import { useEffect, useState } from "react";
import {
  Avatar,
  Card,
  PageHead,
  Pill,
  SectionLabel,
  Stat,
  StatusChip,
  TableCard,
} from "@/components/ui";
import { Resolve, Unavailable } from "@/components/states";
import { DESK_LABEL, useStaff } from "@/auth/session";
import { listStaff } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { StaffRecord, StaffRole } from "@/data/types";
import { formatDay } from "@/lib/utils";

/**
 * ICEFALL's own staff, and the desk each of them holds.
 *
 * THE DESK IS NOT A JOB TITLE, IT IS THE ACCESS MODEL, so this screen states in
 * words what each one gates. Staff currently learn the boundary by being refused
 * — a salesperson discovers Operations owns placements at the moment a position
 * will not move — and a rule you can only find by hitting it reads as a bug.
 * Writing it down here costs nothing and is the same rule the database holds.
 *
 * WHAT THIS SCREEN DESCRIBES, IT DOES NOT ENFORCE. Every sentence below mirrors
 * a policy in the database; the database is what refuses the write. Nothing on
 * this page appoints, demotes or revokes anyone, and no button pretends to.
 *
 * REVOKED STAFF STAY LISTED. Taking someone's access away does not unmake the
 * work they did: audit events carry an `actor_id`, and if their row disappeared
 * the history would name an identifier nobody could resolve. They are shown with
 * access revoked, not deleted and not quietly filtered out of the count.
 *
 * NO ACTIVITY FIGURES. This CRM records no sign-in times and no per-person
 * totals, so there is no "last active" column and no leaderboard — see the note
 * at the foot of the page rather than an empty column implying one is coming.
 *
 * The role is the section heading rather than a repeated column: five desks
 * printed down one column is a column nobody reads, and grouping is the only
 * layout in which a desk with NOBODY in it is visible at all.
 */

/**
 * What each desk can actually do. The names come from `DESK_LABEL` so this file
 * never restates them; only the consequence is written here.
 */
const DESKS: { id: StaffRole; gates: string }[] = [
  {
    id: "super_admin",
    gates:
      "Passes every check the other four desks pass, and holds the ones nobody else does: appointing staff, moving somebody to a different desk, and revoking access.",
  },
  {
    id: "sales",
    gates:
      "Companies, leads, deals and the pipeline. Sales can raise a task about a placement whose term has ended, but raising the task is the whole of it — the position itself is not theirs to move.",
  },
  {
    id: "operations",
    gates:
      "The marketplace. Only Operations can move a company into a paid position or cancel one, and only Operations can approve, reject or send back submitted content.",
  },
  {
    id: "finance",
    gates:
      "Money. Only Finance can change a commission rate or placement pricing, and only Finance records what has been invoiced and what has been collected.",
  },
  {
    id: "support",
    gates:
      "Tickets and the correspondence attached to them. Support reads the commercial screens to answer a question, but cannot change a placement, a rate or an approval.",
  },
];

/**
 * Access maps to the mockup's status control. Revoked is NEUTRAL rather than
 * red: a red cross reads as a refusal somebody should look into, and a revoked
 * account is an ordinary, deliberate end state that the note below the table
 * already explains. The colour is spent on the thing that is true — this person
 * currently has access — and withheld from the thing that is merely over.
 */
const accessState = (active: boolean): "ok" | "neutral" => (active ? "ok" : "neutral");

/** The mockup's table metrics: roomy gutters, a tall row, a quiet header. */
const TH = "px-5 py-3.5 text-[12px] font-semibold text-faint";
const TD = "px-5 py-3.5";

