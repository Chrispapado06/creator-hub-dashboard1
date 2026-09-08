import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bike,
  ChevronRight,
  Footprints,
  MoreHorizontal,
  Mountain,
  Play,
  Plus,
  Snowflake,
  Target,
  Thermometer,
  Timer,
  Weight,
  X,
  Zap,
} from "lucide-react";
import { Rise, Screen, Stagger } from "@/components/layout/chrome";
import { Sheet, SheetRow } from "@/components/ui/Sheet";
import { SESSION_INTENTS, intentById, planFor, type IntentId } from "@/coach/sessionIntent";
import { SectionLabel } from "@/components/ui/primitives";
import { ACTIVITY_TYPES, activityById } from "@/tracking/activities";
import type { ActivityTypeId } from "@/tracking/types";
import { useApp } from "@/state/AppState";
import {
  MAP_STYLE_DETAIL,
  MAP_STYLE_LABEL,
  previewTile,
  saveMapStyle,
  savedMapStyle,
  type MapStyleId,
} from "@/components/map/icefallStyle";
import { useSettings } from "@/settings/store";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageTour } from "@/tour/PageTour";

/**
 * Screen 04a — what are you going to do?
 *
 * Built to the supplied mockup: eight photographic tiles, then a settings sheet
 * for the one you picked. It replaces a family-chip strip over a plain list,
 * which asked the athlete to understand ICEFALL's internal taxonomy before it
 * would let them start.
 *
 * The tiles are DISCIPLINES, not the internal `ActivityFamily` enum — "Ski" and
 * "Snowboard" are one family underneath and two completely different days out,
 * and the mockup is right about which distinction matters to the person holding
 * the phone.
 */

interface Discipline {
  key: string;
  label: string;
  blurb: string;
  image: string;
  icon: typeof Mountain;
  /** The recorder type this starts. Every one is a real, existing type. */
  activity: ActivityTypeId;
}

const DISCIPLINES: Discipline[] = [
  {
    key: "run",
    label: "Run",
    blurb: "Trail running, road running, fast hiking",
    image: "/img/onboarding-track.jpg",
    icon: Zap,
    activity: "trail-run",
  },
  {
    key: "climb",
    label: "Climb",
    blurb: "Alpine climbing, mountaineering, multi-pitch",
    image: "/img/matterhorn.jpg",
    icon: Mountain,
    activity: "mountaineering",
  },
  {
    key: "hike",
    label: "Hike",
    blurb: "Hiking, trekking, backpacking",
    image: "/img/triglav.jpg",
    icon: Footprints,
    activity: "hiking",
  },
  {
    key: "cycle",
    label: "Cycle",
    blurb: "Road cycling, mountain biking, gravel",
    image: "/img/onboarding-train.jpg",
    icon: Bike,
    activity: "road-cycling",
  },
  {
    key: "ski",
    label: "Ski",
    blurb: "Ski touring, backcountry, resort skiing",
    image: "/img/mont-blanc-3.jpg",
    icon: Snowflake,
    activity: "ski-touring",
  },
  {
    key: "snowboard",
    label: "Snowboard",
    blurb: "Backcountry snowboarding, resort",
    image: "/img/denali-1.jpg",
    icon: Snowflake,
    activity: "snowboarding",
  },
  {
    key: "strength",
    label: "Strength",
    blurb: "Gym workout, strength training, mobility",
    // ICEFALL has no strength type; "other" records duration, heart rate and
    // calories, which is exactly the set a gym session has to offer.
    image: "/img/onboarding-plan.jpg",
    icon: Timer,
    activity: "other",
  },
  {
    key: "other",
    label: "Other",
    blurb: "Other outdoor activities",
    image: "/img/home-hero.jpg",
    icon: MoreHorizontal,
    activity: "other",
  },
];

export default function ActivitySelect() {
  const [chosen, setChosen] = useState<Discipline | null>(null);
  if (chosen) return <ActivitySettings discipline={chosen} onClose={() => setChosen(null)} />;
  return <DisciplinePicker onPick={setChosen} />;
}

