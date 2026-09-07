import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Check, Minus, Mountain, X } from "lucide-react";

import { Button } from "@/components/ui/primitives";
import { FEATURES, TRIAL_DAYS, fmtEur, planFor } from "@/growth/tiers";
import { cn } from "@/lib/utils";

/**
 * THE SUBSCRIPTION SHEET — the owner's pricing-card reference, 2026-09-06,
 * built in ICEFALL's own palette.
 *
 * The reference is a shadcn component (`pricing-card.tsx`). Its structure is
 * kept — a raised header holding plan, price and call to action, then a list of
 * what is included, a rule, then what is not — and its class names are not,
 * because they are shadcn's (`bg-card`, `text-muted-foreground`, `border`) and
 * this app has no shadcn theme layer to resolve them against. In it they would
 * simply compile to nothing.
 *
 * ── THE BUTTON DOES NOT TAKE MONEY, AND CANNOT ───────────────────────────────
 *
 * ICEFALL HAS NO PAYMENT PROCESSOR. Not "not configured" — none. `growth/tiers`
 * and both pricing screens carry that as a hard rule with the reasoning: no card
 * form, no checkout, and no control that implies a charge, because none of it
 * would be true.
 *
 * So the reference's orange "Get Started" is a `Start free trial` here, and it
 * does what it says: `/trial` starts the real, already-built, card-free trial.
 * The price is stated as what the plan WILL cost — the wording every other
 * pricing surface in this app uses — and there is no renewal date, no
 * countdown, no "cancel before Friday" and no scarcity, because a false
 * deadline is pressure whether or not the money is real.
 *
 * WHEN BILLING LANDS, this is the seam: the CTA points at the processor's own
 * hosted sheet and the "not connected" line comes out. Nothing else changes.
 *
 * ── EVERY FIGURE IS COMPUTED ─────────────────────────────────────────────────
 *
 * The price, the trial length and both feature lists are read from
 * `growth/tiers`, never typed in here. `tiers.ts` says why: hard-coded
 * marketing copy is how a screen silently becomes false the first time somebody
 * edits a price — and this file would have been the second place to hold
 * "€9.99" three hours after the plan changed from €15.
 */

const PRO = planFor("pro");

/**
 * Four things the paid plan adds, and four the free plan does without.
 *
 * TAKEN FROM `FEATURES`, filtered to what is actually BUILT: `comingSoon`
 * entries are excluded, because a sheet selling a subscription is the last
 * place to list something that does not exist. `notYetEnforced` entries are
 * excluded from the "not included" column too — those work for everybody today,
 * so printing them as withheld would be a claim ICEFALL withholds something it
 * does not.
 */
const INCLUDED = FEATURES.filter(
  (f) => f.comingSoon !== true && f.tiers.includes("pro") && !f.tiers.includes("free"),
).slice(0, 4);

const NOT_IN_FREE = FEATURES.filter(
  (f) =>
    f.comingSoon !== true &&
    f.notYetEnforced !== true &&
    f.tiers.includes("pro") &&
    !f.tiers.includes("free"),
).slice(4, 7);

/** Where the "seen" mark lives. Per device, per install — see `useSubscribeSheet`. */
const SEEN_KEY = "icefall.subscribe.seen.v1";

/**
 * Has this device been shown the sheet?
 *
 * ONCE PER INSTALL, NOT ONCE PER LAUNCH. A subscription sheet on every open is
 * the pressure pattern `Pricing.tsx` rules out in as many words, and it is the
 * thing that makes people delete an app rather than buy from it. Dismissing it
 * is remembered; the plans are still one tap away in Settings whenever somebody
 * wants them.
 *
 * A storage refusal (private mode, quota) means the sheet may appear again on
 * the next launch. That is the safe direction to fail: annoying rather than
 * silently suppressing something the owner asked to be shown.
 */
export function useSubscribeSheet(): { open: boolean; dismiss: () => void } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(SEEN_KEY) !== null;
    } catch {
      seen = false;
    }
    if (!seen) setOpen(true);
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, new Date().toISOString());
    } catch {
      /* Storage refused. It reappears next launch; nothing else breaks. */
    }
  };

  return { open, dismiss };
}

