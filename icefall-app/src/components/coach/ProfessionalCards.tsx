import { Link } from "react-router-dom";
import { ChevronRight, ExternalLink } from "lucide-react";

import { Badge, Disclaimer } from "@/components/ui/primitives";
import { Eyebrow } from "@/screens/coach/shell";
import { GuideRow } from "@/screens/guides/shared";
import { cn } from "@/lib/utils";
import {
  COACH_NO_GUIDES_NOTICE,
  FEATURED_SLOT_NOTICE,
  GUIDE_CARD_NOTICE,
  GUIDE_NO_SEND_NOTICE,
  NOT_EXPEDITION_GROUND_NOTICE,
  OPERATOR_CARD_NOTICE,
  type Operator,
  type ProfessionalShortlist,
} from "@/coach/professionals";

/**
 * GUIDES AND COMPANIES, UNDER THE MESSAGE THAT WAS ASKED ABOUT THEM.
 *
 * ============================================================================
 * WHY THESE ARE CARDS WHEN ALMOST NOTHING ELSE HERE IS
 * ============================================================================
 *
 * The owner's rule is flat rows and spacing, and a bordered card only for a
 * genuinely distinct object. A guide is a person and a company is a business:
 * each is one bounded thing with a name, a claim and a place to go, sitting in
 * a list of others like it. That is the case the exception was written for.
 * The PROSE above them stays unboxed, exactly as `PlanChangeRows` leaves it.
 *
 * ============================================================================
 * NOTHING HERE COMES FROM THE MODEL
 * ============================================================================
 *
 * Every name, figure, badge and link below is read out of the catalogue by
 * `@/coach/professionals`. The model chose to answer a question about hiring
 * somebody; it did not choose who appears, in what order, or what is said
 * about them. If its prose and these cards ever disagreed, the cards are the
 * record — which is why the prompt tells it not to repeat the list.
 *
 * ============================================================================
 * THE FEATURED SLOT IS A SEPARATE SECTION, AND IT IS GOLD
 * ============================================================================
 *
 * Rule 4, and the app's own colour rule: azure is the athlete's own things,
 * gilt means somebody is selling you this. So the coach's own picks are under
 * an azure eyebrow, and anything promoted is under its own gilt heading BELOW
 * them, with the word FEATURED on the card. They never share a list and they
 * never share a scale — `rankGuides` ignores the flag outright, so a featured
 * guide cannot rise a single place.
 *
 * THE COPY DOES NOT SAY "PAID", because nothing is. One real company carries
 * the flag by the owner's editorial choice and no money has changed hands, so
 * calling it a paid placement would invent a commercial relationship and
 * attach it to a named business. `FEATURED_SLOT_NOTICE` says the two things
 * that are true instead, in one place, ready for the day one is sold.
 *
 * ============================================================================
 * THE TWO CARDS HAVE DIFFERENT ACTIONS BECAUSE THEY HAVE DIFFERENT TRUTHS
 * ============================================================================
 *
 * An operator card offers ENQUIRE. That is real: `@/enquiries/send` files it
 * against the mountain and it reaches ICEFALL's desk, and the compose screen
 * says plainly that the desk is not the company.
 *
 * A guide card offers NO send at all, and says why. `@/guides/store` writes a
 * request to `localStorage` and notifies nobody. A matching button here would
 * be the worst kind of working-looking control: somebody who believes a guide
 * is engaged travels, or walks onto a glacier expecting to be met.
 */
