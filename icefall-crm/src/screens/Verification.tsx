import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Clock } from "lucide-react";
import { Avatar, PageHead, Pill, SectionLabel, Stat, StatusChip, TableCard } from "@/components/ui";
import { Resolve } from "@/components/states";
import { listCompanies, listDocuments } from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Company, VerificationDocument } from "@/data/types";
import { daysUntil, formatDay } from "@/lib/utils";

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
 * different claims and the schema keeps them apart: `credentials_verified` is
 * constrained to false for every guide because ICEFALL verifies no guide
 * credential at all yet. This screen must never let the first read as the second.
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
          ICEFALL verifies no guide credential. The database constrains that flag to false for every guide, so a
          guide's documents can be checked here while the guide remains unverified — a checked carnet means a
          member of staff read it, not that the awarding association confirmed it holds good. The two statements
          are kept apart on purpose, and neither this page nor the guide record may collapse them into one.
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
    </>
  );
}
