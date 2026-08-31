import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BarChart3, Calendar, Check, ChevronDown, ChevronRight, Heart, Mountain as MountainIcon,
  MessageSquare, Search, Star, Users,
} from "lucide-react";
import { GuidePhoto } from "@/components/ui";
import { GuideCredentialMark } from "@/components/marks";
import { DEMO_NOTICE, GUIDES, IS_DEMO, type Guide } from "@/data/demo";
import { PEAKS, type Peak } from "@/data/peaks";
import { peakFallback, peakImage } from "./peakPlate";
import { formatEur } from "@/money/model";
import { cn } from "@/lib/utils";

/**
 * Find a guide — a three-step narrowing rather than a wall of filters.
 *
 * Mountain and dates first, then how you want to climb, then the people. The
 * order matters: a guide is only the right guide FOR something, so the page
 * refuses to rank anybody until it knows the objective.
 *
 * ON THE ACCENT — the reference is champagne gold and this renders azure, the
 * substitution asked for by name on the operator profile. Gold survives in one
 * place in this app and one only: the best-match expedition card.
 */

const STEPS = ["Mountain & dates", "Preferences", "Guides"] as const;
type StepId = 0 | 1 | 2;

const GROUP_SIZES = ["1 climber", "2 climbers", "3 climbers", "4+ climbers"];
const EXPERIENCE = ["First alpine route", "Intermediate", "Experienced", "Expedition veteran"];
const ROUTE_PREF = ["Classic route", "Technical line", "Whatever is in condition"];

/**
 * The window the picker opens on.
 *
 * A DATE IN THE FUTURE. The reference shows "15 Jun – 24 Jun 2025", which is
 * eighteen months in the past — the sort of thing that survives a mockup and
 * then quietly ships, telling a visitor the product is abandoned.
 */
const DEFAULT_DATES = "15 – 24 Jun 2027";

export default function GuidesPage() {
  const [step, setStep] = useState<StepId>(0);
  const [peakId, setPeakId] = useState<string>("mont-blanc");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(GROUP_SIZES[1]);
  const [level, setLevel] = useState(EXPERIENCE[1]);
  const [route, setRoute] = useState(ROUTE_PREF[0]);
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<"Recommended" | "Rating" | "Day rate" | "Experience">("Recommended");

  const peak = PEAKS.find((p) => p.id === peakId) ?? PEAKS[0];

  const matches = useMemo(() => {
    if (!IS_DEMO) return [];
    const short = peak.name.replace(/^Mount\s+/, "").split(" / ")[0];
    /* A guide is listed for this mountain, or works the same range. Never
       "every guide, sorted" — the whole point of choosing a peak first. */
    const onPeak = GUIDES.filter((g) => g.mountains.some((m) => m === short || m === peak.name));
    const nearby = GUIDES.filter((g) => !onPeak.includes(g));
    const ranked = [...onPeak, ...nearby];
    if (sort === "Rating") return [...ranked].sort((a, b) => b.rating - a.rating);
    if (sort === "Day rate") return [...ranked].sort((a, b) => a.dayRate - b.dayRate);
    if (sort === "Experience") return [...ranked].sort((a, b) => b.yearsGuiding - a.yearsGuiding);
    return ranked;
  }, [peak, sort]);

  const onPeakCount = useMemo(() => {
    const short = peak.name.replace(/^Mount\s+/, "").split(" / ")[0];
    return GUIDES.filter((g) => g.mountains.some((m) => m === short || m === peak.name)).length;
  }, [peak]);

  const shown = PEAKS.filter(
    (p) =>
      !query.trim() ||
      `${p.name} ${p.range} ${p.country}`.toLowerCase().includes(query.trim().toLowerCase()),
  );

  return (
    <div className="mx-auto w-full max-w-[1320px] pb-16">
      <h1 className="text-[24px] font-light tracking-[-0.02em] text-snow">Find your guide</h1>
      <p className="mt-1.5 text-[13px] text-mist">
        Choose a mountain, set your dates, and see who works it.
      </p>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_312px]">
        <div className="min-w-0">
          <StepCard
            step={step}
            peak={peak}
            query={query}
            onQuery={setQuery}
            shown={shown}
            onPick={(id) => {
              setPeakId(id);
              setQuery("");
            }}
          />

          <nav className="mt-6 flex gap-7 overflow-x-auto border-b border-hairline">
            {STEPS.map((s, i) => (
              <button
                key={s}
                type="button"
                onClick={() => setStep(i as StepId)}
                className={cn(
                  "-mb-px shrink-0 border-b-2 pb-3 text-[11.5px] transition-colors",
                  step === i
                    ? "border-azure text-azure"
                    : "border-transparent text-mist-dim hover:text-mist",
                )}
              >
                <span className="tnum">{i + 1}.</span> {s}
              </button>
            ))}
          </nav>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {step === 0 ? (
              <>
                <Field label="Dates" icon={Calendar}>
                  <span className="text-[13px] text-snow">{DEFAULT_DATES}</span>
                </Field>
                <Field label="Group size" icon={Users}>
                  <Choice value={group} onChange={setGroup} options={GROUP_SIZES} />
                </Field>
                <Field label="Experience level" icon={BarChart3}>
                  <Choice value={level} onChange={setLevel} options={EXPERIENCE} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Route preference" icon={MountainIcon}>
                  <Choice value={route} onChange={setRoute} options={ROUTE_PREF} />
                </Field>
                <Field label="Sort results by" icon={BarChart3}>
                  <Choice
                    value={sort}
                    onChange={(v) => setSort(v as typeof sort)}
                    options={["Recommended", "Rating", "Day rate", "Experience"]}
                  />
                </Field>
              </>
            )}
          </div>

          <div className="mt-7 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] text-snow">
              <span className="tnum">{matches.length}</span> guides
              {onPeakCount > 0 && (
                <span className="text-mist">
                  {" "}
                  &middot; <span className="tnum">{onPeakCount}</span> list {peak.name}
                </span>
              )}
            </p>
            <p className="text-[11.5px] text-mist-dim">Sorted by {sort.toLowerCase()}</p>
          </div>

          {matches.length === 0 ? (
            <div className="mt-4 rounded-card border border-hairline bg-graphite p-6">
              <p className="text-[13px] text-mist">
                {IS_DEMO ? "No guides match." : "ICEFALL has no guides listed yet."}
              </p>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {matches.map((g) => (
                <GuideCard
                  key={g.id}
                  g={g}
                  peak={peak}
                  saved={Boolean(saved[g.id])}
                  onSave={() => setSaved((s) => ({ ...s, [g.id]: !s[g.id] }))}
                />
              ))}
            </div>
          )}
        </div>

        <Rail
          peak={peak}
          group={group}
          level={level}
          route={route}
          step={step}
          onNext={() => setStep((s) => (s === 2 ? s : ((s + 1) as StepId)))}
        />
      </div>

      {IS_DEMO && (
        <p className="mt-8 border-t border-hairline pt-4 text-[11px] leading-relaxed text-mist-dim">
          {DEMO_NOTICE} Availability, success rates and summit counts on this page are demo figures
          — no booking system sits behind them.
        </p>
      )}
    </div>
  );
}

