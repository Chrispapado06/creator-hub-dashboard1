import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ShieldCheck, ShieldOff, SquareStack } from "lucide-react";
import { Avatar } from "@/components/ui";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Resolve, Unavailable } from "@/components/states";
import { DESK_LABEL, useStaff } from "@/auth/session";
import { listStaff, setSupportScopes } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { RequesterKind, StaffRecord, StaffRole } from "@/data/types";
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
 *
 * LAYOUT: the reference theme — metric cards, then one card per desk carrying
 * its own table. The grouping, the scope editor and both warnings survived it;
 * the warnings are now the theme's amber alert instead of a line of amber text.
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
 * The theme's metric card, with ICEFALL's honesty contract intact: `value` of
 * null prints the REASON there is no figure — never a dash, never a zero
 * standing in for one. A measured zero prints as "0".
 */
function Metric({
  icon,
  label,
  value,
  reason,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string | null;
  reason?: string;
  hint?: string;
}) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>
          <div className="flex size-7 items-center justify-center rounded-lg border bg-ui-muted text-muted-foreground">
            {icon}
          </div>
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {value === null ? (
          <p className="text-sm leading-relaxed text-muted-foreground">{reason ?? "Not recorded"}</p>
        ) : (
          <>
            <div className="font-medium text-3xl leading-none tracking-tight tabular-nums">{value}</div>
            {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Access, drawn as the theme's status badge. Revoked is NEUTRAL rather than
 * red: a red cross reads as a refusal somebody should look into, and a revoked
 * account is an ordinary, deliberate end state that the note below the table
 * already explains. The colour is spent on the thing that is true — this person
 * currently has access — and withheld from the thing that is merely over.
 */
function AccessBadge({ active }: { active: boolean }) {
  return active ? (
    <Badge
      className="gap-1.5 border border-ok/20 bg-ok/10 px-2 py-1 font-medium text-ok"
      variant="outline"
    >
      <span className="size-1.5 rounded-full bg-ok" />
      Access active
    </Badge>
  ) : (
    <Badge
      className="gap-1.5 border border-border bg-ui-muted/50 px-2 py-1 font-medium text-muted-foreground"
      variant="outline"
    >
      <span className="size-1.5 rounded-full bg-muted-foreground" />
      Access revoked
    </Badge>
  );
}

/**
 * CR-14: who this person handles on the support desk. The chips are visible to
 * every staff member (the desk should be legible); CHANGING them is a super
 * admin's act through the audited `set_support_scopes` — same authority that
 * appoints staff at all. Empty = unscoped: their desk opens on everything.
 */
function ScopeCell({ staff, canEdit }: { staff: StaffRecord; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [scopes, setScopes] = useState<RequesterKind[]>(staff.support_scopes);
  const [saved, setSaved] = useState<RequesterKind[]>(staff.support_scopes);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const KINDS: { id: RequesterKind; label: string }[] = [
    { id: "athlete", label: "App users" },
    { id: "guide", label: "Guides" },
    { id: "company", label: "Companies" },
    { id: "visitor", label: "Visitors" },
  ];

  const save = async () => {
    setBusy(true);
    setErr(null);
    const r = await setSupportScopes(staff.profile_id, scopes);
    setBusy(false);
    if (r.state === "ok") {
      setSaved(scopes);
      setEditing(false);
    } else setErr(r.state === "error" ? r.reason : "No database is configured.");
  };

  if (!editing) {
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        {saved.length === 0 ? (
          // Unscoped. "Everyone" is the fact, not a placeholder for one.
          <span className="text-muted-foreground">Everyone</span>
        ) : (
          saved.map((k) => (
            <Badge key={k} className="rounded-sm" variant="outline">
              {KINDS.find((x) => x.id === k)?.label ?? k}
            </Badge>
          ))
        )}
        {canEdit && (
          <Button size="xs" variant="ghost" onClick={() => setEditing(true)}>
            Change
          </Button>
        )}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {KINDS.map((k) => (
        <Button
          key={k.id}
          size="xs"
          variant={scopes.includes(k.id) ? "secondary" : "outline"}
          aria-pressed={scopes.includes(k.id)}
          onClick={() =>
            setScopes((cur) => (cur.includes(k.id) ? cur.filter((x) => x !== k.id) : [...cur, k.id]))
          }
        >
          {k.label}
        </Button>
      ))}
      <Button size="xs" disabled={busy} onClick={() => void save()}>
        Save
      </Button>
      <Button
        size="xs"
        variant="ghost"
        onClick={() => {
          setScopes(saved);
          setEditing(false);
        }}
      >
        Cancel
      </Button>
      {/* A refusal from the database is printed in its own words, in place. */}
      {err && <span className="text-xs text-destructive">{err}</span>}
    </span>
  );
}

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
    /* `@container` is load-bearing, not decoration: it gives this box size
       containment in the inline axis, so a wide table scrolls inside its own
       card instead of pushing the whole page sideways and clipping its last
       column. The reference theme gets the same result from an
       `overflow-x-hidden` on its page container. */
    <div className="@container/page flex min-w-0 flex-col gap-4">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl tracking-tight">Admin Team</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            ICEFALL&rsquo;s own staff. The desk beside a name is not a job title — it is what the
            database will and will not let that person do.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-3 dark:*:data-[slot=card]:bg-card">
        <Metric
          icon={<ShieldCheck className="size-4" />}
          label="Staff with access"
          value={withAccess ? String(withAccess.length) : null}
          reason={reason}
          hint={
            departments > 0
              ? `Across ${departments} department${departments === 1 ? "" : "s"}.`
              : "No department is recorded against any of them."
          }
        />
        <Metric
          icon={<ShieldOff className="size-4" />}
          label="Access revoked"
          value={revoked === null ? null : String(revoked)}
          reason={reason}
          hint="Still listed. Audit events name the person who made each change, and a deleted row would leave that history pointing at nobody."
        />
        <Metric
          icon={<SquareStack className="size-4" />}
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

      <Card className="min-w-0">
        <CardHeader className="border-b">
          <CardTitle className="text-xl leading-none">What each desk gates</CardTitle>
          <CardDescription className="max-w-3xl leading-snug">
            The same rule the database holds, written down so nobody has to discover it by being
            refused.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <ul className="border-t">
            {DESKS.map((d) => (
              <li
                key={d.id}
                className="flex flex-col gap-2 border-b border-border/60 px-4 py-4 last:border-0 sm:flex-row sm:items-start sm:gap-5"
              >
                <div className="sm:w-40 sm:shrink-0">
                  <Badge className="rounded-sm" variant={d.id === "super_admin" ? "secondary" : "outline"}>
                    {DESK_LABEL[d.id]}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{d.gates}</p>
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter>
          <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
            These rules live in the database, not on this page. Hiding a control a policy would
            refuse is a courtesy; the write is refused either way, and a desk you were not given is
            not something a screen can hand you. Appointing staff, changing someone&rsquo;s desk and
            revoking access are not done from here.
          </p>
        </CardFooter>
      </Card>

      <Resolve
        result={result}
        what="staff"
        isEmpty={(v) => v.length === 0}
        empty="Nobody has been appointed yet. A person appears here once a Super Admin gives them a desk; there is no self-registration."
      >
        {(staff) => (
          <div className="flex min-w-0 flex-col gap-4">
            {DESKS.map((d) => {
              const desk = staff.filter((s) => s.staff_role === d.id);
              const live = desk.filter((s) => s.active).length;
              return (
                <Card className="min-w-0" key={d.id}>
                  <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 md:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
                    <CardTitle className="text-xl leading-none">{DESK_LABEL[d.id]}</CardTitle>
                    <CardDescription className="leading-snug">
                      {desk.length > 0 ? (
                        <span className="tabular-nums">
                          {live} with access
                          {desk.length - live > 0 && ` · ${desk.length - live} revoked`}
                        </span>
                      ) : (
                        // A desk with nobody on it is the whole reason this page
                        // groups by desk. It is said, not left blank.
                        "Nobody holds this desk."
                      )}
                    </CardDescription>
                  </CardHeader>

                  {desk.length === 0 ? (
                    <CardContent>
                      <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
                        <AlertTriangle className="size-4" />
                        <AlertTitle>Nobody holds this desk</AlertTitle>
                        <AlertDescription className="text-amber-900/80 dark:text-amber-50/80">
                          Until someone is appointed, only a Super Admin can do this desk&rsquo;s work.
                        </AlertDescription>
                      </Alert>
                    </CardContent>
                  ) : (
                    <>
                      <CardContent className="px-0">
                        <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
                          <TableHeader className="[&_tr]:border-t">
                            <TableRow>
                              <TableHead className="py-4 font-normal">Name</TableHead>
                              <TableHead className="py-4 font-normal">Department</TableHead>
                              <TableHead className="py-4 font-normal">Email</TableHead>
                              <TableHead className="py-4 font-normal">Status</TableHead>
                              <TableHead className="py-4 font-normal">Handles support for</TableHead>
                              <TableHead className="py-4 font-normal">Joined</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {desk.map((s) => {
                              const isMe = me !== null && me.profileId === s.profile_id;
                              return (
                                <TableRow key={s.profile_id} className="border-border/60">
                                  <TableCell className="py-4 align-middle">
                                    <div className="flex items-center gap-3">
                                      <Avatar name={s.name} size={32} tone={isMe ? "accent" : "neutral"} />
                                      <span className="font-medium">{s.name}</span>
                                      {isMe && (
                                        <Badge className="rounded-sm" variant="secondary">
                                          You
                                        </Badge>
                                      )}
                                    </div>
                                  </TableCell>
                                  <TableCell className="py-4 align-middle text-muted-foreground">
                                    {s.department.trim() || (
                                      <span className="text-muted-foreground">Not recorded</span>
                                    )}
                                  </TableCell>
                                  <TableCell className="py-4 align-middle text-muted-foreground">
                                    {s.email.trim() || <span className="text-muted-foreground">Not recorded</span>}
                                  </TableCell>
                                  <TableCell className="py-4 align-middle">
                                    <AccessBadge active={s.active} />
                                  </TableCell>
                                  <TableCell className="py-4 align-middle whitespace-normal">
                                    <ScopeCell staff={s} canEdit={me?.role === "super_admin"} />
                                  </TableCell>
                                  <TableCell className="py-4 align-middle tabular-nums text-muted-foreground">
                                    {formatDay(s.joined_on) ?? (
                                      <span className="text-muted-foreground">Not recorded</span>
                                    )}
                                  </TableCell>
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </CardContent>
                      {live === 0 && (
                        <CardContent>
                          <Alert className="border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-50">
                            <AlertTriangle className="size-4" />
                            <AlertTitle>Everyone at this desk has had their access revoked</AlertTitle>
                            <AlertDescription className="text-amber-900/80 dark:text-amber-50/80">
                              They stay listed because the audit log still names them, but nobody can
                              currently do this desk&rsquo;s work except a Super Admin.
                            </AlertDescription>
                          </Alert>
                        </CardContent>
                      )}
                    </>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Resolve>

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
  );
}
