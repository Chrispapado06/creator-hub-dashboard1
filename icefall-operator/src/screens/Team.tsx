/**
 * Team, built to the mockup: Members and Roles & Permissions.
 *
 * Two roles, and no third (spec §3, §13). The Roles tab exists to EXPLAIN the
 * two, not to configure them — a configurable matrix would let a company build a
 * role the rest of this portal has never been tested against, and "keep
 * permissions simple" is a requirement rather than a preference.
 *
 * Removing someone DISABLES them; it does not delete them. Spec §18 requires
 * leads, bookings, conversations and notes to survive a departure, and they
 * reference the staff record — deleting it would take a chunk of the company's
 * own commercial history with it.
 */

import { UserPlus } from "lucide-react";
import { useState } from "react";
import { Monogram } from "@/components/Shell";
import { Button, Card, Field, Notice, PageHeader, Pill, Tabs, inputClass } from "@/components/ui";
import { formatDay } from "@/domain/dates";
import type { CompanyRole } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

const ROLE_LABEL: Record<CompanyRole, string> = { admin: "Company Admin", sales: "Sales Employee" };

const ROLE_CAN: Record<CompanyRole, string[]> = {
  admin: [
    "Edit the company profile",
    "Create and edit expeditions and treks",
    "Upload photographs and documents",
    "Submit changes to Icefall for approval",
    "Invite and remove staff",
    "Everything a Sales Employee can do",
  ],
  sales: [
    "Read and reply to customer conversations",
    "Move leads through the pipeline",
    "Add internal notes",
    "Update departure availability and remaining spaces",
    "Read trip details to answer questions",
  ],
};

const ROLE_CANNOT: Record<CompanyRole, string[]> = {
  admin: ["Change your company's placement on a mountain", "See Icefall's internal notes about your company"],
  sales: ["Edit the company profile or trips", "Submit content for approval", "Manage staff"],
};

