import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Globe, Megaphone, ShieldOff, Target, X, XCircle } from "lucide-react";
import { Button, Card } from "@/components/ui/primitives";
import { PROMOTED_DISMISS_IS_FOREVER, type PromotedCreative } from "@/social/promoted";
import { cn } from "@/lib/utils";

/**
 * THE PROMOTED CARD — the one paid thing on Home, and it says so before it says
 * anything else.
 *
 * ── THE LABEL IS STRUCTURAL, AND HERE IS HOW ─────────────────────────────────
 *
 * `StoryRail.tsx` states the property this file has to reproduce: "StoryViewer
 * cannot draw one of these without drawing the word Promoted, because the
 * branch that draws it is the branch that draws the label." `social/promoted.ts`
 * repeats the instruction for this surface and adds the part a data module
 * cannot do for itself — "do not put an `if` around the label".
 *
 * Two mechanisms, and neither is a convention somebody has to remember:
 *
 *   1. `Identity` BELOW IS THE ONLY FUNCTION IN THIS FILE THAT DRAWS THE
 *      ADVERTISER'S NAME OR THE HEADLINE, and it draws the disclosure first, in
 *      the same unconditional return. There is no branch, no flag and no prop
 *      that produces the words without the label, because there is only one
 *      branch and the label is in it. Deleting the label deletes the copy.
 *   2. THE WORD COMES OFF THE ROW, not out of this file. It renders
 *      `card.disclosure`, a REQUIRED field on `PromotedCreative` with a single
 *      literal type — so a card object that carries a headline and no
 *      disclosure does not type-check and cannot be constructed to pass here.
 *
 * ── WHAT THE MOCKUP ASKED FOR, AND WHAT IT BECAME ────────────────────────────
 *
 * The owner's drawing is an EXAMPLE: eyebrow, big name, a short line, a few
 * fact rows with icons, a call to action, and an x. The shape is kept exactly.
 * The content is not, in two places:
 *
 *   · THE EYEBROW. The drawing's read "EXPEDITION COMPANY" and carried no
 *     disclosure. ICEFALL holds no category for an advertiser — there is no
 *     such column, and the local operator directory is never consulted here
 *     (see the module header: there is no path by which a directory entry
 *     becomes an advertisement) — so an invented category would be a fact about
 *     a business that nobody supplied. The eyebrow carries the label AND the
 *     plain-English description of what it is instead: "Promoted · Paid
 *     placement". Both, in one row, in one branch.
 *   · THE FACT ROWS. The drawing implies rows of product facts — a price, a
 *     date, a duration. NONE OF THAT IS ON THE ROW. `PromotedCreative` carries
 *     three pieces of copy the advertiser wrote and nothing else that describes
 *     a trip, so a fact row here would be a number ICEFALL cannot measure,
 *     printed beside a business's name. The rows instead carry the facts
 *     ICEFALL genuinely holds about this card, all four of them about the
 *     commercial relationship: who paid, that ICEFALL has not vetted them, why
 *     this athlete is seeing it, and what closing it does. That is the same
 *     disclosure `StoryViewer` prints as a paragraph under a promoted slide,
 *     rearranged into the shape the drawing asked for.
 *
 * ── WHAT IS DELIBERATELY NOT DRAWN ───────────────────────────────────────────
 *
 * The fetch hands over more than this card prints, and the omissions are
 * decisions rather than oversights:
 *
 *   · `startsOn` / `endsOn` — the CAMPAIGN's schedule, not an offer's. Printed
 *     on a card it would read as a deadline to act by, which is the scarcity
 *     the constitution forbids outright (00-CONSTITUTION.md:63) and which would
 *     additionally be untrue: the campaign ending is not the trip filling up.
 *   · `declaredGoals` / `countries` — what the advertiser BOUGHT. A reader is
 *     told plainly whether their own objective was involved; the targeting list
 *     itself is the advertiser's commercial detail and one screenshot away from
 *     being a competitor's.
 *   · `companyId` — an opaque key. `companies_select` refuses that row to every
 *     climber, so it is never a link and never resolved.
 *
 * And no figure of any kind appears on this card, so the "never a number
 * ICEFALL cannot measure" rule has nothing to catch here. Nothing counts views
 * on screen: `onShown` writes one row and the card is never told the total.
 *
 * ── INLINE, AND NOTHING ELSE ─────────────────────────────────────────────────
 *
 * It is a `Card` in the page's own flow. No overlay, no scrim over the screen,
 * no sheet, no interstitial, nothing that blocks or dims what is underneath —
 * 00-CONSTITUTION.md:129 for upgrade prompts, and an advertisement has less
 * claim on an athlete's attention than an upgrade prompt does, not more.
 *
 * The x is durable. `UpgradePrompt.tsx:16` forbids "an x that dismisses a thing
 * which then returns tomorrow", so `onDismiss` closes that placement for good —
 * and because a durable x is the opposite of what a reader has been trained to
 * expect from one, the card SAYS SO before they tap it rather than after.
 *
 * ── THE CALL TO ACTION IS NOT THE LOUDEST CONTROL ON THIS SCREEN ─────────────
 *
 * `secondary`, never `primary`. The azure fill is documented in `primitives.tsx`
 * as "the single azure call to action, one per screen, at most" and Home has
 * already spent it on Start session — the athlete's own training. An
 * advertisement out-shouting the session it interrupts is exactly the growth
 * toolkit ICEFALL is built against.
 */
