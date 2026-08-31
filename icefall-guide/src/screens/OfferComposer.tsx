import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Card } from "@/components/ui/primitives";
import { Field, Notice, inputClass } from "@/components/guide";
import { conversations } from "@/domain/season";
import { dayOffset } from "@/lib/day";
import {
  FLEXIBLE_POLICY,
  GUIDE_COMMISSION_PCT,
  eur as toCents,
  formatEur,
  totalsFor,
  type Quote,
  type QuoteLine,
} from "@/money/model";
import { cn } from "@/lib/utils";

/**
 * A CUSTOM OFFER — GU-03's buildable half.
 *
 * The owner asked for "an option where the guide can create a custom offer and
 * offer it to the client based on his needs". This composes the offer and shows
 * the guide exactly what it is worth to them BEFORE they commit to a number,
 * which is the part they cannot currently get anywhere in the app.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * IT CANNOT BE SENT, AND THE SCREEN SAYS SO RATHER THAN PRETENDING.
 *
 * There is no message path in this app — no read, no write, no queue. Sending
 * is split out as GU-03b in the backlog and blocked on the same thing the chat
 * composers are blocked on. A Send button that quietly kept the offer on the
 * phone would be worse than none: the guide would believe a client had a price
 * and stop chasing it, which is exactly how a booking is lost.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * THE ARITHMETIC IS THE SHARED MODEL'S, NEVER THIS SCREEN'S. `totalsFor` is the
 * one place a commission is computed and rounded in this family, and it FLOORS
 * so the remainder goes to the guide. This app shipped its own commission once
 * — wrong rate, wrong rounding, wrong basis — and the rule that came out of it
 * is that importing the CONSTANT is not enough, the whole calculation has to be
 * the shared one (§6g).
 *
 * PASS-THROUGH LINES CARRY NO COMMISSION. A hut bed the guide collects and hands
 * to the hut is not their fee, so ICEFALL takes nothing on it (owner decision
 * 13). It is a flag the guide sets per line and can never be inferred from an
 * amount.
 */