export default function Team() {
  const session = useSession();
  const { backend, revision, refresh } = useOperator();
  const team = useAsync(() => backend.getTeam(session), [session, revision], []);

  const [tab, setTab] = useState<"members" | "roles">("members");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ displayName: "", email: "", role: "sales" as CompanyRole });
  const [message, setMessage] = useState<{ tone: "neutral" | "rejected"; text: string } | null>(null);

  const invite = async () => {
    const res = await backend.inviteTeamMember(session, form);
    if (!res.ok) {
      setMessage({ tone: "rejected", text: res.reason });
      return;
    }
    setMessage({ tone: "neutral", text: `${res.value.displayName} has been invited.` });
    setForm({ displayName: "", email: "", role: "sales" });
    setOpen(false);
    refresh();
  };

  return (
    <>
      <PageHeader
        title="Team"
        detail="Manage your team members and roles."
        action={
          <Button variant="primary" onClick={() => setOpen((v) => !v)}>
            <UserPlus size={13} aria-hidden /> Invite member
          </Button>
        }
      />

      <div className="mb-3">
        <Tabs
          active={tab}
          onChange={setTab}
          tabs={[
            { key: "members" as const, label: "Members", count: team.length },
            { key: "roles" as const, label: "Roles & permissions" },
          ]}
        />
      </div>

      {open && (
        <Card className="mb-4 max-w-lg p-4">
          <div className="space-y-3">
            <Field label="Name">
              <input
                className={inputClass}
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <input
                className={inputClass}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field label="Role">
              <div className="flex gap-1.5">
                {(["sales", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setForm({ ...form, role: r })}
                    className={`rounded-tile px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                      form.role === r ? "bg-azure text-canvas" : "hairline bg-surface text-muted hover:text-ink"
                    }`}
                  >
                    {ROLE_LABEL[r]}
                  </button>
                ))}
              </div>
            </Field>
            <div className="flex gap-2 border-t border-line-soft pt-3">
              <Button
                variant="primary"
                onClick={() => void invite()}
                disabled={!form.displayName.trim() || !form.email.trim()}
              >
                Send invitation
              </Button>
              <Button variant="quiet" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      )}

      {message && (
        <div className="mb-4">
          <Notice tone={message.tone === "rejected" ? "rejected" : "neutral"}>{message.text}</Notice>
        </div>
      )}

      {tab === "members" ? (
        <>
          <Card className="overflow-hidden">
            <div className="hidden grid-cols-[1.6fr_1.1fr_1.6fr_0.8fr_0.8fr] gap-4 border-b border-line px-4 py-2.5 md:grid">
              {["Member", "Role", "Email", "Status", ""].map((h, i) => (
                <div key={i} className="lbl">{h}</div>
              ))}
            </div>
            {team.map((u, i) => (
              <div
                key={u.id}
                className={`grid grid-cols-1 gap-x-4 gap-y-2 px-4 py-3 md:grid-cols-[1.6fr_1.1fr_1.6fr_0.8fr_0.8fr] md:items-center ${
                  i > 0 ? "border-t border-line-soft" : ""
                }`}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Monogram name={u.displayName} size={28} />
                  <span className="min-w-0">
                    <span
                      className={`block truncate text-[12.5px] font-medium ${u.status === "disabled" ? "text-faint" : "text-ink"}`}
                    >
                      {u.displayName}
                    </span>
                    {u.id === session.user.id && <span className="text-[11px] text-azure-ink">You</span>}
                  </span>
                </div>
                <div className="text-[12.5px] text-muted">{ROLE_LABEL[u.role]}</div>
                <div className="truncate text-[12.5px] text-muted">{u.email}</div>
                <div>
                  {u.status === "active" && <Pill tone="azure">Active</Pill>}
                  {u.status === "invited" && <Pill>Invited</Pill>}
                  {u.status === "disabled" && <Pill>Removed</Pill>}
                </div>
                <div className="text-right">
                  {u.id !== session.user.id &&
                    (u.status === "disabled" ? (
                      <Button
                        onClick={async () => {
                          await backend.setTeamMemberStatus(session, u.id, "active");
                          refresh();
                        }}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        onClick={async () => {
                          await backend.setTeamMemberStatus(session, u.id, "disabled");
                          refresh();
                        }}
                      >
                        Remove
                      </Button>
                    ))}
                  <div className="mt-0.5 text-[10.5px] text-faint">
                    Since {formatDay(u.createdAt.slice(0, 10))}
                  </div>
                </div>
              </div>
            ))}
          </Card>

          <p className="mt-3 max-w-3xl text-[11.5px] leading-relaxed text-muted">
            Removing someone takes away their access immediately. Their leads, notes and conversations stay in
            your records — the history of who spoke to which customer is part of your company's account, not
            theirs.
          </p>
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {(["admin", "sales"] as const).map((r) => (
            <Card key={r} className="p-4">
              <h2 className="text-[14px] font-semibold text-ink">{ROLE_LABEL[r]}</h2>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {r === "admin"
                  ? "Responsible for company content and operator setup."
                  : "Responsible for customer conversations and sales follow-up."}
              </p>
              <div className="lbl mt-4">Can</div>
              <ul className="mt-2 space-y-1.5">
                {ROLE_CAN[r].map((x) => (
                  <li key={x} className="text-[12.5px] text-ink">
                    {x}
                  </li>
                ))}
              </ul>
              <div className="lbl mt-4">Cannot</div>
              <ul className="mt-2 space-y-1.5">
                {ROLE_CANNOT[r].map((x) => (
                  <li key={x} className="flex items-start gap-1.5 text-[12.5px] text-muted">
                    {/* A dash, never a tick, beside something that is NOT permitted. */}
                    <span aria-hidden className="mt-[7px] h-px w-2 shrink-0 bg-faint" />
                    <span>{x}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
          <Card className="p-4 md:col-span-2">
            <Notice>
              These two roles are fixed. Icefall deliberately does not offer a configurable permission matrix —
              a custom role would be one this portal has never been tested against, and the person it locked
              out would find that out at the worst moment.
            </Notice>
          </Card>
        </div>
      )}
    </>
  );
}
