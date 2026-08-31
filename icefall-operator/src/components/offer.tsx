/**
 * The custom offer composer — OP-05b, the owner's "expedition companies can
 * create custom offers via the app".
 *
 * It composes the SHARED `Quote` from `@/money/model` — the same shape the
 * guide app's GU-03 composes (request 07). There is deliberately no second
 * offer type in this app: one shape, two sellers.
 *
 * The arithmetic and the wording of the message live in `@/money/offer`, so
 * that they can be tested without rendering anything. Read that file's header
 * before touching the totals; the short version is below.
 *
 * ── WHY THIS IS NOT THE GUIDE APP'S COMPOSER ────────────────────────────────
 *
 * The guide app deducts `GUIDE_COMMISSION_PCT` from a guide's fee and shows the
 * guide a smaller "you receive" figure than the client pays. That is correct
 * THERE and would be a lie HERE, and the difference is structural, not
 * cosmetic:
 *
 *   · A guide engagement is money ICEFALL PROCESSES. The client pays ICEFALL,
 *     ICEFALL splits it, the guide receives the remainder. A deduction is a
 *     real event.
 *
 *   · An expedition is not. An 8,000 m trip is settled by wire and contract
 *     between the climber and the company, and the money NEVER TOUCHES
 *     ICEFALL — see the Referrals block at the foot of `money/model.ts`. What
 *     ICEFALL sells the company is the introduction, and it INVOICES the
 *     company for it separately, afterwards, against bookings that
 *     introduction produced. Nothing is taken out of this offer, because there
 *     is nothing here for ICEFALL to take it out of.
 *
 * `money.ts` warns in its own header that mixing the two models on one booking
 * is a real bug. This file is the place that warning was written for.
 *
 * The display was settled too (request 08, the brain, 2026-08-31): "The
 * operator version never shows ICEFALL's commission. An operator sees what they
 * receive; they do not see what we take."
 *
 * ── WHAT THIS SCREEN DOES NOT DO ────────────────────────────────────────────
 *
 * There is no offer RECORD. The backend has no quote store, so an offer is
 * composed here and delivered as a message into the conversation; it then lives
 * in the thread like any other message and the lead's stage is the only trace
 * of it. The dialog says so rather than implying a tracked, acceptable,
 * expiring document exists behind it. (Backlog `OP-05c`.)
 */

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { DateField, Listbox } from "./controls";
import { Button, Card, Field, Figure, Notice, Pill, inputClass } from "./ui";
import { TODAY, daysUntil } from "@/domain/dates";
import { measured, unavailable, type Reading } from "@/domain/honesty";
import {
  FLEXIBLE_POLICY,
  STANDARD_POLICY,
  formatEur,
  type CancellationPolicy,
  type Cents,
  type Exclusion,
  type Quote,
  type QuoteLine,
} from "@/money/model";
import { centsFromEuros, offerMessageBody, operatorOfferTotals } from "@/money/offer";
import { useOperator, useSession } from "@/state/OperatorContext";
import { useTheme } from "@/state/theme";

/* -------------------------------------------------------------------------- */
/* Draft state — strings while typing, cents the moment they parse            */
/* -------------------------------------------------------------------------- */

interface DraftLine {
  key: string;
  label: string;
  /** As typed, in euros. Parsed by `centsFromEuros`; never stored as a float. */
  amount: string;
  per: "person" | "party";
  passThrough: boolean;
}

interface DraftExclusion {
  key: string;
  label: string;
  /** Blank is legitimate — "we genuinely cannot say" is `approxAmount: null`. */
  approx: string;
}

let seq = 0;
const nextKey = () => `d${++seq}`;

const blankLine = (): DraftLine => ({
  key: nextKey(),
  label: "",
  amount: "",
  per: "person",
  passThrough: false,
});

const POLICIES: { key: string; label: string; policy: CancellationPolicy }[] = [
  { key: "standard", label: "Standard", policy: STANDARD_POLICY },
  { key: "flexible", label: "Flexible", policy: FLEXIBLE_POLICY },
];