export default function OfferComposer() {
  const { id = "" } = useParams();
  const convo = useMemo(() => conversations().find((c) => c.id === id), [id]);

  const [partySize, setPartySize] = useState("1");
  const [lines, setLines] = useState<QuoteLine[]>([
    { label: "Guiding", amount: 0, per: "person" },
  ]);

  const quote: Quote = {
    id: "draft",
    lines: lines.filter((l) => l.amount > 0),
    exclusions: [],
    cancellation: FLEXIBLE_POLICY,
    partySize: Math.max(1, Number(partySize) || 1),
    departureIso: dayOffset(new Date(), 14),
    validUntilIso: dayOffset(new Date(), 14),
  };
  const totals = totalsFor(quote);
  const ready = quote.lines.length > 0 && lines.every((l) => l.label.trim().length > 0);

  const setLine = (i: number, patch: Partial<QuoteLine>) =>
    setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  return (
    <Screen>
      <Stagger>
        <Rise className="flex items-center gap-3 pb-1 pt-7">
          <Link to={`/chat/${id}`} aria-label="Back" className="-ml-1 text-mist">
            <ChevronLeft size={22} strokeWidth={1.7} />
          </Link>
          <h1 className="text-[20px] font-light text-snow">Custom offer</h1>
        </Rise>
        <Rise className="pb-4">
          <p className="text-[12px] leading-relaxed text-mist-dim">
            {convo
              ? `For ${convo.clients.map((c) => c.name).join(", ") || "this client"}.`
              : "Build a price for what this client actually wants."}
          </p>
        </Rise>

        <Rise>
          <Card>
            <Field label="How many climbers">
              <input
                value={partySize}
                onChange={(e) => setPartySize(e.target.value.replace(/[^0-9]/g, ""))}
                inputMode="numeric"
                className={inputClass}
              />
            </Field>
          </Card>
        </Rise>

        <Rise className="pt-4">
          <p className="section-label">What you are charging</p>
          <div className="mt-3 space-y-2.5">
            {lines.map((l, i) => (
              <Card key={i}>
                <div className="flex items-start gap-2.5">
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <input
                      value={l.label}
                      onChange={(e) => setLine(i, { label: e.target.value })}
                      placeholder="Guiding, hut, permit…"
                      className={inputClass}
                    />
                    <div className="grid grid-cols-2 gap-2.5">
                      <input
                        value={l.amount ? String(Math.round(l.amount / 100)) : ""}
                        onChange={(e) =>
                          setLine(i, {
                            amount: toCents(Number(e.target.value.replace(/[^0-9]/g, "")) || 0),
                          })
                        }
                        inputMode="numeric"
                        placeholder="€"
                        className={inputClass}
                      />
                      <button
                        type="button"
                        onClick={() => setLine(i, { per: l.per === "person" ? "party" : "person" })}
                        className="h-[42px] rounded-tile border border-hairline text-[12px] text-mist transition-colors hover:border-hairline-strong hover:text-snow"
                      >
                        {l.per === "person" ? "Per person" : "Whole party"}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLine(i, { passThrough: !l.passThrough })}
                      aria-pressed={Boolean(l.passThrough)}
                      className={cn(
                        "w-full rounded-tile border px-3 py-2 text-left text-[11.5px] transition-colors",
                        l.passThrough
                          ? "border-azure bg-azure/10 text-azure"
                          : "border-hairline text-mist-dim hover:border-hairline-strong",
                      )}
                    >
                      {l.passThrough
                        ? "You collect this and pay it on — ICEFALL takes nothing on it"
                        : "This is your fee"}
                    </button>
                  </div>
                  {lines.length > 1 && (
                    <button
                      type="button"
                      aria-label="Remove line"
                      onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}
                      className="mt-2 shrink-0 text-mist-dim hover:text-danger"
                    >
                      <Trash2 size={15} strokeWidth={1.8} />
                    </button>
                  )}
                </div>
              </Card>
            ))}
            <button
              type="button"
              onClick={() => setLines((ls) => [...ls, { label: "", amount: 0, per: "party" }])}
              className="flex items-center gap-1.5 px-1 text-[12.5px] text-azure"
            >
              <Plus size={14} strokeWidth={2} />
              Add a line
            </button>
          </div>
        </Rise>

        {/* ---- What it is worth to the guide ---------------------------------- */}
        <Rise className="pt-6">
          <p className="section-label">What this pays you</p>
          <Card className="mt-3">
            {ready ? (
              <>
                <dl className="space-y-1.5 text-[12.5px]">
                  <Row label="The client pays" value={formatEur(totals.total)} />
                  {totals.passedThrough > 0 && (
                    <Row
                      label={`ICEFALL ${GUIDE_COMMISSION_PCT}% of your ${formatEur(totals.commissionable)} fee`}
                      value={`−${formatEur(totals.commission)}`}
                      dim
                    />
                  )}
                  {totals.passedThrough === 0 && (
                    <Row
                      label={`ICEFALL ${GUIDE_COMMISSION_PCT}%`}
                      value={`−${formatEur(totals.commission)}`}
                      dim
                    />
                  )}
                  <Row label="You receive" value={formatEur(totals.guideReceives)} strong />
                </dl>
                {totals.passedThrough > 0 && (
                  <p className="mt-2.5 border-t border-hairline pt-2.5 text-[11px] leading-relaxed text-mist-dim">
                    {formatEur(totals.passedThrough)} of that is money you pay on. ICEFALL takes no
                    commission on it — only on your fee.
                  </p>
                )}
                <p className="tnum mt-2.5 text-[11px] text-mist-dim">
                  {formatEur(totals.perPerson)} per climber.
                </p>
              </>
            ) : (
              <p className="text-[12.5px] leading-relaxed text-mist-dim">
                Put a price on at least one line and this shows what reaches you.
              </p>
            )}
          </Card>
        </Rise>

        <Rise className="pb-2 pt-5">
          {/* NOT a disabled Send button. A greyed control invites the guide to
              wonder what would enable it; a sentence tells them. */}
          <Notice tone="neutral">
            <p className="text-snow">This cannot be sent yet</p>
            <p className="mt-1.5">
              ICEFALL cannot carry messages between you and a client, so there is no way to put this
              in front of them. The figures are real — the price you have built here is what you
              would receive.
            </p>
          </Notice>
        </Rise>
      </Stagger>
    </Screen>
  );
}

function Row({
  label,
  value,
  dim,
  strong,
}: {
  label: string;
  value: string;
  dim?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={dim ? "text-mist-dim" : "text-mist"}>{label}</dt>
      <dd className={`tnum ${strong ? "text-[14px] text-snow" : dim ? "text-mist-dim" : "text-mist"}`}>
        {value}
      </dd>
    </div>
  );
}
