// =====================================================================
// supabase/functions/deactivate-user/index.ts   (Deno / Supabase Edge Function)
//
// OWNER-ONLY activate/deactivate. Deactivation must revoke ALL access
// IMMEDIATELY. Three layers, in order:
//   (A) DATA (authoritative + instant): flip memberships.status='deactivated'.
//       Every RLS helper requires status='active' and reads LIVE DB state, so
//       the target's very next statement is denied — including self-profile and
//       self-membership reads (those policies also gate on is_active_member_any).
//       This holds even while the target still carries an unexpired access token.
//   (B) SESSION: delete the target's GoTrue sessions (revoke_user_sessions RPC)
//       so their refresh tokens are dead — no silent re-issue.
//   (C) AUTH: ban the user so no new/refreshed token can be minted.
// This is the ONLY deactivation path (there is deliberately no client-callable
// "set status" that could deactivate without also banning + revoking sessions).
// The DB last-active-owner trigger blocks deactivating the final owner; we also
// pre-check for a clean 409.
//
// Deploy:  supabase functions deploy deactivate-user
// Body:    { user_id, workspace_id?, action?: "deactivate" | "reactivate" }
// =====================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_WORKSPACE_ID =
  Deno.env.get("DEFAULT_WORKSPACE_ID") ?? "00000000-0000-0000-0000-000000000001";
const PERMA_BAN = "876000h"; // ~100 years

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cors(reqOrigin: string | null) {
  // JWT + server-side owner check are the security boundary; reflect the caller's
  // origin so the app works from the web app, desktop, or localhost.
  return {
    "Access-Control-Allow-Origin": reqOrigin || "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req.headers.get("Origin")), "Content-Type": "application/json" };
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers });

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req.headers.get("Origin")) });
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1. Verify caller JWT.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json(401, { error: "Missing bearer token" });
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user) return json(401, { error: "Invalid or expired session" });
    const caller = u.user;

    // 2. Validate input.
    const body = await req.json().catch(() => ({}));
    const targetId = String(body.user_id ?? "");
    const workspaceId = String(body.workspace_id ?? DEFAULT_WORKSPACE_ID);
    const action = String(body.action ?? "deactivate");
    if (!UUID_RE.test(targetId)) return json(400, { error: "Valid user_id required" });
    if (action !== "deactivate" && action !== "reactivate")
      return json(400, { error: "action must be deactivate|reactivate" });
    if (targetId === caller.id)
      return json(400, { error: "You cannot change your own access" });

    // 3. Authorize: caller must be an ACTIVE OWNER of the workspace.
    const { data: cm, error: cErr } = await admin
      .from("memberships").select("role,status")
      .eq("user_id", caller.id).eq("workspace_id", workspaceId).maybeSingle();
    if (cErr) return json(500, { error: cErr.message });
    if (!cm || cm.status !== "active" || cm.role !== "owner")
      return json(403, { error: "Only an active owner can change member access" });

    // 4. Load target membership.
    const { data: target, error: tErr } = await admin
      .from("memberships").select("role,status")
      .eq("user_id", targetId).eq("workspace_id", workspaceId).maybeSingle();
    if (tErr) return json(500, { error: tErr.message });
    if (!target) return json(404, { error: "Target is not a member of this workspace" });

    if (action === "deactivate") {
      // 5. Anti-lockout pre-check (DB constraint trigger also enforces this).
      if (target.role === "owner") {
        const { count, error: countErr } = await admin
          .from("memberships")
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId).eq("role", "owner").eq("status", "active")
          .neq("user_id", targetId);
        if (countErr) return json(500, { error: countErr.message });
        if ((count ?? 0) === 0)
          return json(409, { error: "Cannot deactivate the last active owner" });
      }

      // (A) DATA — instant, authoritative.
      const { error: upErr } = await admin
        .from("memberships").update({ status: "deactivated" })
        .eq("user_id", targetId).eq("workspace_id", workspaceId);
      if (upErr) return json(409, { error: upErr.message }); // e.g. last-owner trigger

      // (B) SESSION — kill refresh tokens now.
      const { error: sessErr } = await admin.rpc("revoke_user_sessions", { p_user: targetId });
      if (sessErr) return json(200, { ok: true, action, user_id: targetId, warning: `status set + banned but session-revoke failed: ${sessErr.message}` });

      // (C) AUTH — block any future refresh/login.
      const { error: banErr } = await admin.auth.admin.updateUserById(targetId, { ban_duration: PERMA_BAN });
      if (banErr) return json(200, { ok: true, action, user_id: targetId, warning: `status set + sessions revoked but ban failed: ${banErr.message}` });

      return json(200, { ok: true, action, user_id: targetId });
    }

    // reactivate
    const { error: upErr } = await admin
      .from("memberships").update({ status: "active" })
      .eq("user_id", targetId).eq("workspace_id", workspaceId);
    if (upErr) return json(500, { error: upErr.message });
    const { error: unbanErr } = await admin.auth.admin.updateUserById(targetId, { ban_duration: "none" });
    if (unbanErr) return json(200, { ok: true, action, user_id: targetId, warning: `status set but unban failed: ${unbanErr.message}` });

    return json(200, { ok: true, action, user_id: targetId });
  } catch (e) {
    return json(500, { error: (e as Error)?.message ?? String(e) });
  }
});
