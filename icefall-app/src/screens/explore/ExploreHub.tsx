import { useMemo, useState } from "react";
import { ACCENT, INK, TILE, TINT, WHITE } from "@/components/layout/editorialPalette";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Backpack,
  CloudSnow,
  Crosshair,
  Heart,
  Loader2,
  Map as MapIcon,
  MapPin,
  Mountain as MountainIcon,
  MountainSnow,
  Route as RouteIcon,
  UserRound,
  Users,
  UsersRound,
} from "lucide-react";

import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { useMountainImage } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { fmtElevation } from "@/lib/format";
import { NETWORK_NOT_CONNECTED_NOTICE } from "@/network/types";
import { locateMe, saveLastPlace } from "@/routes/places";
import { sync } from "@/services/repository";
import { useApp, usePrimaryGoal } from "@/state/AppState";
import { useTraining } from "@/tracking/training";
import { trekById, trekDuration, trekRegion, type Trek } from "@/treks";
import { trekImage } from "@/treks/images";
import type { Goal, Mountain } from "@/types";

/**
 * EXPLORE — the hub, to the owner's design of 2026-09-04.
 *
 * A light, warm, editorial page inside an app that ships dark: a large serif
 * "Explore", a blue discovery card into Find, four pastel category cards, the
 * athlete's objective as a photograph, and a rail of places worth a look. The
 * drawing is the specification; where this file departs from it, the reason is
 * written beside the departure.
 *
 * WHAT THE DRAWING SHOWS THAT ICEFALL CANNOT HONESTLY DRAW, and what is shown
 * instead. The rule is unchanged from every other screen: never a figure that
 * was not measured, never a label that is not true of the thing it labels.
 *
 *   · "Base phase · Week 4". The plan's own block, the same line Home prints:
 *     `useTraining(goal).currentWeek` carries `block` ("Base 3 · deload") and
 *     `index`, both computed by the plan builder from the goal's dates. When
 *     no plan week contains today — no start recorded, or a start in the
 *     future — the line falls back to the countdown alone, which is derived
 *     from a date the athlete set. Never a stage nobody computed.
 *   · "ALPINE CLIMB". A goal has no discipline. The curated mountain it points
 *     at has `difficultyLabel`, hand-written per peak ("Serious alpine",
 *     "High-altitude expedition"), so the chip shows that — a true label in
 *     the drawing's position rather than a category the data does not hold.
 *   · "~130 km" on a trek. Trek records hold `durationDays` and `maxAltitudeM`
 *     and NO distance, so the trek card shows its duration ("12–14 days"). The
 *     Treks card's blurb says "duration" for the same reason, where the drawing
 *     says "distance".
 *   · The heart. It is the existing save-an-objective action — `addObjective`
 *     — and it appears only on mountains, because a saved objective is a PEAK
 *     with an elevation and a trek is neither.
 *   · "Worth exploring" is an editorial pick, like `FAMOUS_TREKS`: a short list
 *     of ids in this file, resolved against the real catalogue, showing only
 *     what each record actually holds.
 *
 * THE MAP. The drawing has a map button and a "Map view" link, and there was no
 * map anywhere in Explore. Both now open `ExploreMap` — real pins on real
 * coordinates — because a map control that opened a list would be a control
 * that does not do what it says.
 *
 * "SEE ALL". The drawing shows four category cards. The hub used to hold six
 * doors — People, Groups, Conditions and Gear as well — and none of those
 * destinations went anywhere. "See all" reveals the other four, in the same
 * card language, along with the network statement they carried.
 *
 * THE THEME IS THE PERSON'S, NOT THIS PAGE'S. An earlier version put
 * `data-theme="light"` on <html> while this screen was mounted, so it matched
 * its light drawing — and overrode a dark preference for exactly this page.
 * That is gone (owner's ruling, 2026-09-04: every page follows the person's
 * choice). The light theme itself now carries the drawing's warm canvas and
 * blue accent, and the pastels come from the editorial palette's per-theme
 * variables, so this page is the drawing in light and its dark counterpart in
 * dark, with nothing here deciding which.
 */

