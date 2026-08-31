import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock } from "lucide-react";
import { Avatar, Button, Card, PageHead, Pill, SectionLabel, Stat, StatusChip, TableCard } from "@/components/ui";
import { Resolve } from "@/components/states";
import {
  listCompanies, listDocuments, listIdentityChecks, listProfilesBasic,
  recordIdentityCheck, revokeIdentityCheck,
} from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Company, IdentityCheck, VerificationDocument } from "@/data/types";
import { daysUntil, formatDay, formatMoment } from "@/lib/utils";

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
 * Nothing here writes. There is no audited function for deciding a document, so
 * the page flags and counts; a person acts, somewhere else.
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
 * The state column, drawn as the mockup's chip.
 *
 * The tick is only ever `checked`, because that is the one state a member of
 * ICEFALL staff actually decided — and it still means only that somebody read
 * the document, never that the issuing body confirmed it. `pending` waits.
 * `rejected` and `expired` share the refused glyph because neither is a document
 * anybody may rely on today; the word beside it says which of the two it is, so
 * nothing is collapsed that the reader needs kept apart.
 */
const stateChip = (s: VerificationDocument["state"]): "ok" | "pending" | "bad" | "neutral" =>
  s === "checked" ? "ok" : s === "pending" ? "pending" : "bad";

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

  if (expiry.kind === "none") return <span className="text-faint">Not recorded</span>;
  if (expiry.kind === "unreadable" || day === null) return <span className="text-faint">Not readable</span>;

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap">
      <span>{day}</span>
      {expiry.kind === "expired" && (
        <Pill tone="red">
          <AlertTriangle size={12} strokeWidth={1.8} />
          {expiry.days === 1 ? "Expired yesterday" : `Expired ${expiry.days} days ago`}
        </Pill>
      )}
      {expiry.kind === "soon" && (
        <Pill tone="amber">
          <Clock size={12} strokeWidth={1.8} />
          {expiry.days === 0 ? "Expires today" : expiry.days === 1 ? "1 day left" : `${expiry.days} days left`}
        </Pill>
      )}
    </span>
  );
}

const HEAD = "px-5 py-3.5 text-[12px] font-semibold text-faint";

