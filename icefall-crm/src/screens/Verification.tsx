import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, CircleSlash, Clock, FileCheck2, Hourglass } from "lucide-react";
import { Avatar } from "@/components/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Resolve } from "@/components/states";
import {
  listCompanies, listDocuments, listIdentityChecks, listProfilesBasic,
  recordIdentityCheck, revokeIdentityCheck,
} from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Company, IdentityCheck, VerificationDocument } from "@/data/types";
import { daysUntil, formatDay, formatMoment } from "@/lib/utils";
import { Select } from "@/components/controls";

/**
 * The documents companies and guides have sent ICEFALL, and what ICEFALL did
 * with each one.
 *
 * "CHECKED" MEANS A MEMBER OF ICEFALL STAFF READ THE DOCUMENT ON A RECORDED
 * DATE. It does not mean the insurer, the registrar or the awarding association
 * was contacted — none of them were, ICEFALL has no channel to any of them, and
 * no word on this screen may be read as claiming otherwise. `checked_on` is null
 * until somebody actually did it, so it renders as "Not checked", never as a
 * date and never as a placeholder: a fabricated check date is the one error on
 * this page that could put a customer on a mountain with an uninsured operator.
 *
 * A DOCUMENT WITH NO `expires_on` IS "NOT RECORDED" — never "expired" and never
 * "no expiry". ICEFALL was not told when that cover lapses. Printing "expired"
 * would accuse an operator of something unevidenced; printing "no expiry" would
 * reassure a reader about cover nobody has confirmed still stands. Only a
 * recorded date is counted, flagged or chased, and the tiles say how many carry
 * none rather than quietly dropping them.
 *
 * A GUIDE'S DOCUMENTS CAN BE CHECKED WHILE THE GUIDE IS NOT VERIFIED. Those are
 * different claims and the schema keeps them apart — since 20260831120000 by a
 * DERIVED state (`guide_credentials_state`: unchecked/checked/expired, expiry
 * revoking the claim automatically) written only through the audited
 * operations-desk function. The distinction OUTLIVES the old pin: "checked"
 * means ICEFALL read the papers on a named date; it never means the issuing
 * federation confirmed anything, and this screen must never let the first read
 * as the second.
 *
 * The document tables write nothing. There is no audited function for deciding a
 * document, so that half of the page flags and counts; a person acts, somewhere
 * else. The identity section below DOES write, through its own audited calls.
 *
 * LAYOUT: the reference theme — metric cards, a section heading with its
 * standing sentence beneath it, and every table inside a card. The three marks
 * stayed apart, every "Not recorded" stayed in those words, and the identity
 * recorder and its revoke flow are untouched in what they do.
 */

/** Inside this many days of a recorded expiry, a document raises a task. */
const EXPIRY_WINDOW_DAYS = 30;

const KIND_LABEL: Record<VerificationDocument["kind"], string> = {
  insurance: "Insurance",
  business_registration: "Business registration",
  certification: "Certification",
  licence: "Licence",
  identity: "Identity",
  other: "Other",
};

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
 * The state column, drawn as the theme's status badge.
 *
 * The green dot is only ever `checked`, because that is the one state a member
 * of ICEFALL staff actually decided — and it still means only that somebody
 * read the document, never that the issuing body confirmed it. `pending` waits.
 * `rejected` and `expired` share the refused colour because neither is a
 * document anybody may rely on today; the word beside it says which of the two
 * it is, so nothing is collapsed that the reader needs kept apart.
 */
function StateBadge({ state }: { state: VerificationDocument["state"] }) {
  const tone =
    state === "checked"
      ? "border-ok/20 bg-ok/10 text-ok"
      : state === "pending"
        ? "border-warn/20 bg-warn/10 text-warn"
        : "border-bad/20 bg-bad/10 text-bad";
  const dot =
    state === "checked" ? "bg-ok" : state === "pending" ? "bg-warn" : "bg-bad";
  return (
    <Badge className={`gap-1.5 border px-2 py-1 font-medium ${tone}`} variant="outline">
      <span className={`size-1.5 rounded-full ${dot}`} />
      {state}
    </Badge>
  );
}

type Expiry =
  | { kind: "none" }
  | { kind: "unreadable" }
  | { kind: "expired"; days: number }
  | { kind: "soon"; days: number }
  | { kind: "current" };

/**
 * What the recorded expiry date says — and nothing beyond it.
 *
 * The absence of a date is its own answer, kept distinct from a date that has
 * passed. Everything downstream branches on this rather than on the stored
 * `state`, because `state` is what somebody typed and the date is what the
 * document says.
 */
