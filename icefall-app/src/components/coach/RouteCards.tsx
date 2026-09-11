import { useState } from "react";
import { Link } from "react-router-dom";

import { Eyebrow } from "@/screens/coach/shell";
import { TrailImage } from "@/components/domain/TrailImage";
import { NETWORK_LABEL, SAC_LABEL, TRAIL_ATTRIBUTION } from "@/services/trails";
import { PLATE_CAPTION } from "@/services/trailImagery";
import { TREKS, trekAltitude, trekDuration } from "@/treks";
import { trekImage, trekImageCaption, trekPlate } from "@/treks/images";
import { fmtDistance } from "@/lib/format";
import type { RouteCard } from "@/coach/routeSuggestions";
import type { SuggestedRoutes } from "@/coach/suggestedRoutes";

/**
 * ROUTES THE COACH SUGGESTED, UNDER THE MESSAGE THAT SUGGESTED THEM.
 *
 * ============================================================================
 * EVERY FIGURE HERE CAME OUT OF ICEFALL'S OWN RECORDS
 * ============================================================================
 *
 * The model picked ids. It did not write a single number, name or grade on this
 * component: the trek half reads `TREKS` by id, the trail half reads the record
 * `nearbyTrails` returned for that relation. The one model-authored string is
 * `reason`, and it is shown in quotation marks with "your coach" after it, for
 * the reason `PlanChangeRows` gives for `why` — the claim and the arithmetic sit
 * on the same card, so a reason that does not match the route is contradicted an
 * inch below itself rather than being the only account there is.
 *
 * If nothing resolved, this component is never rendered; the screen writes a
 * sentence saying so instead. Nothing here has an empty state, because "no
 * cards" is not a thing it is ever asked to draw.
 *
 * ============================================================================
 * A CARD, AND WHY THIS ONE IS ALLOWED TO BE ONE
 * ============================================================================
 *
 * The house rule is flat rows and spacing, and a bordered container only for a
 * genuinely distinct object. A trail is one: it is a place, with a picture of
 * its own ground, its own page and its own record, and four of them in a column
 * with only spacing between would read as one long paragraph about walking.
 * Note what is still NOT boxed — the coach's sentence above, the header line,
 * the attribution. The picture is the container; nothing else gains a border.
 *
 * ============================================================================
 * ATTRIBUTION IS A LICENCE OBLIGATION, NOT A CAPTION
 * ============================================================================
 *
 * Every photograph reachable from here is CC BY or CC BY-SA and both require
 * the photographer named wherever the work appears. So:
 *
 *   TRAILS  `TrailImage` decides which layer won — a verified photograph, the
 *           Esri satellite mosaic, or the contour plate it draws on the device
 *           — and reports the right sentence for that layer through
 *           `onCaption`. This component prints whatever it is told, unmodified
 *           and untruncated. It does not compose its own: a caption written
 *           here would describe a layer this file cannot see.
 *
 *   TREKS   `trekImageCaption` is the single accessor for the same reason —
 *           the trek card and the trek page used to look the credit up
 *           separately, so a photograph added in one place appeared credited on
 *           one screen and anonymous on the other. It also carries the honest
 *           fallbacks: "the mountain this route visits, not the route itself"
 *           when the picture is of a peak, and "no verified photograph of this
 *           route" when it is the drawn plate.
 *
 * The line is `clamp-2` rather than `truncate`, measured: at this size a single
 * line loses the licence and the source on effectively every photograph, which
 * is a breach rather than a cosmetic slip. See the same note in `Routes.tsx`.
 */