export default function Team() {
  const me = useStaff();
  const [result, setResult] = useState<Result<StaffRecord[]>>(loading);

  useEffect(() => {
    void listStaff().then(setResult);
  }, []);

  // Narrowed once. Never `?? []` — an unreadable table and an empty one are
  // different facts, and the tiles have to be able to say which this is.
  const rows = result.state === "ok" ? result.value : null;
  const reason =
    result.state === "unavailable" || result.state === "error" ? result.reason : "Not recorded";

  const withAccess = rows ? rows.filter((s) => s.active) : null;
  const revoked = rows ? rows.length - (withAccess?.length ?? 0) : null;

  const departments = withAccess
    ? new Set(withAccess.map((s) => s.department.trim()).filter(Boolean)).size
    : 0;

  // A desk nobody holds is the figure worth surfacing: it means that desk's work
  // is blocked for everyone except a Super Admin until somebody is appointed.
  const uncovered = withAccess
    ? DESKS.filter((d) => !withAccess.some((s) => s.staff_role === d.id))
    : [];

  return (
    <>
      <PageHead
        title="Admin Team"
        subtitle="ICEFALL's own staff. The desk beside a name is not a job title — it is what the database will and will not let that person do."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat
          tone="butter"
          label="Staff with access"
          value={withAccess ? String(withAccess.length) : null}
          reason={reason}
          hint={
            departments > 0
              ? `Across ${departments} department${departments === 1 ? "" : "s"}.`
              : "No department is recorded against any of them."
          }
        />
        <Stat
          tone="sky"
          label="Access revoked"
          value={revoked === null ? null : String(revoked)}
          reason={reason}
          hint="Still listed. Audit events name the person who made each change, and a deleted row would leave that history pointing at nobody."
        />
        <Stat
          tone="lilac"
          label="Desks covered"
          value={rows ? `${DESKS.length - uncovered.length} of ${DESKS.length}` : null}
          reason={reason}
          hint={
            uncovered.length > 0
              ? `Nobody currently holds ${uncovered.map((d) => DESK_LABEL[d.id]).join(", ")}.`
              : "Every desk has at least one person with access."
          }
        />
      </div>

      <div className="mt-6">
        <SectionLabel>What each desk gates</SectionLabel>
        <Card className="mt-1.5" pad={false}>
          <ul>
            {DESKS.map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-2 border-b border-line-soft px-5 py-3.5 last:border-0 sm:flex-row sm:items-start sm:gap-5"
              >
                <div className="sm:w-40 sm:shrink-0">
                  <Pill tone={d.id === "super_admin" ? "accent" : "neutral"}>{DESK_LABEL[d.id]}</Pill>
                </div>
                <p className="text-[12.5px] leading-relaxed text-muted">{d.gates}</p>
              </li>
            ))}
          </ul>
          <p className="border-t border-line-soft px-5 py-4 text-[12.5px] leading-relaxed text-faint">
            These rules live in the database, not on this page. Hiding a control a policy would
            refuse is a courtesy; the write is refused either way, and a desk you were not given is
            not something a screen can hand you. Appointing staff, changing someone's desk and
            revoking access are not done from here.
          </p>
        </Card>
      </div>

      <div className="mt-6">
        <Resolve
          result={result}
          what="staff"
          isEmpty={(v) => v.length === 0}
          empty="Nobody has been appointed yet. A person appears here once a Super Admin gives them a desk; there is no self-registration."
        >
          {(staff) => (
            <div className="space-y-8">
              {DESKS.map((d) => {
                const desk = staff.filter((s) => s.staff_role === d.id);
                const live = desk.filter((s) => s.active).length;
                return (
                  <div key={d.id}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h2 className="text-[17px] font-bold tracking-[-0.02em] text-ink">
                        {DESK_LABEL[d.id]}
                      </h2>
                      {desk.length > 0 && (
                        <p className="tnum text-[12px] font-medium text-faint">
                          {live} with access
                          {desk.length - live > 0 && ` · ${desk.length - live} revoked`}
                        </p>
                      )}
                    </div>

                    {desk.length === 0 ? (
                      <Card className="mt-2">
                        <p className="text-[12.5px] leading-relaxed text-muted">
                          Nobody holds this desk.
                        </p>
                        <p className="mt-1 text-[11.5px] leading-relaxed text-warn">
                          Until someone is appointed, only a Super Admin can do this desk's work.
                        </p>
                      </Card>
                    ) : (
                      <>
                        <TableCard className="mt-2">
                          <table className="w-full min-w-[760px] text-[13px]">
                            <thead>
                              <tr className="border-b border-line-soft text-left">
                                <th className={TH}>Name</th>
                                <th className={TH}>Department</th>
                                <th className={TH}>Email</th>
                                <th className={TH}>Status</th>
                                <th className={TH}>Joined</th>
                              </tr>
                            </thead>
                            <tbody>
                              {desk.map((s) => {
                                const isMe = me !== null && me.profileId === s.profile_id;
                                return (
                                  <tr
                                    key={s.profile_id}
                                    className="border-b border-line-soft last:border-0 hover:bg-raised"
                                  >
                                    <td className={TD}>
                                      <div className="flex items-center gap-3">
                                        <Avatar
                                          name={s.name}
                                          size={34}
                                          tone={isMe ? "accent" : "neutral"}
                                        />
                                        <span className="font-medium text-ink">{s.name}</span>
                                        {isMe && <Pill tone="accent">You</Pill>}
                                      </div>
                                    </td>
                                    <td className={`${TD} text-muted`}>
                                      {s.department.trim() || (
                                        <span className="text-faint">Not recorded</span>
                                      )}
                                    </td>
                                    <td className={`${TD} text-muted`}>
                                      {s.email.trim() || (
                                        <span className="text-faint">Not recorded</span>
                                      )}
                                    </td>
                                    <td className={TD}>
                                      <StatusChip
                                        state={accessState(s.active)}
                                        label={s.active ? "Access active" : "Access revoked"}
                                      />
                                    </td>
                                    <td className={`tnum whitespace-nowrap ${TD} text-muted`}>
                                      {formatDay(s.joined_on) ?? (
                                        <span className="text-faint">Not recorded</span>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </TableCard>
                        {live === 0 && (
                          <p className="mt-2 text-[11.5px] leading-relaxed text-warn">
                            Everyone at this desk has had their access revoked. They stay listed
                            because the audit log still names them, but nobody can currently do this
                            desk's work except a Super Admin.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Resolve>
      </div>

      <div className="mt-6">
        <Unavailable
          reason={
            "Last sign-in, actions taken and anything resembling a per-person performance figure " +
            "are not shown. ICEFALL records no session times at all, and while the audit log names " +
            "who made each change, it is read newest-first and capped — a count drawn from it would " +
            "be the size of a recent window presented as somebody's total. Neither is a gap in this " +
            "screen; there is simply nothing measured to put here."
          }
        />
      </div>
    </>
  );
}