function expiryOf(doc: VerificationDocument): Expiry {
  if (!doc.expires_on) return { kind: "none" };
  const days = daysUntil(doc.expires_on);
  if (!Number.isFinite(days)) return { kind: "unreadable" };
  if (days < 0) return { kind: "expired", days: -days };
  if (days <= EXPIRY_WINDOW_DAYS) return { kind: "soon", days };
  return { kind: "current" };
}

function ExpiryCell({ doc }: { doc: VerificationDocument }) {
  const expiry = expiryOf(doc);
  const day = formatDay(doc.expires_on);

  // Two different absences, kept apart: nobody told us, versus we cannot read
  // what we were told. Neither is a dash and neither is "expired".
  if (expiry.kind === "none") return <span className="text-muted-foreground">Not recorded</span>;
  if (expiry.kind === "unreadable" || day === null)
    return <span className="text-muted-foreground">Not readable</span>;

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span>{day}</span>
      {expiry.kind === "expired" && (
        <Badge
          className="gap-1.5 border border-bad/20 bg-bad/10 px-2 py-1 font-medium text-bad"
          variant="outline"
        >
          <AlertTriangle className="size-3" />
          {expiry.days === 1 ? "Expired yesterday" : `Expired ${expiry.days} days ago`}
        </Badge>
      )}
      {expiry.kind === "soon" && (
        <Badge
          className="gap-1.5 border border-warn/20 bg-warn/10 px-2 py-1 font-medium text-warn"
          variant="outline"
        >
          <Clock className="size-3" />
          {expiry.days === 0 ? "Expires today" : expiry.days === 1 ? "1 day left" : `${expiry.days} days left`}
        </Badge>
      )}
    </span>
  );
}

const TH = "py-4 font-normal";
const TD = "py-4 align-middle";

