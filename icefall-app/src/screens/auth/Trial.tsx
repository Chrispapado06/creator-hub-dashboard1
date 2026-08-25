import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Backpack, Check, CloudSnow, CreditCard, FileText, Gauge, LineChart, Lock,
  MessageCircle, RefreshCcw, ShieldCheck,
} from "lucide-react";
import { Button, AzureNotice } from "@/components/ui/primitives";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { TRIAL_DAYS, useApp } from "@/state/AppState";
import { planFor } from "@/growth/tiers";

/**
 * The trial flow — the offer, and the confirm.
 *
 * READ THIS BEFORE EDITING. ICEFALL has no payment processor. Not "not yet
 * configured" — none at all. That single fact decides both screens, and none of
 * it is negotiable, however a mock-up draws it:
 *
 *   - NO CARD FORM, AND NO CARD ON FILE. Nothing collects or DISPLAYS a card,
 *     because there is none — a "Visa ···· 4242 · Change" row is a fabricated
 *     payment record, and the App-Store path we're taking never renders a card
 *     anyway (Apple's own sheet does). If billing lands, a processor's hosted
 *     sheet handles it, never this file.
 *   - NOTHING IMPLIES A CHARGE. No "you'll be charged on the 4th", no "cancel
 *     before Friday to avoid billing", no "100% secure payment", no renewal
 *     countdown. None of it would be true, and a false deadline is pressure
 *     whether or not the money is real. The price is stated as what the plan
 *     WILL cost when subscriptions go live.
 *   - NOTHING IS LOCKED WHEN THE TRIAL ENDS. Recorded training is the athlete's.
 *
 * `startTrial` in AppState is the seam: when billing lands, swap the local dates
 * for the processor's record and the "billing is not connected" panels drop.
 */

const PRO = planFor("pro");
const PRICE = PRO.monthlyEur === null ? "the monthly price" : `€${PRO.monthlyEur.toFixed(2)}`;

const trialDays: number = TRIAL_DAYS; // widened: TRIAL_DAYS is a literal type
const DAY_NOUN = trialDays === 1 ? "day" : "days";
const TRIAL_LENGTH_NUMERIC = `${trialDays} ${DAY_NOUN}`;

const BILLING_NOTICE =
  `ICEFALL has no payment processor connected. The ${TRIAL_LENGTH_NUMERIC} are free, no payment ` +
  `method is taken, and nothing is charged when the trial ends — the app carries on exactly as it ` +
  `is. ${PRICE} a month is what the plan will cost when subscriptions go live.`;

const BILLING_NOTICE_ENDED =
  `ICEFALL has no payment processor connected. No payment method was taken, nothing was charged ` +
  `when the trial ended, and nothing has been locked. ${PRICE} a month is what the plan will cost ` +
  `when subscriptions go live.`;

const EASE = [0.22, 1, 0.36, 1] as const;

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                              */
/* -------------------------------------------------------------------------- */


