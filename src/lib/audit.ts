import { supabase } from "@/integrations/supabase/client";

const getActorUsername = (): string | null => {
  const raw = localStorage.getItem("agency_session");
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    return obj?.username ?? null;
  } catch {
    return raw;
  }
};

/** Append-only audit log entry. Fire-and-forget — failures are silent. */
export async function logAudit(params: {
  action: string;
  entity_type: string;
  entity_id?: string | null;
  entity_name?: string | null;
  details?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  try {
    await supabase.from("audit_log").insert({
      actor_username: getActorUsername(),
      action: params.action,
      entity_type: params.entity_type,
      entity_id: params.entity_id ?? null,
      entity_name: params.entity_name ?? null,
      details: params.details ?? null,
      metadata: params.metadata ?? null,
    });
  } catch {
    // Audit logging never blocks user actions
  }
}
