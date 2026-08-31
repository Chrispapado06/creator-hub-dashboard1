import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Award, BadgeCheck, Bookmark, ChevronRight, Flag, Heart, Leaf, Mountain as MountainIcon,
  MessageSquare, Play, Send, Shield, ShieldCheck, Sprout, Star, TrendingUp, Users,
} from "lucide-react";
import { Badge, GuidePhoto, VerifiedTick } from "@/components/ui";
import { IS_DEMO } from "@/data/demo";
import { companyById, companySlug, tripsFor, type Company, type Review } from "@/data/companies";
import { formatEur, STANDARD_POLICY } from "@/money/model";
import { cn } from "@/lib/utils";
import { operatorsForTrek, treksForOperator } from "@/data/treks";
import { TrekCard } from "./TrekCard";
import { demoNoticeFor, RealBusinessBanner } from "@/components/RealBusiness";
import { CompanyMark } from "@/components/CompanyMark";
import { peakFallback, peakImage } from "./peakPlate";
import { useCompanyPreview, type CompanyPreview } from "./useCompanyPreview";

/**
 * An expedition company, full width.
 *
 * The phone app has this screen too, and this is NOT that screen stretched. A
 * desktop has room for a persistent right rail — why climb with them, what
 * people say, what they are accredited by — beside the story and the trips, so
 * the whole company reads in about a screen and a half rather than six.
 *
 * ON THE ACCENT — the reference design is champagne gold and this renders in
 * azure, the same substitution asked for by name on the operator profile
 * ("just make the yellow to Blue"). The app has one accent.
 */

/* Treks sit beside Expeditions here for the same reason they do on a mountain
   page: an operator sells two different products and a buyer is choosing
   between them, not browsing one list. */
const TABS = ["Overview", "Expeditions", "Treks", "Reviews", "Team", "Gallery", "About", "FAQ"] as const;
type TabId = (typeof TABS)[number];

const PILLAR_ICONS = [ShieldCheck, Users, TrendingUp, Leaf];
const WHY_ICONS = [Award, Users, TrendingUp, Shield, Sprout];
/**
 * "Featured", or nothing.
 *
 * These read "Most popular", "Best value" and "Premium", assigned by array
 * index — so the ribbon was decided by a listing's position in a loop, not by
 * anything about the listing. "Most popular" is a claim about what other
 * customers did, and ICEFALL has never had a customer; "Best value" is a
 * comparison the app cannot compute. Both are social proof, which the product
 * refuses on principle.
 *
 * "Featured" survives because it is the one that is true. ICEFALL sells
 * placement, so a featured listing is a listing someone paid to feature — a
 * fact about a commercial arrangement rather than a claim about other people's
 * behaviour. The operator still gets the visual prominence they are buying; the
 * reader stops being told something unearned.
 */
const BADGES = ["Featured", "", "Featured", ""] as const;

/** The notice window that actually refunds in full, read off the policy. */
const FREE_CANCEL_DAYS = STANDARD_POLICY.tiers.find((t) => t.refundPct === 100)?.daysBefore ?? 0;

export default function CompanyPage() {
  const { id } = useParams<{ id: string }>();
  const company = id !== undefined ? companyById(id) : undefined;
  /**
   * ABOVE THE EARLY RETURN, DELIBERATELY. `CompanyPage` returns early for a
   * missing company; a hook below that return runs on some renders and not
   * others — "rendered fewer hooks than expected", the failure a redirect
   * placed above the useState calls once caused in Explore.tsx.
   * `useCompanyPreview` accepts undefined for exactly this reason.
   */
  const preview = useCompanyPreview(company);

  if (company === undefined) {
    return (
      <div className="mx-auto w-full max-w-[720px] py-16">
        <h1 className="text-[22px] font-light text-snow">No such company</h1>
        <p className="mt-3 text-[13px] leading-relaxed text-mist">
          ICEFALL has no operator partnerships, so a missing listing is a placeholder that has gone
          rather than a business that has closed.
        </p>
        <Link
          to="/app/explore"
          className="mt-6 inline-flex items-center gap-1.5 text-[13px] text-azure hover:text-azure-bright"
        >
          Back to expeditions
          <ChevronRight size={14} strokeWidth={1.9} />
        </Link>
      </div>
    );
  }

  return <Profile company={preview.company} preview={preview} />;
}

