import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ChevronRight, Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow,
  Droplets, Eye, Moon, Sun, Wind,
} from "lucide-react";
import {
  describeWeatherCode,
  getMountainConditions,
  peakLocalClock,
  weatherKind,
  type HourReading,
  type MountainConditions,
  type Reading,
  type WeatherKind,
} from "@/services/conditions";
import { fmtElevation, fmtTempCoarse, fmtVisibility } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The weather at the objective — the owner's reference widget, built for a
 * mountain instead of a city.
 *
 * SHAPE (from the reference, top to bottom):
 *   condition glyph + a large temperature on the left, the condition word over
 *   the altitude on the right, and beneath them a row of hours, each with its
 *   own glyph and its own temperature.
 *
 * IT IS A SECTION OF THE OBJECTIVE CARD, not a card of its own — see `shell`
 * below for the owner ruling that decided that, which a nested rounded box had
 * quietly reversed.
 *
 * MONOCHROME, BY INSTRUCTION. The owner asked for this "with out colours", so
 * there is no warm/cold tinting, no blue for rain, no amber for a warning and
 * no gradient anywhere below. Every value in this file is `snow`, `mist` or
 * `mist-dim` — the app's three ink tokens — or a `white/[0.0x]` lift. Those
 * tokens invert with the theme (see the palette block in `index.css`, where the
 * light theme redefines `--color-white` to near-black), so this reads as white
 * on black in the dark build and black on white in the light one, which is
 * exactly the pair the reference shows. Nothing here is hardcoded to a hex, so
 * it also survives being dropped inside an `.on-dark` island over photography.
 *
 * THE PLACE IS AN ALTITUDE. The reference says "Singapore"; ICEFALL reports
 * conditions AT THE DESTINATION, and −3° at 4,806 m is a different fact from
 * −3° in the valley below it. The place line carries the elevation — never a
 * settlement, and never the peak's name, which the card above already prints.
 *
 * WHAT IT REFUSES TO DO. `getMountainConditions` hands back readings that may
 * legitimately be absent, and every absence stays visible here:
 *
 *   - An unmeasured figure is an em dash. A measured zero is a zero — 0° is a
 *     real temperature on a mountain and prints as "0°", never as a dash, and
 *     WMO code 0 is "clear sky" rather than a missing code, so this file tests
 *     `.value === null` and never truthiness.
 *   - The hour row is only ever as long as the forecast that came back. It is
 *     never interpolated, never padded with the current temperature and never
 *     given a placeholder ramp: six plausible temperatures nobody modelled
 *     would look exactly like a forecast, which is the one thing this cannot
 *     do. Fewer hours, or none and the reason said out loud.
 *   - A failed request says so in words rather than spinning forever or
 *     rendering an empty frame, because the app is expected to be opened with
 *     no signal at all.
 */

/**
 * How often the card asks again while it is on screen and being looked at.
 *
 * See the effect that uses it: short and clock-agnostic, because the mountain's
 * hour does not turn over on the reader's minute.
 */
const REFRESH_MS = 5 * 60 * 1000;

/* -------------------------------------------------------------------------- */
/* Glyphs                                                                     */
/* -------------------------------------------------------------------------- */

type Glyph = typeof Cloud;

/**
 * WMO code → a line glyph, or nothing.
 *
 * `weatherKind` returns null for a code this app does not recognise, and null
 * here means NO ICON. A default of "clear" would turn a code ICEFALL failed to
 * read into a picture of good weather on a mountain, which is the same class of
 * lie as inventing an hour.
 *
 * Daylight only chooses between a sun and a moon for a clear sky; it never
 * changes what the glyph says about the WEATHER. When `isDay` is unknown the
 * sun is drawn, because the alternative is dropping the condition entirely over
 * a question about the time of day.
 */