/** The three reassurances across the top — every one of them TRUE. */
function TrustRow({ items }: { items: { icon: typeof Lock; label: string }[] }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ icon: Icon, label }) => (
        <div key={label} className="flex flex-col items-center gap-1.5 text-center">
          <Icon size={16} strokeWidth={1.6} className="text-azure/85" />
          <span className="text-[10.5px] leading-tight text-mist">{label}</span>
        </div>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Screen 2 — the trial pitch                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Every tile is a feature that EXISTS in this build (the enforced Pro gates and
 * the built systems). Nothing aspirational — the comparison in /pricing marks
 * what is only "coming soon", and it never appears as a selling point here.
 */
const TRIAL_TILES: { icon: typeof Lock; title: string; detail: string }[] = [
  { icon: MessageCircle, title: "Unlimited Coach", detail: "Ask as often as you train." },
  { icon: LineChart, title: "Advanced analytics", detail: "Load, trends and benchmarks." },
  { icon: CloudSnow, title: "Detailed conditions", detail: "Per-elevation, 7-day, your window." },
  { icon: Backpack, title: "Full kit & pack", detail: "Mountain-specific, weight-planned." },
  { icon: FileText, title: "Permits & documents", detail: "What the objective requires." },
  { icon: Gauge, title: "Readiness & recovery", detail: "A daily read, honestly bounded." },
];

export function TrialStart() {
  const navigate = useNavigate();
  const endsAt = useMemo(() => new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(), []);

  return (
    <div className="no-scrollbar relative h-full overflow-y-auto bg-obsidian">
      <div
        className="relative px-5 pb-10"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link
            to="/pricing"
            aria-label="Back"
            className="grid h-9 w-9 place-items-center rounded-full text-mist transition-colors hover:text-snow"
          >
            <ArrowLeft size={19} strokeWidth={1.6} />
          </Link>
          <p className="section-label text-mist">{TRIAL_LENGTH_NUMERIC} Pro trial</p>
          <span className="h-9 w-9" />
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: EASE }}>
          <h1 className="display mt-6 text-center text-[30px] leading-[1.08] text-snow">
            Experience ICEFALL<br />Pro. No limits.
          </h1>

          <div className="mt-6">
            <TrustRow
              items={[
                { icon: ShieldCheck, label: "Full access to all Pro features" },
                { icon: RefreshCcw, label: `${TRIAL_LENGTH_NUMERIC}, nothing taken` },
                { icon: Lock, label: "Cancel any time" },
              ]}
            />
          </div>

          {/* Hero */}
          <div className="mt-6 h-44 overflow-hidden rounded-card border border-hairline">
            <img src="/img/matterhorn.jpg" alt="" aria-hidden className="h-full w-full object-cover" />
          </div>

          {/* Trial includes */}
          <p className="section-label mt-7">Your {TRIAL_LENGTH_NUMERIC} trial includes</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            {TRIAL_TILES.map(({ icon: Icon, title, detail }) => (
              <div key={title} className="rounded-tile border border-hairline bg-elevated/40 p-3.5">
                <Icon size={17} strokeWidth={1.6} className="text-azure/85" />
                <p className="mt-2.5 text-[12.5px] leading-snug text-snow">{title}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-mist-dim">{detail}</p>
              </div>
            ))}
          </div>

          <p className="mt-6 text-center text-[12px] leading-relaxed text-mist">
            Trial ends {fmtDate(endsAt)} if you start today.<br />
            Nothing is charged when it ends.
          </p>

          <div className="mt-5">
            <AzureNotice title="Billing is not connected">{BILLING_NOTICE}</AzureNotice>
          </div>

          <Button className="mt-6 w-full" onClick={() => navigate("/subscribe")}>
            Start my {TRIAL_LENGTH_NUMERIC} trial
          </Button>
          <button
            type="button"
            onClick={() => navigate("/pricing")}
            className="mt-4 w-full text-center text-[13px] text-azure transition-colors hover:text-azure-bright"
          >
            View all plans
          </button>
        </motion.div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Screen 3 — confirm and start (no payment, honestly)                        */
/* -------------------------------------------------------------------------- */

const PRO_BENEFITS: { icon: typeof Lock; title: string; detail: string }[] = [
  { icon: MessageCircle, title: "Unlimited Coach", detail: "Personalised, every day of preparation." },
  { icon: LineChart, title: "Advanced analytics", detail: "Deep load, trend and benchmark tracking." },
  { icon: CloudSnow, title: "Detailed conditions", detail: "Per-elevation bands and extended forecast." },
  { icon: Backpack, title: "Full kit & pack planner", detail: "Mountain-specific, itemised by weight." },
];

export function Paywall() {
  const navigate = useNavigate();
  const { subscription, trialDaysLeft, startTrial } = useApp();

  const ended = subscription.status === "expired";
  const trialing = subscription.status === "trialing";

  const endsAt = useMemo(() => new Date(Date.now() + TRIAL_DAYS * 86_400_000).toISOString(), []);

  function begin() {
    startTrial();
    navigate("/home", { replace: true });
  }

  return (
    <div className="no-scrollbar relative h-full overflow-y-auto bg-obsidian">
      {/* Full-bleed hero */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[300px] overflow-hidden">
        <img src="/img/home-hero.jpg" alt="" aria-hidden className="h-full w-full object-cover opacity-90" />
        <div className="absolute inset-0 bg-gradient-to-b from-obsidian/40 via-obsidian/75 to-obsidian" />
      </div>

      <div
        className="relative px-5 pb-10"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 0px) + 16px)" }}
      >
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Back"
            className="grid h-9 w-9 place-items-center rounded-full text-snow/90 transition-colors hover:text-snow"
          >
            <ArrowLeft size={19} strokeWidth={1.6} />
          </button>
          <p className="section-label text-mist">{ended ? "Trial ended" : "Start trial"}</p>
          <span className="h-9 w-9" />
        </div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.42, ease: EASE }}>
          <h1 className="display mt-16 text-center text-[30px] leading-[1.1] text-snow">
            {ended ? (
              <>Your trial<br />has ended.</>
            ) : (
              <>Start your {TRIAL_LENGTH_NUMERIC}<br />Pro trial.</>
            )}
          </h1>

          {ended ? (
            <p className="mt-3 text-center text-[13px] leading-relaxed text-mist">
              Everything you recorded is still here, and still yours. Nothing has been locked, and
              nothing was charged.
            </p>
          ) : (
            <>
              <p className="mt-3 text-center text-[15px] text-snow">
                Then {PRICE}/month when subscriptions go live.
              </p>
              <p className="mt-1.5 text-center text-[12px] text-mist">
                {trialing && trialDaysLeft !== null
                  ? `Your trial is running — ${trialDaysLeft} ${trialDaysLeft === 1 ? "day" : "days"} left.`
                  : `Cancel any time. Nothing is charged, now or when the ${TRIAL_LENGTH_NUMERIC} end.`}
              </p>
            </>
          )}

          {/* Benefits */}
          <div className="mt-8 space-y-3.5 rounded-card border border-hairline bg-graphite/70 p-5">
            {PRO_BENEFITS.map(({ icon: Icon, title, detail }) => (
              <div key={title} className="flex gap-3.5">
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-tile border border-hairline text-azure/85">
                  <Icon size={17} strokeWidth={1.6} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] text-snow">{title}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-mist-dim">{detail}</span>
                </span>
              </div>
            ))}
          </div>

          {/* Payment — honest. No card, because there is none and none is taken. */}
          <p className="section-label mt-7">Payment</p>
          <div className="mt-3 flex gap-3 rounded-card border border-hairline bg-graphite/70 p-4">
            <CreditCard size={18} strokeWidth={1.6} className="mt-0.5 shrink-0 text-mist" />
            <div className="min-w-0">
              <p className="text-[13px] text-snow">No card needed</p>
              <p className="mt-1 text-[11.5px] leading-relaxed text-mist-dim">
                Billing isn't connected — the trial is free and nothing is charged, now or when it
                ends. When payments go live, you'll add a method here through the App Store.
              </p>
            </div>
          </div>

          <div className="mt-5">
            <AzureNotice title="Billing is not connected">{ended ? BILLING_NOTICE_ENDED : BILLING_NOTICE}</AzureNotice>
          </div>

          {ended ? (
            <Button className="mt-6 w-full" onClick={() => navigate("/home", { replace: true })}>
              Back to ICEFALL
            </Button>
          ) : (
            <>
              <Button className="mt-6 w-full" onClick={begin}>
                <Lock size={15} strokeWidth={1.8} />
                Start {TRIAL_LENGTH_NUMERIC} trial
              </Button>
              <p className="mt-3 text-center text-[11px] leading-relaxed text-mist-dim">
                No payment method is requested, and no payment is taken.
                {" "}The trial ends {fmtDate(endsAt)} if you start today.
              </p>
            </>
          )}

          {/* Honest trust row — each claim true today */}
          <div className="mt-6 border-t border-hairline pt-5">
            <TrustRow
              items={[
                { icon: Lock, label: "Nothing charged" },
                { icon: CreditCard, label: "No card taken" },
                { icon: RefreshCcw, label: "Cancel any time" },
              ]}
            />
          </div>

          <button
            type="button"
            onClick={() => navigate("/home", { replace: true })}
            className="section-label mt-6 w-full text-center text-mist transition-colors hover:text-snow"
          >
            Back to ICEFALL
          </button>
        </motion.div>
      </div>
    </div>
  );
}
