import { useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { Avatar, Card, PageHead, Pill, SectionLabel, Stat, StatusChip, TableCard } from "@/components/ui";
import { Resolve, Unavailable } from "@/components/states";
import { listDocuments, listGuides } from "@/data/queries";
import { formatCents, formatCentsShort, loading, type Result } from "@/data/result";
import type { DocumentState, GuideRecord, VerificationDocument } from "@/data/types";
import { formatDay } from "@/lib/utils";

/**
 * The individual guides ICEFALL lists, and exactly how much ICEFALL knows about
 * each of them.
 *
 * NO GUIDE IS EVER SHOWN AS VERIFIED ON THIS SCREEN, AND THIS IS THE SAFETY RULE
 * THE WHOLE FILE EXISTS TO HOLD. `credentials_verified` is constrained to FALSE
 * for every row in the database because ICEFALL verifies no guide credential at
 * all — nobody here reads carnets, and no awarding association has ever been
 * contacted. A tick beside "IFMGA" is, in practice, the entire reason a client
 * stops asking to see the carnet themselves, and on glaciated ground that
 * question is the only protection they have. So the page reports the one thing
 * that is true — whether an ICEFALL staff member opened the documents, on a
 * recorded date — and nothing that could be read as a qualification.
 *
 * WHICH CONSTRAINS THE SKIN AS WELL AS THE COPY. The mockup's green tick is the
 * strongest single mark in this design language, and on a guide row it would be
 * read as a person having been approved. It is therefore spent on nothing here:
 * not on the document check, not on the marketplace listing, and not on a
 * document somebody typed as checked without leaving a date. The only chips that
 * carry colour on this screen are refusals and waits.
 *
 * "DOCUMENTS CHECKED" IS NOT "ALL DOCUMENTS CHECKED". `documents_checked_on` is
 * a date somebody reviewed something; a guide can carry that date and still have
 * an unread certificate sitting on file. The table says how many are on file and
 * how many nobody has opened, and the section below lists them, because the gap
 * between the two is where a client would be misled.
 *
 * `revenue_cents` IS NULL WHEN NO GUIDE BOOKING HAS HAD ITS VALUE RECORDED. That
 * renders as "Not recorded" and never as €0 — a guide who has earned nothing and
 * a guide whose earnings nobody wrote down are different facts, and only one of
 * them is a reason to stop listing somebody.
 *
 * THERE IS NO CONVERSION RATE HERE ON PURPOSE. Leads owns that figure, and a
 * second one computed over a different denominator would quietly become a rival
 * definition of the same word.
 */

/** Only the guide's own documents. Company documents belong to Verification. */
const documentsFor = (docs: VerificationDocument[], guideId: string) =>
  docs.filter((d) => d.subject_type === "guide" && d.subject_id === guideId);

/** The date is the evidence, not the stored state — `state` is what somebody typed. */
const isUnchecked = (d: VerificationDocument) => d.subject_type === "guide" && d.checked_on === null;

const KIND_LABEL: Record<VerificationDocument["kind"], string> = {
  insurance: "Insurance",
  business_registration: "Business registration",
  certification: "Certification",
  licence: "Licence",
  identity: "Identity",
  other: "Other",
};

/**
 * The stored state of a document nobody has read.
 *
 * `rejected` and `expired` are refusals and take the red glyph, which is exactly
 * the weight the chip they replace carried. `pending` takes the amber wait,
 * which is the honest reading of every row in that table. `checked` NEVER takes
 * the green tick: these rows are selected precisely because they carry no check
 * date, so a row typed as checked is a contradiction to be looked at, not a
 * settlement — a tick would say the opposite of the heading above it.
 */
const documentState = (s: DocumentState): "ok" | "pending" | "bad" | "neutral" =>
  s === "rejected" || s === "expired" ? "bad" : s === "pending" ? "pending" : "neutral";

/**
 * What ICEFALL did, in the smallest number of words that stays true.
 *
 * Deliberately not green. Everywhere else in this CRM green means settled, and a
 * green chip in a "documents" column is the exact glance that makes a reader
 * think somebody vetted this person. The date carries the meaning; the colour is
 * not asked to help.
 */
function DocumentsChecked({ guide, documents }: { guide: GuideRecord; documents: VerificationDocument[] | null }) {
  const on = formatDay(guide.documents_checked_on);
  const mine = documents === null ? null : documentsFor(documents, guide.id);
  const unchecked = mine === null ? null : mine.filter((d) => d.checked_on === null).length;

  return (
    <span className="block">
      {on === null ? (
        <span className="text-[12.5px] text-faint">Not checked</span>
      ) : (
        <Pill className="whitespace-nowrap">Documents checked {on}</Pill>
      )}
      {/* Absent entirely when the document table could not be read — the section
          below states the reason once rather than repeating it in every row. */}
      {mine !== null && unchecked !== null && (
        <span className="mt-1.5 block text-[12px] text-faint">
          {mine.length === 0
            ? "No documents on file"
            : unchecked === 0
              ? `${mine.length} on file, all checked`
              : `${mine.length} on file · ${unchecked} not checked`}
        </span>
      )}
    </span>
  );
}

export default function Guides() {
  const [guides, setGuides] = useState<Result<GuideRecord[]>>(loading);
  const [documents, setDocuments] = useState<Result<VerificationDocument[]>>(loading);

  useEffect(() => {
    void listGuides().then(setGuides);
    void listDocuments().then(setDocuments);
  }, []);

  const rows = guides.state === "ok" ? guides.value : null;
  const docs = documents.state === "ok" ? documents.value : null;

  // Three absences that would otherwise all render as the same zero: the
  // database is unreachable, the table exists and is empty, and the row exists
  // but the figure was never written.
  const reason =
    guides.state === "unavailable" || guides.state === "error"
      ? guides.reason
      : rows !== null && rows.length === 0
        ? "No guide records exist yet."
        : "Not recorded";

  const onRecord = rows !== null && rows.length > 0 ? String(rows.length) : null;

  const checked = rows === null ? null : rows.filter((g) => g.documents_checked_on !== null).length;
  const checkedValue = rows !== null && checked !== null && rows.length > 0 ? `${checked} of ${rows.length}` : null;

  const withRevenue = rows === null ? null : rows.filter((g) => g.revenue_cents !== null);
  const revenueValue =
    withRevenue !== null && withRevenue.length > 0
      ? formatCentsShort(withRevenue.reduce((n, g) => n + (g.revenue_cents ?? 0), 0))
      : null;
  const revenueExcluded = rows !== null && withRevenue !== null ? rows.length - withRevenue.length : 0;
  const revenueReason =
    rows !== null && rows.length > 0 && withRevenue !== null && withRevenue.length === 0
      ? "No guide booking has had its value recorded. The column holds NULL rather than zero, which is the difference between nothing being earned and nobody writing it down."
      : reason;

  // A row arriving with the flag set would mean the CHECK constraint had been
  // dropped without a verification process behind it. That gets said in words —
  // it never becomes a tick.
  const flaggedVerified = rows === null ? 0 : rows.filter((g) => g.credentials_verified).length;

  return (
    <>
      <PageHead
        title="Guides"
        subtitle="Individual mountain guides listed through ICEFALL, and the documents ICEFALL has actually read about each of them."
      />

      <Card className="mb-4 flex items-start gap-4">
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[oklch(0.962_0.055_84)] text-warn"
        >
          <ShieldAlert size={19} strokeWidth={1.9} />
        </span>
        <div className="min-w-0">
          <p className="text-[14.5px] font-bold tracking-[-0.01em] text-ink">
            ICEFALL does not verify guide credentials
          </p>
          <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">
            No guide here is verified and none can be: the credentials_verified column is constrained to FALSE on
            every row, and dropping that constraint is the deliberate act that would turn verification on. It should
            not be dropped before somebody at ICEFALL is genuinely reading carnets and licences. Until then the only
            claim this page makes is that a member of staff opened a document on a recorded date — which is a
            statement about ICEFALL&rsquo;s work, not about the guide&rsquo;s qualification, and never about the
            awarding association, which has not been contacted.
          </p>
          {flaggedVerified > 0 && (
            <p className="mt-2.5 max-w-3xl text-[12.5px] leading-relaxed text-warn">
              {flaggedVerified === 1 ? "One guide record carries" : `${flaggedVerified} guide records carry`} the
              verified flag. Nothing in ICEFALL sets it, so either the constraint has been dropped or the row was
              written by hand. It is reported here in words rather than drawn as a badge anywhere on this page.
            </p>
          )}
        </div>
      </Card>

      {/* The pastels run butter, sky, lilac, mint. The second tile can never
          carry a figure, so it never carries its colour either — which is the
          whole reason the tone is allowed to mean "there is a number here". */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat tone="butter" label="Guides on record" value={onRecord} reason={reason} />
        <Stat
          tone="sky"
          label="Credentials verified"
          value={null}
          reason="Not a figure ICEFALL can produce. The column is constrained to FALSE, so a count here could only ever be zero — and a zero would imply the check exists and nobody has passed it."
        />
        <Stat
          tone="lilac"
          label="Guides with documents checked"
          value={checkedValue}
          reason={reason}
          hint={
            rows !== null && checked !== null
              ? checked === rows.length
                ? "Every guide carries a check date. It covers the documents staff opened, not necessarily every document on file."
                : `${rows.length - checked} guide${rows.length - checked === 1 ? "" : "s"} carry no check date at all.`
              : undefined
          }
        />
        <Stat
          tone="mint"
          label="Revenue attributed to guides"
          value={revenueValue}
          reason={revenueReason}
          hint={
            revenueExcluded > 0
              ? `Excludes ${revenueExcluded} guide${revenueExcluded === 1 ? "" : "s"} whose revenue has not been recorded.`
              : "Every guide on record carries a recorded revenue figure."
          }
        />
      </div>

      <div className="mt-6">
        <SectionLabel>Guides</SectionLabel>
        <div className="mt-1.5">
          <Resolve
            result={guides}
            what="guides"
            isEmpty={(v) => v.length === 0}
            empty="No guide has been added yet. Operations creates a guide record when a company nominates one or a guide applies directly."
          >
            {(list) => {
              const listed = list.filter((g) => g.listed);
              const listedUnchecked = listed.filter((g) => g.documents_checked_on === null).length;
              return (
                <>
                  <TableCard>
                    <table className="w-full min-w-[1080px] text-[13px]">
                      <thead>
                        <tr className="border-b border-line-soft text-left">
                          <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Guide</th>
                          <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Based in</th>
                          <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Mountains</th>
                          <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Documents checked</th>
                          <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Leads</th>
                          <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Bookings</th>
                          <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Revenue</th>
                          <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Listed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {list.map((g) => (
                          <tr key={g.id} className="border-b border-line-soft last:border-0 hover:bg-raised">
                            <td className="px-5 py-3.5">
                              <span className="flex items-center gap-3">
                                <Avatar name={g.name} size={34} />
                                <span className="whitespace-nowrap font-medium text-ink">{g.name}</span>
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-muted">
                              {g.based_in ?? <span className="text-faint">Not recorded</span>}
                            </td>
                            <td className="px-5 py-3.5">
                              {g.mountains.length === 0 ? (
                                <span className="text-faint">None recorded</span>
                              ) : (
                                <span className="flex flex-wrap gap-1.5">
                                  {g.mountains.map((m) => (
                                    <Pill key={m}>{m}</Pill>
                                  ))}
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5">
                              <DocumentsChecked guide={g} documents={docs} />
                            </td>
                            <td className="tnum px-5 py-3.5 text-[15px] font-bold tracking-[-0.02em] text-ink">
                              {g.leads}
                            </td>
                            <td className="tnum px-5 py-3.5 text-[15px] font-bold tracking-[-0.02em] text-ink">
                              {g.bookings}
                            </td>
                            {/* The figure is heavy; the absence stays light, so the
                                weight of this column is itself a claim that there
                                is a recorded number under it. */}
                            <td className="tnum px-5 py-3.5 text-[15px] font-bold tracking-[-0.02em] text-ink">
                              {formatCents(g.revenue_cents) ?? (
                                <span className="text-[12.5px] font-normal tracking-normal text-faint">
                                  Not recorded
                                </span>
                              )}
                            </td>
                            {/* Not a StatusChip. "Listed" is where a guide's card
                                is shown, not a judgement anybody made about the
                                guide, and the chip's green tick on this row would
                                be read as the approval this page exists to deny. */}
                            <td className="whitespace-nowrap px-5 py-3.5">
                              <Pill tone={g.listed ? "accent" : "neutral"}>{g.listed ? "Listed" : "Not listed"}</Pill>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </TableCard>

                  {listed.length > 0 && (
                    <p className="mt-2.5 max-w-3xl text-[12px] leading-relaxed text-faint">
                      {listedUnchecked === 0
                        ? `All ${listed.length} guides visible to customers have a recorded document check.`
                        : `${listedUnchecked} of the ${listed.length} guides visible to customers ${
                            listedUnchecked === 1 ? "has" : "have"
                          } no recorded document check.`}
                    </p>
                  )}
                  <p className="mt-1 max-w-3xl text-[12px] leading-relaxed text-faint">
                    A guide record carries no currency of its own, so revenue is shown in ICEFALL&rsquo;s reporting
                    currency and an amount earned in another one is not converted.
                  </p>
                </>
              );
            }}
          </Resolve>
        </div>
      </div>

      <div className="mt-6">
        <SectionLabel>Guide documents nobody has read</SectionLabel>
        <p className="mt-1.5 max-w-3xl text-[12.5px] leading-relaxed text-muted">
          Sent to ICEFALL, stored, and nothing further. This is the distance between what a guide has claimed and
          what anyone here has looked at, and it is the reason no badge appears above.
        </p>
        <div className="mt-2.5">
          <Resolve
            result={documents}
            what="unread guide documents"
            isEmpty={(v) => v.filter(isUnchecked).length === 0}
            empty="Every document a guide has sent has been opened by ICEFALL staff. That is still not verification — no awarding body was contacted."
          >
            {(all) => (
              <TableCard>
                <table className="w-full min-w-[820px] text-[13px]">
                  <thead>
                    <tr className="border-b border-line-soft text-left">
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Guide</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Document</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Label</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">State</th>
                      <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {all.filter(isUnchecked).map((d) => (
                      <tr key={d.id} className="border-b border-line-soft last:border-0 hover:bg-raised">
                        <td className="px-5 py-3.5">
                          <span className="flex items-center gap-3">
                            <Avatar name={d.subject_name} size={34} />
                            <span className="whitespace-nowrap font-medium text-ink">{d.subject_name}</span>
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-muted">{KIND_LABEL[d.kind]}</td>
                        <td className="px-5 py-3.5 text-muted">{d.label}</td>
                        <td className="whitespace-nowrap px-5 py-3.5">
                          <StatusChip state={documentState(d.state)} label={d.state} />
                        </td>
                        <td className="px-5 py-3.5 text-muted">
                          {d.note ?? <span className="text-faint">None given</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableCard>
            )}
          </Resolve>
        </div>
      </div>

      <div className="mt-6">
        <Unavailable
          reason={
            "Ratings, reviews and any measure of a guide's standing are absent because ICEFALL collects none. " +
            "There is no rating field and no review table, and deriving a proxy from bookings would turn a sales " +
            "figure into a safety signal — the one substitution this page must never make. Certification level, " +
            "association membership and years of experience are absent for the same reason: ICEFALL holds " +
            "documents, not qualifications, and no column here has been checked against an issuing body."
          }
        />
      </div>
    </>
  );
}