export function ProfessionalCards({ shortlist }: { shortlist: ProfessionalShortlist }) {
  const s = shortlist;
  const hasGuides = s.guides.length > 0 || s.featuredGuides.length > 0;
  const hasOperators = s.operators.length > 0 || s.featuredOperators.length > 0;

  // Nothing to draw and nothing to explain — the reply said it all.
  if (!hasGuides && !hasOperators && !s.guideCatalogueEmpty) return null;

  return (
    <div className="mt-3 border-t border-hairline pt-3">
      {/* ---- Guides ------------------------------------------------------ */}

      {hasGuides ? (
        <>
          <Eyebrow className="!text-azure/70">
            {s.objectiveName ? `Guides for ${s.objectiveName}` : "Guides"}
          </Eyebrow>
          <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{GUIDE_CARD_NOTICE}</p>

          <div className="mt-2.5 space-y-2.5">
            {s.guides.map(({ guide, match }) => (
              <GuideRow
                key={guide.id}
                guide={guide}
                match={match}
                to={`/explore/guides/${guide.id}`}
              />
            ))}
          </div>

          <p className="mt-2.5 text-[11px] leading-relaxed text-mist-dim">{GUIDE_NO_SEND_NOTICE}</p>

          {s.featuredGuides.length > 0 && (
            <div className="mt-4">
              <PaidSlotHeading>Featured</PaidSlotHeading>
              <div className="mt-2.5 space-y-2.5">
                {s.featuredGuides.map(({ guide, match }) => (
                  <GuideRow
                    key={guide.id}
                    guide={guide}
                    match={match}
                    to={`/explore/guides/${guide.id}`}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        /*
         * THE HONEST EMPTY STATE, WHICH IS THE PRODUCTION STATE.
         *
         * No guide has listed with ICEFALL, so the shipped app shows this and
         * not a ranking. It is drawn rather than left to the prose because the
         * prose can be a model's, and this sentence must be the app's — it is
         * the one that sends somebody to a real register instead of to a name
         * ICEFALL made up.
         */
        s.guideCatalogueEmpty && (
          <>
            <Eyebrow className="!text-mist">No guides listed</Eyebrow>
            <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{COACH_NO_GUIDES_NOTICE}</p>
          </>
        )
      )}

      {/* ---- Operators --------------------------------------------------- */}

      {hasOperators && (
        <div className={cn(hasGuides || s.guideCatalogueEmpty ? "mt-5" : "")}>
          <Eyebrow className="!text-azure/70">Expedition companies</Eyebrow>
          {/* Not ranked, and the athlete is told so before they read a list
              whose order they would otherwise assume means something. */}
          <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">
            Not ranked. ICEFALL holds no price, ratio, route or season for any company, so there is
            nothing honest to sort them by — this is alphabetical within the region.
          </p>

          <div className="mt-2.5 space-y-2.5">
            {s.operators.map((o) => (
              <OperatorCard key={o.id} operator={o} shortlist={s} />
            ))}
          </div>

          {s.featuredOperators.length > 0 && (
            <div className="mt-4">
              <PaidSlotHeading>Featured</PaidSlotHeading>
              <div className="mt-2.5 space-y-2.5">
                {s.featuredOperators.map((o) => (
                  <OperatorCard key={o.id} operator={o} shortlist={s} featured />
                ))}
              </div>
            </div>
          )}

          <Disclaimer className="mt-2.5">{OPERATOR_CARD_NOTICE}</Disclaimer>
        </div>
      )}

      {!hasOperators && s.operatorAbsence === "not-expedition-ground" && (
        <p className={cn("text-[11px] leading-relaxed text-mist-dim", hasGuides && "mt-4")}>
          {NOT_EXPEDITION_GROUND_NOTICE}
        </p>
      )}
    </div>
  );
}

/**
 * The gilt heading over a promoted section.
 *
 * The word and the colour do the same job twice on purpose. Somebody skimming
 * reads the gold and somebody reading reads the sentence, and a client cannot
 * tell a bought position from a qualification without being told either way.
 */
function PaidSlotHeading({ children }: { children: React.ReactNode }) {
  return (
    <>
      <p className="inline-flex items-center gap-1.5 rounded-pill border border-gilt/45 bg-gilt/[0.12] px-2 py-[3px] text-[9.5px] font-medium uppercase tracking-[0.12em] text-gilt">
        {children}
      </p>
      <p className="mt-1.5 text-[11px] leading-relaxed text-mist-dim">{FEATURED_SLOT_NOTICE}</p>
    </>
  );
}

/**
 * One company.
 *
 * WHAT IS ON IT IS WHAT THE RECORD HOLDS AND NO MORE. A real listing carries a
 * name, what it is registered or certified as, the ground it works and a link
 * to its own site. There is no rating, no price, no response time and no
 * departure date, because ICEFALL has measured none of those and inventing one
 * about an identifiable business is the mistake this directory has already
 * made once.
 */
function OperatorCard({
  operator,
  shortlist,
  featured = false,
}: {
  operator: Operator;
  shortlist: ProfessionalShortlist;
  featured?: boolean;
}) {
  const peak = shortlist.objectiveName ?? "";
  const elevation = shortlist.elevationM ?? 0;

  /*
   * ENQUIRE IS OFFERED ONLY WHERE IT COULD WORK.
   *
   * `sendEnquiry` files against the MOUNTAIN, and a sample listing is not a
   * company — an enquiry naming one would put a placeholder into a commercial
   * queue. So the button appears for a real listing about a placeable
   * objective, and the sample listings carry the sentence instead.
   */
  const canEnquire = operator.sample !== true && operator.demo !== true && peak !== "";

  return (
    <div
      className={cn(
        "rounded-card border bg-graphite p-3.5",
        featured ? "border-gilt/35" : "border-hairline",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="min-w-0 truncate text-[15px] font-light leading-tight text-snow">
              {operator.name}
            </h3>
            {operator.demo && <Badge tone="azure">Demo</Badge>}
            {operator.sample && <Badge tone="neutral">Sample listing</Badge>}
            {featured && (
              <span className="rounded-pill border border-gilt/45 bg-gilt/[0.12] px-2 py-[2px] text-[9.5px] font-medium uppercase tracking-[0.12em] text-gilt">
                Featured
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[12px] leading-relaxed text-mist">{operator.certification}</p>
          {operator.regions.length > 0 && (
            <p className="mt-1 truncate text-[11px] text-mist-dim">
              {operator.regions.join(" · ")}
            </p>
          )}
        </div>
        <Link
          to={`/operator/${operator.id}`}
          aria-label={`${operator.name} profile`}
          className="shrink-0 text-mist-dim transition-colors hover:text-snow"
        >
          <ChevronRight size={16} strokeWidth={1.6} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3">
        {operator.website ? (
          <a
            href={operator.website}
            target="_blank"
            rel="noreferrer noopener"
            className="inline-flex items-center gap-1.5 text-[12px] text-azure"
          >
            Their own site
            <ExternalLink size={13} strokeWidth={1.7} aria-hidden="true" />
          </a>
        ) : (
          <span />
        )}

        {canEnquire ? (
          <Link
            to={`/inbox/new?operator=${encodeURIComponent(operator.id)}&peak=${encodeURIComponent(
              peak,
            )}&elevation=${elevation}`}
            className="shrink-0 rounded-full border border-azure/45 px-3.5 py-1.5 text-[12px] text-azure transition-colors hover:bg-azure/10"
          >
            Enquire
          </Link>
        ) : (
          <span className="shrink-0 text-[11px] text-mist-dim">
            {operator.sample || operator.demo ? "Nothing to write to" : "No objective set"}
          </span>
        )}
      </div>
    </div>
  );
}