export function RouteCards({ suggestion }: { suggestion: SuggestedRoutes }) {
  const { cards, basis, nearLabel } = suggestion;
  if (cards.length === 0) return null;

  /*
   * THE HEADER SAYS WHICH "NEAR" THIS IS.
   *
   * "Near you" and "near Mont Blanc" are different claims and the athlete
   * cannot tell them apart from the cards alone — a trail 30 km from the
   * mountain they are training for looks exactly like a trail 30 km from their
   * house. `basis` is carried this far precisely so the difference is stated
   * rather than assumed, and the objective branch names the mountain.
   *
   * `basis` DESCRIBES THE TRAIL SEARCH AND NOTHING ELSE, so it is only allowed
   * to speak when there is a trail on screen. A list of treks alone has a
   * different "near" — the objective's mountain or its country, decided by
   * `suggestedTreksFor` — and labelling three Nepalese treks "Near your area"
   * because the athlete happens to have Location on would be a straightforward
   * falsehood. With no trail to describe, the header says where they came from
   * and claims no geography at all.
   */
  const hasTrail = cards.some((c) => c.kind === "trail");
  const where = !hasTrail
    ? "From ICEFALL's trek catalogue"
    : basis === "device"
      ? "Near your area"
      : basis === "objective" && nearLabel
        ? `Near ${nearLabel}`
        : "From ICEFALL's records";

  return (
    <div className="mt-3 border-t border-hairline pt-3">
      <Eyebrow className="!text-azure/70">
        {cards.length === 1 ? "A route" : `${cards.length} routes`} · {where}
      </Eyebrow>

      {/*
        THE SUBSTITUTION, SAID IN FULL.

        `basis: "objective"` means ICEFALL had no position for the athlete, so
        it searched around the mountain they are training for instead of around
        them. The heading above already names the mountain — but somebody who
        asked for trails near them reads "Near Mont Blanc" as a description of
        the trails, not as an admission that a different question was answered.
        One flat line, no box, and it says which was substituted for which.

        "No position" RATHER THAN "Location is off", deliberately. The two are
        not the same state: the athlete may have turned sharing on and ICEFALL
        may still hold nothing, because `approxLocation` is only written when a
        fix is actually taken. A sentence that named the setting would be
        telling some of them their own settings screen is wrong.
      */}
      {hasTrail && basis === "objective" && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-mist-dim">
          ICEFALL has no location for you, so these are near your objective rather than near you.
        </p>
      )}

      <div className="mt-3 space-y-4">
        {cards.map((card) =>
          card.kind === "trek" ? (
            <TrekRouteCard key={`trek:${card.id}`} card={card} />
          ) : (
            <TrailRouteCard key={`trail:${card.osmId}`} card={card} />
          ),
        )}
      </div>

      {/*
        ODbL requires OpenStreetMap credited wherever its data is shown, and the
        trail rows above are OSM relations. Printed once for the group rather
        than on every card — it is the same source for all of them, and a line
        repeated three times reads as decoration and stops being read.
      */}
      {hasTrail && (
        <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">{TRAIL_ATTRIBUTION}</p>
      )}
    </div>
  );
}

/** The coach's one sentence, quoted and attributed. Omitted when there is none. */
function Reason({ reason }: { reason: string }) {
  if (!reason) return null;
  return <p className="mt-1.5 text-[12.5px] leading-relaxed text-mist">“{reason}” — your coach</p>;
}

/** The attribution line under a picture. Never truncated to one line. */
function Caption({ text }: { text: string }) {
  return <p className="mt-1.5 clamp-2 text-[10.5px] leading-snug text-mist-dim">{text}</p>;
}

/* -------------------------------------------------------------------------- */
/* Treks                                                                       */
/* -------------------------------------------------------------------------- */

