/**
 * Team — Members, and who is allowed to do what.
 *
 * THREE TIERS ON THIS SCREEN, TWO ROLES IN THE DATA. `CompanyRole` still has
 * exactly two values (spec §3, §13); the account owner is not a third role but
 * the one member of the company nobody invited, read off `invitedBy` by
 * `isOwnerAccount` in `authz.ts`. That is why the Roles tab has three panels
 * and the invite form still offers two.
 *
 * The Roles tab EXPLAINS the model, it does not configure it. A configurable
 * matrix would let a company build a role the rest of this portal has never
 * been tested against, and "keep permissions simple" is a requirement rather
 * than a preference. What the owner asked for — the top account handing a
 * permission to somebody else — needs somewhere to STORE the grant, and there
 * is no such column and no backend method that writes one. So this screen says
 * so, in words, rather than showing a switch that forgets.
 * See `icefall-sessions/requests/11-operator-super-admin-and-grants.md`.
 *
 * NOTHING HERE EMAILS ANYBODY. Inviting adds a member row in the `invited`
 * state and that is the whole of it. TWO THINGS ARE MISSING, both verified
 * rather than assumed: (1) there is no mail sender anywhere in the ICEFALL
 * Supabase project — `icefall-supabase/config.toml` carries no `[auth.email.smtp]`
 * block and that tree mentions no smtp/sendgrid/resend/postmark/mailer of any
 * kind; (2) this portal has no authentication at all — the sign-in screen is a
 * picker over seeded rows, so there is no account for an invited person to
 * create even if a message could reach them.
 *
 * The owner has ruled what the finished flow should be (backlog `OP-08b`): the
 * inviter types an email, the invitee gets a mail and only chooses a password.
 * That ruling does not override the standing rule — DO NOT SHIP A SEND THAT
 * DOES NOT SEND. A button that appears to invite and quietly does nothing is
 * worse than no button, because the person waiting is a colleague who believes
 * they have access and stops asking. So this screen builds the honest half: the
 * record, and the plain statement of what it is not. No token, no accept route,
 * no password screen — those are meaningless without auth and would be a second
 * thing pretending to work.
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
import { can, isOwnerAccount } from "@/domain/authz";
import { formatDay } from "@/domain/dates";
import type { CompanyRole, CompanyUser } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

/** The three tiers as this screen speaks about them. Only two are roles. */
type Tier = "owner" | "admin" | "sales";

const TIER_LABEL: Record<Tier, string> = {
  owner: "Account owner",
  admin: "Company Admin",
  sales: "Sales Employee",
};

const ROLE_LABEL: Record<CompanyRole, string> = { admin: "Company Admin", sales: "Sales Employee" };

const tierOf = (u: CompanyUser): Tier => (isOwnerAccount(u) ? "owner" : u.role);

/** One sentence each, because that is what people actually read. */
const TIER_LEAD: Record<Tier, string> = {
  owner:
    "The account Icefall created when your company joined. Everything a Company Admin can do, plus the things that commit the company.",
  admin: "Responsible for company content and operator setup.",
  sales: "Responsible for customer conversations and sales follow-up.",
};