/* -------------------------------------------------------------------------- */
/* Theme                                                                       */
/* -------------------------------------------------------------------------- */


/*
 * Colours come from components/layout/editorialPalette.ts: the tints and inks
 * are CSS variables with a value per theme, so this page follows the person's
 * light/dark choice; WHITE and INK are the two literals reserved for things
 * drawn on a photograph or on the blue gradient card, which are the same in
 * both themes. (The light theme remaps the `white` TOKEN to near-black so
 * dark-ground lifts become darkenings — which is exactly why a genuine white
 * has to be a literal.)
 */

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Whole days between today and a target date, both read as LOCAL calendar days.
 *
 * `new Date("2027-06-12")` is UTC midnight, so west of Greenwich the naive
 * difference is a day out — and a countdown that reads a day early on a
 * departure is the kind of small lie that changes a plan. Goals carry either a
 * bare `YYYY-MM-DD` or a full timestamp, so both are reduced to a local day
 * before subtracting.
 */
function daysUntil(iso: string, now = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso.trim());
  let target: Date;

  if (match) {
    const [y, mo, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    target = new Date(y, mo - 1, d);
    // Rejects 2027-02-31, which the constructor would roll silently into March.
    if (target.getFullYear() !== y || target.getMonth() !== mo - 1 || target.getDate() !== d) {
      return null;
    }
  } else {
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return null;
    target = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** The countdown in words. Never a fabricated date when there isn't one. */
function countdownLabel(days: number | null): string {
  if (days === null) return "Target date not recorded";
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago`;
  if (days === 0) return "Today";
  return `${days} ${days === 1 ? "day" : "days"} to go`;
}

/**
 * Which week of the build this is — 1 on the day training started.
 *
 * Null when the goal never recorded a start, or when the recorded start is in
 * the future: "Week 0" would be a claim about training that has not begun.
 */
function trainingWeek(goal: Goal): number | null {
  if (!goal.trainingStartedAt) return null;
  const until = daysUntil(goal.trainingStartedAt);
  if (until === null || until > 0) return null;
  return Math.floor(-until / 7) + 1;
}

/* -------------------------------------------------------------------------- */
/* The editorial picks                                                         */
/* -------------------------------------------------------------------------- */

/*
 * The four doors in the drawing, in its order and its colours.
 *
 * The pastels are the editorial palette's per-theme variables — pale in light,
 * deep and low-chroma in dark — so the four cards keep their colour identity
 * under either preference.
 * The Treks blurb says "duration" where the drawing says "distance" — see the
 * header: no trek record holds a distance.
 */
/*
 * ── THE PHOTOGRAPHS ON THESE CARDS, AND THE ONE RULE THAT PICKED THEM ───────
 *
 * Every one is CC0 or public domain, from the bundled Wikimedia library in
 * `public/img/` (licences in `public/img/CREDITS.md` and `_credits.json`).
 * THAT IS NOT AN AESTHETIC CHOICE. Roughly half that library is CC BY or
 * CC BY-SA, which CREDITS.md states "require the credit shown wherever the
 * image is displayed publicly" — and a 170px category card has nowhere to
 * print one. So the attribution-free half is the only half that can be used
 * decoratively, and swapping in a prettier CC BY shot without adding a visible
 * credit would be a licence breach, not a design tweak. If you change one of
 * these, check its row in `_credits.json` first.
 *
 * They are DECORATION and are marked `aria-hidden` with no alt text: the card
 * is named by its own label, and the photograph is not a picture of what lies
 * behind the card. `Guides` is a climber on a mountain, not any guide ICEFALL
 * lists; `Expeditions` is a Himalayan scene, not a company's trip. Nothing here
 * claims to depict a specific thing, which is exactly why generic imagery is
 * honest in this one position and is not honest on a mountain page — see
 * `useMountainImage`, which labels representative terrain wherever it stands in
 * for a real summit.
 *
 * The tint and accent stay: they colour the icon chip and survive the photo
 * failing to load, so a card is never a blank rectangle.
 */
const CATEGORIES = [
  {
    to: "/explore/expeditions",
    label: "Expeditions",
    blurb: "Companies running guided expeditions",
    icon: MountainSnow,
    bg: TINT.blue,
    accent: ACCENT.blue,
    /* "Himalaya Adventures (Unsplash)" — CC0. */
    photo: "/img/expedition-hero.jpg",
  },
  {
    to: "/explore/guides",
    label: "Guides",
    blurb: "Mountain professionals for your objective",
    icon: UserRound,
    bg: TINT.green,
    accent: ACCENT.green,
    /* "Mountain climb with pickaxe (Unsplash)" — CC0. A climber, not a guide
       ICEFALL lists: the real guide portraits are generated and are excluded
       from the deploy by `.vercelignore`, so they could not be used here even
       if they should be.

       IT NEEDS THE ZOOM, and this is why. The photograph is landscape (1400 ×
       933) and the card is portrait, so `object-cover` scales to match HEIGHT
       and crops the sides — the full vertical extent is shown, and the top 40%
       of this particular frame is flat, pale, featureless sky. At card size
       that read as a blank grey rectangle: the owner reported it as "guides
       image isnt loading", which is exactly what a correctly-loaded washed-out
       photo looks like. Scaling past cover crops that sky away and puts the
       climber in the frame. `object-position` alone cannot do it — with a
       landscape image in a portrait box there is no vertical overflow to move. */
    photo: "/img/event-b.jpg",
    photoStyle: { transform: "scale(1.45)", objectPosition: "56% 62%" },
  },
  {
    to: "/explore/mountains",
    label: "Mountains",
    blurb: "Named peaks and curated objectives",
    icon: MountainIcon,
    bg: TINT.lavender,
    accent: ACCENT.lavender,
    /* "Sommet du Mont Blanc 01" — CC0. */
    photo: "/img/mont-blanc.jpg",
  },
  {
    to: "/explore/treks",
    label: "Treks",
    blurb: "Routes by region, duration, and difficulty",
    icon: RouteIcon,
    bg: TINT.peach,
    accent: ACCENT.peach,
    /* "On the Laugavegur Trek — Iceland (Unsplash)" — CC0. An actual trekking
       route, which is what this card leads to. */
    photo: "/img/onboarding-track.jpg",
  },
] as const;

/*
 * "Worth exploring" — an editorial pick, by the same rule as `FAMOUS_TREKS`:
 * ids, not records, resolved against the catalogue at render so a renamed or
 * removed entry drops out rather than showing stale text. Every figure on a
 * card comes from the resolved record.
 */
const WORTH_EXPLORING: readonly { kind: "mountain" | "trek"; id: string }[] = [
  { kind: "mountain", id: "k2" },
  { kind: "trek", id: "everest-base-camp-trek" },
  { kind: "mountain", id: "kilimanjaro" },
  { kind: "trek", id: "tour-du-mont-blanc" },
  { kind: "mountain", id: "everest" },
  { kind: "trek", id: "annapurna-circuit-trek" },
];

type RailItem = { kind: "mountain"; mountain: Mountain } | { kind: "trek"; trek: Trek };

/* -------------------------------------------------------------------------- */
/* Screen                                                                      */
/* -------------------------------------------------------------------------- */

export default function ExploreHub() {
  const goal = usePrimaryGoal();
  const [allDoors, setAllDoors] = useState(false);

  const rail = useMemo<RailItem[]>(
    () =>
      WORTH_EXPLORING.flatMap((pick): RailItem[] => {
        if (pick.kind === "mountain") {
          const mountain = sync.mountainById(pick.id);
          return mountain ? [{ kind: "mountain", mountain }] : [];
        }
        const trek = trekById(pick.id);
        return trek ? [{ kind: "trek", trek }] : [];
      }),
    [],
  );

  return (
    <Screen padded={false}>
      {/* Every child of Stagger is a Rise, directly. framer-motion hands the
          stagger variants to direct children only; a wrapper between them
          leaves everything at opacity 0 with no error to find. */}
      <Stagger className="px-5 pb-10 pt-6">
        <Rise>
          <header className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="display text-[56px] leading-[0.95] text-snow">Explore</h1>
              <p className="mt-2 text-[17px] leading-snug text-mist">
                Find your next mountain objective.
              </p>
            </div>
            <Link
              to="/explore/map"
              aria-label="Open the map"
              className="mb-1 grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full bg-graphite text-snow shadow-[0_2px_12px_rgba(20,24,40,0.08)] transition-colors hover:bg-slate"
            >
              <MapIcon size={18} strokeWidth={1.6} aria-hidden="true" />
            </Link>
          </header>
        </Rise>

        <Rise className="mt-6">
          <DiscoverCard />
        </Rise>

        <Rise className="mt-8">
          <SectionHead
            title="Browse"
            action={{
              label: allDoors ? "See fewer" : "See all",
              onClick: () => setAllDoors((v) => !v),
            }}
          />
        </Rise>

        <Rise className="mt-4">
          <div className="grid grid-cols-2 gap-3">
            {CATEGORIES.map((c) => (
              <CategoryCard key={c.to} category={c} />
            ))}
          </div>
        </Rise>

        {allDoors && (
          <Rise className="mt-3">
            <MoreDoors goal={goal} />
          </Rise>
        )}

        <Rise className="mt-9">
          <SectionHead
            title="Your objective"
            action={{ label: goal ? "Change" : "Set one", to: "/goals", tone: "mist" }}
          />
        </Rise>

        <Rise className="mt-3">{goal ? <ObjectiveCard goal={goal} /> : <NoObjective />}</Rise>

        <Rise className="mt-9">
          <SectionHead title="Worth exploring" action={{ label: "Map view", to: "/explore/map" }} />
        </Rise>

        <Rise className="mt-3">
          <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
            {rail.map((item) =>
              item.kind === "mountain" ? (
                <MountainRailCard key={item.mountain.id} mountain={item.mountain} />
              ) : (
                <TrekRailCard key={item.trek.id} trek={item.trek} />
              ),
            )}
          </div>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Section heads                                                               */
/* -------------------------------------------------------------------------- */

function SectionHead({
  title,
  action,
}: {
  title: string;
  action?: { label: string; to?: string; onClick?: () => void; tone?: "azure" | "mist" };
}) {
  const toneClass = action?.tone === "mist" ? "text-mist" : "text-azure";
  return (
    <div className="flex items-baseline justify-between gap-4">
      <h2 className="display text-[30px] leading-none text-snow">{title}</h2>
      {action &&
        (action.to ? (
          <Link to={action.to} className={cn("shrink-0 text-[15px]", toneClass)}>
            {action.label}
          </Link>
        ) : (
          <button
            type="button"
            onClick={action.onClick}
            className={cn("shrink-0 text-[15px]", toneClass)}
          >
            {action.label}
          </button>
        ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Discover nearby                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The blue card into Find.
 *
 * "Use current location" does what it says BEFORE leaving: it asks the device,
 * remembers the answer the way Find itself does (`saveLastPlace`), and only
 * then opens Find, which starts on the last place. If the device refuses,
 * Find opens on its region picker instead — a refused location is a reason to
 * choose one, not a reason to show results for somewhere else.
 *
 * "or pick a region" opens Find with the picker already up (`?where=1`).
 */
function DiscoverCard() {
  const navigate = useNavigate();
  const [locating, setLocating] = useState(false);

  async function useCurrentLocation() {
    setLocating(true);
    try {
      const place = await locateMe();
      saveLastPlace(place);
      navigate("/explore/routes");
    } catch {
      navigate("/explore/routes?where=1");
    } finally {
      setLocating(false);
    }
  }

  return (
    <section
      className="relative overflow-hidden rounded-[20px] p-5"
      style={{ color: WHITE }}
    >
      {/* "Vista de Chamonix" — CC0, so no visible credit is owed. A valley with
          the range behind it, which is what "around your location" means.

          The blue gradient stays and sits OVER it, near-solid on the left where
          the text is and thinning sharply to the right so the terrain actually
          reads. The first attempt used a darker sky photograph under an even
          gradient and the picture was invisible — a photograph nobody can see
          is weight in the bundle for nothing. `loading="eager"`: this card is
          the top of the page, and lazy-loading something already on screen only
          delays it. */}
      <img
        src="/img/community-a.jpg"
        alt=""
        aria-hidden="true"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(27,45,122,0.97) 0%, rgba(30,56,150,0.92) 30%, rgba(40,78,200,0.62) 58%, rgba(47,91,232,0.20) 100%)",
        }}
      />
      <div className="relative">
      {/* The arrow floats at the card's edge rather than taking a flex slot:
          in the drawing the title runs on one line under it, and giving the
          arrow its own column wrapped "Find Near Trail/Trek" onto two. */}
      <div className="relative flex items-center gap-4 pr-12">
        <span
          aria-hidden="true"
          className="grid h-12 w-12 shrink-0 place-items-center rounded-[14px] border border-[#FFFFFF]/15 bg-[#FFFFFF]/10"
        >
          <MapPin size={22} strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium uppercase tracking-[0.16em] text-[#FFFFFF]/65">
            Discover nearby
          </p>
          <Link to="/explore/routes" className="display mt-1 block text-[27px] leading-none">
            Find Near Trail/Trek
          </Link>
          <p className="mt-1.5 text-[15px] leading-snug text-[#FFFFFF]/75">
            Trails, treks &amp; routes around your location
          </p>
        </div>
        <Link
          to="/explore/routes"
          aria-label="Open Find"
          /* Sits over the brightest part of the photograph, where a 10% white
             fill and a thin border disappeared entirely. A dark translucent
             disc with a blur reads on snow and on sky alike. */
          className="absolute right-0 top-1/2 grid h-[38px] w-[38px] -translate-y-1/2 place-items-center rounded-full border border-[#FFFFFF]/45 bg-[#0B1430]/45 backdrop-blur-sm"
        >
          <ArrowRight size={18} strokeWidth={1.8} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-6 flex items-center gap-3 text-[15px]">
        <button
          type="button"
          onClick={useCurrentLocation}
          disabled={locating}
          className="inline-flex items-center gap-2 disabled:opacity-70"
        >
          {locating ? (
            <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          ) : (
            <Crosshair size={16} strokeWidth={1.7} aria-hidden="true" />
          )}
          Use current location
        </button>
        <span aria-hidden="true" className="text-[#FFFFFF]/40">
          ·
        </span>
        <Link to="/explore/routes?where=1" className="text-[#FFFFFF]/60">
          or pick a region
        </Link>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Browse                                                                      */
/* -------------------------------------------------------------------------- */

function CategoryCard({ category }: { category: (typeof CATEGORIES)[number] }) {
  const Icon = category.icon;
  return (
    <Link
      to={category.to}
      className="relative flex aspect-[10/11] flex-col justify-end overflow-hidden rounded-[24px] p-4 transition-transform active:scale-[0.985]"
      /* The tint stays as the card's own ground, so a photograph that fails to
         load leaves a coloured card rather than a black hole. */
      style={{ backgroundColor: category.bg }}
    >
      <img
        src={category.photo}
        alt=""
        aria-hidden="true"
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        /* Per-card crop, where a frame needs one. See the Guides entry. */
        style={"photoStyle" in category ? category.photoStyle : undefined}
      />
      {/* Text sits on a photograph, so it is white in BOTH themes and needs its
          own scrim — a photograph does not lighten when the app does. Strong
          at the foot where the words are, clear at the top so the picture is
          still a picture. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(to top, rgba(6,10,20,0.86) 0%, rgba(6,10,20,0.55) 42%, rgba(6,10,20,0.12) 100%)",
        }}
      />

      <div className="relative flex items-center gap-2" style={{ color: category.accent }}>
        <span
          aria-hidden="true"
          className="grid h-9 w-9 place-items-center rounded-[10px]"
          style={{ backgroundColor: TILE }}
        >
          <Icon size={18} strokeWidth={1.6} />
        </span>
        <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" style={{ color: WHITE }} />
      </div>

      <p className="relative mt-auto pt-7 text-[18px] font-semibold leading-tight" style={{ color: WHITE }}>
        {category.label}
      </p>
      <p className="relative mt-1.5 text-[13.5px] leading-snug" style={{ color: "rgba(255,255,255,0.78)" }}>
        {category.blurb}
      </p>
    </Link>
  );
}

/**
 * The four doors the drawing does not show, behind "See all".
 *
 * Each line under a label is the same statement the old hub made — a real
 * count of something on this device, or the plain fact that the network is not
 * connected. Never a bare `0`, which at zero users would say "nobody" when the
 * truth is "nothing could be searched".
 */
function MoreDoors({ goal }: { goal: Goal | undefined }) {
  const { expeditions, connectionRequests } = useApp();
  const myGroups = expeditions.length;
  const queued = connectionRequests.length;
  const rangeItems = sync.products.length;

  const doors = [
    {
      to: "/social?tab=people",
      label: "People",
      icon: Users,
      line:
        queued > 0
          ? `The network is not connected. ${queued} message${queued === 1 ? "" : "s"} written and held on this device.`
          : "The network is not connected — there is no directory to search.",
    },
    {
      to: myGroups > 0 ? "/social?tab=groups" : "/social?tab=groups&create=1",
      label: "Groups",
      icon: UsersRound,
      line:
        myGroups > 0
          ? `${myGroups} group${myGroups === 1 ? "" : "s"} you created, held on this device.`
          : "You have not created a group. Yours would be the only ones that exist.",
    },
    {
      to: goal ? `/mountain/${encodeURIComponent(goal.id)}/conditions` : "/goals",
      label: "Conditions",
      icon: CloudSnow,
      line: goal ? `Forecast for ${goal.name}.` : "Conditions follow a mountain — set an objective first.",
    },
    {
      to: "/gear",
      label: "Gear",
      icon: Backpack,
      line: `${rangeItems} item${rangeItems === 1 ? "" : "s"} in the ICEFALL range.`,
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {doors.map((d) => {
          const Icon = d.icon;
          return (
            <Link
              key={d.label}
              to={d.to}
              className="block rounded-[24px] bg-graphite p-4 shadow-[0_1px_8px_rgba(20,24,40,0.05)]"
            >
              <div className="flex items-center gap-2 text-mist">
                <span
                  aria-hidden="true"
                  className="grid h-9 w-9 place-items-center rounded-[10px] bg-slate"
                >
                  <Icon size={18} strokeWidth={1.6} />
                </span>
                <ArrowRight size={16} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <p className="mt-7 text-[19px] font-semibold leading-tight text-snow">{d.label}</p>
              <p className="mt-1.5 text-[13px] leading-snug text-mist">{d.line}</p>
            </Link>
          );
        })}
      </div>
      <p className="mt-4 text-[12px] leading-relaxed text-mist-dim">{NETWORK_NOT_CONNECTED_NOTICE}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The objective                                                               */
/* -------------------------------------------------------------------------- */

function ObjectiveCard({ goal }: { goal: Goal }) {
  const mountain = goal.mountainId ? sync.mountainById(goal.mountainId) : undefined;
  const image = useMountainImage({
    name: goal.name,
    elevationM: goal.elevationM,
    lat: goal.lat,
    lon: goal.lon,
    curatedId: goal.mountainId,
    wikipedia: goal.wikipedia,
    photo: goal.photo,
  });

  // The plan's own block and week, exactly as Home prints them. Without a
  // plan week that contains today, the derived week and the countdown — both
  // from dates the athlete set — stand in.
  const { currentWeek } = useTraining(goal);
  const week = trainingWeek(goal);
  const days = daysUntil(goal.targetDate);
  const status = currentWeek
    ? `${currentWeek.block} · Week ${currentWeek.index}`
    : [week !== null ? `Week ${week}` : null, countdownLabel(days)]
        .filter((s): s is string => s !== null)
        .join(" · ");

  // A true label in the chip's position: the curated mountain's own
  // difficulty label, else the route the athlete named. Never a discipline the
  // data does not hold.
  const chip = mountain?.difficultyLabel ?? goal.subtitle ?? null;
  const place = mountain ? `${mountain.range} · ${mountain.country}` : (goal.country ?? null);

  return (
    <Link
      to={`/mountain/${encodeURIComponent(goal.id)}`}
      className="relative block aspect-[17/10] overflow-hidden rounded-[24px] bg-slate"
    >
      <img
        src={image.src}
        alt={image.real ? goal.name : ""}
        aria-hidden={image.real ? undefined : true}
        loading="lazy"
        className={cn(
          "absolute inset-0 h-full w-full object-cover",
          image.real ? "opacity-100" : "opacity-60",
        )}
      />
      <div className="absolute inset-0 bg-[linear-gradient(to_top,rgba(6,10,20,0.8)_0%,rgba(6,10,20,0.28)_45%,rgba(6,10,20,0)_72%)]" />

      {chip && (
        <span
          className="absolute left-4 top-4 rounded-full px-3.5 py-1.5 text-[12px] font-semibold uppercase tracking-[0.12em]"
          style={{ backgroundColor: WHITE, color: INK }}
        >
          {chip}
        </span>
      )}

      {/* Band artwork can never pass as the summit. */}
      {!image.real && (
        <span
          title={image.caption}
          className="absolute right-4 top-4 rounded-full border border-[#FFFFFF]/25 bg-[#060A14]/60 px-2.5 py-1 text-[9px] font-medium uppercase tracking-[0.1em] backdrop-blur"
          style={{ color: WHITE }}
        >
          Representative terrain
        </span>
      )}

      <div className="absolute inset-x-0 bottom-0 p-4" style={{ color: WHITE }}>
        {place && (
          <p className="text-[12px] uppercase tracking-[0.16em] text-[#FFFFFF]/70">{place}</p>
        )}
        <h3 className="display mt-1 truncate text-[38px] leading-none">{goal.name}</h3>
        {/* The plan's label ("Base 4 · deload · Week 12") runs longer than the
            drawing's "Base phase · Week 4", so the line may wrap rather than
            truncate — a status cut to "Base 4 · deload · We…" tells nobody
            which week it is. */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="flex min-w-0 items-center gap-2 text-[14px] leading-tight">
            <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-[#3DBE7A]" />
            <span className="tnum">{status}</span>
          </p>
          <span
            className="shrink-0 rounded-full px-4 py-2.5 text-[14px] font-semibold"
            style={{ backgroundColor: WHITE, color: INK }}
          >
            Open objective
          </span>
        </div>
      </div>
    </Link>
  );
}

/** No objective yet. The same card shape, saying so, leading to Goals. */
function NoObjective() {
  return (
    <Link
      to="/goals"
      className="flex aspect-[17/10] flex-col justify-end rounded-[24px] bg-graphite p-4 shadow-[0_1px_8px_rgba(20,24,40,0.05)]"
    >
      <p className="text-[12px] uppercase tracking-[0.16em] text-mist-dim">No objective set</p>
      <h3 className="display mt-1 text-[32px] leading-none text-snow">Name the mountain</h3>
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-[14px] text-mist">Everything on this page follows it.</p>
        <span className="shrink-0 rounded-full bg-azure px-5 py-2.5 text-[15px] font-semibold text-[color:var(--ice-on-accent)]">
          Set an objective
        </span>
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Worth exploring                                                             */
/* -------------------------------------------------------------------------- */

/** Peaks that take an expedition, from the record's own permit rule. */
function mountainKind(m: Mountain): "Expedition" | "Mountain" {
  return m.permitIssuedToOperator ? "Expedition" : "Mountain";
}

function MountainRailCard({ mountain }: { mountain: Mountain }) {
  const { objectives, addObjective, removeObjective } = useApp();
  const image = useMountainImage({
    name: mountain.name,
    elevationM: mountain.elevationM,
    lat: mountain.coords.lat,
    lon: mountain.coords.lon,
    curatedId: mountain.id,
    photo: mountain.photo,
  });

  const saved = objectives.find((o) => o.curatedId === mountain.id || o.id === mountain.id);

  function toggleSaved(e: React.MouseEvent) {
    // Inside a Link: the heart must not also open the mountain.
    e.preventDefault();
    e.stopPropagation();
    if (saved) removeObjective(saved.id);
    else
      addObjective({
        id: mountain.id,
        name: mountain.name,
        elevationM: mountain.elevationM,
        lat: mountain.coords.lat,
        lon: mountain.coords.lon,
        curatedId: mountain.id,
        photo: mountain.photo,
      });
  }

  return (
    <Link
      to={`/explore/mountain/${mountain.id}`}
      className="w-[245px] shrink-0 overflow-hidden rounded-[22px] bg-graphite shadow-[0_1px_10px_rgba(20,24,40,0.06)]"
    >
      <div className="relative h-[152px] bg-slate">
        <img
          src={image.src}
          alt={image.real ? mountain.name : ""}
          aria-hidden={image.real ? undefined : true}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
        <button
          type="button"
          onClick={toggleSaved}
          aria-pressed={saved !== undefined}
          aria-label={saved ? `Remove ${mountain.name} from your objectives` : `Save ${mountain.name} as an objective`}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full shadow-[0_1px_6px_rgba(20,24,40,0.12)]"
          style={{ backgroundColor: WHITE, color: INK }}
        >
          <Heart
            size={16}
            strokeWidth={1.7}
            fill={saved ? "currentColor" : "none"}
            aria-hidden="true"
          />
        </button>
      </div>
      <div className="p-4">
        {/* The record's range can carry a sub-range in brackets — "Karakoram
            (Baltoro Muztagh)" — which is true but does not fit a 245px card.
            The bracketed part is dropped for display; nothing is added. */}
        <p className="truncate text-[12px] uppercase tracking-[0.16em] text-mist">
          {mountain.range.replace(/\s*\([^)]*\)\s*$/, "")} · {mountain.country}
        </p>
        <h3 className="display mt-1 truncate text-[28px] leading-none text-snow">{mountain.name}</h3>
        <div className="mt-3 flex items-center gap-3">
          <span
            className="rounded-full px-3 py-1 text-[13px]"
            style={{ backgroundColor: TINT.blue, color: ACCENT.blue }}
          >
            {mountainKind(mountain)}
          </span>
          <span className="tnum text-[15px] text-snow">{fmtElevation(mountain.elevationM)} m</span>
        </div>
      </div>
    </Link>
  );
}

function TrekRailCard({ trek }: { trek: Trek }) {
  const region = trekRegion(trek.regionId);
  const place = region ? `${region.name} · ${trek.country}` : trek.country;

  return (
    <Link
      to={`/explore/trek/${trek.id}`}
      className="w-[245px] shrink-0 overflow-hidden rounded-[22px] bg-graphite shadow-[0_1px_10px_rgba(20,24,40,0.06)]"
    >
      <div className="relative h-[152px] bg-slate">
        <img
          src={trekImage(trek)}
          alt={trek.name}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
      <div className="p-4">
        <p className="truncate text-[12px] uppercase tracking-[0.16em] text-mist">{place}</p>
        <h3 className="display mt-1 truncate text-[28px] leading-none text-snow">{trek.name}</h3>
        <div className="mt-3 flex items-center gap-3">
          <span
            className="rounded-full px-3 py-1 text-[13px]"
            style={{ backgroundColor: TINT.green, color: ACCENT.green }}
          >
            Trek
          </span>
          {/* Duration, not distance: the record holds days and no kilometres. */}
          <span className="tnum text-[15px] text-snow">{trekDuration(trek)}</span>
        </div>
      </div>
    </Link>
  );
}