function StepCard({
  step, peak, query, onQuery, shown, onPick,
}: {
  step: StepId;
  peak: Peak;
  query: string;
  onQuery: (v: string) => void;
  shown: Peak[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="relative overflow-hidden rounded-card border border-hairline">
      <img
        src={peakImage(peak.id)}
        alt=""
        aria-hidden
        onError={(ev) => {
          const el = ev.currentTarget;
          if (!el.dataset.fellBack) {
            el.dataset.fellBack = "1";
            el.src = peakFallback(peak.id);
          }
        }}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 scrim-hero" />

      <div className="relative p-7">
        <p className="section-label">
          Step <span className="tnum">{step + 1}</span> of <span className="tnum">3</span>
        </p>
        <h2 className="mt-2 text-[24px] font-light leading-tight tracking-[-0.02em] text-snow">
          {step === 0 ? "Select your mountain" : step === 1 ? "How do you want to climb it?" : "Choose your guide"}
        </h2>
        <p className="mt-1 text-[13px] text-mist">
          {step === 0
            ? "Where do you want to go?"
            : step === 1
              ? "Route, pace and who you want beside you."
              : `Everyone below works ${peak.name} or the range around it.`}
        </p>

        {/*
          ONE WAY TO CHOOSE A MOUNTAIN, not three.
          This card previously had a search box AND a "Browse all mountains"
          button, with a Mountain dropdown in the filter row directly beneath and
          the choice repeated again in the rail. Four controls for one decision,
          stacked. The search now opens the whole list on focus — so "browse" and
          "search" are the same control — and the dropdown below is gone.
        */}
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist-dim">
              <Search size={14} strokeWidth={1.9} />
            </span>
            <input
              value={query}
              onChange={(e) => {
                onQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => window.setTimeout(() => setOpen(false), 140)}
              placeholder={`${peak.name} — change mountain`}
              aria-label="Choose a mountain"
              aria-expanded={open}
              role="combobox"
              className="h-11 w-[320px] rounded-tile border border-hairline-strong bg-obsidian/70 pl-9 pr-3 text-[13px] text-snow outline-none backdrop-blur placeholder:text-mist focus:border-azure/60"
            />
            {open && (
              <ul className="absolute z-20 mt-1.5 max-h-[300px] w-[320px] overflow-y-auto rounded-tile border border-hairline-strong bg-elevated py-1 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]">
                <li className="border-b border-hairline px-3.5 pb-1.5 pt-1 text-[10px] uppercase tracking-[0.12em] text-mist-dim">
                  {query.trim() ? `${shown.length} matching` : `All ${shown.length} mountains`}
                </li>
                {shown.length === 0 && (
                  <li className="px-3.5 py-2 text-[12px] text-mist-dim">No mountain matches.</li>
                )}
                {/* No cap: the header counts these, and a list that says 51 while showing
                    40 is a smaller lie than it looks but still a lie. It scrolls. */}
                {shown.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onPick(p.id);
                        setOpen(false);
                      }}
                      className="flex w-full items-baseline justify-between gap-3 px-3.5 py-2 text-left transition-colors hover:bg-slate"
                    >
                      <span className="truncate text-[12.5px] text-snow">{p.name}</span>
                      <span className="tnum shrink-0 text-[11px] text-mist-dim">
                        {p.elevationM.toLocaleString("en-GB")} m
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>


        </div>
      </div>
    </section>
  );
}

function Field({
  label, icon: Icon, children,
}: {
  label: string;
  icon: typeof MountainIcon;
  children: React.ReactNode;
}) {
  return (
    <label className="block rounded-tile border border-hairline bg-graphite px-3.5 py-2.5">
      <span className="section-label block">{label}</span>
      <span className="mt-1.5 flex items-center gap-2">
        <Icon size={14} strokeWidth={1.8} className="shrink-0 text-azure" />
        <span className="min-w-0 flex-1">{children}</span>
      </span>
    </label>
  );
}

function Choice({
  value, onChange, options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <span className="relative flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none bg-transparent pr-5 text-[13px] text-snow outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o} className="bg-graphite">
            {o}
          </option>
        ))}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-0 text-mist-dim" />
    </span>
  );
}

