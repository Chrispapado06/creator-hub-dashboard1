import { useCallback, useEffect, useState } from "react";
import { Button, Card, Pill, SectionLabel } from "@/components/ui";
import { Resolve } from "@/components/states";
import {
  inviteCompanyUser,
  listCompanyInvitations,
  listCompanyMembers,
  revokeInvitation,
} from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { CompanyInvitation, CompanyMember } from "@/data/types";
import { cn, formatDay } from "@/lib/utils";

/**
 * Team & access — the day-one gap closed: the CRM could create a company
 * nobody could sign in to. This panel is how a company's people get logins.
 *
 * HOW IT ACTUALLY WORKS, because the UI must not imply more: `invite_company_user`
 * creates an invitation ROW keyed to an email address. NOTHING SENDS AN EMAIL —
 * no part of ICEFALL sends mail yet — so the form says, in so many words, that
 * the address must be passed on by a person. When someone signs up (or next
 * signs in) with that exact address, the shared auth module consumes the
 * invitation and the membership appears here. Joining a company elevates no
 * role: operator access comes from `company_users`, not from `profiles.role`.
 *
 * REVOKING REQUIRES A REASON — the database refuses without one, so the button
 * appears only once the sentence exists (the resolve-box pattern).
 */
export function CompanyAccess({ companyId }: { companyId: string }) {
  const [members, setMembers] = useState<Result<CompanyMember[]>>(loading);
  const [invitations, setInvitations] = useState<Result<CompanyInvitation[]>>(loading);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "sales">("admin");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokeReason, setRevokeReason] = useState("");

  const refresh = useCallback(() => {
    void listCompanyMembers(companyId).then(setMembers);
    void listCompanyInvitations(companyId).then(setInvitations);
  }, [companyId]);
  useEffect(refresh, [refresh]);

  const invite = async () => {
    setBusy(true);
    setNotice(null);
    const res = await inviteCompanyUser(companyId, email, role);
    setBusy(false);
    if (res.state === "ok") {
      setNotice({
        tone: "ok",
        text: `Invitation recorded for ${email.trim()}. ICEFALL does not send the email — tell them to sign up (or sign in) with exactly this address, and access attaches the moment they do. It expires in 14 days.`,
      });
      setEmail("");
      refresh();
    } else {
      setNotice({ tone: "bad", text: res.state === "error" ? res.reason : "No database is configured." });
    }
  };

  const revoke = async (id: string) => {
    setBusy(true);
    setNotice(null);
    const res = await revokeInvitation(id, revokeReason);
    setBusy(false);
    setRevoking(null);
    setRevokeReason("");
    if (res.state === "ok") refresh();
    else setNotice({ tone: "bad", text: res.state === "error" ? res.reason : "No database is configured." });
  };

  const open = (invitations.state === "ok" ? invitations.value : []).filter(
    (i) => i.accepted_at === null && i.revoked_at === null,
  );

  return (
    <Card className="mt-4">
      <SectionLabel>Team &amp; access</SectionLabel>
      <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">
        Who can sign in for this company. An invitation is claimed by whoever signs up with the
        exact address it names; joining a company grants operator access only — never ICEFALL
        staff powers.
      </p>

      {notice && (
        <p
          className={cn(
            "mt-3 rounded-tile px-3.5 py-2.5 text-[12.5px] leading-relaxed",
            notice.tone === "ok" ? "bg-mint text-[oklch(0.4_0.08_155)]" : "bg-[oklch(0.955_0.03_25)] text-bad",
          )}
        >
          {notice.text}
        </p>
      )}

      <div className="mt-4 grid gap-5 lg:grid-cols-2">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">Members</p>
          <Resolve
            result={members}
            what="the member list"
            isEmpty={(v) => v.length === 0}
            empty="Nobody can sign in for this company yet. Invite their first admin below."
          >
            {(rows) => (
              <div className="mt-2 space-y-1.5">
                {rows.map((m) => (
                  <div key={m.profile_id} className="flex items-center justify-between rounded-tile bg-raised px-3 py-2">
                    <span className="text-[13px] font-medium text-ink">{m.name}</span>
                    <span className="flex items-center gap-2">
                      <Pill tone={m.company_role === "admin" ? "accent" : "neutral"}>
                        {m.company_role === "admin" ? "Admin" : "Sales"}
                      </Pill>
                      {m.status !== "active" && <Pill tone="amber">{m.status}</Pill>}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Resolve>

          {open.length > 0 && (
            <>
              <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">
                Waiting to be claimed
              </p>
              <div className="mt-2 space-y-1.5">
                {open.map((i) => (
                  <div key={i.id} className="rounded-tile border border-line px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="tnum min-w-0 truncate text-[12.5px] font-medium text-ink">{i.email}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Pill tone="neutral">{i.company_role === "admin" ? "Admin" : "Sales"}</Pill>
                        <span className="text-[11px] text-faint">expires {formatDay(i.expires_at)}</span>
                        <button
                          type="button"
                          className="text-[11.5px] font-medium text-muted hover:text-bad"
                          onClick={() => {
                            setRevoking(revoking === i.id ? null : i.id);
                            setRevokeReason("");
                          }}
                        >
                          Revoke
                        </button>
                      </span>
                    </div>
                    {revoking === i.id && (
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          value={revokeReason}
                          onChange={(e) => setRevokeReason(e.target.value)}
                          placeholder="Why — required to revoke"
                          className="h-8 min-w-0 flex-1 rounded-[8px] border border-line bg-surface px-2.5 text-[12px] text-ink outline-none placeholder:text-faint focus:border-accent"
                        />
                        <Button
                          size="sm"
                          variant="danger"
                          disabled={busy || revokeReason.trim().length === 0}
                          onClick={() => void revoke(i.id)}
                        >
                          Confirm
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <div>
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">Invite</p>
          <div className="mt-2 space-y-3">
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">Email address</span>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="them@their-company.com"
                className="h-10 w-full rounded-tile border border-line bg-surface px-3 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">Role at the company</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "sales")}
                className="h-10 w-full rounded-tile border border-line bg-surface px-3 text-[13px] text-ink outline-none focus:border-accent"
              >
                <option value="admin">Admin — manages their team and content</option>
                <option value="sales">Sales — works leads, cannot invite</option>
              </select>
            </label>
            <Button
              className="!bg-accent text-white hover:opacity-90"
              disabled={busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}
              onClick={() => void invite()}
            >
              {busy ? "Inviting…" : "Create invitation"}
            </Button>
            {/* The sentence that keeps this honest: no email leaves ICEFALL. */}
            <p className="text-[11.5px] leading-relaxed text-faint">
              This records the invitation — it does not send an email, because nothing does yet.
              Pass the address on yourself; their access attaches when they sign up with it.
            </p>
          </div>
        </div>
      </div>
    </Card>
  );
}