/**
 * Following, kept in the browser.
 *
 * There is no account and no server, so "followed" is a fact about this browser
 * and nothing more. Storing it locally means the button at least tells the
 * truth on the next visit, instead of resetting and pretending it never
 * happened — which is what a plain `useState` toggle would do.
 */
function useFollow(id: string) {
  const key = `icefall:following:${id}`;
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      setOn(window.localStorage.getItem(key) === "1");
    } catch {
      /* private mode, blocked storage — the button still works for this visit */
    }
  }, [key]);
  const toggle = () => {
    setOn((prev) => {
      const next = !prev;
      try {
        if (next) window.localStorage.setItem(key, "1");
        else window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
      return next;
    });
  };
  return [on, toggle] as const;
}

function Profile({ company: c, preview }: { company: Company; preview: CompanyPreview }) {
  const [tab, setTab] = useState<TabId>("Overview");

  useEffect(() => {
    const wanted = preview.requestedTab;
    if (wanted !== null && (TABS as readonly string[]).includes(wanted)) setTab(wanted as TabId);
  }, [preview.requestedTab]);

  // Measure after every render. No dependency array on purpose.
  useEffect(() => {
    preview.onRendered(tab);
  });
  const [following, toggleFollow] = useFollow(c.id);
  const [askedForVideo, setAskedForVideo] = useState(false);
  const trips = tripsFor(c.name);
  const treks = treksForOperator(c.id);
  const hero = c.gallery[0] ?? "/img/everest.jpg";
  const verified = c.verifiedOn.length > 0;

  return (
    <div className="mx-auto w-full max-w-[1320px] pb-16">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5">
        <Link to="/app/explore" className="text-[10.5px] uppercase tracking-[0.13em] text-mist-dim hover:text-mist">Explore</Link>
        <ChevronRight size={11} className="text-mist-dim" />
        <Link to="/app/explore" className="text-[10.5px] uppercase tracking-[0.13em] text-mist-dim hover:text-mist">Expeditions</Link>
        <ChevronRight size={11} className="text-mist-dim" />
        <span className="text-[10.5px] uppercase tracking-[0.13em] text-snow">{c.name}</span>
      </nav>

      {/*
        A REAL COMPANY, WITH ICEFALL'S NUMBERS ON IT.
        Above everything, not in a footnote — someone who reads the rating and
        leaves has already been misled by the time they reach the bottom.
      */}
      <div className="mt-3 empty:mt-0">
        <RealBusinessBanner company={c} />
      </div>

      {/* ---- Hero -------------------------------------------------------- */}
      <section data-icefall-section="hero" className="relative mt-4 overflow-hidden rounded-card border border-hairline">
        <div className="absolute inset-0">
          <img src={hero} alt="" aria-hidden className="h-full w-full object-cover object-[62%_38%]" />
          <div className="absolute inset-0 bg-gradient-to-r from-obsidian via-obsidian/85 to-obsidian/25" />
          <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/40 to-transparent" />
        </div>

        <div className="relative flex flex-wrap items-start gap-x-8 gap-y-6 p-7">
          {/*
            The mark, on its own ground.

            `logo` is only ever set for an invented company — a real business's
            logo is its trademark and is not bundled, so that listing falls back
            to the monogram. The verification check sits ON the tile, and only
            when the operator actually carries a verification date.
          */}
          <div className="relative shrink-0">
            <CompanyMark name={c.name} logo={c.logo} size={132} variant="card" />
            {verified && (
              <span
                title={`Verified by ICEFALL on ${c.verifiedOn}`}
                className="absolute -right-2.5 -top-2.5 grid h-9 w-9 place-items-center rounded-pill border-2 border-obsidian bg-azure text-obsidian shadow-[0_6px_18px_-6px_rgba(0,0,0,0.9)]"
              >
                <BadgeCheck size={18} strokeWidth={2.2} />
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            {verified ? (
              <span className="inline-flex items-center gap-1.5 rounded-pill border border-azure/45 bg-obsidian/60 px-3 py-1 text-[9.5px] font-semibold uppercase tracking-[0.13em] text-azure backdrop-blur">
                Verified company
                <VerifiedTick verifiedOn={c.verifiedOn} size={11} />
              </span>
            ) : (
              /* No tick for an operator ICEFALL has not verified. The badge is
                 the most load-bearing thing on the page and is never decorative. */
              <span className="inline-flex rounded-pill border border-hairline-strong bg-obsidian/60 px-3 py-1 text-[9.5px] font-semibold uppercase tracking-[0.13em] text-mist-dim backdrop-blur">
                Not verified by ICEFALL
              </span>
            )}

            <h1 className="mt-2.5 text-[32px] font-light leading-none tracking-[-0.02em] text-snow">{c.name}</h1>
            <p className="mt-2 text-[15px] text-snow/75">{c.tagline}</p>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-mist">
              <span className="flex items-center gap-1.5">
                <MountainIcon size={12.5} strokeWidth={1.8} className="text-azure" />
                {c.city}
              </span>
              {c.yearsExperience > 0 && (
                <>
                  <span className="text-mist-dim">·</span>
                  <span>{c.yearsExperience}+ years experience</span>
                </>
              )}
            </div>

            {/*
              A rating is shown only where reviews back it. Printing one with a
              review count of zero is how the header came to claim 64 reviews on
              a listing whose rail said none had been published.
            */}
            <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px]">
              {c.reviewCount > 0 ? (
                <span className="flex items-center gap-1.5">
                  <Star size={13} className="fill-azure text-azure" strokeWidth={1.9} />
                  <span className="tnum text-snow">{c.rating.toFixed(1)}</span>
                  <span className="text-mist-dim">({c.reviewCount} reviews)</span>
                </span>
              ) : (
                <span className="text-mist-dim">No ratings published</span>
              )}
              {c.summiteerCount > 0 && (
                <span className="flex items-center gap-1.5 text-mist">
                  <Users size={13} strokeWidth={1.8} className="text-mist-dim" />
                  <span className="tnum">{c.summiteerCount.toLocaleString("en-GB")}+</span> summiteers
                </span>
              )}
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <Link
                to="/app/messages"
                className="flex h-11 w-[230px] items-center justify-center gap-2 rounded-tile bg-azure-cta text-[13.5px] font-medium text-obsidian transition-opacity hover:opacity-90"
              >
                <MessageSquare size={15} strokeWidth={1.9} />
                Contact company
              </Link>
              <button
                type="button"
                onClick={toggleFollow}
                aria-pressed={following}
                className={cn(
                  "flex h-11 w-[168px] items-center justify-center gap-2 rounded-tile border text-[13.5px] transition-colors",
                  following
                    ? "border-azure bg-azure/10 text-azure"
                    : "border-hairline-strong text-snow hover:border-azure/50",
                )}
              >
                <Heart size={15} strokeWidth={1.9} className={cn(following && "fill-azure")} />
                {following ? "Following" : "Follow"}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ---- Tabs -------------------------------------------------------- */}
      <div className="no-scrollbar mt-6 flex gap-8 overflow-x-auto border-b border-hairline">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            aria-current={t === tab ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 pb-3 text-[11px] font-medium uppercase tracking-[0.13em] transition-colors",
              t === tab ? "border-azure text-azure" : "border-transparent text-mist-dim hover:text-mist",
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_384px]">
        <div className="min-w-0">
          {tab === "Overview" && (
            <>
              <div className="grid gap-5 lg:grid-cols-2">
                <AboutCard c={c} onTeam={() => setTab("Team")} />
                <StoryCard c={c} asked={askedForVideo} onAsk={() => setAskedForVideo(true)} />
              </div>
              <div data-icefall-section="featured-trips">
                <Trips trips={trips} onAll={() => setTab("Expeditions")} />
              </div>

              {treks.length > 0 && (
                <>
                  <div className="mt-7 flex items-baseline justify-between">
                    <h2 className="text-[11px] font-medium uppercase tracking-[0.13em] text-snow">
                      Treks
                    </h2>
                    <button
                      type="button"
                      onClick={() => setTab("Treks")}
                      className="flex items-center gap-0.5 text-[11.5px] text-summit hover:text-snow"
                    >
                      View all {treks.length}
                      <ChevronRight size={13} strokeWidth={1.9} />
                    </button>
                  </div>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {treks.slice(0, 3).map((t) => (
                      <TrekCard key={t.id} trek={t} operators={operatorsForTrek(t.id).length} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {tab === "Expeditions" && (
            <div data-icefall-section="featured-trips">
              <Trips trips={trips} />
            </div>
          )}
          {tab === "Treks" && (
            treks.length === 0 ? (
              <div className="rounded-card border border-hairline bg-graphite p-6">
                <p className="text-[13px] text-mist">
                  {c.realBusiness
                    ? `ICEFALL does not know which trekking routes ${c.name} runs.`
                    : "This operator publishes no trekking routes."}
                </p>
              </div>
            ) : (
              <>
                <p className="text-[12px] text-mist-dim">
                  Walking routes {c.name} runs. None of these climb a summit.
                </p>
                <div className="mt-3 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                  {treks.map((t) => (
                    <TrekCard key={t.id} trek={t} operators={operatorsForTrek(t.id).length} />
                  ))}
                </div>
              </>
            )
          )}
          {tab === "Reviews" && <ReviewList c={c} />}
          {tab === "Team" && <Team c={c} />}
          {tab === "Gallery" && <Gallery photos={c.gallery} />}
          {tab === "About" && <AboutTab c={c} />}
          {tab === "FAQ" && <Faq c={c} />}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <WhyClimb c={c} />
          <WhatPeopleSay c={c} onAll={() => setTab("Reviews")} />
          <Credentials c={c} />
        </aside>
      </div>

      {IS_DEMO && (
        <p className="mt-8 border-t border-hairline pt-4 text-[11px] leading-relaxed text-mist-dim">
          {demoNoticeFor(c)}
        </p>
      )}
    </div>
  );
}

function AboutCard({ c, onTeam }: { c: Company; onTeam: () => void }) {
  /* A zero here means the operator has published no figure — see companies.ts.
     "0+ years" and a "0% summit success rate" would both be worse than silence. */
  const NP = "Not published";
  const stats = [
    { icon: MountainIcon, value: c.yearsExperience > 0 ? `${c.yearsExperience}+` : NP, label: "Years experience" },
    { icon: Flag, value: c.expeditionCount > 0 ? `${c.expeditionCount}+` : NP, label: "Successful expeditions" },
    { icon: TrendingUp, value: c.summitSuccessPct > 0 ? `${c.summitSuccessPct}%` : NP, label: "Summit success rate" },
    { icon: ShieldCheck, value: "24/7", label: "Support" },
  ];
  return (
    <section data-icefall-section="about" className="flex flex-col rounded-card border border-hairline bg-graphite p-6">
      <p className="section-label">About {c.name}</p>
      <p className="mt-3.5 text-[13.5px] leading-relaxed text-mist">{c.about}</p>

      <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex items-start gap-2">
            <s.icon size={17} strokeWidth={1.6} className="mt-0.5 shrink-0 text-azure" />
            <span className="min-w-0">
              <span className={cn("tnum block leading-tight", s.value === NP ? "text-[11.5px] text-mist-dim" : "text-[15px] text-snow")}>{s.value}</span>
              <span className="mt-0.5 block text-[10.5px] leading-snug text-mist-dim">{s.label}</span>
            </span>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onTeam}
        className="mt-6 flex w-fit items-center gap-2 rounded-tile border border-azure/45 px-4 py-2.5 text-[12.5px] text-azure transition-colors hover:border-azure hover:text-azure-bright"
      >
        Meet the team
        <ChevronRight size={14} strokeWidth={2} />
      </button>
    </section>
  );
}

/**
 * "Our story".
 *
 * The reference centres a video here. No company in this app has published
 * one, so the play control says that when pressed rather than swallowing the
 * click. A control that does nothing is worse than one that explains itself.
 */
function StoryCard({ c, asked, onAsk }: { c: Company; asked: boolean; onAsk: () => void }) {
  const still = c.gallery[1] ?? c.gallery[0] ?? "/img/everest.jpg";
  return (
    <section data-icefall-section="story" className="relative overflow-hidden rounded-card border border-hairline bg-graphite">
      <img src={still} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute inset-0 scrim-full" />
      <div className="relative flex min-h-[248px] flex-col justify-end p-6">
        <button
          type="button"
          onClick={onAsk}
          aria-label={`${c.name} story video`}
          className="absolute left-1/2 top-1/2 grid h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-pill border border-snow/25 bg-obsidian/45 backdrop-blur transition-colors hover:border-azure/60"
        >
          <Play size={19} className="ml-0.5 text-snow/85" strokeWidth={1.6} />
        </button>
        <p className="text-[15px] text-snow">Our story</p>
        <p className="mt-0.5 text-[12px] text-mist">
          {asked ? "No video has been published by this operator." : "Watch the video"}
        </p>
      </div>
    </section>
  );
}

function Trips({ trips, onAll }: { trips: ReturnType<typeof tripsFor>; onAll?: () => void }) {
  if (trips.length === 0) {
    return (
      <div data-icefall-section="featured-trips" className="mt-6 rounded-card border border-hairline bg-graphite p-6">
        <p className="text-[13px] text-mist">This listing publishes no trips.</p>
      </div>
    );
  }
  return (
    <>
      <div className={cn("flex items-baseline justify-between", onAll ? "mt-7" : "")}>
        <h2 className="text-[11px] font-medium uppercase tracking-[0.13em] text-snow">
          {onAll ? "Featured expeditions" : "Expeditions"}
        </h2>
        {onAll !== undefined && (
          <button type="button" onClick={onAll} className="flex items-center gap-0.5 text-[11.5px] text-azure hover:text-azure-bright">
            View all expeditions
            <ChevronRight size={13} strokeWidth={1.9} />
          </button>
        )}
      </div>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {trips.map((t, i) => (
          /*
           * These were <article> elements with nothing to click. The company
           * page listed the trips and every one of them was a dead end.
           */
          <Link
            key={t.id}
            to={`/app/trip/${t.id}`}
            className="group block overflow-hidden rounded-card border border-hairline bg-graphite transition-colors hover:border-azure/45"
          >
            <div className="relative aspect-[16/10]">
              <img
                src={peakImage(t.heroPeak)}
                alt=""
                aria-hidden
                loading="lazy"
                onError={(ev) => {
                  const el = ev.currentTarget;
                  if (!el.dataset.fellBack) {
                    el.dataset.fellBack = "1";
                    el.src = peakFallback(t.heroPeak);
                  }
                }}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              />
              {BADGES[i % BADGES.length] !== "" && (
                <span className="absolute left-3 top-3 rounded-pill bg-azure px-2.5 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-obsidian">
                  {BADGES[i % BADGES.length]}
                </span>
              )}
            </div>
            <div className="p-4">
              <p className="text-[13.5px] leading-tight text-snow">{t.objective}</p>
              <p className="tnum mt-1.5 text-[11.5px] text-mist-dim">{t.durationDays} days · {t.country}</p>
              <div className="mt-3 flex items-end justify-between gap-2 border-t border-hairline pt-3">
                <span>
                  <span className="section-label block">From</span>
                  <span className="tnum mt-1 block text-[13px] text-snow">{formatEur(t.fromEur)}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone="azure">{t.months}</Badge>
                  <Bookmark size={14} strokeWidth={1.7} className="text-mist-dim" aria-hidden />
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}

function WhyClimb({ c }: { c: Company }) {
  return (
    <section data-icefall-section="why-climb" className="rounded-card border border-hairline bg-graphite p-6">
      <p className="section-label">Why climb with us</p>
      <ul className="mt-4 space-y-4">
        {c.highlights.slice(0, 5).map((h, i) => {
          const Icon = WHY_ICONS[i % WHY_ICONS.length]!;
          return (
            <li key={h.label} className="flex items-start gap-3.5">
              <Icon size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
              <span className="min-w-0">
                <span className="block text-[13px] leading-tight text-snow">{h.label}</span>
                <span className="mt-1 block text-[11.5px] leading-snug text-mist-dim">{h.detail}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span className="flex items-center gap-0.5" aria-hidden>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={size}
          strokeWidth={1.6}
          className={n <= Math.round(value) ? "fill-azure text-azure" : "text-mist-dim/45"}
        />
      ))}
    </span>
  );
}

function WhatPeopleSay({ c, onAll }: { c: Company; onAll: () => void }) {
  if (c.reviews.length === 0) {
    return (
      <section data-icefall-section="reviews" className="rounded-card border border-hairline bg-graphite p-6">
        <p className="section-label">What people say</p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-mist">
          No reviews have been published for this listing.
        </p>
      </section>
    );
  }
  const [lead, ...rest] = c.reviews;
  return (
    <section data-icefall-section="reviews" className="rounded-card border border-hairline bg-graphite p-6">
      <div className="flex items-baseline justify-between">
        <p className="section-label">What people say</p>
        <button type="button" onClick={onAll} className="flex items-center gap-0.5 text-[11.5px] text-azure hover:text-azure-bright">
          View all reviews
          <ChevronRight size={13} strokeWidth={1.9} />
        </button>
      </div>

      <div className="mt-3.5 flex items-center gap-3">
        <span className="tnum text-[30px] font-light leading-none text-snow">{c.rating.toFixed(1)}</span>
        <Stars value={c.rating} size={14} />
        <span className="text-[11.5px] text-mist-dim">({c.reviewCount} reviews)</span>
      </div>

      <div className="mt-5 border-t border-hairline pt-4">
        <ReviewRow r={lead} expanded />
      </div>
      {rest.length > 0 && (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {rest.map((r) => (
            <li key={r.id} className="py-3.5">
              <ReviewRow r={r} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReviewRow({ r, expanded = false }: { r: Review; expanded?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      {/*
        A MONOGRAM, NOT A FACE.
        The reference shows photographs of the reviewers. These reviewers do not
        exist, and giving an invented person a photographed identity is a
        different order of fabrication from giving them a name — so the avatar
        falls back to initials, which the component already does well.
      */}
      <GuidePhoto name={r.author} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[12.5px] text-snow">{r.author}</span>
          {r.verified && (
            <span className="rounded-pill border border-summit/40 px-1.5 py-px text-[9px] uppercase tracking-[0.08em] text-summit">
              Verified
            </span>
          )}
          {!expanded && (
            <span className="ml-auto flex items-center gap-1.5">
              <Stars value={r.stars} />
              <span className="tnum text-[11.5px] text-snow">{r.stars.toFixed(1)}</span>
            </span>
          )}
        </div>
        {r.climbed && <p className="mt-0.5 text-[11px] text-mist-dim">Climbed {r.climbed}</p>}
        {expanded && (
          <>
            <p className="mt-2 text-[12.5px] leading-relaxed text-mist">{r.body}</p>
            <p className="mt-1.5 text-[10.5px] text-mist-dim">{r.when}</p>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Accreditations, set as wordmarks.
 *
 * The bodies are real. Their LOGOS are not reproduced — a rendered wordmark
 * names an accreditation, a copied logo passes a real organisation's mark off
 * as ICEFALL content for a listing that may not hold it.
 */
function Credentials({ c }: { c: Company }) {
  return (
    <section data-icefall-section="credentials" className="rounded-card border border-hairline bg-graphite p-6">
      <p className="section-label">Company credentials</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {c.credentials.map((cr) => (
          <div
            key={cr.mark}
            title={cr.full}
            className="rounded-tile border border-hairline bg-slate/50 px-3 py-3.5 text-center"
          >
            <p className="text-[13px] font-medium tracking-[0.06em] text-snow">{cr.mark}</p>
            <p className="mt-1 text-[9px] uppercase tracking-[0.1em] text-mist-dim">{cr.note}</p>
          </div>
        ))}
      </div>

      <Link
        to="/app/messages"
        className="mt-5 flex h-11 items-center justify-center gap-2 rounded-tile bg-azure-cta text-[13px] font-medium text-obsidian transition-opacity hover:opacity-90"
      >
        <MessageSquare size={14} strokeWidth={1.9} />
        Contact company
      </Link>

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[10.5px] text-mist-dim">
        <span className="flex items-center gap-1.5">
          <Shield size={11} strokeWidth={1.8} />
          Payment is with the operator
        </span>
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={11} strokeWidth={1.8} />
          Full refund to {FREE_CANCEL_DAYS} days
        </span>
      </div>
    </section>
  );
}

function Team({ c }: { c: Company }) {
  if (!c.team.length) {
    return <p data-icefall-section="team" className="text-[13px] text-mist">No team has been published for this listing.</p>;
  }
  return (
    <div data-icefall-section="team" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {c.team.map((m) => (
        <div key={m.name} className="flex items-center gap-3.5 rounded-card border border-hairline bg-graphite p-5">
          <GuidePhoto name={m.name} src={m.photo} size={52} />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] text-snow">{m.name}</span>
            <span className="mt-0.5 block text-[11.5px] text-mist-dim">{m.role}</span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ReviewList({ c }: { c: Company }) {
  if (c.reviews.length === 0) {
    return <p className="text-[13px] text-mist">No reviews have been published for this listing.</p>;
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {c.reviews.map((r) => (
        <article key={r.id} className="rounded-card border border-hairline bg-graphite p-5">
          <div className="flex items-start gap-3">
            <GuidePhoto name={r.author} size={40} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="text-[13px] text-snow">{r.author}</span>
                {r.verified && (
                  <span className="rounded-pill border border-summit/40 px-1.5 py-px text-[9px] uppercase tracking-[0.08em] text-summit">
                    Verified
                  </span>
                )}
                <span className="ml-auto flex items-center gap-1.5">
                  <Stars value={r.stars} />
                </span>
              </div>
              {r.climbed && <p className="mt-0.5 text-[11px] text-mist-dim">Climbed {r.climbed}</p>}
            </div>
          </div>
          <p className="mt-3 text-[12.5px] leading-relaxed text-mist">{r.body}</p>
          <p className="mt-2 text-[10.5px] text-mist-dim">{r.when}</p>
        </article>
      ))}
    </div>
  );
}

function Gallery({ photos }: { photos: string[] }) {
  if (!photos.length) return <p data-icefall-section="gallery" className="text-[13px] text-mist">No photographs published.</p>;
  return (
    <div data-icefall-section="gallery" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {photos.map((src) => (
        <img
          key={src}
          src={src}
          alt=""
          aria-hidden
          loading="lazy"
          className="aspect-[4/3] w-full rounded-card border border-hairline object-cover"
        />
      ))}
    </div>
  );
}

function AboutTab({ c }: { c: Company }) {
  return (
    <div className="max-w-[68ch]">
      <p className="text-[13.5px] leading-relaxed text-mist">{c.about}</p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {c.pillars.map((p, i) => {
          const Icon = PILLAR_ICONS[i % PILLAR_ICONS.length]!;
          return (
            <div key={p.label} className="rounded-tile border border-hairline bg-slate/50 px-3 py-4 text-center">
              <Icon size={18} strokeWidth={1.6} className="mx-auto text-azure" />
              <p className="mt-2.5 text-[12px] leading-tight text-snow">{p.label}</p>
              <p className="mt-1 text-[10.5px] leading-tight text-mist-dim">{p.detail}</p>
            </div>
          );
        })}
      </div>
      <Link
        to="/app/messages"
        className="mt-6 inline-flex items-center gap-2 rounded-tile border border-azure/45 px-4 py-2.5 text-[12.5px] text-azure hover:border-azure hover:text-azure-bright"
      >
        <Send size={13} strokeWidth={1.9} />
        Send an enquiry
      </Link>
    </div>
  );
}

function Faq({ c }: { c: Company }) {
  return (
    <dl data-icefall-section="faq" className="max-w-[70ch] divide-y divide-hairline border-y border-hairline">
      {c.faq.map((f) => (
        <div key={f.q} className="py-4">
          <dt className="text-[13.5px] text-snow">{f.q}</dt>
          <dd className="mt-1.5 text-[12.5px] leading-relaxed text-mist">{f.a}</dd>
        </div>
      ))}
    </dl>
  );
}

export { companySlug };