function TrekRouteCard({ card }: { card: Extract<RouteCard, { kind: "trek" }> }) {
  /*
   * RE-READ BY ID AT RENDER TIME, not carried on the card.
   *
   * The trek catalogue ships inside the app, so this lookup is exact, free, and
   * cannot go stale — a trek card drawn today shows today's record. It is also
   * the reason a trek id that has since been removed from the catalogue draws
   * nothing at all rather than a husk: there is no snapshot to fall back on and
   * there should not be one.
   */
  const trek = TREKS.find((t) => t.id === card.id);
  const [broken, setBroken] = useState(false);
  if (!trek) return null;

  const facts = [
    trekDuration(trek),
    trek.difficulty ?? "Difficulty not graded",
    trek.maxAltitudeM !== null ? `High point ${trekAltitude(trek)}` : null,
  ].filter(Boolean);

  return (
    <Link to={`/explore/trek/${trek.id}`} className="block">
      <div className="relative aspect-[16/10] overflow-hidden rounded-[16px] bg-slate">
        <img
          src={broken ? trekPlate(trek.id) : trekImage(trek)}
          alt=""
          aria-hidden
          loading="lazy"
          decoding="async"
          /* A photograph that 404s must not leave the card blank under a
             caption crediting a picture nobody can see. The plate is drawn
             from the id and needs no network. */
          onError={() => setBroken(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian/55 via-transparent to-transparent" />
        <span className="absolute bottom-3 left-3 rounded-pill border border-hairline-strong bg-obsidian/70 px-2.5 py-1 text-[10.5px] text-mist backdrop-blur">
          {trek.style}
        </span>
      </div>

      <p className="mt-2 text-[14px] leading-snug text-snow">{trek.name}</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-mist">
        {trek.country} · {facts.join(" · ")}
      </p>
      <Reason reason={card.reason} />
      <Caption
        text={
          /* The plate fallback is a drawing, so the photograph's credit would
             be crediting the wrong picture. `PLATE_CAPTION` is the same
             sentence the trail cards use for the same drawing. */
          broken ? PLATE_CAPTION : trekImageCaption(trek)
        }
      />
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Trails                                                                      */
/* -------------------------------------------------------------------------- */

function TrailRouteCard({ card }: { card: Extract<RouteCard, { kind: "trail" }> }) {
  /* Set by `TrailImage`, because only it knows which layer actually won. The
     starting value describes the plate, which is what is painted first. */
  const [caption, setCaption] = useState(PLATE_CAPTION);

  const facts = [
    /* Only a length ICEFALL actually holds. `lengthKm` is already null for a
       relation whose geometry measured to something impossible, so there is no
       branch here that can print a nonsense figure. */
    card.lengthKm != null ? `${fmtDistance(card.lengthKm)} km` : "Length not recorded",
    card.ascentM != null ? `${Math.round(card.ascentM)} m ascent` : null,
    card.sacScale ? (SAC_LABEL[card.sacScale] ?? card.sacScale) : null,
    card.network ? NETWORK_LABEL[card.network] : null,
  ].filter(Boolean);

  const away =
    card.distanceM === undefined
      ? null
      : card.distanceM < 1000
        ? "Here"
        : `${(card.distanceM / 1000).toFixed(card.distanceM < 10_000 ? 1 : 0)} km away`;

  return (
    <Link to={`/explore/trail/${card.osmId}`} className="block">
      <div className="relative aspect-[16/10] overflow-hidden rounded-[16px] bg-slate">
        {/* The plate is always painted and painted first — it needs no network,
            so there is no state in which this card is blank. */}
        <TrailImage
          osmId={card.osmId}
          lat={card.lat}
          lon={card.lon}
          name={card.name}
          lengthKm={card.lengthKm}
          onCaption={setCaption}
          className="absolute inset-0 h-full w-full"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-obsidian/55 via-transparent to-transparent" />
        {card.ref && (
          <span className="absolute bottom-3 right-3 rounded-pill border border-azure/45 bg-obsidian/75 px-2.5 py-1 text-[10.5px] text-azure backdrop-blur">
            {card.ref}
          </span>
        )}
      </div>

      <p className="mt-2 text-[14px] leading-snug text-snow">{card.name}</p>
      <p className="mt-0.5 text-[12.5px] leading-relaxed text-mist">
        {[away, ...facts].filter(Boolean).join(" · ")}
      </p>
      <Reason reason={card.reason} />
      <Caption text={caption} />
    </Link>
  );
}