/* -------------------------------------------------------------------------- */

function DisciplinePicker({ onPick }: { onPick: (d: Discipline) => void }) {
  const navigate = useNavigate();
  return (
    <Screen padded={false}>
      <Stagger className="px-5 pb-8 pt-6">
        <Rise>
          <div className="flex items-start justify-between gap-4">
            <div>
              <SectionLabel>Activity</SectionLabel>
              <h1 className="mt-2 text-[30px] font-light leading-[1.12] text-snow">
                What are you
                <br />
                going to do?
              </h1>
              <p className="mt-2.5 max-w-[280px] text-[12.5px] leading-relaxed text-mist">
                Choose your activity to start recording and track your performance.
              </p>
            </div>
            {/* PH-03 — "Needs to be an option to back out from the activity".
                There WAS one: this button already called `navigate(-1)` and was
                labelled "Close" to a screen reader. It was drawn as a mountain
                glyph inside an azure ring, which reads as a brand mark or a
                link to the mountains — not as a way out, which is why the exit
                could not be found. The affordance was present and illegible,
                and an exit nobody recognises is not an exit.

                Now an X, in the same treatment the second step of this flow
                already uses, so backing out looks the same at both steps. */}
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label="Close"
              className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-hairline-strong text-mist transition-colors hover:border-azure/45 hover:text-snow"
            >
              <X size={18} strokeWidth={1.8} />
            </button>
          </div>
        </Rise>

        {/* ---- What this flow is ---------------------------------------------
            Shown once, on the first visit to the picker, and never again once
            dismissed. HERE AND NOWHERE ELSE IN THE FLOW: the next step carries
            a sticky Start bar and the live screen is a recording in progress,
            and neither is a place to read three sentences.

            Two of the three name controls that are ON THIS SCREEN — the Goal
            tile above and Start simulated below — and the third describes what
            the recorder does once it is running, which is the one thing nobody
            finds by themselves because it only shows itself after a crash. */}
        <PageTour screen="record" />

        <Rise className="pt-6">
          <div className="grid grid-cols-2 gap-3">
            {DISCIPLINES.map((d) => (
              <button
                key={d.key}
                type="button"
                onClick={() => onPick(d)}
                /* THE PICTURE IS THE TILE. This had a hairline border and a
                   card radius around a photograph — a frame drawn on top of an
                   image that already has an edge of its own. The radius drops
                   to the tile scale a picture uses, the border goes, and the
                   hover moves onto the photograph itself, where the eye
                   already is. */
                className="group relative overflow-hidden rounded-tile text-left"
              >
                <img
                  src={d.image}
                  alt=""
                  aria-hidden
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-[0.55] transition-opacity group-hover:opacity-70"
                />
                {/* THE SCRIM HELD DOWN TO THE BOTTOM QUARTER.
                    With the border gone the photograph has to be what tells you
                    where a tile is, and at 30% under a gradient that reached
                    full obsidian everywhere it was not a photograph, it was a
                    dark rectangle that needed an outline to exist. The stops
                    are pinned so the bottom 26% — where the name and the blurb
                    sit — stays as opaque as it was, and everything above it
                    opens up to the picture. Legibility unchanged, tile
                    visible. */}
                <span className="absolute inset-0 bg-gradient-to-t from-obsidian from-26% via-obsidian/65 via-58% to-obsidian/15" />
                <span className="relative flex h-[172px] flex-col p-4">
                  <d.icon size={24} strokeWidth={1.4} className="text-azure" />
                  <span className="mt-auto block text-[15px] uppercase tracking-[0.06em] text-snow">
                    {d.label}
                  </span>
                  <span className="mt-1.5 block text-[11.5px] leading-snug text-mist">
                    {d.blurb}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </Rise>

        <Rise className="pt-3">
          <button
            type="button"
            onClick={() => onPick(DISCIPLINES[DISCIPLINES.length - 1])}
            className="flex w-full items-center justify-center gap-2 rounded-[12px] border border-hairline-strong py-4 text-[12.5px] uppercase tracking-[0.1em] text-azure transition-colors hover:border-azure/50"
          >
            Create custom activity
            <Plus size={15} strokeWidth={1.9} />
          </button>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * Screen 04b — the settings for the discipline just chosen.
 *
 * The mockup shows "HR Monitor · Connected" in green. It is NOT rendered that
 * way here. ICEFALL does pair a Bluetooth heart-rate strap — `tracking/sources/
 * heartRate.ts`, connected from the Connect control on `LiveTracker` — but this
 * screen has never asked for that state, and a green "Connected" printed before
 * anything is paired is a claim about the athlete's equipment nothing checked.
 * The live state belongs where the connection is made. Every row below reports
 * what is actually true, and says plainly when the answer is nothing.
 */
function ActivitySettings({
  discipline,
  onClose,
}: {
  discipline: Discipline;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const { goals } = useApp();
  const { settings, patch } = useSettings();
  const activity = useMemo(() => activityById(discipline.activity), [discipline.activity]);
  const objective = goals.find((g) => g.status === "active");

  const [goalOpen, setGoalOpen] = useState(false);
  /*
   * `window.prompt` was used here and it is not acceptable: it is blocked
   * outright in installed PWAs and some embedded webviews (the console said so
   * — "prompt() is not supported"), it cannot be styled, and it blocks the main
   * thread. Pack weight gets a real sheet instead.
   *
   * It served Footwear too until the owner removed that row; the sheet is now
   * single-purpose and the field-picking ternaries went with it.
   */
  const [editing, setEditing] = useState<null | "pack">(null);
  // Chosen before the run, because on the hill nobody wants to hunt for it.
  const [mapStyle, setMapStyle] = useState<MapStyleId>(() => savedMapStyle());
  const [draft, setDraft] = useState("");
  const intent = settings.sessionGoal ? intentById(settings.sessionGoal as IntentId) : null;
  const plan = intent ? planFor(intent, activity) : null;

  const rows = [
    {
      icon: Mountain,
      title: "Mountain objective",
      value: objective
        ? `${objective.name} – ${fmtDate(objective.targetDate, { day: undefined })}`
        : "None set",
      to: "/goals",
    },
    {
      icon: Weight,
      title: "Pack weight",
      optional: true,
      value: settings.packWeightKg ? `${settings.packWeightKg} kg` : "Not set",
      onClick: () => {
        setDraft(settings.packWeightKg ? String(settings.packWeightKg) : "");
        setEditing("pack");
      },
    },
    {
      icon: Thermometer,
      title: "Weather",
      value: "Auto-detect",
      detail: "Read from your position when the session starts.",
    },
    {
      icon: Target,
      title: "Goal",
      optional: true,
      value: intent ? intent.label : "None",
      onClick: () => setGoalOpen(true),
    },
  ];

  return (
    <Screen padded={false}>
      {/* ---- Hero ------------------------------------------------------- */}
      <div className="relative h-[300px] overflow-hidden">
        <img
          src={discipline.image}
          alt=""
          aria-hidden
          className="h-full w-full object-cover opacity-75"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-obsidian/85 via-transparent to-obsidian" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          className="absolute left-5 grid h-10 w-10 place-items-center rounded-full bg-obsidian/65 text-snow backdrop-blur transition-colors hover:bg-obsidian/85"
          /* The fallback is the point. `--screen-safe-top` is only set by the
             layouts that own a header (see chrome.tsx); this screen has none,
             so the bare var resolved to nothing, `calc()` became invalid, and
             the browser dropped `top` altogether — dumping the back button and
             the title below the hero image instead of on it. */
          style={{ top: "calc(var(--screen-safe-top, env(safe-area-inset-top, 0px)) + 12px)" }}
        >
          <X size={17} strokeWidth={1.8} />
        </button>
        <div
          className="absolute inset-x-0 flex flex-col items-center"
          style={{ top: "calc(var(--screen-safe-top, env(safe-area-inset-top, 0px)) + 18px)" }}
        >
          <discipline.icon size={26} strokeWidth={1.4} className="text-azure" />
          <h1 className="mt-2 text-[30px] font-light uppercase tracking-[0.04em] text-snow">
            {discipline.label}
          </h1>
          <p className="mt-1 text-[12.5px] text-mist">{discipline.blurb}</p>
        </div>
      </div>

      <Stagger className="-mt-6 px-5 pb-8">
        {/* ---- Map ------------------------------------------------------- */}
        {/* `pt-8` cancels the Stagger's `-mt-6`. That negative margin was put
            there to tuck the first block under the hero gradient back when that
            block was a card; the first thing here is a section label, which the
            same offset simply hid. */}
        <Rise className="pt-8">
          <SectionLabel>Map</SectionLabel>
          <div className="mt-3 flex gap-2">
            {(Object.keys(MAP_STYLE_LABEL) as MapStyleId[]).map((id) => {
              const tile = previewTile(id);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMapStyle(id);
                    saveMapStyle(id);
                  }}
                  aria-pressed={mapStyle === id}
                  className="group flex-1 text-left"
                >
                  {/* A real tile of the same mountain in every option — the
                      chooser shows the ground rather than describing it.

                      CHOSEN IS A RING ON THE PICTURE, NOT A FRAME AROUND THE
                      OPTION. Every option used to carry a border and the chosen
                      one changed its colour, so three outlined boxes competed
                      to say which was picked. The ring is inset in the
                      photograph's own edge and only the chosen one has it —
                      which is also why it goes here and not on the button: the
                      name below has to stay on the page, not inside a box with
                      the picture. */}
                  <span
                    className={cn(
                      "relative block h-[62px] overflow-hidden rounded-tile bg-slate transition-opacity",
                      mapStyle === id ? "ring-2 ring-inset ring-azure" : "group-hover:opacity-90",
                    )}
                  >
                    {tile ? (
                      <img
                        src={tile}
                        alt=""
                        aria-hidden
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      /* ICEFALL's style is vector and has no raster endpoint,
                         so this swatch is drawn from the style's own tokens:
                         the obsidian ground, a hairline contour, the azure
                         route. */
                      /* `on-dark` — see index.css. This swatch is a PREVIEW of
                         ICEFALL's map style, and that style is dark in every
                         theme, so it has to stay dark or it stops describing
                         the thing it is choosing. */
                      <span className="on-dark block h-full w-full bg-obsidian">
                        <svg viewBox="0 0 120 62" className="h-full w-full" aria-hidden>
                          <path
                            d="M0 46 L26 34 L44 40 L70 22 L92 30 L120 16"
                            fill="none"
                            stroke="var(--ice-hairline-strong)"
                            strokeWidth="1"
                          />
                          {/* The faint second contour. Its stroke was a
                              literal white at 7% — the hairline token's own
                              value, written out — so it followed neither the
                              theme nor any future change to the token. */}
                          <path
                            d="M0 54 L30 44 L52 49 L78 33 L100 40 L120 28"
                            fill="none"
                            stroke="var(--ice-hairline)"
                            strokeWidth="1"
                          />
                          <path
                            d="M14 52 L38 41 L58 45 L84 27 L104 34"
                            fill="none"
                            stroke="var(--ice-azure)"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                          />
                        </svg>
                      </span>
                    )}
                  </span>
                  {/* The name sits UNDER the picture, on the page, the way a
                      caption does — it is no longer inside a panel with it. */}
                  <span className="block pt-2">
                    <span
                      className={cn(
                        "block text-[12.5px]",
                        mapStyle === id ? "text-azure" : "text-snow",
                      )}
                    >
                      {MAP_STYLE_LABEL[id]}
                    </span>
                    <span className="mt-0.5 block text-[10.5px] leading-snug text-mist">
                      {MAP_STYLE_DETAIL[id]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </Rise>

        {/* ---- Settings ------------------------------------------------- */}
        {/* This used to be the first block, so it needed no top spacing. It
            follows the map cards now and its label was sitting on top of them. */}
        <Rise className="pt-6">
          <SectionLabel>Activity settings</SectionLabel>
          {/* ROWS, NOT A TABLE. The box around this list was drawing an
              outline whose only message was "these four rows belong together" —
              the label above and the air around it say that already. What is
              kept is the hairline BETWEEN rows, because Mountain objective,
              Pack weight, Weather and Goal are genuinely unlike one another and
              there is no icon column wide enough to do the sorting on its own. */}
          <div className="mt-1.5">
            {rows.map((row, i) => {
              const inner = (
                <>
                  <row.icon size={17} strokeWidth={1.5} className="shrink-0 text-azure/85" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14px] text-snow">
                      {row.title}
                      {row.optional && <span className="text-mist-dim"> (optional)</span>}
                    </span>
                    {row.detail && (
                      <span className="mt-0.5 block text-[11px] leading-relaxed text-mist">
                        {row.detail}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12.5px] text-mist">{row.value}</span>
                  {(row.to || row.onClick) && (
                    <ChevronRight size={16} strokeWidth={1.8} className="shrink-0 text-mist-dim" />
                  )}
                </>
              );
              const cls = cn(
                /* `-mx-5 px-5` cancels the screen's gutter and re-applies it as
                   the row's own, so the title lands on the same left edge as
                   the section label above it and the hover fill reaches the
                   glass rather than stopping short of it. */
                "-mx-5 flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors",
                i > 0 && "border-t border-hairline",
                /* Not `bg-slate/40` — that lifted the row off the panel it used
                   to sit in, and reads as nothing on the canvas in light. */
                (row.to || row.onClick) && "hover:bg-white/[0.03]",
              );
              if (row.to) {
                return (
                  <button
                    key={row.title}
                    type="button"
                    onClick={() => navigate(row.to!)}
                    className={cls}
                  >
                    {inner}
                  </button>
                );
              }
              if (row.onClick) {
                return (
                  <button key={row.title} type="button" onClick={row.onClick} className={cls}>
                    {inner}
                  </button>
                );
              }
              return (
                <div key={row.title} className={cls}>
                  {inner}
                </div>
              );
            })}
          </div>
        </Rise>

        {/* ---- The session this intent produces --------------------------- */}
        {plan && plan.blocks.length > 0 && (
          /* THE SESSION IS A SECTION, NOT A TINTED PANEL.
             It was `rounded-card border border-azure/30 bg-azure/[0.04] p-4`,
             which used the accent as a container: azure means "the athlete's
             own", and washing a whole block in it to say "these lines go
             together" spends the one colour that carries meaning on a job that
             space does. So the label and the air announce it, the azure stays
             where it is doing work — the bullets and the amounts — and the two
             internal rules come down to ONE, at the one real division: between
             what the session is and what it is made of. Every sentence, the
             watch line and the caveat are unchanged. */
          <Rise className="pt-8">
            <div>
              <div className="flex items-baseline justify-between gap-3">
                <SectionLabel>Your session</SectionLabel>
                <span className="tnum shrink-0 text-[11.5px] text-mist">
                  about{" "}
                  {plan.totalMin >= 120
                    ? `${(plan.totalMin / 60).toFixed(1)} h`
                    : `${plan.totalMin} min`}
                </span>
              </div>
              <p className="mt-2.5 text-[12.5px] leading-relaxed text-mist">{plan.intent.what}</p>

              <div className="mt-4 space-y-3 border-t border-hairline pt-4">
                {plan.blocks.map((b) => (
                  <div key={b.label} className="flex items-start gap-3">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-[13.5px] text-snow">{b.label}</span>
                        <span className="tnum text-[12px] text-azure">{b.amount}</span>
                      </span>
                      <span className="mt-0.5 block text-[11.5px] leading-relaxed text-mist">
                        {b.effort}
                      </span>
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-5 text-[11.5px] leading-relaxed text-snow">
                <span className="text-mist">Watch: </span>
                {plan.watch}
              </p>
              <p className="mt-2 text-[10.5px] leading-relaxed text-mist">{plan.caveat}</p>
            </div>
          </Rise>
        )}

        {/* ---- Start ------------------------------------------------------ */}
        {/* The PRIMARY start is pinned below, outside this scroller — starting
            the thing you came here to start should never need a scroll. What
            stays here are the two secondary actions. */}
        <Rise className="pt-5">
          <button
            type="button"
            onClick={() => navigate(`/activity/live/${activity.id}?go=1&mode=simulated`)}
            className="mt-2.5 w-full rounded-[10px] border border-hairline py-2.5 text-[11.5px] text-mist transition-colors hover:border-hairline-strong hover:text-snow"
          >
            Start simulated — for indoor review
          </button>
          <button
            type="button"
            onClick={() => patch({ defaultActivity: activity.id })}
            className="mt-2.5 w-full rounded-[12px] border border-hairline-strong py-3.5 text-[12.5px] uppercase tracking-[0.1em] text-snow transition-colors hover:border-azure/45"
          >
            {settings.defaultActivity === activity.id ? "Saved as default" : "Save as default"}
          </button>
        </Rise>
      </Stagger>
      {/*
       * PINNED START.
       *
       * Outside `Stagger` on purpose: `Rise` animates with a transform, and a
       * transformed ancestor makes `position: sticky` resolve against that
       * element instead of the scroller — the bar would scroll away with the
       * content it is supposed to outlive.
       *
       * The gradient is not decoration; it keeps the text underneath legible as
       * it passes behind the bar.
       */}
      <div className="sticky bottom-0 z-20 bg-gradient-to-t from-obsidian via-obsidian/95 to-transparent px-5 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] pt-8">
        <button
          type="button"
          onClick={() => navigate(`/activity/live/${activity.id}?go=1`)}
          className="flex w-full items-center justify-center gap-2.5 rounded-[12px] bg-azure py-4 text-[13.5px] uppercase tracking-[0.1em] text-obsidian transition-colors hover:bg-azure-bright"
        >
          Start {discipline.label}
          <Play size={15} strokeWidth={2.2} fill="currentColor" />
        </button>
      </div>

      {editing && (
        <Sheet title="Pack weight" onClose={() => setEditing(null)}>
          <div className="space-y-3 px-1 pb-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^0-9.,]/g, ""))}
              inputMode="decimal"
              placeholder="11.2"
              autoFocus
              className="w-full rounded-tile border border-hairline bg-elevated/40 px-3.5 py-3 text-[15px] text-snow outline-none transition-colors placeholder:text-mist-dim focus:border-azure/50"
            />
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => {
                  patch({ packWeightKg: undefined });
                  setEditing(null);
                }}
                className="flex-1 rounded-[10px] border border-hairline-strong py-3 text-[12.5px] text-mist transition-colors hover:text-snow"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => {
                  const kg = Number(draft.replace(",", "."));
                  patch({ packWeightKg: Number.isFinite(kg) && kg > 0 ? kg : undefined });
                  setEditing(null);
                }}
                className="flex-1 rounded-[10px] bg-azure py-3 text-[12.5px] uppercase tracking-[0.08em] text-obsidian transition-colors hover:bg-azure-bright"
              >
                Save
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {goalOpen && (
        <Sheet title="What do you want out of it?" onClose={() => setGoalOpen(false)}>
          {SESSION_INTENTS.map((i) => (
            <SheetRow
              key={i.id}
              title={i.label}
              detail={i.blurb}
              active={settings.sessionGoal === i.id}
              onClick={() => {
                patch({ sessionGoal: i.id === "free" ? undefined : i.id });
                setGoalOpen(false);
              }}
            />
          ))}
        </Sheet>
      )}
    </Screen>
  );
}