const TIER_CAN: Record<Tier, string[]> = {
  owner: [
    "Everything a Company Admin can do",
    "Create a custom offer for a customer — a price outside your published range",
  ],
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

const TIER_CANNOT: Record<Tier, string[]> = {
  owner: [
    "Change your company's placement on a mountain",
    "See Icefall's internal notes about your company",
    "Hand the custom-offer permission to someone else — not yet, see below",
  ],
  admin: [
    "Change your company's placement on a mountain",
    "Create a custom offer for a customer",
    "See Icefall's internal notes about your company",
  ],
  sales: ["Edit the company profile or trips", "Submit content for approval", "Manage staff"],
};

export default function Team() {
  const session = useSession();
  const { backend, revision, refresh } = useOperator();
  const team = useAsync(() => backend.getTeam(session), [session, revision], []);

  const mayManageStaff = can(session, "manageStaff");

  const [tab, setTab] = useState<"members" | "roles">("members");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ displayName: "", email: "", role: "sales" as CompanyRole });
  const [message, setMessage] = useState<{ tone: "neutral" | "rejected"; text: string } | null>(null);

  /**
   * THREE SECURITY PROPERTIES THE REAL INVITE FLOW MUST HOLD.
   *
   * They are written here, at the call site, because they follow from the
   * owner's ruling — "the person only needs to create password" — and whoever
   * finally builds the mail-and-auth half will be reading this function, not
   * the backlog. Each one is a hole if it is missed, not a nicety:
   *
   * (a) THE INVITATION CARRIES THE IDENTITY. Company, role and permissions are
   *     fixed by the inviter at the moment of invitation and are never chosen,
   *     edited or supplied by the invitee. If the recipient can pick any part
   *     of it, the flow is privilege escalation wearing a friendly label. Note
   *     the memory adapter already holds half of this: `companyId` is taken
   *     from the session, never from `input`.
   *
   * (b) SINGLE-USE, EXPIRING, AND BOUND TO THE ADDRESS IT WENT TO. One
   *     acceptance consumes it; an unused one dies on its own; and it only
   *     opens for the invited address. A forwarded link must not be able to
   *     create an account for whoever received it second.
   *
   * (c) THE INVITEE CANNOT CHANGE THE EMAIL ON THE INVITATION. If the address
   *     is editable at acceptance, a leaked link can simply be redirected, and
   *     (b) protects nothing.
   */
  const invite = async () => {
    const res = await backend.inviteTeamMember(session, form);
    if (!res.ok) {
      setMessage({ tone: "rejected", text: res.reason });
      return;
    }
    setMessage({
      tone: "neutral",
      // What actually happened — a row was written — and not one word that
      // could be skimmed as "a message is on its way to them".
      text: `${res.value.displayName} is now on your team list as Invited. Icefall cannot email them: there is no mail service set up yet, and no sign-in for this portal — so somebody will need to tell them another way.`,
    });
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
          /* Offered only to the people the backend will actually let through. */
          mayManageStaff ? (
            <Button variant="primary" onClick={() => setOpen((v) => !v)}>
              <UserPlus size={13} aria-hidden /> Add member
            </Button>
          ) : undefined
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

      {open && mayManageStaff && (
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
            <Notice title="Icefall cannot email this person yet">
              This records them on your team list as Invited, so your company's record of who works here is
              right. Nothing reaches them: there is no mail service connected, so somebody at your company
              will have to tell them another way, and there is no sign-in for them to use when they do.
              <span className="mt-1.5 block text-muted">
                Two things are missing before an invitation can work on its own:{" "}
                <span className="text-ink">an email service, and sign-in for this portal.</span> Both are with
                Icefall.
              </span>
            </Notice>
            <div className="flex gap-2 border-t border-line-soft pt-3">
              <Button
                variant="primary"
                onClick={() => void invite()}
                disabled={!form.displayName.trim() || !form.email.trim()}
              >
                Add to team
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
                <div className="text-[12.5px] text-muted">
                  {TIER_LABEL[tierOf(u)]}
                  {isOwnerAccount(u) && (
                    <span className="block text-[10.5px] text-faint">Company Admin, and the founding account</span>
                  )}
                </div>
                <div className="truncate text-[12.5px] text-muted">{u.email}</div>
                <div>
                  {u.status === "active" && <Pill tone="azure">Active</Pill>}
                  {u.status === "invited" && <Pill>Invited</Pill>}
                  {u.status === "disabled" && <Pill>Removed</Pill>}
                </div>
                <div className="text-right">
                  {u.id !== session.user.id &&
                    mayManageStaff &&
                    (u.status === "disabled" ? (
                      <Button
                        onClick={async () => {
                          const res = await backend.setTeamMemberStatus(session, u.id, "active");
                          if (!res.ok) setMessage({ tone: "rejected", text: res.reason });
                          refresh();
                        }}
                      >
                        Restore
                      </Button>
                    ) : (
                      <Button
                        variant="danger"
                        onClick={async () => {
                          const res = await backend.setTeamMemberStatus(session, u.id, "disabled");
                          if (!res.ok) setMessage({ tone: "rejected", text: res.reason });
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
            theirs. An <span className="text-ink">Invited</span> member is on this list and nothing more:
            Icefall has no way to email them and no sign-in to let them in, so being on this list gives them
            no access at all until both exist.
          </p>
        </>
      ) : (
        <div className="space-y-4">
          {/* The question people come to this tab with, answered before the panels. */}
          <Card className="p-4">
            <h2 className="text-[14px] font-semibold text-ink">Who can manage staff</h2>
            <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-muted">
              The <span className="text-ink">account owner</span> and any{" "}
              <span className="text-ink">Company Admin</span> can add a member, remove one and choose whether
              that person joins as a Company Admin or a Sales Employee. A Sales Employee cannot — this screen
              is not in their menu at all.
            </p>
            <p className="mt-2 max-w-3xl text-[12.5px] leading-relaxed text-muted">
              The account owner is the account Icefall created when your company joined. It is the only one
              nobody on your team invited, which is how the portal knows which it is. There is no way to move
              it to somebody else from here.
            </p>
          </Card>

          <div className="grid gap-4 md:grid-cols-3">
            {(["owner", "admin", "sales"] as const).map((t) => (
              <Card key={t} className="p-4">
                <h2 className="text-[14px] font-semibold text-ink">{TIER_LABEL[t]}</h2>
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{TIER_LEAD[t]}</p>
                <div className="lbl mt-4">Can</div>
                <ul className="mt-2 space-y-1.5">
                  {TIER_CAN[t].map((x) => (
                    <li key={x} className="text-[12.5px] text-ink">
                      {x}
                    </li>
                  ))}
                </ul>
                <div className="lbl mt-4">Cannot</div>
                <ul className="mt-2 space-y-1.5">
                  {TIER_CANNOT[t].map((x) => (
                    <li key={x} className="flex items-start gap-1.5 text-[12.5px] text-muted">
                      {/* A dash, never a tick, beside something that is NOT permitted. */}
                      <span aria-hidden className="mt-[7px] h-px w-2 shrink-0 bg-faint" />
                      <span>{x}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>

          <Card className="p-4">
            <h2 className="text-[14px] font-semibold text-ink">Custom offers, and passing permissions on</h2>
            <p className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-muted">
              A custom offer is a price this company will honour for one customer, outside the published range,
              so it is a commitment rather than a piece of content. The rule is set: only the account owner may
              create one. <span className="text-ink">The offer builder is not in this portal yet</span> — the
              rule is written down now so that there is one answer waiting for it, rather than a new one
              invented on the day.
            </p>
            <div className="mt-3">
              <Notice title="Handing it to somebody else is not available yet">
                Icefall has nowhere to keep a permission granted to one person, so a grant made here would be
                gone by the next time anyone signed in — which is worse than not offering it. The stored
                permission has been requested from Icefall. Until it exists, the way to give somebody the
                owner's powers is to have them work from the owner account.
              </Notice>
            </div>
          </Card>

          <Card className="p-4">
            <Notice>
              Beyond these, Icefall deliberately does not offer a configurable permission matrix — a custom
              role would be one this portal has never been tested against, and the person it locked out would
              find that out at the worst moment.
            </Notice>
          </Card>
        </div>
      )}
    </>
  );
}