function glyphFor(code: number | null, isDay: boolean | null): Glyph | null {
  const kind: WeatherKind | null = weatherKind(code);
  if (kind === null) return null;
  switch (kind) {
    case "clear":
      return isDay === false ? Moon : Sun;
    case "cloud":
      return Cloud;
    case "fog":
      return CloudFog;
    case "drizzle":
      return CloudDrizzle;
    case "rain":
      return CloudRain;
    case "snow":
      return CloudSnow;
    case "thunder":
      return CloudLightning;
  }
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * A temperature, or an em dash.
 *
 * `fmtTempCoarse` is the app's shared formatter and it carries the minus-sign
 * rule with it: U+2212, not a hyphen. This file used to build the string itself
 * and shipped hyphens at 40px, one tap from a screen rendering "−2.9°C" for the
 * same reading — see the note on `minus` in `@/lib/format` for why that is a
 * safety defect and not a typographic one. Nothing here formats a temperature
 * by hand again.
 *
 * The absence test is `=== null` and never truthiness: 0° is a real temperature
 * on a mountain and prints as "0°".
 */
function degrees(r: Reading): string {
  return r.value === null ? "—" : fmtTempCoarse(r.value);
}

function windText(r: Reading): string {
  return r.value === null ? "—" : `${Math.round(r.value)} km/h`;
}

function precipText(r: Reading): string {
  return r.value === null ? "—" : `${r.value.toFixed(1)} mm`;
}

/** Shared with the full forecast, which was printing "1.5 km" where this said "2 km". */
function visibilityText(r: Reading): string {
  return r.value === null ? "—" : fmtVisibility(r.value);
}

/* -------------------------------------------------------------------------- */

export function ObjectiveWeather({
  peakName,
  elevationM,
  lat,
  lon,
  goalId,
  className,
}: {
  peakName: string;
  elevationM: number;
  lat: number;
  lon: number;
  /** Where "Full forecast" goes. */
  goalId: string;
  className?: string;
}) {
  const [data, setData] = useState<MountainConditions | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloads, setReloads] = useState(0);

  /*
   * IT HAS TO COME BACK FOR MORE. This card names an hour "Now" and orders five
   * more after it; left open on Home — in a hut, at a belay, on a phone nobody
   * has locked — every one of those labels quietly stops being true, and the
   * old strip's bare temperature at least did not make the claim. So: refetch
   * when the tab is looked at again, and refetch on a timer while it is.
   *
   * Five minutes rather than an hour, and not because the forecast changes that
   * fast. The mountain's hour boundary is not the viewer's — Nepal is +05:45,
   * which is Everest — so a timer set to the reader's clock would turn over at
   * the wrong minute for exactly the peaks this app exists for. A short poll
   * needs to know nothing about either clock. It is one small GET.
   */
  useEffect(() => {
    const bump = () => {
      if (document.visibilityState === "visible") setReloads((n) => n + 1);
    };
    const id = window.setInterval(bump, REFRESH_MS);
    document.addEventListener("visibilitychange", bump);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", bump);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void getMountainConditions({
      peakName,
      elevationM,
      lat,
      lon,
      signal: controller.signal,
    })
      .then((d) => {
        if (!controller.signal.aborted) {
          setData(d);
          setLoading(false);
        }
      })
      /*
       * RULE 4 — NOTHING SPINS FOREVER. `getMountainConditions` catches its own
       * fetch, but its OFFLINE branch runs before that try block, so a throw
       * there rejects this promise, `setLoading(false)` never runs, and the one
       * build that must never spin spins for as long as the screen is open.
       * A rejection lands in the same honest failure card as everything else.
       */
      .catch(() => {
        if (!controller.signal.aborted) {
          setData(null);
          setLoading(false);
        }
      });
    return () => controller.abort();
  }, [peakName, elevationM, lat, lon, reloads]);

  /*
   * A SECTION OF THE OBJECTIVE CARD, NOT A CARD OF ITS OWN.
   *
   * Owner: "connect this to the current objective box together." They were two
   * boxes saying the same mountain's name twice — the forecast IS the
   * objective's forecast, and reading it as separate information was the thing
   * to fix. That ruling still stands, and a rounded, hairlined, tinted box
   * nested 17px inside the objective card's own rounded hairline box is the
   * ruling undone: two concentric rectangles, same border colour, near-identical
   * radii. A rule across the card and the shared ground is what "one object"
   * looks like, and it is what the strip this replaced did.
   *
   * Still a Link, and still a SIBLING of the card's /goals link rather than a
   * child of it — an anchor inside an anchor is invalid. The whole section is
   * the tap target, as it was before; the explicit `aria-label` is what stops a
   * screen reader announcing the entire card contents as the link's name.
   */
  const shell = (children: React.ReactNode) => (
    <Link
      to={`/mountain/${goalId}/conditions`}
      aria-label={`Full forecast for ${peakName}`}
      className={cn("block border-t border-hairline pt-4", className)}
    >
      {children}
    </Link>
  );

  if (loading) {
    return shell(<p className="text-[12.5px] text-mist">Requesting the forecast…</p>);
  }

  /*
   * RULE 4 — OFFLINE FIRST. A request that did not arrive says what it could
   * not reach, in words, and shows no figures at all. It never falls back to a
   * spinner that never ends or to a frame with dashes in it that could be read
   * as a calm, clear summit.
   *
   * The peak and its height are not repeated here either: the objective card
   * prints both, two rows up and at 26px.
   */
  if (!data || data.error) {
    return shell(
      <>
        <p className="text-[12.5px] leading-relaxed text-mist">
          The forecast could not be loaded. ICEFALL will not show conditions it has not read —
          nothing here is a guess.
        </p>
        <FullForecast />
      </>,
    );
  }

  const c = data.current;
  const word = describeWeatherCode(c.weatherCode.value);
  const Big = glyphFor(c.weatherCode.value, c.isDay);
  const hours = data.hourly.hours;
  const readAt = peakLocalClock(c.observedAt);
  /*
   * The row never collapses onto itself. A two-hour outlook used to stretch two
   * columns across the full width, which reads as a layout fault rather than as
   * a forecast that stopped; held to the width that was ASKED for, the same two
   * hours sit in the left two sixths and the empty tracks say what the note
   * says. Nothing is drawn in them — an empty track is not a padded hour.
   */
  const tracks = Math.max(hours.length, data.hourly.requested);

  return shell(
    <>
      {/* ---- The headline: glyph + temperature left, condition + place right ---- */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {/* No glyph when the code was not read. Nothing stands in for it. */}
          {Big && (
            <Big size={34} strokeWidth={1.15} className="shrink-0 text-snow" aria-hidden />
          )}
          <p className="tnum text-[40px] font-extralight leading-none tracking-tight text-snow">
            {degrees(c.temperatureC)}
          </p>
        </div>
        <div className="min-w-0 text-right">
          {/* Silence, not "Clear", when the code is unknown. */}
          {word && <p className="truncate text-[14px] leading-tight text-snow">{word}</p>}
          {/*
            THE ALTITUDE, AND NOT THE NAME. The objective card prints "Mont Blanc"
            at 26px two rows above this; printing it again here is the duplication
            the owner had already had removed once. What the height adds is the
            fact the temperature belongs to — −3° at 4,806 m is a different
            statement from −3° in the valley below it.
          */}
          <p className="tnum mt-1 truncate text-[11.5px] leading-tight text-mist">
            at {fmtElevation(elevationM)} m
          </p>
          {/*
            WHEN IT WAS READ. The big figure is the provider's instantaneous
            `current` block and the row beneath is its hourly model — two
            different things about the present, and without this line the card
            offered two numbers and no way to tell which was which. It is also
            what dates the card: a screen left open goes stale, and a stamp is
            how a reader can see that it has. Read off the mountain's own stamp,
            and printed only when that stamp is unambiguously the mountain's.
          */}
          {readAt && (
            <p className="tnum truncate text-[11px] leading-tight text-mist">
              read at {readAt}
            </p>
          )}
        </div>
      </div>

      {/* ---- The hours ahead ------------------------------------------------ */}
      {hours.length > 0 && (
        <div
          className="mt-4 grid gap-1 border-t border-hairline pt-3.5"
          style={{ gridTemplateColumns: `repeat(${tracks}, minmax(0, 1fr))` }}
        >
          {hours.map((h) => (
            <HourColumn key={h.time} hour={h} />
          ))}
        </div>
      )}

      {/*
        The note is printed whenever the service sends one — both when the row
        is empty and when it is short. "Only the next 3 hours were forecast."
        under three columns is the difference between a window that stopped and
        a window that was never there.
      */}
      {data.hourly.note && (
        <p
          className={cn(
            // `mist`, not `mist-dim`: this sentence is the one that says the
            // forecast is incomplete, which is not a footnote.
            "text-[11px] leading-relaxed text-mist",
            hours.length > 0 ? "mt-2.5" : "mt-4 border-t border-hairline pt-3.5",
          )}
        >
          {data.hourly.note}
        </p>
      )}

      {/*
        ---- Wind, precipitation, visibility --------------------------------
        These were on the strip this widget replaces and they are measurements a
        mountaineer actually packs against, so they did not go to the forecast
        page to be found later — they moved one line down and stayed on Home.
        The reference has no slot for them; the card does.
      */}
      <div className="mt-3.5 grid grid-cols-3 gap-2 border-t border-hairline pt-3.5">
        <Figure icon={Wind} label="Wind" value={windText(c.windKph)} />
        <Figure icon={Droplets} label="Precip" value={precipText(c.precipitationMm)} />
        <Figure icon={Eye} label="Visibility" value={visibilityText(c.visibilityM)} />
      </div>

      <FullForecast />
    </>,
  );
}

