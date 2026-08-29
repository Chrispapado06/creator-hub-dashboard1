import { AlertTriangle, Check, Minus, X } from "lucide-react";
import { Badge, Card, Disclaimer } from "@/components/ui/primitives";
import { fmtPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { formatDateRange, nightsToDays } from "@/guides/dates";
import {
  PLATFORM_FEE_BASIS_NOTE,
  quoteTotals,
  type CancellationPolicy,
  type QuoteLine,
} from "@/guides/engagement";

/**
 * The pieces the request, thread and dashboard screens all render.
 *
 * They live together because a price shown three different ways is a price
 * somebody will dispute. The breakdown below is the ONLY place a total is
 * assembled for display, and it always builds the total by addition from the
 * lines above it, so no screen can show a figure that disagrees with its own
 * arithmetic.
 */

/* -------------------------------------------------------------------------- */
/* Small primitives                                                            */
/* -------------------------------------------------------------------------- */

/** Every price in this feature. Tabular, so a column of them does not jitter. */
export function Money({ eur, className }: { eur: number; className?: string }) {
  return <span className={cn("tnum", className)}>{fmtPrice(eur)}</span>;
}

/**
 * The badge that must appear on every card and profile touching a demo guide.
 *
 * Not optional and not decorative: a demo guide is an invented person, and the
 * badge is the only thing standing between "a marketplace outline" and "an app
 * that appears to be offering to put a stranger on a glacier".
 */
export function DemoBadge({ demo }: { demo: boolean }) {
  if (!demo) return null;
  return <Badge tone="azure">Demo</Badge>;
}

export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="mb-2">
      <span className="section-label">{children}</span>
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{hint}</p>}
    </div>
  );
}

const inputClass =
  "w-full rounded-tile border border-hairline bg-graphite px-3.5 py-3 text-[13px] text-snow outline-none " +
  "transition-colors placeholder:text-mist-dim focus:border-azure/50 [color-scheme:dark]";

export function TextInput({ className, ...props }: React.ComponentPropsWithRef<"input">) {
  return <input {...props} className={cn(inputClass, className)} />;
}

/**
 * `ref` is destructured through as an ordinary prop — React 19 passes it to
 * function components directly, and the thread screen needs a handle so "Ask a
 * question" can put the cursor in the box rather than merely scrolling near it.
 */
export function TextArea({ className, ...props }: React.ComponentPropsWithRef<"textarea">) {
  return (
    <textarea {...props} className={cn(inputClass, "resize-none leading-relaxed", className)} />
  );
}

/**
 * A value ICEFALL does not have, with the reason attached.
 *
 * House rule: never a zero and never a dash standing in for arithmetic that did
 * not happen. An unlisted day rate is not a free guide.
 */