/** "2026-09-14" plus n days, staying in calendar-day strings. */
function dayPlus(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */
/* Small pieces                                                               */
/* -------------------------------------------------------------------------- */

function Toggle({
  on,
  onChange,
  children,
  hint,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  children: string;
  hint?: string;
}) {
  /*
   * `index.css` pins every input to `color-scheme: light`, which is right for
   * the light theme and wrong for a native control on a dark ground — the box
   * would render white. The resolved theme is handed to the control itself
   * rather than changing that global rule, which is chrome another session
   * owns. Same reason on the two date fields below.
   */
  const { resolved } = useTheme();
  return (
    <label className="flex cursor-pointer items-start gap-2">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => onChange(e.target.checked)}
        style={{ colorScheme: resolved }}
        className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[var(--op-azure)]"
      />
      <span>
        <span className="block text-[12px] font-medium text-ink">{children}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{hint}</span>}
      </span>
    </label>
  );
}

function TotalRow({
  label,
  children,
  strong = false,
}: {
  label: string;
  children: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className={`text-[12.5px] ${strong ? "font-medium text-ink" : "text-muted"}`}>{label}</span>
      <span className="tnum shrink-0 text-right text-ink">{children}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The composer                                                               */
/* -------------------------------------------------------------------------- */

export function OfferComposer({
  customerName,
  subject,
  conversationId,
  addedByCompany,
  onClose,
}: {
  customerName: string;
  /** What the enquiry is about — the trip name. Null when nothing is chosen. */
  subject: string | null;
  /**
   * The thread this offer would be delivered into, or NULL when ICEFALL has no
   * thread with this person. The composer still works in that case; only the
   * delivery is impossible, and it says so.
   */
  conversationId: string | null;
  /**
   * TRUE when the company added this lead itself (`origin: "company"`).
   *
   * There are two different reasons a row has no thread and they are not the
   * same fact. A lead the company typed in was never ICEFALL's conversation at
   * all; an ICEFALL enquiry recorded without a conversation is ours and simply
   * has no thread behind it. Telling an operator "this lead came to you
   * directly" about the second one would be false, so the two are worded apart.
   */
  addedByCompany: boolean;
  onClose: () => void;
}) {
  const session = useSession();
  const { backend, refresh } = useOperator();

  const [lines, setLines] = useState<DraftLine[]>([blankLine()]);
  const [exclusions, setExclusions] = useState<DraftExclusion[]>([]);
  const [nothingExcluded, setNothingExcluded] = useState(false);
  const [partySize, setPartySize] = useState("2");
  const [departure, setDeparture] = useState(dayPlus(TODAY, 60));
  const [validUntil, setValidUntil] = useState(dayPlus(TODAY, 14));
  const [policyKey, setPolicyKey] = useState("standard");
  const [note, setNote] = useState(STANDARD_POLICY.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  /**
   * The quote id is local and disposable. Nothing stores a `Quote` — see the
   * file header — so this exists to satisfy the shared shape, not to identify a
   * record that survives this dialog.
   */
  const [draftId] = useState(() => `q-draft-${Date.now().toString(36)}`);

  const party = /^\d+$/.test(partySize.trim()) ? Number(partySize.trim()) : 0;
  const policy = POLICIES.find((p) => p.key === policyKey)?.policy ?? STANDARD_POLICY;

  const parsedLines = lines.map((l) => ({ draft: l, amount: centsFromEuros(l.amount) }));

  const quote: Quote | null = useMemo(() => {
    if (party < 1) return null;
    if (lines.length === 0) return null;
    const built: QuoteLine[] = [];
    for (const l of lines) {
      const amount = centsFromEuros(l.amount);
      if (amount === null || !l.label.trim()) return null;
      built.push({ label: l.label.trim(), amount, per: l.per, passThrough: l.passThrough });
    }
    const exc: Exclusion[] = nothingExcluded
      ? []
      : exclusions
          .filter((e) => e.label.trim())
          .map((e) => ({ label: e.label.trim(), approxAmount: centsFromEuros(e.approx) }));
    return {
      id: draftId,
      lines: built,
      exclusions: exc,
      cancellation: { ...policy, note: note.trim() || undefined },
      partySize: party,
      departureIso: departure,
      validUntilIso: validUntil,
    };
  }, [lines, exclusions, nothingExcluded, party, departure, validUntil, policy, note, draftId]);

  const totals = quote ? operatorOfferTotals(quote) : null;

  /**
   * The total as a `Reading`, so a half-typed offer says WHY there is no figure
   * instead of showing €0. An offer with one blank amount is not a €0 offer.
   */
  const totalReading: Reading<Cents> = totals
    ? measured(totals.total)
    : party < 1
      ? unavailable("Say how many climbers this is for and the total appears.")
      : unavailable("One line still needs a name and an amount. Until then there is no total to show.");

  /* Everything standing between this draft and a sendable offer. */
  const problems: string[] = [];
  if (party < 1) problems.push("Party size must be at least one climber.");
  if (lines.length === 0) problems.push("An offer needs at least one line.");
  if (parsedLines.some((l) => !l.draft.label.trim())) problems.push("Every line needs a name.");
  if (parsedLines.some((l) => l.amount === null))
    problems.push("Every line needs an amount in euros — 1200 or 1200.50.");
  if (!departure) problems.push("Set a departure date.");
  else if ((daysUntil(departure, TODAY) ?? 0) < 0) problems.push("The departure date is in the past.");
  if (!validUntil) problems.push("Set a date this offer holds until.");
  else if ((daysUntil(validUntil, TODAY) ?? 0) < 0)
    problems.push("This offer already expired — the hold-until date is in the past.");
  else if (departure && (daysUntil(validUntil, departure) ?? 0) > 0)
    problems.push("The offer cannot hold past the departure it is for.");
  if (!nothingExcluded && exclusions.filter((e) => e.label.trim()).length === 0)
    problems.push(
      "List what is not included, or tick that nothing is excluded. Surprise extras are what sour a booking.",
    );

  const body =
    quote && totals
      ? offerMessageBody({ customerName, subject, quote, totals, nothingExcluded })
      : null;

  const send = async () => {
    if (!conversationId || !body) return;
    setSending(true);
    setError(null);
    // The SAME call the reply composer makes, so the offer passes through the
    // same contact-details guard as any other operator-authored text. An offer
    // is a message and is the obvious place to smuggle a phone number; the
    // guard lives inside `sendMessage`, so it cannot be bypassed by composing
    // the text somewhere else. Its refusal is shown verbatim below.
    const res = await backend.sendMessage(session, conversationId, body);
    setSending(false);
    if (!res.ok) {
      setError(res.reason);
      return;
    }
    setSent(true);
    refresh();
  };

  const setLine = (key: string, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  /*
   * NO CLICK-OUTSIDE-TO-CLOSE, unlike `AddLeadDialog`, and the difference is on
   * purpose. That dialog is six fields; this one is a whole price — lines,
   * party maths, exclusions, a policy and a note — and there is nowhere for a
   * draft to be saved. Losing ten minutes of work to a stray click on the scrim
   * is not a fair trade for the convenience of dismissing it that way. Escape
   * and Cancel both still close it, because both are things a person meant.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-scrim p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Custom offer for ${customerName}`}
    >
      <div className="my-auto w-full max-w-2xl">
        <Card className="max-h-[90vh] overflow-y-auto p-5">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-[14px] font-semibold text-ink">Custom offer</h2>
            <span className="ser text-[15px] text-muted">{customerName}</span>
            {subject && <Pill>{subject}</Pill>}
          </div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
            Your own price for this climber, in your own lines. It goes to them as a message in this
            conversation — Icefall does not keep a separate offer record, so the thread is where it
            lives afterwards.
          </p>

          {sent ? (
            <div className="mt-4 space-y-3">
              <Notice title="Sent">
                The offer is in the conversation with {customerName.split(" ")[0]} and the lead is
                marked as contacted. It is a message like any other now — there is nothing further
                to track here.
              </Notice>
              <div className="flex justify-end">
                <Button variant="primary" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* ---------------------------------------------------------- */}
              {/* Who and when                                               */}
              {/* ---------------------------------------------------------- */}
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <Field label="Climbers" hint="Party size. Per-person lines multiply by it.">
                  <input
                    inputMode="numeric"
                    value={partySize}
                    onChange={(e) => setPartySize(e.target.value)}
                    className={`${inputClass} tnum`}
                  />
                </Field>
                {/*
                  The kit's DateField — ISO strings in and out (§6af), the same
                  state variables and the same problems-list validation as the
                  native inputs it replaced. Cleared reads as "" so the
                  "Set a departure date" refusal stays reachable.
                */}
                <DateField
                  label="Departure"
                  value={departure || null}
                  onChange={(v) => setDeparture(v ?? "")}
                  clearable
                />
                <div>
                  <DateField
                    label="Holds until"
                    value={validUntil || null}
                    onChange={(v) => setValidUntil(v ?? "")}
                    clearable
                  />
                  <span className="mt-1 block text-[11.5px] leading-snug text-muted">
                    After this date the price is not binding.
                  </span>
                </div>
              </div>

              {/* ---------------------------------------------------------- */}
              {/* Lines                                                      */}
              {/* ---------------------------------------------------------- */}
              <div className="mt-5">
                <div className="lbl">What they are paying for</div>
                <div className="mt-2 space-y-2.5">
                  {lines.map((l) => {
                    const amount = centsFromEuros(l.amount);
                    return (
                      <div key={l.key} className="hairline rounded-tile bg-canvas p-3">
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="min-w-[170px] flex-1">
                            <span className="lbl">Line</span>
                            <input
                              value={l.label}
                              onChange={(e) => setLine(l.key, { label: e.target.value })}
                              placeholder="Guiding, permits, 8 days on the hill"
                              className={`${inputClass} mt-1`}
                            />
                          </label>
                          <label className="w-[118px]">
                            <span className="lbl">Amount €</span>
                            <input
                              inputMode="decimal"
                              value={l.amount}
                              onChange={(e) => setLine(l.key, { amount: e.target.value })}
                              placeholder="1200"
                              className={`${inputClass} tnum mt-1`}
                            />
                          </label>
                          {/*
                            An open listbox's Escape must close the LIST, not
                            this dialog — the dialog's document-level Escape
                            listener would otherwise throw away the whole
                            draft. When the list is closed, Escape falls
                            through to the dialog, same as before.
                          */}
                          <div
                            className="w-[126px]"
                            onKeyDown={(e) => {
                              if (
                                e.key === "Escape" &&
                                (e.target as HTMLElement).closest('[role="listbox"]')
                              ) {
                                e.stopPropagation();
                              }
                            }}
                          >
                            <Listbox
                              label="Per"
                              value={l.per}
                              options={[
                                { value: "person", label: "Per person" },
                                { value: "party", label: "Whole party" },
                              ]}
                              onChange={(v) =>
                                setLine(l.key, { per: v as "person" | "party" })
                              }
                            />
                          </div>
                          <button
                            type="button"
                            aria-label={`Remove line ${l.label || "(unnamed)"}`}
                            onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}
                            className="rounded-tile p-1.5 text-faint transition-colors hover:bg-raised hover:text-rejected"
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </div>

                        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                          {/*
                            passThrough IS SET BY THE SELLER, NEVER INFERRED —
                            the same rule as the guide app (request 07) and the
                            flag's own note in `money/model.ts`. Nothing about
                            an amount reveals whether it was a hut bill.

                            It changes no figure on this screen, because nothing
                            is deducted from an operator's offer. It is asked
                            for anyway because it is the only record of which
                            part of the total was the company's own fee and
                            which was money it merely collected and handed on —
                            the distinction ICEFALL's separate referral invoice
                            is later worked out against. Drop the toggle and
                            that has to be re-derived from a hut bill months
                            afterwards, which cannot be done.
                          */}
                          <Toggle
                            on={l.passThrough}
                            onChange={(v) => setLine(l.key, { passThrough: v })}
                            hint="A hut bed, a permit, hired kit — money you collect and hand straight on. It is not your fee, and recording that here is the only place it is written down."
                          >
                            You only pass this money on
                          </Toggle>
                          <span className="tnum shrink-0 text-[12.5px] text-muted">
                            {amount === null ? (
                              <span className="text-faint">No amount yet</span>
                            ) : l.per === "person" ? (
                              /* THE PARTY MATHS, SPELLED OUT — request 07 §3.
                                 A per-person figure beside a party total is how
                                 €500 gets read as €1,340. */
                              <>
                                {formatEur(amount)} × {party || "?"} ={" "}
                                <span className="font-medium text-ink">
                                  {party > 0 ? formatEur(amount * party) : "—"}
                                </span>
                              </>
                            ) : (
                              <>
                                whole party ={" "}
                                <span className="font-medium text-ink">{formatEur(amount)}</span>
                              </>
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2">
                  <Button onClick={() => setLines((ls) => [...ls, blankLine()])}>
                    <Plus size={13} aria-hidden />
                    Add line
                  </Button>
                </div>
              </div>

              {/* ---------------------------------------------------------- */}
              {/* Totals                                                     */}
              {/* ---------------------------------------------------------- */}
              {/*
                NO COMMISSION LINE, NO DEDUCTION, NO NET-TO-YOU FIGURE THAT
                DIFFERS FROM THE TOTAL — and none of that is an omission.

                A guide's offer deducts ICEFALL's cut because ICEFALL processes
                that payment and splits it. An expedition company's client pays
                the company directly; the money never touches ICEFALL, which
                invoices the company separately for the introduction. So here
                what the client pays IS what the company receives, and
                `operatorOfferTotals` calls `totalsFor` with an explicit zero
                rate to say exactly that.

                The brain settled the display (request 08): "The operator
                version never shows ICEFALL's commission. An operator sees what
                they receive; they do not see what we take."

                If you are about to add a commission row here, you are building
                the guide app by mistake.
              */}
              <div className="mt-5 hairline rounded-card bg-canvas p-4">
                <div className="lbl">The offer</div>
                <div className="mt-2">
                  <Figure reading={totalReading} format={(c) => formatEur(c)} />
                  <div className="mt-1 text-[11.5px] text-faint">What the climber pays</div>
                </div>

                {totals && (
                  <div className="mt-3 border-t border-line-soft pt-2">
                    <TotalRow label="You receive" strong>
                      <span className="ser text-[17px]">{formatEur(totals.total)}</span>
                    </TotalRow>
                    {party > 1 && (
                      <TotalRow label={`Per person, across ${party} climbers`}>
                        {formatEur(totals.perPerson)}
                      </TotalRow>
                    )}
                    {totals.passedThrough > 0 && (
                      <TotalRow label="Of which you are only passing on">
                        {formatEur(totals.passedThrough)}
                      </TotalRow>
                    )}
                    <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
                      Nothing is deducted from this offer. Your client pays you directly, so what
                      they pay is what you receive — Icefall never handles this money and takes
                      nothing out of it.
                    </p>
                  </div>
                )}
              </div>

              {/* ---------------------------------------------------------- */}
              {/* Exclusions                                                 */}
              {/* ---------------------------------------------------------- */}
              <div className="mt-5">
                <div className="lbl">What is not included</div>
                <p className="mt-1 text-[11.5px] leading-snug text-muted">
                  Flights, insurance, tips, personal kit. A cost met here rather than in a car park
                  at 6 a.m. is the difference between a good booking and a bad one.
                </p>

                <div className="mt-2">
                  <Toggle
                    on={nothingExcluded}
                    onChange={setNothingExcluded}
                    hint="Only tick this if it is true — the price covers everything they will have to pay for."
                  >
                    Nothing is excluded
                  </Toggle>
                </div>

                {!nothingExcluded && (
                  <>
                    <div className="mt-2 space-y-2">
                      {exclusions.map((e) => (
                        <div key={e.key} className="flex flex-wrap items-end gap-2">
                          <label className="min-w-[170px] flex-1">
                            <span className="lbl">Not included</span>
                            <input
                              value={e.label}
                              onChange={(ev) =>
                                setExclusions((xs) =>
                                  xs.map((x) => (x.key === e.key ? { ...x, label: ev.target.value } : x)),
                                )
                              }
                              placeholder="International flights"
                              className={`${inputClass} mt-1`}
                            />
                          </label>
                          <label className="w-[150px]">
                            <span className="lbl">Roughly € — optional</span>
                            <input
                              inputMode="decimal"
                              value={e.approx}
                              onChange={(ev) =>
                                setExclusions((xs) =>
                                  xs.map((x) => (x.key === e.key ? { ...x, approx: ev.target.value } : x)),
                                )
                              }
                              placeholder="Leave blank"
                              className={`${inputClass} tnum mt-1`}
                            />
                          </label>
                          <button
                            type="button"
                            aria-label={`Remove exclusion ${e.label || "(unnamed)"}`}
                            onClick={() => setExclusions((xs) => xs.filter((x) => x.key !== e.key))}
                            className="rounded-tile p-1.5 text-faint transition-colors hover:bg-raised hover:text-rejected"
                          >
                            <Trash2 size={14} aria-hidden />
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2">
                      <Button
                        onClick={() =>
                          setExclusions((xs) => [...xs, { key: nextKey(), label: "", approx: "" }])
                        }
                      >
                        <Plus size={13} aria-hidden />
                        Add exclusion
                      </Button>
                    </div>
                    <p className="mt-1.5 text-[11.5px] leading-snug text-faint">
                      Leave the figure blank where you genuinely cannot say. The offer will say so in
                      words rather than guess.
                    </p>
                  </>
                )}
              </div>

              {/* ---------------------------------------------------------- */}
              {/* Cancellation                                               */}
              {/* ---------------------------------------------------------- */}
              <div className="mt-5">
                <div className="lbl">If they cancel</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {POLICIES.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => {
                        setPolicyKey(p.key);
                        setNote(p.policy.note ?? "");
                      }}
                      className={`rounded-pill px-2.5 py-1 text-[12px] font-medium transition-colors ${
                        policyKey === p.key
                          ? "bg-azure text-canvas"
                          : "bg-raised text-muted hover:text-ink"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="mt-2 hairline rounded-tile bg-canvas px-3 py-2">
                  {[...policy.tiers]
                    .sort((a, b) => b.daysBefore - a.daysBefore)
                    .map((t) => (
                      <div
                        key={t.daysBefore}
                        className="flex justify-between gap-3 py-0.5 text-[12px] text-muted"
                      >
                        <span>
                          {t.daysBefore === 0
                            ? "Less notice than that"
                            : `${t.daysBefore} or more days before departure`}
                        </span>
                        <span className="tnum text-ink">{t.refundPct}% back</span>
                      </div>
                    ))}
                  <div className="flex justify-between gap-3 border-t border-line-soft py-0.5 pt-1.5 text-[12px] text-muted">
                    <span>If conditions prevent an attempt</span>
                    <span className="tnum text-ink">{policy.conditionsRefundPct}% back</span>
                  </div>
                </div>
                <div className="mt-2">
                  <Field label="Your note on it" hint="Sent with the offer. Never replaces the tiers above.">
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      className={`${inputClass} resize-y`}
                    />
                  </Field>
                </div>
              </div>

              {/* ---------------------------------------------------------- */}
              {/* What will be sent                                          */}
              {/* ---------------------------------------------------------- */}
              <div className="mt-5">
                <div className="lbl">What {customerName.split(" ")[0]} will read</div>
                {body ? (
                  <pre className="hairline tnum mt-2 max-h-[220px] overflow-auto rounded-tile bg-canvas px-3 py-2.5 font-sans text-[12px] leading-relaxed whitespace-pre-wrap text-ink">
                    {body}
                  </pre>
                ) : (
                  <p className="mt-2 text-[12px] leading-relaxed text-muted">
                    The offer appears here once every line has a name and an amount. There is nothing
                    to preview from a half-written price.
                  </p>
                )}
              </div>

              {problems.length > 0 && (
                <div className="mt-3">
                  <Notice tone="pending" title="Not ready to send">
                    <ul className="mt-1 list-disc space-y-0.5 pl-4">
                      {problems.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </Notice>
                </div>
              )}

              {/*
                THE REFUSAL, VERBATIM. `sendMessage` runs the contact-details
                guard over the whole offer body, so a phone number typed into a
                line label is refused here in the operator's own words rather
                than reaching the climber.
              */}
              {error && (
                <div className="mt-3">
                  <Notice tone="rejected">{error}</Notice>
                </div>
              )}

              {/* ---------------------------------------------------------- */}
              {/* Sending — or the honest reason there is nothing to send to  */}
              {/* ---------------------------------------------------------- */}
              {conversationId === null && (
                <div className="mt-3">
                  {/*
                    A lead the company added itself has no ICEFALL thread. The
                    composer stays open and usable — the offer is theirs to
                    make — but there is no conversation to deliver it into, and
                    a Send button here would post into nothing. It says so.
                  */}
                  <Notice title="Icefall cannot deliver this one">
                    {addedByCompany
                      ? `Icefall has no message thread with ${customerName.split(" ")[0]} — you added this lead yourself, so we have never carried a word between the two of you and there is nowhere here to send it. Copy the text above into whatever channel you are already using. The offer is yours either way.`
                      : `This enquiry was recorded without a conversation, so Icefall has no thread with ${customerName.split(" ")[0]} to deliver it into. Copy the text above and send it however you reached them. The offer is yours either way.`}
                  </Notice>
                </div>
              )}

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button onClick={onClose}>Cancel</Button>
                {conversationId !== null && (
                  <Button
                    variant="primary"
                    onClick={() => void send()}
                    disabled={sending || problems.length > 0 || !body}
                  >
                    {sending ? "Sending…" : "Send offer"}
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