function DocumentTable({ docs, companyIds }: { docs: VerificationDocument[]; companyIds: Set<string> | null }) {
  return (
    <Card className="min-w-0">
      <CardContent className="px-0">
        <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
          <TableHeader>
            <TableRow>
              <TableHead className={TH}>Subject</TableHead>
              <TableHead className={TH}>Document</TableHead>
              <TableHead className={TH}>Label</TableHead>
              <TableHead className={TH}>Issued</TableHead>
              <TableHead className={TH}>Expires</TableHead>
              <TableHead className={TH}>State</TableHead>
              <TableHead className={TH}>Checked on</TableHead>
              <TableHead className={TH}>Checked by</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {docs.map((d) => (
              <TableRow key={d.id} className="border-border/60">
                <TableCell className={TD}>
                  <div className="flex items-center gap-3 whitespace-nowrap">
                    {/* The monogram is drawn from the subject name the document
                        itself carries — nothing is looked up and nothing is
                        guessed at when the name is all there is. */}
                    <Avatar name={d.subject_name} size={32} />
                    {/* Linked only where the record is genuinely readable — a link to a
                        company the reader cannot open is a promise the screen breaks. */}
                    {companyIds?.has(d.subject_id) ? (
                      <Link to={`/admin/companies/${d.subject_id}`} className="font-medium hover:underline">
                        {d.subject_name}
                      </Link>
                    ) : (
                      <span className="font-medium">{d.subject_name}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className={TD}>
                  {/* Taxonomy, not status — a neutral badge, never a status one. */}
                  <Badge className="rounded-sm" variant="outline">
                    {KIND_LABEL[d.kind]}
                  </Badge>
                </TableCell>
                <TableCell className={`${TD} whitespace-normal text-muted-foreground`}>
                  {d.label}
                  {d.note && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{d.note}</p>}
                </TableCell>
                <TableCell className={`${TD} tabular-nums text-muted-foreground`}>
                  {formatDay(d.issued_on) ?? <span className="text-muted-foreground">Not recorded</span>}
                </TableCell>
                <TableCell className={`${TD} tabular-nums text-muted-foreground`}>
                  <ExpiryCell doc={d} />
                </TableCell>
                <TableCell className={TD}>
                  <StateBadge state={d.state} />
                </TableCell>
                <TableCell className={`${TD} tabular-nums text-muted-foreground`}>
                  {/* No date, no check. There is no third rendering of this. */}
                  {formatDay(d.checked_on) ?? <span className="text-muted-foreground">Not checked</span>}
                </TableCell>
                <TableCell className={`${TD} text-muted-foreground`}>
                  {d.checked_by ? (
                    <span className="flex items-center gap-2.5">
                      {/* A filled monogram tells ICEFALL's own reader apart from
                          the subject whose document it is, at the far end of the
                          same row. */}
                      <Avatar name={d.checked_by} size={24} tone="accent" />
                      {d.checked_by}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Not recorded</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function DocumentSection({
  result,
  subject,
  what,
  empty,
  companyIds,
}: {
  result: Result<VerificationDocument[]>;
  subject: VerificationDocument["subject_type"];
  what: string;
  empty: string;
  companyIds: Set<string> | null;
}) {
  return (
    <Resolve
      result={result}
      what={what}
      // A domain predicate, not `length === 0`: documents may exist for the other
      // subject while this half of the page genuinely holds nothing yet.
      isEmpty={(v) => !v.some((d) => d.subject_type === subject)}
      empty={empty}
    >
      {(all) => <DocumentTable docs={all.filter((d) => d.subject_type === subject)} companyIds={companyIds} />}
    </Resolve>
  );
}

/**
 * The GREY mark — identity — managed as its own fact, never merged with gold.
 *
 * OWNER RULING (the three marks): GOLD is credentials checked by ICEFALL
 * (guides only, the flow above), GREY is identity verified ("this person is
 * who they say", nothing more), BLUE is paid membership (a billing fact,
 * elsewhere). Three different claims, three different marks, and none may
 * borrow another's colour — on a platform where a badge may read as
 * "qualified to lead me up a mountain", paid membership and safety-relevant
 * verification cannot share a symbol.
 *
 * The mark is DERIVED from the record (identity_verified()), never stored;
 * identity has NO EXPIRY, deliberately — established-or-not, unlike a
 * credential that lapses with its insurance. Recording and revoking go
 * through the audited operations-desk functions; the table itself refuses
 * direct writes, staff included.
 */
function IdentitySection() {
  const [checks, setChecks] = useState<Result<IdentityCheck[]>>(loading);
  const [people, setPeople] = useState<Result<{ id: string; display_name: string; role: string }[]>>(loading);
  const [who, setWho] = useState("");
  const [docRef, setDocRef] = useState("");
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listIdentityChecks().then(setChecks);
    void listProfilesBasic().then(setPeople);
  }, []);
  useEffect(refresh, [refresh]);

  const nameOf = useMemo(() => {
    const m = new Map<string, string>();
    if (people.state === "ok") for (const p of people.value) m.set(p.id, p.display_name);
    return (id: string | null) => (id ? (m.get(id) ?? id.slice(0, 8)) : "not recorded");
  }, [people]);

  const act = async (fn: () => Promise<Result<null>>) => {
    setBusy(true);
    setErr(null);
    const r = await fn();
    setBusy(false);
    if (r.state !== "ok") setErr(r.state === "error" ? r.reason : "No database is configured.");
    else {
      setWho(""); setDocRef(""); setRevoking(null); setReason("");
    }
    refresh();
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h2 className="font-heading text-base font-medium">Identity checks — the grey mark</h2>
      <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
        A separate claim from everything above: ICEFALL confirmed the person is who they say — nothing
        about qualifications, nothing about membership. The mark is derived from this record and dies
        with its revocation; it never expires, because identity is established or it is not. Recorded by
        the operations desk, in their own name, against a stated document reference.
      </p>
      {/* A refusal from the database, in its own words. It does not disappear. */}
      {err && <p className="text-sm text-destructive">{err}</p>}

      {checks.state === "loading" ? (
        <Card className="min-w-0">
          <CardContent>
            <p className="text-sm text-muted-foreground">Reading identity checks…</p>
          </CardContent>
        </Card>
      ) : checks.state !== "ok" ? (
        <Card className="min-w-0">
          <CardContent className="flex flex-col gap-1">
            <p className="text-sm leading-relaxed text-destructive">
              Identity checks could not be read: {"reason" in checks ? checks.reason : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              If this says the table does not exist, the identity migration has not been pushed yet.
            </p>
          </CardContent>
        </Card>
      ) : checks.value.length === 0 ? (
        <Card className="min-w-0">
          <CardContent>
            <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
              No identity has been checked yet. The first record appears here the moment the operations
              desk verifies one — and only then does anyone&rsquo;s grey mark exist.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="min-w-0">
          <CardContent className="px-0">
            <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
              <TableHeader>
                <TableRow>
                  <TableHead className={TH}>Person</TableHead>
                  <TableHead className={TH}>Document reference</TableHead>
                  <TableHead className={TH}>Checked by</TableHead>
                  <TableHead className={TH}>On</TableHead>
                  <TableHead className={TH}>Mark</TableHead>
                  <TableHead className={TH}></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {checks.value.map((c) => (
                  <TableRow key={c.profile_id} className="border-border/60">
                    <TableCell className={TD}>
                      <span className="flex items-center gap-3">
                        <Avatar name={nameOf(c.profile_id)} size={32} />
                        <span className="font-medium">{nameOf(c.profile_id)}</span>
                      </span>
                    </TableCell>
                    <TableCell className={`${TD} text-muted-foreground`}>{c.document_ref}</TableCell>
                    <TableCell className={`${TD} text-muted-foreground`}>{nameOf(c.checked_by)}</TableCell>
                    <TableCell className={`${TD} tabular-nums text-muted-foreground`}>
                      {formatMoment(c.checked_at)}
                    </TableCell>
                    <TableCell className={`${TD} whitespace-normal`}>
                      {c.revoked_at === null ? (
                        // Grey, deliberately: this mark never borrows gold.
                        <Badge className="rounded-sm" variant="outline">
                          identity established
                        </Badge>
                      ) : (
                        <span className="grid gap-0.5">
                          <span className="flex">
                            <Badge
                              className="gap-1.5 border border-bad/20 bg-bad/10 px-2 py-1 font-medium text-bad"
                              variant="outline"
                            >
                              <span className="size-1.5 rounded-full bg-bad" />
                              revoked
                            </Badge>
                          </span>
                          {/* The stated reason, verbatim, beside the mark it killed. */}
                          <span className="block text-xs text-muted-foreground">{c.revoke_reason}</span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className={`${TD} text-right`}>
                      {c.revoked_at === null && (
                        revoking === c.profile_id ? (
                          <span className="flex flex-wrap items-center justify-end gap-2">
                            <Input
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Why — required, audited"
                              className="w-52"
                            />
                            <Button size="sm" disabled={busy || reason.trim().length < 3}
                              onClick={() => void act(() => revokeIdentityCheck(c.profile_id, reason))}>
                              Confirm
                            </Button>
                            <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setRevoking(null); setReason(""); }}>
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => setRevoking(c.profile_id)}>
                            Revoke
                          </Button>
                        )
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recording — the operations desk's own act, in their own name. The
          database refuses anyone else, so this form failing for a non-ops
          reader is the system working, and the error says so in its words. */}
      <Card className="min-w-0 mt-2">
        <CardHeader>
          <CardTitle>Record an identity check</CardTitle>
          <CardDescription className="max-w-3xl">
            State what was seen as a reference ("passport, CY, ending 483") — never store the document
            itself. Re-checking a revoked or already-checked person replaces the record and clears any
            revocation; the audit trail keeps the history.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={who}
              onChange={setWho}
              ariaLabel="Person whose identity was checked"
              placeholder="Choose a person…"
              className="min-w-[240px]"
              options={people.state === "ok" ? people.value.map((p) => ({ value: p.id, label: p.display_name, hint: p.role })) : []}
            />
            <Input
              value={docRef}
              onChange={(e) => setDocRef(e.target.value)}
              placeholder="Document reference"
              className="min-w-[260px] flex-1"
            />
            <Button
              variant="outline"
              disabled={busy || who === "" || docRef.trim().length < 3}
              onClick={() => void act(() => recordIdentityCheck(who, docRef))}
            >
              Record check
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Verification() {
  const [documents, setDocuments] = useState<Result<VerificationDocument[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);

  useEffect(() => {
    void listDocuments().then(setDocuments);
    void listCompanies().then(setCompanies);
  }, []);

  const reason =
    documents.state === "unavailable" || documents.state === "error" ? documents.reason : "Not recorded";

  const tally = (() => {
    if (documents.state !== "ok") return null;
    const docs = documents.value;
    const expiries = docs.map(expiryOf);
    return {
      // Checked is counted from the recorded date, not the stored state, so this
      // tile can never disagree with the "Checked on" column beside it.
      checked: docs.filter((d) => d.checked_on !== null).length,
      undatedChecks: docs.filter((d) => d.state === "checked" && d.checked_on === null).length,
      pending: docs.filter((d) => d.state === "pending").length,
      soon: expiries.filter((e) => e.kind === "soon").length,
      expired: expiries.filter((e) => e.kind === "expired").length,
      noExpiryDate: expiries.filter((e) => e.kind === "none" || e.kind === "unreadable").length,
    };
  })();

  const companyIds = companies.state === "ok" ? new Set(companies.value.map((c) => c.id)) : null;

  /**
   * Companies that have sent nothing at all never appear in this table, and a
   * reader scanning a page of green pills would conclude the roster is clean.
   * Naming the count is the only thing that stops absence reading as approval.
   */
  const silence = (() => {
    if (companies.state !== "ok" || documents.state !== "ok") return null;
    const held = new Set(documents.value.filter((d) => d.subject_type === "company").map((d) => d.subject_id));
    return { without: companies.value.filter((c) => !held.has(c.id)).length, total: companies.value.length };
  })();

  const companyNote =
    silence === null
      ? "How many companies have sent nothing at all cannot be stated here: this table lists documents, and the company list it would have to be compared against is not readable."
      : silence.without === 0
        ? `All ${silence.total} companies on record have at least one document below.`
        : `${silence.without} of ${silence.total} companies have sent no document at all and appear nowhere below. A company missing from this table has not been checked — it has been silent, which is not the same thing.`;

  return (
    /* `@container` is load-bearing, not decoration: it gives this box size
       containment in the inline axis, so a wide table scrolls inside its own
       card instead of pushing the whole page sideways and clipping its last
       column. The reference theme gets the same result from an
       `overflow-x-hidden` on its page container. */
    <div className="@container/page flex min-w-0 flex-col gap-4">
      <div className="flex flex-col items-start gap-4 sm:flex-row sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl tracking-tight">Verification</h1>
          <p className="max-w-4xl text-sm text-muted-foreground">
            Documents companies and guides have sent to ICEFALL, and what ICEFALL did with each one.
            Checked means a member of ICEFALL staff read the document on the date shown — no insurer,
            registrar or awarding association was contacted, so nothing on this page is a third
            party&rsquo;s confirmation.
          </p>
        </div>
      </div>

      {/* A tile that cannot be counted — because the document list did not
          arrive — carries the reason instead of a number. */}
      <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
        <Metric
          icon={<FileCheck2 className="size-4" />}
          label="Checked by ICEFALL"
          value={tally ? String(tally.checked) : null}
          reason={reason}
          hint={
            tally && tally.undatedChecks > 0
              ? `${tally.undatedChecks} more are marked checked but carry no date, so ICEFALL cannot say when — they are not counted here.`
              : "Documents a member of staff read on a recorded date, whatever they then decided."
          }
        />
        <Metric
          icon={<Hourglass className="size-4" />}
          label="Pending a check"
          value={tally ? String(tally.pending) : null}
          reason={reason}
          hint="Sent to ICEFALL and not yet read by anybody."
        />
        <Metric
          icon={<CalendarClock className="size-4" />}
          label="Expiring within 30 days"
          value={tally ? String(tally.soon) : null}
          reason={reason}
          hint={
            tally && tally.noExpiryDate > 0
              ? `Counted from recorded expiry dates only; ${tally.noExpiryDate} document${tally.noExpiryDate === 1 ? "" : "s"} carry none and cannot be chased.`
              : "Every document here carries an expiry date."
          }
        />
        <Metric
          icon={<CircleSlash className="size-4" />}
          label="Expired"
          value={tally ? String(tally.expired) : null}
          reason={reason}
          hint="Counted from the recorded expiry date, not from what a document's state was set to."
        />
      </div>

      <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
        A document inside 30 days of its recorded expiry raises a task for somebody to chase the renewal.
        This screen flags and counts; it changes nothing on its own, and no expiry is inferred for a document
        that arrived without one.
      </p>

      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="font-heading text-base font-medium">Company documents checked by ICEFALL</h2>
        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">{companyNote}</p>
        <DocumentSection
          result={documents}
          subject="company"
          what="company documents"
          empty="No company has sent a document yet. A row appears here when one is uploaded, and stays pending until a member of ICEFALL staff has read it."
          companyIds={companyIds}
        />
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <h2 className="font-heading text-base font-medium">Guide documents checked by ICEFALL</h2>
        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
          A checked carnet means a member of staff read it on a named date — not that the awarding
          association confirmed it holds good; ICEFALL has no channel to any association. Since
          20260831120000 the guide&rsquo;s credential state is DERIVED from the check record and its expiry
          (unchecked / checked / expired) — a stored "verified" that could outlive its evidence no longer
          exists anywhere. The two statements stay apart on purpose, and neither this page nor the guide
          record may collapse them into one.
        </p>
        <DocumentSection
          result={documents}
          subject="guide"
          what="guide documents"
          empty="No guide has sent a document yet. Guides appear here only once they upload something; a guide absent from this list has had nothing checked."
          companyIds={null}
        />
      </div>

      <IdentitySection />
    </div>
  );
}