function DocumentTable({ docs, companyIds }: { docs: VerificationDocument[]; companyIds: Set<string> | null }) {
  return (
    <TableCard>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line-soft text-left">
            <th className={HEAD}>Subject</th>
            <th className={HEAD}>Document</th>
            <th className={HEAD}>Label</th>
            <th className={HEAD}>Issued</th>
            <th className={HEAD}>Expires</th>
            <th className={HEAD}>State</th>
            <th className={HEAD}>Checked on</th>
            <th className={HEAD}>Checked by</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id} className="border-b border-line-soft last:border-0 hover:bg-raised">
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-3 whitespace-nowrap">
                  {/* The monogram is drawn from the subject name the document
                      itself carries — nothing is looked up and nothing is
                      guessed at when the name is all there is. */}
                  <Avatar name={d.subject_name} size={34} />
                  {/* Linked only where the record is genuinely readable — a link to a
                      company the reader cannot open is a promise the screen breaks. */}
                  {companyIds?.has(d.subject_id) ? (
                    <Link to={`/admin/companies/${d.subject_id}`} className="font-medium text-ink hover:text-accent">
                      {d.subject_name}
                    </Link>
                  ) : (
                    <span className="font-medium text-ink">{d.subject_name}</span>
                  )}
                </div>
              </td>
              <td className="px-5 py-3.5">
                {/* Taxonomy, not status — a neutral pill, never a chip. */}
                <Pill>{KIND_LABEL[d.kind]}</Pill>
              </td>
              <td className="px-5 py-3.5 text-muted">
                {d.label}
                {d.note && <p className="mt-0.5 text-[11.5px] leading-snug text-faint">{d.note}</p>}
              </td>
              <td className="tnum whitespace-nowrap px-5 py-3.5 text-muted">
                {formatDay(d.issued_on) ?? <span className="text-faint">Not recorded</span>}
              </td>
              <td className="tnum px-5 py-3.5 text-muted">
                <ExpiryCell doc={d} />
              </td>
              <td className="whitespace-nowrap px-5 py-3.5">
                <StatusChip state={stateChip(d.state)} label={d.state} />
              </td>
              <td className="tnum whitespace-nowrap px-5 py-3.5 text-muted">
                {/* No date, no check. There is no third rendering of this. */}
                {formatDay(d.checked_on) ?? <span className="text-faint">Not checked</span>}
              </td>
              <td className="whitespace-nowrap px-5 py-3.5 text-muted">
                {d.checked_by ? (
                  <span className="flex items-center gap-2.5">
                    {/* Accent tells ICEFALL's own reader apart from the subject
                        whose document it is, at the far end of the same row. */}
                    <Avatar name={d.checked_by} size={28} tone="accent" />
                    {d.checked_by}
                  </span>
                ) : (
                  <span className="text-faint">Not recorded</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableCard>
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
    <div className="mt-6">
      <SectionLabel>Identity checks — the grey mark</SectionLabel>
      <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">
        A separate claim from everything above: ICEFALL confirmed the person is who they say — nothing
        about qualifications, nothing about membership. The mark is derived from this record and dies
        with its revocation; it never expires, because identity is established or it is not. Recorded by
        the operations desk, in their own name, against a stated document reference.
      </p>
      {err && <p className="mt-2 text-[12.5px] text-bad">{err}</p>}

      <div className="mt-2.5">
        {checks.state === "loading" ? (
          <Card><p className="text-[12.5px] text-faint">Reading identity checks…</p></Card>
        ) : checks.state !== "ok" ? (
          <Card>
            <p className="text-[12.5px] leading-relaxed text-bad">
              Identity checks could not be read: {"reason" in checks ? checks.reason : ""}
            </p>
            <p className="mt-1 text-[12px] text-faint">
              If this says the table does not exist, the identity migration has not been pushed yet.
            </p>
          </Card>
        ) : checks.value.length === 0 ? (
          <Card>
            <p className="text-[12.5px] text-faint">
              No identity has been checked yet. The first record appears here the moment the operations
              desk verifies one — and only then does anyone's grey mark exist.
            </p>
          </Card>
        ) : (
          <TableCard>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line-soft text-left">
                  <th className={HEAD}>Person</th>
                  <th className={HEAD}>Document reference</th>
                  <th className={HEAD}>Checked by</th>
                  <th className={HEAD}>On</th>
                  <th className={HEAD}>Mark</th>
                  <th className={HEAD}></th>
                </tr>
              </thead>
              <tbody>
                {checks.value.map((c) => (
                  <tr key={c.profile_id} className="border-b border-line-soft last:border-0">
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-3"><Avatar name={nameOf(c.profile_id)} size={34} />
                        <span className="font-medium text-ink">{nameOf(c.profile_id)}</span></span>
                    </td>
                    <td className="px-5 py-3.5 text-muted">{c.document_ref}</td>
                    <td className="px-5 py-3.5 text-muted">{nameOf(c.checked_by)}</td>
                    <td className="tnum whitespace-nowrap px-5 py-3.5 text-muted">{formatMoment(c.checked_at)}</td>
                    <td className="px-5 py-3.5">
                      {c.revoked_at === null ? (
                        // Grey, deliberately: this mark never borrows gold.
                        <Pill tone="neutral">identity established</Pill>
                      ) : (
                        <span>
                          <Pill tone="red">revoked</Pill>
                          <span className="mt-0.5 block text-[11.5px] text-faint">{c.revoke_reason}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      {c.revoked_at === null && (
                        revoking === c.profile_id ? (
                          <span className="flex items-center justify-end gap-2">
                            <input
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                              placeholder="Why — required, audited"
                              className="h-8 w-52 rounded-tile border border-line bg-surface px-2.5 text-[12px] outline-none focus:border-accent"
                            />
                            <Button size="sm" variant="secondary" disabled={busy || reason.trim().length < 3}
                              onClick={() => void act(() => revokeIdentityCheck(c.profile_id, reason))}>
                              Confirm
                            </Button>
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setRevoking(null); setReason(""); }}>
                              Cancel
                            </Button>
                          </span>
                        ) : (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setRevoking(c.profile_id)}>
                            Revoke
                          </Button>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </div>

      {/* Recording — the operations desk's own act, in their own name. The
          database refuses anyone else, so this form failing for a non-ops
          reader is the system working, and the error says so in its words. */}
      <Card className="mt-3">
        <p className="text-[12.5px] font-semibold text-ink">Record an identity check</p>
        <p className="mt-0.5 text-[12px] leading-relaxed text-faint">
          State what was seen as a reference ("passport, CY, ending 483") — never store the document
          itself. Re-checking a revoked or already-checked person replaces the record and clears any
          revocation; the audit trail keeps the history.
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <select
            value={who}
            onChange={(e) => setWho(e.target.value)}
            className="h-10 min-w-[220px] rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none"
          >
            <option value="">Choose a person…</option>
            {people.state === "ok" && people.value.map((p) => (
              <option key={p.id} value={p.id}>{p.display_name} ({p.role})</option>
            ))}
          </select>
          <input
            value={docRef}
            onChange={(e) => setDocRef(e.target.value)}
            placeholder="Document reference"
            className="h-10 min-w-[260px] flex-1 rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent"
          />
          <Button
            variant="secondary"
            disabled={busy || who === "" || docRef.trim().length < 3}
            onClick={() => void act(() => recordIdentityCheck(who, docRef))}
          >
            Record check
          </Button>
        </div>
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
    <>
      <PageHead
        title="Verification"
        subtitle="Documents companies and guides have sent to ICEFALL, and what ICEFALL did with each one. Checked means a member of ICEFALL staff read the document on the date shown — no insurer, registrar or awarding association was contacted, so nothing on this page is a third party's confirmation."
      />

      {/* Pastel in the mockup's order. A tile that cannot be counted — because the
          document list did not arrive — drops to plain surface on its own. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          tone="butter"
          label="Checked by ICEFALL"
          value={tally ? String(tally.checked) : null}
          reason={reason}
          hint={
            tally && tally.undatedChecks > 0
              ? `${tally.undatedChecks} more are marked checked but carry no date, so ICEFALL cannot say when — they are not counted here.`
              : "Documents a member of staff read on a recorded date, whatever they then decided."
          }
        />
        <Stat
          tone="sky"
          label="Pending a check"
          value={tally ? String(tally.pending) : null}
          reason={reason}
          hint="Sent to ICEFALL and not yet read by anybody."
        />
        <Stat
          tone="lilac"
          label="Expiring within 30 days"
          value={tally ? String(tally.soon) : null}
          reason={reason}
          hint={
            tally && tally.noExpiryDate > 0
              ? `Counted from recorded expiry dates only; ${tally.noExpiryDate} document${tally.noExpiryDate === 1 ? "" : "s"} carry none and cannot be chased.`
              : "Every document here carries an expiry date."
          }
        />
        <Stat
          tone="mint"
          label="Expired"
          value={tally ? String(tally.expired) : null}
          reason={reason}
          hint="Counted from the recorded expiry date, not from what a document's state was set to."
        />
      </div>

      <p className="mt-3 max-w-3xl text-[12.5px] leading-relaxed text-muted">
        A document inside 30 days of its recorded expiry raises a task for somebody to chase the renewal.
        This screen flags and counts; it changes nothing on its own, and no expiry is inferred for a document
        that arrived without one.
      </p>

      <div className="mt-6">
        <SectionLabel>Company documents checked by ICEFALL</SectionLabel>
        <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">{companyNote}</p>
        <div className="mt-2.5">
          <DocumentSection
            result={documents}
            subject="company"
            what="company documents"
            empty="No company has sent a document yet. A row appears here when one is uploaded, and stays pending until a member of ICEFALL staff has read it."
            companyIds={companyIds}
          />
        </div>
      </div>

      <div className="mt-6">
        <SectionLabel>Guide documents checked by ICEFALL</SectionLabel>
        <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">
          A checked carnet means a member of staff read it on a named date — not that the awarding
          association confirmed it holds good; ICEFALL has no channel to any association. Since
          20260831120000 the guide's credential state is DERIVED from the check record and its expiry
          (unchecked / checked / expired) — a stored "verified" that could outlive its evidence no longer
          exists anywhere. The two statements stay apart on purpose, and neither this page nor the guide
          record may collapse them into one.
        </p>
        <div className="mt-2.5">
          <DocumentSection
            result={documents}
            subject="guide"
            what="guide documents"
            empty="No guide has sent a document yet. Guides appear here only once they upload something; a guide absent from this list has had nothing checked."
            companyIds={null}
          />
        </div>
      </div>

      <IdentitySection />
    </>
  );
}