/* -------------------------------------------------------------------------- */

function HourColumn({ hour }: { hour: HourReading }) {
  const G = glyphFor(hour.weatherCode.value, hour.isDay);
  return (
    <div className="min-w-0 text-center">
      {/*
        The current hour is the brightest column. Weight and opacity carry it —
        there is no accent to spend here, and none is wanted.

        THE OTHER FIVE ARE `mist`, NOT `mist-dim`, AND 10.5px, NOT 9.5px. This
        label is what tells you which hour a temperature belongs to, and it was
        the least legible text in the app: measured at 2.89:1 on the widget's
        own lifted ground. `index.css` already records mist-dim as failing AA
        for small text at 10px on the plain canvas; this was smaller, on a
        lighter ground, on a screen read in gloves in daylight. The step to
        `mist` is the fix and it costs no colour — the card stays monochrome,
        which is the instruction.

        "Now" is printed ONLY when the service says this hour contains this
        instant. An outlook whose series does not reach the present carries no
        such hour, and every column then reads its own clock time.
      */}
      <p
        className={cn(
          "tnum truncate text-[10.5px] leading-none",
          hour.isNow ? "text-snow" : "text-mist",
        )}
      >
        {hour.isNow ? "Now" : hour.label}
      </p>
      <div className="mt-2 flex h-[18px] items-center justify-center">
        {G && (
          <G
            size={16}
            strokeWidth={1.3}
            className={hour.isNow ? "text-snow" : "text-mist"}
            aria-hidden
          />
        )}
      </div>
      <p
        className={cn(
          "tnum mt-1.5 truncate text-[12px] leading-none",
          hour.isNow ? "text-snow" : "text-mist",
        )}
      >
        {degrees(hour.temperatureC)}
      </p>
    </div>
  );
}