export function SubscribeSheet({ onDismiss }: { onDismiss: () => void }) {
  const price = PRO.monthlyEur === null ? null : fmtEur(PRO.monthlyEur);

  return (
    <div className="fixed inset-0 z-[400] flex items-end justify-center">
      {/* The scrim is a real dismiss target, not decoration: a sheet that can
          only be closed by its own small × is a sheet people feel trapped in. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onDismiss}
        className="absolute inset-0 bg-obsidian/70 backdrop-blur-sm"
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="ICEFALL Pro"
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[420px] rounded-t-[28px] border border-hairline-strong bg-graphite p-1.5 shadow-[var(--ice-shadow-pop)]"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)" }}
      >
        {/* ---- The raised header, as in the reference ---------------------- */}
        <div className="relative overflow-hidden rounded-[24px] border border-hairline bg-slate p-4">
          {/* The reference's top glass gradient. Drawn from `--ice-snow` rather
              than literal white so it lifts the panel in the light theme too,
              where white on near-white would do nothing. */}
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-40 rounded-[inherit]"
            style={{
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--ice-snow) 8%, transparent) 0%, color-mix(in oklab, var(--ice-snow) 3%, transparent) 40%, transparent 100%)",
            }}
          />

          {/* `pr-10` keeps this row clear of the close button, which is
              absolutely positioned over the sheet's top-right corner — without
              it the badge ran underneath the ×. */}
          <div className="relative flex items-center justify-between pr-10">
            <span className="flex items-center gap-2 text-[13.5px] font-medium text-mist">
              <Mountain size={16} strokeWidth={1.7} aria-hidden />
              ICEFALL {PRO.name}
            </span>
            <span className="shrink-0 rounded-full border border-hairline-strong px-2.5 py-0.5 text-[11px] text-mist">
              One plan
            </span>
          </div>

          <div className="relative mt-6 flex items-end gap-1.5">
            <span className="text-[34px] font-extrabold leading-none tracking-tight text-snow">
              {price ?? "—"}
            </span>
            <span className="pb-1 text-[13px] text-mist">/ month</span>
          </div>

          {/* NO STRUCK-THROUGH "WAS" PRICE. The reference has one; ICEFALL has
              never charged anything, so there is no previous price for this to
              be a discount from, and inventing one is a fabricated saving. */}

          <div className="relative mt-4">
            <Button asChild size="lg" className="w-full">
              <Link to="/trial" onClick={onDismiss}>
                Start {TRIAL_DAYS}-day free trial
              </Link>
            </Button>
            <p className="mt-2 text-center text-[11px] leading-relaxed text-mist-dim">
              No card needed — ICEFALL has no payment processor connected yet, so nothing is
              charged. {price ?? "The monthly price"} is what {PRO.name} will cost when
              subscriptions go live.
            </p>
          </div>
        </div>

        {/* ---- What it adds ------------------------------------------------ */}
        <div className="space-y-5 p-4">
          <ul className="space-y-2.5">
            {INCLUDED.map((f) => (
              <li key={f.id} className="flex items-start gap-2.5 text-[13px] text-snow">
                <Check size={15} strokeWidth={2.2} className="mt-0.5 shrink-0 text-summit" />
                <span>{f.label}</span>
              </li>
            ))}
          </ul>

          {NOT_IN_FREE.length > 0 && (
            <>
              <div className="flex items-center gap-3 text-[11.5px] text-mist-dim">
                <span className="h-px flex-1 bg-hairline" />
                Not on Base
                <span className="h-px flex-1 bg-hairline" />
              </div>

              <ul className="space-y-2.5">
                {NOT_IN_FREE.map((f) => (
                  <li
                    key={f.id}
                    className={cn("flex items-start gap-2.5 text-[13px] text-mist-dim")}
                  >
                    <Minus size={15} strokeWidth={2.2} className="mt-0.5 shrink-0" />
                    <span>{f.label}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={onDismiss}
              className="text-[12.5px] text-mist transition-colors hover:text-snow"
            >
              Not now
            </button>
            <Link
              to="/pricing"
              onClick={onDismiss}
              className="text-[12.5px] text-azure transition-opacity hover:opacity-80"
            >
              Compare plans
            </Link>
          </div>
        </div>

        <button
          type="button"
          aria-label="Close"
          onClick={onDismiss}
          className="absolute right-3.5 top-3.5 grid h-8 w-8 place-items-center rounded-full border border-hairline-strong bg-obsidian/70 text-mist transition-colors hover:text-snow"
        >
          <X size={15} strokeWidth={2} aria-hidden />
        </button>
      </motion.div>
    </div>
  );
}