export function PromotedCard({
  card,
  onDismiss,
  onShown,
  className,
}: {
  card: PromotedCreative;
  /** Close this placement for good. See `PROMOTED_DISMISS_IS_FOREVER`. */
  onDismiss: () => void;
  /**
   * Called ONCE per placement, when this card is actually on screen.
   *
   * Not an impression and not a delivery — ICEFALL cannot see a screen. It
   * records that a client asked to record a view, which is the only thing that
   * was measured. See `recordPromotedView`.
   */
  onShown: () => void;
  className?: string;
}) {
  /*
   * Once per placement, on render rather than on fetch.
   *
   * The ref rather than an empty dependency list: `onShown` is memoised on the
   * card in `usePromotedHomeCard`, so it changes identity when the card does,
   * and a bare `[]` would silently stop counting the second campaign a device
   * ever sees. The ref makes the guard about the PLACEMENT, which is what the
   * primary key on `(placement_id, profile_id)` is about too.
   */
  const recorded = useRef<string | null>(null);
  useEffect(() => {
    if (recorded.current === card.id) return;
    recorded.current = card.id;
    onShown();
  }, [card.id, onShown]);

  /*
   * The picture, and why it is allowed to be absent without comment.
   *
   * `imagePath` is a REFERENCE, not a URL: the fetch module says outright that
   * it "does not turn it into a URL and does not know which bucket it belongs
   * to". So this file resolves only the case it can resolve honestly — a path
   * inside this app — and draws nothing for a storage key it would have to
   * guess a bucket and a signing scheme for. A guessed URL is a broken image
   * frame at the top of an advertisement, and the alternative some codebases
   * reach for — a stock mountain photograph standing in — would be ICEFALL
   * supplying imagery for a business it does not vet.
   *
   * A card with no picture is a card with no picture. The layout below expects
   * that as the ordinary case, not as a degraded one.
   */
  const [imageBroken, setImageBroken] = useState(false);
  const imageSrc = imageBroken ? null : inAppImage(card.imagePath);

  return (
    <Card inset={false} className={cn("overflow-hidden", className)}>
      {imageSrc && (
        <div className="relative aspect-[16/9] w-full bg-slate">
          <img
            src={imageSrc}
            alt=""
            aria-hidden
            loading="lazy"
            onError={() => setImageBroken(true)}
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* Dissolves the advertiser's picture into the card rather than
              ending it on a hard edge against the copy below it. */}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-graphite" />
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <Identity card={card} />

          {/*
            The x, and it is a real 44px target.

            Negative margins so the hit area can be generous without the
            eyebrow row growing around it, and it sits at the top of the card
            while the call to action sits at the bottom — the two controls are
            the full height of the copy apart, which is the separation a gloved
            hand needs. It is also never over the photograph: the picture is
            above this row, so there is one position for this button and no
            branch deciding it.
          */}
          <button
            type="button"
            onClick={onDismiss}
            aria-label={`Close this promotion from ${card.companyName}. Closing it is permanent.`}
            className="-mr-2 -mt-2 grid h-11 w-11 shrink-0 place-items-center rounded-full text-mist-dim transition-colors hover:bg-white/[0.06] hover:text-snow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-azure/60"
          >
            <X size={17} strokeWidth={1.8} />
          </button>
        </div>

        {/* ---- The fact rows — every one of them about the money ------------ */}
        <div className="mt-4 space-y-2.5 border-t border-hairline pt-3.5">
          <Fact icon={Megaphone} text={`Paid placement by ${card.companyName}.`} />
          <Fact
            icon={ShieldOff}
            text="ICEFALL does not vet or endorse it, and takes no part in anything you book."
          />
          {/*
            WHY THIS ATHLETE. `audienceMode` is reported rather than hidden, and
            the two sentences are the same ones the story viewer prints, for the
            same reason: "targeted" means an objective they DECLARED matched —
            their own words, typed into their own app — and "general" means
            nothing about them was involved at all. Neither describes an
            inference, because the fetch makes none.
          */}
          {/*
            THREE BRANCHES, BECAUSE THERE ARE THREE TRUTHS.
            This read two ways and told a lie in one of them: `countries` is
            applied to EVERY campaign, not only targeted ones, so a "general"
            placement scoped to GB reached only GB profiles and then printed
            "Nothing about you was used to choose it" — when the reader's own
            declared country is exactly what was used. On the one line of the
            card whose whole job is to be true.
          */}
          {card.audienceMode === "targeted" ? (
            <Fact
              icon={Target}
              text="You are seeing it because of an objective you set yourself — nothing was inferred about you."
            />
          ) : card.countryScoped ? (
            <Fact
              icon={Globe}
              text="You are seeing it because of the country on your profile. Nothing else about you was used."
            />
          ) : (
            <Fact icon={Globe} text="Nothing about you was used to choose it." />
          )}
          {/* Said BEFORE the x is tapped, not discovered after. */}
          <Fact icon={XCircle} text={PROMOTED_DISMISS_IS_FOREVER} />
        </div>

        {/*
          The advertiser's own words on the button, and an in-app destination.

          `ctaHref` is re-checked in the database and again in the fetch — a
          single leading "/", no whitespace, 300 characters at most — so a
          promoted card ICEFALL drew cannot send a climber to another host. This
          is a `Link` for that reason: an `<a href>` would accept anything the
          row happened to contain.
        */}
        <Button asChild variant="secondary" size="lg" className="mt-4 w-full">
          <Link to={card.ctaHref}>
            {card.ctaLabel}
            <ChevronRight size={15} strokeWidth={1.8} />
          </Link>
        </Button>
      </div>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* The one branch that draws the words                                        */
/* -------------------------------------------------------------------------- */

/**
 * THE DISCLOSURE AND THE COPY, IN ONE UNCONDITIONAL RETURN.
 *
 * This is the property `StoryRail.tsx` describes and `social/promoted.ts` asks
 * this surface to reproduce. Nothing else in this file prints `companyName`,
 * `headline` or `body`, and this function prints `card.disclosure` first, above
 * both, with no condition around it. There is no arrangement of props that gets
 * the advertiser's name onto Home without the word, because there is no second
 * branch to get it from.
 *
 * `card.disclosure` rather than the exported `PROMOTED_LABEL` constant on
 * purpose: the field is required and single-valued on `PromotedCreative`, so
 * the type system — not a reviewer — is what guarantees there is a word to
 * draw. Importing the constant here would let a future edit read the label from
 * somewhere the data layer does not control.
 *
 * ORDER: label, then who paid, then what they are saying. The drawing put the
 * name largest and that is kept — an advertiser a reader has to hunt for is not
 * a disclosed advertiser — with the headline immediately under it at reading
 * size, and the optional body under that.
 */
function Identity({ card }: { card: PromotedCreative }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="inline-flex items-center rounded-pill border border-hairline-strong bg-white/[0.04] px-2.5 py-1 text-[9.5px] uppercase tracking-[0.16em] text-snow">
          {card.disclosure}
        </span>
        <span className="section-label text-mist-dim">Paid placement</span>
      </div>

      <h3 className="mt-3 text-[23px] font-light leading-tight text-snow">{card.companyName}</h3>

      <p className="mt-1.5 text-[14px] leading-snug text-snow/90">{card.headline}</p>

      {/* Optional by contract, and absent is ordinary — never a reserved line. */}
      {card.body && (
        <p className="mt-2 text-[12.5px] leading-relaxed text-mist">{card.body}</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

/** One row of the disclosure block: an icon, and one true sentence. */
function Fact({ icon: Icon, text }: { icon: typeof Megaphone; text: string }) {
  return (
    <div className="flex gap-2.5">
      <Icon size={13} strokeWidth={1.6} className="mt-[2px] shrink-0 text-mist-dim" />
      <p className="min-w-0 flex-1 text-[11.5px] leading-relaxed text-mist">{text}</p>
    </div>
  );
}

/**
 * An `imagePath` this app can actually load, or null.
 *
 * Accepts one shape — an absolute path inside this app — and refuses everything
 * else, including a protocol-relative `//host/…`, which is a remote origin
 * wearing a leading slash. A storage key like `creatives/abc.jpg` returns null
 * rather than being guessed at: this file does not know the bucket, and an
 * advertisement whose picture is a broken frame is worse than one without a
 * picture.
 */
function inAppImage(path: string | null): string | null {
  if (!path) return null;
  const trimmed = path.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (/\s/.test(trimmed)) return null;
  return trimmed;
}