function Figure({
  icon: Icon,
  label,
  value,
}: {
  icon: Glyph;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <Icon size={13} strokeWidth={1.6} className="text-mist" aria-hidden />
      <p className="tnum mt-1.5 truncate text-[11.5px] text-snow">{value}</p>
      {/*
        `.section-label` AT ITS OWN SIZE, IN THE SECONDARY INK. It was overridden
        to 8px here, and the palette block in index.css sets the tertiary ink's
        contrast on the explicit basis that this class renders at 10px —
        shrinking it spends a margin that was measured, not guessed.

        The colour step is the second half. That measured margin is quoted
        against the CANVAS; this label sits on a card, and the tertiary ink
        lands at 4.23:1 there, under AA. `mist` puts it at 6.13:1 in both
        themes and costs no colour — the card stays ink-only, which is the
        instruction. WIND / PRECIP / VISIBILITY is which figure you are
        looking at, on a screen read in gloves.
      */}
      <p className="section-label mt-1 truncate text-mist">{label}</p>
    </div>
  );
}

/**
 * The route out. Monochrome like the rest of the card — the chevron is the
 * affordance now that the accent is gone.
 */
function FullForecast() {
  return (
    <div className="mt-3.5 flex items-center justify-between border-t border-hairline pt-3">
      <span className="text-[12.5px] text-snow">Full forecast</span>
      <ChevronRight size={15} strokeWidth={1.8} className="text-mist" />
    </div>
  );
}