function GuideCard({
  g, peak, saved, onSave,
}: {
  g: Guide;
  peak: Peak;
  saved: boolean;
  onSave: () => void;
}) {
  const short = peak.name.replace(/^Mount\s+/, "").split(" / ")[0];
  const listsThisPeak = g.mountains.some((m) => m === short || m === peak.name);

  return (
    <article className="flex flex-col overflow-hidden rounded-card border border-hairline bg-graphite transition-colors hover:border-azure/45">
      <div className="relative h-[186px]">
        {/*
          The objective behind the portrait, never a stock photo of a climber.
          `GuidePhoto` falls back to a monogram, because the portraits are
          gitignored and a broken face is worse than initials.
        */}
        <img
          src={peakImage(g.heroPeak)}
          alt=""
          aria-hidden
          loading="lazy"
          onError={(ev) => {
            const el = ev.currentTarget;
            if (!el.dataset.fellBack) {
              el.dataset.fellBack = "1";
              el.src = peakFallback(g.heroPeak);
            }
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 scrim-full" />

        <span
          className={cn(
            "absolute left-3 top-3 rounded-pill px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em]",
            g.available
              ? "bg-summit/85 text-obsidian"
              : "border border-hairline-strong bg-obsidian/70 text-mist backdrop-blur",
          )}
        >
          {g.available ? "Available" : "Booked up"}
        </span>

        <button
          type="button"
          onClick={onSave}
          aria-pressed={saved}
          aria-label={saved ? `Unsave ${g.name}` : `Save ${g.name}`}
          className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-pill bg-obsidian/60 backdrop-blur transition-colors hover:bg-obsidian/85"
        >
          <Heart
            size={15}
            strokeWidth={1.9}
            className={cn(saved ? "fill-azure text-azure" : "text-snow/85")}
          />
        </button>

        <div className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4">
          <GuidePhoto name={g.name} src={g.photo} size={46} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-[15px] text-snow">{g.name}</span>
              <GuideCredentialMark verifiedOn={g.verifiedOn} size={13} />
            </span>
            <span className="mt-0.5 block truncate text-[11.5px] text-mist">{g.credential}</span>
          </span>
        </div>
      </div>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px]">
          <span className="flex items-center gap-1.5">
            <Star size={12} className="fill-azure text-azure" strokeWidth={1.8} />
            <span className="tnum text-snow">{g.rating.toFixed(1)}</span>
            <span className="text-mist-dim">({g.reviews})</span>
          </span>
          <span className="tnum text-mist-dim">{g.expeditionsLed} expeditions led</span>
          {/* Says which mountain the card is being judged against, so a guide
              who works the range but not this peak is not read as one who does. */}
          {!listsThisPeak && <span className="text-mist-dim">&middot; not listed for {short}</span>}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 border-y border-hairline py-3">
          {[
            ["Success rate", `${g.successRatePct}%`],
            ["Summits", `${g.summits}+`],
            ["Years", `${g.yearsGuiding}+`],
          ].map(([k, v]) => (
            <span key={k}>
              <span className="section-label block">{k}</span>
              <span className="tnum mt-1 block text-[14px] text-snow">{v}</span>
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <span>
            <span className="section-label block">From</span>
            {/*
              THE DAY RATE, LABELLED AS ONE. The reference says "/ person",
              which is a trip price — a different number that depends on the
              route and the party size. This is what the guide actually charges.
            */}
            <span className="tnum mt-1 block text-[14px] text-snow">
              {formatEur(g.dayRate)} <span className="text-[11px] text-mist-dim">/ day</span>
            </span>
          </span>
          {/* Went to /app/messages before this page existed — the fourth
              dead-end link found in this app. */}
          <Link
            to={`/app/guides/${g.id}`}
            className="rounded-pill border border-azure/45 px-3.5 py-2 text-[12px] text-azure transition-colors hover:border-azure hover:text-azure-bright"
          >
            View profile
          </Link>
        </div>
      </div>
    </article>
  );
}

function Rail({
  peak, group, level, route, step, onNext,
}: {
  peak: Peak;
  group: string;
  level: string;
  route: string;
  step: StepId;
  onNext: () => void;
}) {
  const rows: [string, string][] = [
    ["Dates", DEFAULT_DATES],
    ["Group size", group],
    ["Experience", level],
    ["Route preference", route],
  ];

  return (
    <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
      <section className="rounded-card border border-hairline bg-graphite p-5">
        <p className="section-label">Your selection</p>

        <div className="relative mt-3 h-[104px] overflow-hidden rounded-tile">
          <img
            src={peakImage(peak.id)}
            alt=""
            aria-hidden
            onError={(ev) => {
              const el = ev.currentTarget;
              if (!el.dataset.fellBack) {
                el.dataset.fellBack = "1";
                el.src = peakFallback(peak.id);
              }
            }}
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div className="absolute inset-0 scrim-bottom" />
          <div className="absolute inset-x-0 bottom-0 p-3">
            <p className="text-[15px] leading-tight text-snow">{peak.name}</p>
            <p className="tnum mt-0.5 text-[11.5px] text-mist">
              {peak.elevationM.toLocaleString("en-GB")} m &middot; {peak.country}
            </p>
          </div>
        </div>

        <dl className="mt-4 space-y-2.5">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-3">
              <dt className="text-[11.5px] text-mist-dim">{k}</dt>
              <dd className="text-right text-[12px] text-snow">{v}</dd>
            </div>
          ))}
        </dl>

        <button
          type="button"
          onClick={onNext}
          disabled={step === 2}
          className={cn(
            "mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-tile text-[13px] font-medium transition-opacity",
            step === 2
              ? "cursor-default border border-hairline text-mist-dim"
              : "bg-azure-cta text-obsidian hover:opacity-90",
          )}
        >
          {step === 0 ? "Continue to preferences" : step === 1 ? "See the guides" : "All steps done"}
          {step !== 2 && <ChevronRight size={15} strokeWidth={2.2} />}
        </button>
      </section>

      {/*
        WHY BOOK WITH ICEFALL — and every line is something ICEFALL actually
        does. The reference promises "verified reviews & success rates", "24/7
        support" and "secure booking & flexible payments", none of which exist:
        there is no booking system, so there are no completed bookings to verify
        a review against. Claims a marketplace cannot keep are the ones that
        matter most, so these say what is true instead.
      */}
      <section className="rounded-card border border-hairline bg-graphite p-5">
        <p className="section-label">How this listing works</p>
        <ul className="mt-3 space-y-2.5">
          {[
            "Every guide here holds an IFMGA or UIAGM licence",
            "Credentials are documented, not just claimed",
            "You book with the guide directly — ICEFALL takes no cut",
            "No position in these results is for sale",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2.5 text-[12px] leading-snug text-mist">
              <Check size={13} strokeWidth={2.2} className="mt-0.5 shrink-0 text-summit" />
              {t}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-card border border-hairline bg-graphite p-5">
        <p className="section-label">Not sure which mountain?</p>
        <p className="mt-2 text-[12px] leading-relaxed text-mist">
          The coach can work back from what you have climbed to what you are ready for.
        </p>
        <Link
          to="/app/coach"
          className="mt-3.5 flex h-10 items-center justify-center gap-2 rounded-tile border border-hairline-strong text-[12.5px] text-snow transition-colors hover:border-azure/50"
        >
          <MessageSquare size={13} strokeWidth={1.9} />
          Ask the coach
        </Link>
      </section>
    </aside>
  );
}