export function NotKnown({ reason, className }: { reason: string; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] text-mist-dim", className)}>
      <Minus size={11} strokeWidth={1.8} aria-hidden="true" />
      {reason}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* Expedition summary                                                          */
/* -------------------------------------------------------------------------- */

export interface ExpeditionFacts {
  mountain: string;
  /** Empty means NOT DECIDED, which is a real answer rather than a gap. */
  route: string;
  /** `YYYY-MM-DD`. Absent when the request carried no dates. */
  startDate?: string;
  endDate?: string;
  /** Absent when the request carried no party size. Never defaulted to 1. */
  groupSize?: number;
  guideName: string;
  guideDemo: boolean;
}

/**
 * The engagement itself, pinned above the conversation.
 *
 * Mountain, route, dates and party size are the four things an argument three
 * weeks before departure is always about, so they stay on screen rather than
 * scrolling away above a message list.
 *
 * Every field renders its own absence. A missing party size is not "1 climber":
 * a guide reading that would plan for a rope of two and meet a rope of four.
 */
export function ExpeditionSummary({
  facts,
  className,
}: {
  facts: ExpeditionFacts;
  className?: string;
}) {
  const hasDates = Boolean(facts.startDate && facts.endDate);
  const days = hasDates ? nightsToDays(facts.startDate!, facts.endDate!) : null;

  return (
    <Card className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="section-label">Expedition</p>
          <h2 className="mt-2 truncate text-[17px] font-light text-snow">
            {facts.mountain.trim() || <NotKnown reason="No mountain named" />}
          </h2>
        </div>
        <DemoBadge demo={facts.guideDemo} />
      </div>

      <dl className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-3 border-t border-hairline pt-3.5">
        <Fact label="Route">
          {/* An unnamed route renders its reason, never an invented one.
              "Not decided" is the athlete's actual position, and a guide needs
              to know that rather than be handed a route nobody chose. */}
          {facts.route.trim() ? (
            facts.route
          ) : (
            <NotKnown reason="Not decided — to agree with the guide" />
          )}
        </Fact>
        <Fact label="Dates">
          {hasDates ? (
            <>
              {formatDateRange(facts.startDate!, facts.endDate!)}
              <span className="tnum ml-1.5 text-mist-dim">
                ({days} {days === 1 ? "day" : "days"})
              </span>
            </>
          ) : (
            <NotKnown reason="No dates given" />
          )}
        </Fact>
        <Fact label="Party">
          {facts.groupSize === undefined ? (
            <NotKnown reason="Not stated" />
          ) : (
            <>
              <span className="tnum">{facts.groupSize}</span>{" "}
              {facts.groupSize === 1 ? "climber" : "climbers"}
            </>
          )}
        </Fact>
        <Fact label="Guide">{facts.guideName}</Fact>
      </dl>
    </Card>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="section-label">{label}</dt>
      <dd className="mt-1.5 text-[13px] leading-snug text-snow">{children}</dd>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Money                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Guide fee, pass-through costs, total — and, for the guide only, the deduction.
 *
 * THE BREAKDOWN DEPENDS ON WHO IS READING IT, and that is not a styling
 * preference. Under the deducted model (constitution 3b) ICEFALL's cut is a
 * division of the guide's fee, not an addition to the client's bill:
 *
 *     A guide charges €1,000. The client pays €1,000. The guide receives €900.
 *
 * So a CLIENT must not see a platform-fee line at all. There is nothing there
 * for them to pay, and a line item they are not charged for, sitting above a
 * total, reads as a charge — the previous version added it to their total and
 * they genuinely were charged it.
 *
 * A GUIDE must see it, and must see what they actually receive, because that
 * is the number they decide whether to accept work on. It stays its own line
 * rather than being folded into "guide's fee", which would misattribute
 * ICEFALL's cut to the guide, or into the total, which would hide it.
 *
 * The percentage is interpolated from `PLATFORM_COMMISSION_PCT` rather than
 * written into the sentence, so it stays configurable without leaving a stale
 * number on a confirmation.
 */
export function PriceBreakdown({
  guideFeeEur,
  additionalCosts,
  audience,
  className,
}: {
  guideFeeEur: number;
  additionalCosts: QuoteLine[];
  /** Whose screen this is. Decides whether the deduction is shown at all. */
  audience: "client" | "guide";
  className?: string;
}) {
  const totals = quoteTotals({ guideFeeEur, additionalCosts });

  return (
    <div className={cn("rounded-tile border border-hairline bg-obsidian/40 p-4", className)}>
      <PriceRow label="Guide's fee" amount={totals.guideFeeEur} />

      {additionalCosts.length > 0 && (
        <>
          <div className="my-3 h-px bg-hairline" />
          <p className="section-label mb-2.5">Additional costs</p>
          {additionalCosts.map((line) => (
            <PriceRow key={line.id} label={line.label} note={line.note} amount={line.amountEur} />
          ))}
        </>
      )}

      <div className="my-3 h-px bg-hairline-strong" />
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-snow">
          {audience === "guide" ? "Client pays" : "Total"}
        </span>
        <Money eur={totals.totalEur} className="text-[19px] font-light text-snow" />
      </div>

      {audience === "guide" && (
        <>
          <div className="my-3 h-px bg-hairline" />
          <PriceRow
            label={`ICEFALL ${totals.platformCommissionPct}%`}
            note="Deducted from your fee, not added to theirs"
            amount={totals.platformFeeEur}
          />
          <div className="my-3 h-px bg-hairline-strong" />
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[13px] text-snow">You receive</span>
            <Money eur={totals.guideReceivesEur} className="text-[19px] font-light text-azure" />
          </div>
        </>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">{PLATFORM_FEE_BASIS_NOTE}</p>
    </div>
  );
}

function PriceRow({ label, note, amount }: { label: string; note?: string; amount: number }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className="text-[13px] leading-snug text-mist">{label}</p>
        {note && <p className="mt-0.5 text-[11px] leading-relaxed text-mist-dim">{note}</p>}
      </div>
      <Money eur={amount} className="shrink-0 text-[13px] text-snow" />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inclusions                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * What the price does and does not cover, side by side.
 *
 * Both lists always render, including when one is empty. "Nothing was listed as
 * excluded" is a fact an athlete should see and query; an absent column reads
 * as "everything is included", which is the assumption that produces a €400
 * hut bill at the trailhead.
 */
export function InclusionLists({
  included,
  excluded,
  className,
}: {
  included: string[];
  excluded: string[];
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3", className)}>
      <InclusionList title="Included" items={included} tone="in" />
      <InclusionList title="Not included" items={excluded} tone="out" />
    </div>
  );
}

function InclusionList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "in" | "out";
}) {
  const Icon = tone === "in" ? Check : X;
  return (
    <div className="rounded-tile border border-hairline bg-obsidian/40 p-3.5">
      <p className="section-label">{title}</p>
      {items.length === 0 ? (
        <p className="mt-2 text-[12px] leading-relaxed text-mist-dim">
          Nothing listed. Ask the guide to put this in writing before you accept.
        </p>
      ) : (
        <ul className="mt-2.5 space-y-1.5">
          {items.map((item) => (
            <li key={item} className="flex gap-2.5 text-[12.5px] leading-relaxed text-mist">
              <Icon
                size={12}
                strokeWidth={2}
                aria-hidden="true"
                className={cn("mt-[3px] shrink-0", tone === "in" ? "text-summit" : "text-mist-dim")}
              />
              {item}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Cancellation                                                                */
/* -------------------------------------------------------------------------- */

export function CancellationBlock({
  policy,
  className,
}: {
  policy: CancellationPolicy;
  className?: string;
}) {
  return (
    <div className={cn("rounded-tile border border-hairline bg-obsidian/40 p-3.5", className)}>
      <p className="section-label">Cancellation policy</p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-mist">{policy.summary}</p>

      <ul className="mt-3 space-y-1.5">
        {[...policy.tiers]
          .sort((a, b) => b.fromDaysBefore - a.fromDaysBefore)
          .map((tier) => (
            <li
              key={tier.fromDaysBefore}
              className="tnum flex items-baseline justify-between gap-3 text-[12px]"
            >
              <span className="text-mist">
                {tier.fromDaysBefore === 0
                  ? "Under 14 days"
                  : `${tier.fromDaysBefore}+ days before`}
              </span>
              <span className="text-snow">{tier.refundPct}% refunded</span>
            </li>
          ))}
      </ul>

      <p className="mt-3 border-t border-hairline pt-3 text-[12px] leading-relaxed text-mist">
        {policy.guideCancels}
      </p>
    </div>
  );
}

/**
 * What renders where a cancellation policy should be and is not.
 *
 * NEVER a default policy. Showing ICEFALL's suggested ladder here would attach
 * terms to a guide who never wrote them, and the athlete would believe they had
 * a refund position they do not have. The gap is the finding.
 */
export function CancellationMissing({ className }: { className?: string }) {
  return (
    <div
      className={cn("rounded-tile border border-dashed border-hairline-strong p-3.5", className)}
    >
      <p className="section-label">Cancellation policy</p>
      <p className="mt-2 text-[12.5px] leading-relaxed text-mist">
        None attached. ICEFALL will not fill this in — terms invented by an app are not terms a
        guide agreed to. Ask for the cancellation position in writing before you accept anything.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Warnings                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The one place this feature raises its voice.
 *
 * Reserved for the two statements an athlete must not skim: that nothing here
 * reaches a guide, and that nothing here has been verified. Everything else
 * uses `Disclaimer`, which is quieter on purpose — a screen where every notice
 * shouts is a screen where none of them is read.
 */
export function Caution({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-tile border border-alert/30 bg-alert/[0.06] p-3.5",
        className,
      )}
    >
      <AlertTriangle size={14} strokeWidth={1.8} className="mt-[2px] shrink-0 text-alert" />
      <p className="text-[12px] leading-relaxed text-mist">{children}</p>
    </div>
  );
}

/** Convenience wrapper so the long notices read the same on every screen. */
export function Notice({ children }: { children: React.ReactNode }) {
  return <Disclaimer>{children}</Disclaimer>;
}
