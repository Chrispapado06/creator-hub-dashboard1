import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  ArrowUpRight, Bookmark, ChevronRight, Flag, Heart, Landmark, Leaf, MapPin,
  MessageSquare, Mountain as MountainIcon, Package, Share2, ShieldCheck, Star,
  Stethoscope, TriangleAlert, Users,
} from "lucide-react";
import { Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { cn } from "@/lib/utils";
import { fmtElevation, fmtPrice } from "@/lib/format";
import { sync } from "@/services/repository";
import { ACCESS_DISCLAIMER, accessFor, operatorSearchUrl } from "@/services/expeditionAccess";
import {
  DEMO_NOTICE, OPERATOR_DISCLAIMER, SAMPLE_NOTICE, SHOW_DEMO_OPERATORS, operatorById,
  type Operator,
} from "@/services/operators";

/**
 * An expedition company's profile — a company, deliberately not a person.
 *
 * It carries the app's azure. The gilt gold is reserved for the best-matched
 * listing on the Expeditions screen — one card, marking one thing — and a whole
 * surface painted in it would stop that meaning anything.
 *
 * ── WHAT IS REAL ON THIS PAGE, AND WHAT IS NOT ──────────────────────────────
 *
 * Almost none of it. The statistics, the rating, the reviews, the summit rate,
 * the Sherpa ratio, the trips and their prices are ALL INVENTED, and four of
 * these listings carry the names of businesses that exist. Publishing a review
 * signed by a named person about a trip they never took, or a "92% summit rate"
 * nobody measured, is a commercial claim about a real company that nobody made.
 *
 * So every one of those fields renders only when `SHOW_DEMO_OPERATORS` is true,
 * which an ordinary production build resolves to false — see `lib/demoFlag`.
 * What a shipped build shows instead is the second half of this file: the
 * certification to insist on, the authority that issues the permit, what the
 * route demands, and the questions to put in writing before money moves. Those
 * come from `expeditionAccess.ts`, and they are true.
 *
 * The notice is NOT a footnote. It sits directly beneath the company's name and
 * above everything it is warning about, because somebody can land here from a
 * shared link with no other context.
 *
 * ── DELIBERATELY ABSENT ─────────────────────────────────────────────────────
 *
 * The design has a "Meet the Team — watch our story" video card. There is no
 * video. A play button that plays nothing is a promise the page cannot keep, so
 * it is not drawn at all rather than drawn dead.
 */

/* -------------------------------------------------------------------------- */
/* Context                                                                     */
/* -------------------------------------------------------------------------- */

interface EnquiryContext {
  peakName: string;
  elevationM: number;
  goalId?: string;
}

/** What ICEFALL knows about the route, from whichever record holds it. */
interface RouteFacts {
  summary?: string;
  duration: string;
  seasons: string;
  difficulty: string;
  priceFromEur?: number;
  demands: string[];
  experience: string;
}

function readContext(params: URLSearchParams): EnquiryContext | null {
  const peakName = (params.get("peak") ?? "").trim();
  if (peakName === "") return null;

  const elevation = Number(params.get("elevation"));
  return {
    peakName,
    elevationM: Number.isFinite(elevation) && elevation > 0 ? elevation : 0,
    goalId: params.get("goal") ?? undefined,
  };
}

/** The existing compose route: /inbox/new?operator&peak&elevation&goal. */
function composeHref(operatorId: string, ctx: EnquiryContext): string {
  const q = new URLSearchParams({ operator: operatorId, peak: ctx.peakName });
  if (ctx.elevationM > 0) q.set("elevation", String(ctx.elevationM));
  if (ctx.goalId !== undefined) q.set("goal", ctx.goalId);
  return `/inbox/new?${q.toString()}`;
}

function monogram(name: string): string {
  return name
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

const TABS = ["Overview", "Expeditions", "Reviews", "Gallery", "About"] as const;
type TabId = (typeof TABS)[number];

/** Fixed icon cycles — the model carries labels, not icons. */
const PILLAR_ICONS = [ShieldCheck, Users, Heart, Leaf];
const HIGHLIGHT_ICONS = [MountainIcon, Flag, Users, Stethoscope, Package, Leaf];

const BADGE_LABEL: Record<string, string> = {
  popular: "Popular",
  "best-value": "Best value",
  premium: "Premium",
};

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function OperatorProfile() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();

  const operator = id !== undefined ? operatorById(id) : undefined;
  const ctx = readContext(params);

  // An unknown id resolves to nothing rather than to a stub named after the
  // id — that is exactly how an empty directory grows fake companies.
  if (operator === undefined) return <UnknownListing />;

  return (
    <Profile operator={operator} ctx={ctx} contextCountry={params.get("country") ?? undefined} />
  );
}

function Profile({
  operator,
  ctx,
  contextCountry,
}: {
  operator: Operator;
  ctx: EnquiryContext | null;
  contextCountry?: string;
}) {
  const [tab, setTab] = useState<TabId>("Overview");
  const [logoFailed, setLogoFailed] = useState(false);

  /** Everything invented. False in any ordinary production build. */
  const claims = SHOW_DEMO_OPERATORS && operator.demo === true;

  /**
   * The route behind the objective, when ICEFALL holds one. Matched on the
   * peak's NAME, because this screen is reached with a peak from a curated
   * objective, the catalogue or a shared link, and only the name survives all
   * three.
   */
  const route = useMemo((): RouteFacts | undefined => {
    if (ctx === null) return undefined;
    const wanted = ctx.peakName.trim().toLowerCase();

    const exp = sync.expeditions.find(
      (e) => sync.mountainById(e.mountainId)?.name.trim().toLowerCase() === wanted,
    );
    if (exp !== undefined) {
      return {
        summary: exp.summary,
        duration: exp.durationLabel,
        seasons: exp.seasons.join(", "),
        difficulty: `${exp.difficulty} / 5 · ${exp.difficultyLabel}`,
        priceFromEur: exp.priceFromEur,
        demands: exp.prerequisites,
        experience: exp.requiredExperience,
      };
    }

    const mountain = sync.mountains.find((m) => m.name.trim().toLowerCase() === wanted);
    if (mountain !== undefined) {
      return {
        duration: mountain.typicalDurationLabel,
        seasons: mountain.bestSeasons.join(", "),
        difficulty: `${mountain.difficulty} / 5 · ${mountain.difficultyLabel}`,
        demands: mountain.technicalRequirements,
        experience: mountain.requiredExperience,
      };
    }
    // A catalogue peak: ICEFALL holds a name and a height and nothing else, so
    // the section does not render rather than being padded out.
    return undefined;
  }, [ctx]);

  /** The listing's own regions, or the country the objective supplied. */
  const permitCountries =
    operator.regions.length > 0 ? operator.regions : contextCountry ? [contextCountry] : [];

  const heroPhoto = operator.gallery?.[0] ?? "/img/everest.jpg";

  return (
    <Screen padded={false}>
      {/* ---- Hero ------------------------------------------------------- */}
      <div className="relative">
        {/*
          The banner reads dark, and it darkens to the LEFT.
          `scrim-full` fades upward from the bottom, which is right for a card
          whose caption sits along its base — but here the logo tile and the
          company's name sit in the top-left corner, and a bottom fade left them
          on the brightest part of the photograph. A rightward gradient puts the
          near-black under the type and lets the peak keep the right-hand side,
          which is how the design carries it.
        */}
        <div className="absolute inset-0">
          <img
            src={heroPhoto}
            alt=""
            aria-hidden
            className="h-full w-full object-cover object-[70%_35%] opacity-[0.72]"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-obsidian via-obsidian/80 to-obsidian/25" />
          <div className="absolute inset-0 bg-gradient-to-t from-obsidian via-obsidian/35 to-transparent" />
        </div>

        <div className="relative px-5" style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}>
          <div className="flex items-center gap-3 pb-4 pt-4">
            <button
              type="button"
              onClick={() => window.history.back()}
              aria-label="Back"
              className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-azure transition-colors hover:bg-white/[0.06]"
            >
              <ChevronRight size={20} strokeWidth={1.8} className="rotate-180" />
            </button>
            <span className="text-[14px] text-azure">Expeditions</span>
            <span className="ml-auto flex items-center gap-1">
              {/* Saving and sharing a company both need a backend and a share
                  sheet. Drawn inert rather than wired to nothing. */}
              <span aria-hidden className="grid h-9 w-9 place-items-center text-mist-dim/70">
                <Heart size={18} strokeWidth={1.6} />
              </span>
              <span aria-hidden className="grid h-9 w-9 place-items-center text-mist-dim/70">
                <Share2 size={18} strokeWidth={1.6} />
              </span>
            </span>
          </div>

          <div className="flex items-start gap-4 pb-5">
            <div className="relative shrink-0">
              <div className="grid h-[92px] w-[92px] place-items-center overflow-hidden rounded-[14px] border border-hairline-strong bg-obsidian">
                {operator.logo !== undefined && !logoFailed ? (
                  <img
                    src={operator.logo}
                    alt=""
                    aria-hidden
                    onError={() => setLogoFailed(true)}
                    className="h-full w-full object-contain p-2"
                  />
                ) : (
                  <span className="text-[19px] tracking-[0.06em] text-mist">
                    {monogram(operator.name)}
                  </span>
                )}
              </div>
              {claims && (
                <span
                  aria-hidden
                  className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-azure text-obsidian"
                >
                  <ShieldCheck size={13} strokeWidth={2.4} />
                </span>
              )}
            </div>

            <div className="min-w-0 flex-1 pt-1">
              <h1 className="text-[21px] font-normal leading-tight text-snow">{operator.name}</h1>
              {claims && operator.tagline !== undefined && (
                <p className="mt-1 text-[13.5px] leading-snug text-snow/75">{operator.tagline}</p>
              )}
              <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] text-mist">
                <MapPin size={12} strokeWidth={1.8} className="shrink-0 text-azure" />
                {operator.city ?? "Location not stated"}
                {claims && operator.yearsExperience !== undefined && (
                  <>
                    <span className="text-mist-dim">·</span>
                    {operator.yearsExperience}+ years experience
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      <Stagger className="px-5 pb-24">
        {/* ---- Stats ---------------------------------------------------- */}
        {claims && (
          <Rise className="flex items-stretch gap-1 border-b border-hairline pb-4">
            <Stat
              icon={MountainIcon}
              value={`${operator.yearsExperience ?? 0}+`}
              label="Years experience"
            />
            <Stat icon={Flag} value={`${operator.expeditionCount ?? 0}+`} label="Expeditions" />
            <Stat
              icon={Users}
              value={`${(operator.summiteerCount ?? 0).toLocaleString("en-GB")}+`}
              label="Summiteers"
            />
            <Stat
              icon={Star}
              value={operator.rating?.toFixed(1) ?? "—"}
              label={`(${operator.reviewCount ?? 0} reviews)`}
            />
          </Rise>
        )}

        {/* ---- The two actions ------------------------------------------ */}
        <Rise className="flex gap-2.5 pt-4">
          <button
            type="button"
            onClick={() => setTab("Expeditions")}
            className="h-11 flex-1 rounded-tile bg-azure text-[13.5px] font-medium text-obsidian transition-colors hover:bg-azure-bright"
          >
            View expeditions
          </button>
          {ctx !== null ? (
            <Button asChild variant="secondary" className="h-11 flex-1 border-azure/45 text-snow">
              <Link to={composeHref(operator.id, ctx)}>
                <MessageSquare size={14} strokeWidth={1.8} />
                Contact company
              </Link>
            </Button>
          ) : (
            <Button asChild variant="secondary" className="h-11 flex-1 border-azure/45 text-snow">
              <Link to="/explore/expeditions">
                Choose a mountain
                <ChevronRight size={14} strokeWidth={1.8} />
              </Link>
            </Button>
          )}
        </Rise>

        {/* ---- The notice, above everything it warns about --------------- */}
        <Rise className="pt-4">
          <Disclaimer>{claims ? DEMO_NOTICE : SAMPLE_NOTICE}</Disclaimer>
        </Rise>

        {/* ---- Tabs ------------------------------------------------------ */}
        <Rise className="no-scrollbar -mx-5 mt-5 flex gap-7 overflow-x-auto border-b border-hairline px-5">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={t === tab}
              className={cn(
                "shrink-0 border-b-2 pb-2.5 text-[12px] uppercase tracking-[0.1em] transition-colors",
                t === tab
                  ? "border-azure text-azure"
                  : "border-transparent text-mist-dim hover:text-mist",
              )}
            >
              {t}
            </button>
          ))}
        </Rise>

        {tab === "Overview" && (
          <>
            {claims && operator.about !== undefined && (
              <Rise className="pt-6">
                <Card>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-mist-dim">
                    About {operator.name}
                  </p>
                  <p className="mt-3 text-[13px] leading-relaxed text-mist">{operator.about}</p>

                  {operator.pillars !== undefined && (
                    <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                      {operator.pillars.map((p, i) => {
                        const Icon = PILLAR_ICONS[i % PILLAR_ICONS.length]!;
                        return (
                          <div
                            key={p.label}
                            className="rounded-tile border border-hairline bg-slate/50 px-2.5 py-3 text-center"
                          >
                            <Icon size={17} strokeWidth={1.6} className="mx-auto text-azure" />
                            <p className="mt-2 text-[11.5px] leading-tight text-snow">{p.label}</p>
                            <p className="mt-1 text-[10px] leading-tight text-mist-dim">
                              {p.detail}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Card>
              </Rise>
            )}

            {claims && operator.highlights !== undefined && (
              <Rise className="pt-4">
                <Card>
                  <p className="text-[11px] uppercase tracking-[0.14em] text-mist-dim">
                    Company highlights
                  </p>
                  <ul className="mt-1 divide-y divide-hairline">
                    {operator.highlights.map((h, i) => {
                      const Icon = HIGHLIGHT_ICONS[i % HIGHLIGHT_ICONS.length]!;
                      return (
                        <li key={h.label} className="flex items-center gap-3.5 py-3">
                          <Icon size={18} strokeWidth={1.5} className="shrink-0 text-azure" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] text-snow">{h.label}</span>
                            <span className="mt-0.5 block text-[11.5px] text-mist-dim">
                              {h.detail}
                            </span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </Card>
              </Rise>
            )}

            <FeaturedTrips
              operator={operator}
              claims={claims}
              onSeeAll={() => setTab("Expeditions")}
            />
            <Reviews operator={operator} claims={claims} compact onSeeAll={() => setTab("Reviews")} />
          </>
        )}

        {tab === "Expeditions" && <FeaturedTrips operator={operator} claims={claims} full />}

        {tab === "Reviews" && <Reviews operator={operator} claims={claims} />}

        {tab === "Gallery" && <Gallery operator={operator} />}

        {tab === "About" && (
          <AboutTab operator={operator} ctx={ctx} route={route} permitCountries={permitCountries} />
        )}
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

function Stat({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof MountainIcon;
  value: string;
  label: string;
}) {
  return (
    <div className="min-w-0 flex-1 border-r border-hairline px-1 text-center last:border-r-0">
      <Icon size={16} strokeWidth={1.6} className="mx-auto text-azure" />
      <p className="tnum mt-1.5 truncate text-[15px] leading-none text-snow">{value}</p>
      <p className="mt-1.5 truncate text-[9.5px] leading-tight text-mist-dim">{label}</p>
    </div>
  );
}

function Stars({ value, size = 11 }: { value: number; size?: number }) {
  return (
    <span aria-label={`${value.toFixed(1)} out of 5`} className="inline-flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          size={size}
          strokeWidth={0}
          fill="currentColor"
          className={i < Math.round(value) ? "text-azure" : "text-mist-dim/40"}
        />
      ))}
    </span>
  );
}

function FeaturedTrips({
  operator,
  claims,
  full = false,
  onSeeAll,
}: {
  operator: Operator;
  claims: boolean;
  full?: boolean;
  onSeeAll?: () => void;
}) {
  const trips = claims ? (operator.trips ?? []) : [];

  if (trips.length === 0) {
    return (
      <Rise className="pt-6">
        <Card>
          <p className="text-[13px] leading-relaxed text-mist">
            This listing publishes no trips. A real operator's programme, its dates and its prices
            come from them directly — ICEFALL holds none of it and will not invent it.
          </p>
        </Card>
      </Rise>
    );
  }

  return (
    <>
      <Rise className="flex items-baseline justify-between pt-6">
        <p className="text-[11px] uppercase tracking-[0.14em] text-mist-dim">
          {full ? "Expeditions" : "Featured expeditions"}
        </p>
        {!full && onSeeAll !== undefined && (
          <button
            type="button"
            onClick={onSeeAll}
            className="flex items-center gap-0.5 text-[11.5px] text-azure transition-colors hover:text-azure-bright"
          >
            View all
            <ChevronRight size={13} strokeWidth={1.9} />
          </button>
        )}
      </Rise>

      <div
        className={cn(
          full ? "mt-3 space-y-3" : "no-scrollbar -mx-5 mt-3 flex gap-3 overflow-x-auto px-5",
        )}
      >
        {trips.map((t) => (
          <Rise key={t.id} className={full ? undefined : "w-[188px] shrink-0"}>
            <Link
              to={`/operator/${operator.id}/trip/${t.id}`}
              className="block overflow-hidden rounded-card border border-hairline bg-graphite transition-colors hover:border-azure/45"
            >
              <div className={cn("relative w-full", full ? "aspect-[16/7]" : "aspect-[16/10]")}>
                <img
                  src={t.photo}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
                {t.badge !== undefined && (
                  <span className="absolute left-2.5 top-2.5 rounded-[5px] bg-azure px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-obsidian">
                    {BADGE_LABEL[t.badge]}
                  </span>
                )}
              </div>
              <div className="p-3">
                <p className="text-[13px] leading-tight text-snow">{t.name}</p>
                <p className="tnum mt-1 text-[11px] text-mist-dim">
                  {t.days} days · {t.country}
                </p>
                <div className="mt-2.5 flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <p className="tnum text-[12.5px] text-snow">From {fmtPrice(t.priceFromEur)}</p>
                    <p className="mt-1 flex items-center gap-1.5">
                      <Stars value={t.rating} />
                      <span className="tnum text-[10.5px] text-mist-dim">({t.reviewCount})</span>
                    </p>
                  </div>
                  <Bookmark size={15} strokeWidth={1.6} className="shrink-0 text-mist-dim/70" />
                </div>
              </div>
            </Link>
          </Rise>
        ))}
      </div>
    </>
  );
}

function Reviews({
  operator,
  claims,
  compact = false,
  onSeeAll,
}: {
  operator: Operator;
  claims: boolean;
  compact?: boolean;
  onSeeAll?: () => void;
}) {
  const reviews = claims ? (operator.reviews ?? []) : [];
  const shown = compact ? reviews.slice(0, 1) : reviews;

  if (reviews.length === 0) {
    return (
      <Rise className="pt-6">
        <Card>
          <p className="text-[13px] leading-relaxed text-mist">
            No reviews. ICEFALL has no customers, runs no bookings and collects no feedback, so
            there is nothing to average — a star rating here would be a number nobody gave.
          </p>
        </Card>
      </Rise>
    );
  }

  return (
    <>
      <Rise className="flex items-baseline justify-between pt-6">
        <p className="text-[11px] uppercase tracking-[0.14em] text-mist-dim">
          {compact ? "Recent reviews" : "Reviews"}
        </p>
        {compact && onSeeAll !== undefined && (
          <button
            type="button"
            onClick={onSeeAll}
            className="text-[11.5px] text-azure transition-colors hover:text-azure-bright"
          >
            View all
          </button>
        )}
      </Rise>

      <div className="mt-3 space-y-3">
        {shown.map((r) => (
          <Rise key={r.id}>
            <Card>
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-hairline bg-elevated text-[11px] text-mist">
                  {monogram(r.author)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] text-snow">{r.author}</p>
                  <p className="mt-1 flex items-center gap-2">
                    <Stars value={r.stars} />
                    <span className="text-[10.5px] text-mist-dim">{r.agoLabel}</span>
                  </p>
                </div>
              </div>
              <p className="mt-3 text-[12.5px] leading-relaxed text-mist">{r.body}</p>
            </Card>
          </Rise>
        ))}
      </div>
    </>
  );
}

function Gallery({ operator }: { operator: Operator }) {
  const photos = operator.gallery ?? [];

  if (photos.length === 0) {
    return (
      <Rise className="pt-6">
        <Card>
          <p className="text-[13px] leading-relaxed text-mist">No photographs for this listing.</p>
        </Card>
      </Rise>
    );
  }

  return (
    <>
      <Rise className="pt-6">
        <p className="text-[11px] uppercase tracking-[0.14em] text-mist-dim">Gallery</p>
      </Rise>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {photos.map((src, i) => (
          <Rise key={src + i} className={i === 0 ? "col-span-2" : undefined}>
            <div
              className={cn(
                "overflow-hidden rounded-tile border border-hairline",
                i === 0 ? "aspect-[16/9]" : "aspect-square",
              )}
            >
              <img
                src={src}
                alt=""
                aria-hidden
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
          </Rise>
        ))}
      </div>
      <Rise className="pt-3">
        <p className="text-[10.5px] leading-relaxed text-mist-dim">
          ICEFALL's own mountain photography, not this company's. No operator has supplied images,
          and passing someone else's expedition photographs off as theirs would be a second
          invention on top of the first.
        </p>
      </Rise>
    </>
  );
}

/**
 * The half of this screen that is true.
 *
 * Certification, the authority that actually issues the permit, what the route
 * demands, and the questions to put in writing. This is what a production build
 * shows, and it is the only part a climber should act on.
 */
function AboutTab({
  operator,
  ctx,
  route,
  permitCountries,
}: {
  operator: Operator;
  ctx: EnquiryContext | null;
  route: RouteFacts | undefined;
  permitCountries: string[];
}) {
  const questions = accessFor({
    requiresGuide: true,
    elevationM: ctx?.elevationM ?? operator.minElevationM,
  }).notes;

  const authorities = permitCountries
    .map((country) => ({
      country,
      access: accessFor({ country, requiresGuide: true, elevationM: operator.minElevationM }),
    }))
    .filter((a) => a.access.authority);

  return (
    <>
      <Rise className="pt-6">
        <SectionLabel>What this listing states</SectionLabel>
        <Card className="mt-3">
          <dl className="space-y-3.5 text-[13px]">
            <Fact label="Certification" value={operator.certification} />
            <Fact
              label="Regions covered"
              value={
                operator.regions.length > 0
                  ? operator.regions.join(" · ")
                  : "Multi-range — no single region"
              }
            />
            <Fact
              label="Works from"
              value={
                operator.minElevationM > 0
                  ? `${fmtElevation(operator.minElevationM)} m`
                  : "No stated minimum"
              }
              numeric
            />
            <Fact label="Typical response" value={`Within ${operator.responseHours} hours`} numeric />
          </dl>
        </Card>
        <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
          Stated by the listing, checked by nobody. IFMGA/UIAGM is the only internationally
          recognised mountain guide qualification — ask any real operator for the guide's carnet
          number and confirm it with the national guides association yourself.
        </p>
      </Rise>

      {route !== undefined && (
        <Rise className="pt-6">
          <SectionLabel>What you would be climbing</SectionLabel>
          <Card className="mt-3">
            {route.summary !== undefined && (
              <p className="text-[13px] leading-relaxed text-mist">{route.summary}</p>
            )}
            <dl
              className={cn(
                "space-y-3.5 text-[13px]",
                route.summary !== undefined && "mt-4 border-t border-hairline pt-4",
              )}
            >
              <Fact label="Duration" value={route.duration} numeric />
              <Fact label="Season" value={route.seasons} />
              <Fact label="Difficulty" value={route.difficulty} numeric />
              <Fact
                label="Indicative cost"
                value={
                  route.priceFromEur !== undefined
                    ? `from ${fmtPrice(route.priceFromEur)}`
                    : "Not published"
                }
                numeric={route.priceFromEur !== undefined}
              />
            </dl>
            <p className="mt-3.5 text-[11px] leading-relaxed text-mist-dim">
              {route.priceFromEur !== undefined
                ? "A planning figure for the route, not a quote and not this listing's price. ICEFALL sells nothing, takes no payment and holds no departure dates — what you pay comes from the operator, and moves with season, group ratio and what they exclude."
                : "ICEFALL publishes no figure for this peak and will not invent one. Ask the operator what the price covers — guiding ratio, permits, oxygen, transfers and what happens if you turn back are where quotes differ most."}
            </p>
          </Card>
        </Rise>
      )}

      {route !== undefined && route.demands.length > 0 && (
        <Rise className="pt-6">
          <SectionLabel>What it asks of you</SectionLabel>
          <Card className="mt-3">
            <ul className="space-y-2.5">
              {route.demands.map((req) => (
                <li key={req} className="flex gap-3 text-[13px] leading-relaxed text-mist">
                  <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                  {req}
                </li>
              ))}
            </ul>
            <p className="mt-3.5 text-[11px] leading-relaxed text-mist-dim">{route.experience}</p>
          </Card>
        </Rise>
      )}

      {authorities.length > 0 && (
        <Rise className="pt-6">
          <SectionLabel>Permits &amp; access</SectionLabel>
          <div className="mt-3 space-y-2.5">
            {authorities.map((a) => (
              <Card key={a.country}>
                <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-mist-dim">
                  <Landmark size={13} strokeWidth={1.7} className="text-azure" />
                  {a.country}
                </p>
                <p className="mt-2 text-[13px] leading-relaxed text-snow/85">{a.access.authority}</p>
                {a.access.authorityNote !== undefined && (
                  <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                    {a.access.authorityNote}
                  </p>
                )}
              </Card>
            ))}
          </div>
        </Rise>
      )}

      {operator.faq !== undefined && operator.faq.length > 0 && (
        <Rise className="pt-6">
          <SectionLabel>Questions this listing answers</SectionLabel>
          <div className="mt-3 space-y-2.5">
            {operator.faq.map((f) => (
              <Card key={f.q}>
                <p className="text-[13px] text-snow">{f.q}</p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">{f.a}</p>
              </Card>
            ))}
          </div>
        </Rise>
      )}

      <Rise className="pt-6">
        <SectionLabel>Ask before you book</SectionLabel>
        <Card className="mt-3">
          <ul className="space-y-3">
            {questions.map((q) => (
              <li key={q} className="flex gap-3 text-[12.5px] leading-relaxed text-mist">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                {q}
              </li>
            ))}
          </ul>
        </Card>
      </Rise>

      <Rise className="pt-6">
        <SectionLabel>Find a real operator</SectionLabel>
        <a
          href={operatorSearchUrl(ctx?.peakName ?? operator.name)}
          target="_blank"
          rel="noreferrer noopener"
          className="mt-3 flex items-center gap-2.5 rounded-card border border-hairline bg-graphite px-4 py-3.5 text-[13px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
        >
          <ArrowUpRight size={15} strokeWidth={1.7} className="shrink-0" />
          <span className="flex-1">
            Search certified operators for {ctx?.peakName ?? "your objective"}
          </span>
        </a>
        <Disclaimer className="mt-4">{ACCESS_DISCLAIMER}</Disclaimer>
        <Disclaimer className="mt-3">{OPERATOR_DISCLAIMER}</Disclaimer>
      </Rise>
    </>
  );
}

function Fact({ label, value, numeric }: { label: string; value: string; numeric?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-5">
      <dt className="shrink-0 text-mist-dim">{label}</dt>
      <dd className={cn("text-right text-snow", numeric === true && "tnum")}>{value}</dd>
    </div>
  );
}

/**
 * A listing id that resolves to nothing.
 *
 * A designed state rather than a redirect: someone following a stale share link
 * deserves to be told the listing does not exist — and, more importantly, that
 * none of them ever did.
 */
function UnknownListing() {
  return (
    <Screen>
      <Stagger className="pt-10">
        <Rise>
          <TriangleAlert size={22} strokeWidth={1.6} className="text-azure" />
          <h1 className="mt-4 text-[19px] font-light text-snow">No such listing</h1>
          <p className="mt-2 text-[13px] leading-relaxed text-mist">
            Nothing here matches that link. ICEFALL has no operator partnerships and lists no real
            companies, so a listing that has gone is not a company that has closed — it is an entry
            that was only ever a placeholder.
          </p>
        </Rise>
        <Rise className="pt-6">
          <Button asChild variant="secondary" className="w-full">
            <Link to="/explore/expeditions">
              Back to expeditions
              <ChevronRight size={15} strokeWidth={1.8} />
            </Link>
          </Button>
        </Rise>
      </Stagger>
    </Screen>
  );
}
