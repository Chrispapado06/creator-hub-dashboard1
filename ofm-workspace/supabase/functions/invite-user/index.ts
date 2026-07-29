// =====================================================================
// supabase/functions/invite-user/index.ts   (Deno / Supabase Edge Function)
//
// OWNER-ONLY invite-by-email. The desktop client holds ONLY the anon key and
// calls this with the signed-in user's JWT. This function:
//   1. verifies the caller JWT server-side,
//   2. confirms the caller is an ACTIVE OWNER of the target workspace,
//   3. records/refreshes a pending invites audit row,
//   4. creates the auth user + sends the invite email (invitee sets their OWN
//      password on the emailed link),  OR, if the user already exists, resolves
//      them via the AUTH ADMIN API (authoritative — never via the client-writable
//      profiles table),
//   5. provisions the membership directly with the service_role (idempotent).
//
// Membership is created here — NOT by any DB trigger — so an email that happens
// to have a pending invite can never auto-grant a role to a self-registrant.
//
// service_role NEVER reaches the client; it lives only in this function's env.
//
// Deploy:  supabase functions deploy invite-user
// Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY auto-injected.
//          supabase secrets set INVITE_REDIRECT_URL="ofm://auth/callback"
//          supabase secrets set ALLOWED_ORIGIN="ofm://localhost"   (your app origin)
//          supabase secrets set DEFAULT_WORKSPACE_ID="00000000-0000-0000-0000-000000000001"
// =====================================================================
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const DEFAULT_WORKSPACE_ID =
  Deno.env.get("DEFAULT_WORKSPACE_ID") ?? "00000000-0000-0000-0000-000000000001";
const REDIRECT_TO = Deno.env.get("INVITE_REDIRECT_URL") || undefined;
const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") ?? ""; // set to your app origin

const ROLES = new Set(["owner", "manager", "chatter"]);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function cors(reqOrigin: string | null) {
  // Restrict to the configured origin; never echo an arbitrary origin.
  const allow = ALLOWED_ORIGIN
    ? (reqOrigin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : ALLOWED_ORIGIN)
    : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Authoritative user lookup against auth.users via the admin API (paginated).
// NEVER resolve identity from the client-writable public.profiles table.
async function findUserByEmail(admin: SupabaseClient, email: string) {
  const perPage = 200;
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit;
    if (data.users.length < perPage) return null;
  }
  return null;
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
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = String(body.role ?? "").trim();
    const workspaceId = String(body.workspace_id ?? DEFAULT_WORKSPACE_ID);
    if (!EMAIL_RE.test(email)) return json(400, { error: "Valid email required" });
    if (!ROLES.has(role)) return json(400, { error: "role must be owner|manager|chatter" });

    // 3. Authorize: caller must be an ACTIVE OWNER of the workspace.
    const { data: m, error: mErr } = await admin
      .from("memberships")
      .select("role,status")
      .eq("user_id", caller.id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (mErr) return json(500, { error: mErr.message });
    if (!m || m.status !== "active" || m.role !== "owner")
      return json(403, { error: "Only an active owner can invite users" });

    // 4. Record/refresh the pending invite (audit).
    const { error: invErr } = await admin.from("invites").upsert(
      {
        workspace_id: workspaceId,
        email,
        role,
        invited_by: caller.id,
        status: "pending",
        expires_at: new Date(Date.now() + 7 * 864e5).toISOString(),
        accepted_at: null,
        accepted_user_id: null,
      },
      { onConflict: "workspace_id,email" },
    );
    if (invErr) return json(500, { error: `Invite record failed: ${invErr.message}` });

    // 5. Create the auth user + send the email, or resolve an existing user.
    let userId: string;
    const { data: invited, error: sendErr } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { workspace_id: workspaceId, role },
      redirectTo: REDIRECT_TO,
    });

    if (sendErr) {
      // Already-registered address: resolve authoritatively via auth admin API.
      const existing = await findUserByEmail(admin, email);
      if (!existing)
        return json(409, { error: `Could not invite: ${sendErr.message}` });
      userId = existing.id;
      // Re-send a set-password/magic link so they can (re)join.
      if (REDIRECT_TO) {
        await admin.auth.admin.generateLink({
          type: "magiclink", email, options: { redirectTo: REDIRECT_TO },
        }).catch(() => {});
      }
    } else {
      userId = invited.user!.id;
    }

    // 6. Provision the membership (idempotent). Re-inviting a previously
    //    deactivated member reactivates them; keep auth ban state consistent by
    //    lifting any ban so membership='active' never contradicts a banned login.
    const { error: upErr } = await admin.from("memberships").upsert(
      { workspace_id: workspaceId, user_id: userId, role, status: "active", invited_by: caller.id },
      { onConflict: "workspace_id,user_id" },
    );
    if (upErr) {
      // e.g. the DB last-active-owner trigger rejected an owner->lower re-invite.
      return json(409, { error: `Membership update rejected: ${upErr.message}` });
    }
    await admin.auth.admin.updateUserById(userId, { ban_duration: "none" }).catch(() => {});

    return json(200, {
      ok: true,
      user_id: userId,
      email,
      role,
      workspace_id: workspaceId,
      mode: sendErr ? "existing_user_added" : "invited",
    });
  } catch (e) {
    return json(500, { error: (e as Error)?.message ?? String(e) });
  }
});
