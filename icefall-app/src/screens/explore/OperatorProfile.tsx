import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowUpRight, ChevronRight, Landmark, MessageSquare, TriangleAlert } from "lucide-react";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, Stagger } from "@/components/layout/chrome";
import { MountainThumb } from "@/components/domain/MountainImage";
import { cn } from "@/lib/utils";
import { fmtElevation } from "@/lib/format";
import { ACCESS_DISCLAIMER, accessFor, operatorSearchUrl } from "@/services/expeditionAccess";
import { OPERATOR_DISCLAIMER, operatorById, type Operator } from "@/services/operators";

/**
 * One operator listing, in full — the destination behind "View profile & chat".
 *
 * WHAT THIS SCREEN IS ALLOWED TO SAY
 *
 * Every entry in `operators.ts` is `sample: true` and named "<Region> — sample
 * listing". There is no real company behind any of them, ICEFALL has no
 * operator partnerships, and nothing composed here is transmitted anywhere.
 * Someone can land on this route from a shared link with no other context, so
 * the sample treatment is the second thing on the page, above the fold, in the
 * accent colour — not a footnote under the action.
 *
 * DELIBERATELY ABSENT, AND WHY
 *
 *  · No star rating and no review count. There are no reviews. A rating is
 *    user-generated content that does not exist here, and inventing one would
 *    be the single number a climber books on.
 *  · No verification tick, "vetted" or "approved" mark of any kind. ICEFALL
 *    checks nobody — not certification, not insurance, not permits.
 *  · No years in business, founding date, team size or summit count. These are
 *    unverifiable business claims, and for a listing that isn't a business they
 *    are simply fiction.
 *  · No member counts, avatar stacks or "24 climbers enquired" — fabricated
 *    social proof aimed at a decision that can kill someone.
 *  · No "premium partner", featured slot or sponsored ranking. There is no
 *    commercial relationship to disclose, and paid placement at the top of a
 *    safety-critical directory would be a conflict of interest even if there
 *    were one.
 *  · No operator logo or expedition photography. A generated mark would look
 *    like a brand that exists; the monogram tile is plainly a placeholder.
 *
 * WHAT REPLACES IT
 *
 * The things that actually decide who to trust at altitude, all of them
 * checkable: the certification to insist on, the national authority that issues
 * the permit, the country's practicalities, and the questions to put to any
 * operator in writing before money moves. Those come from `expeditionAccess.ts`
 * and are real.
 */

/* -------------------------------------------------------------------------- */
/* Enquiry context                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The objective the reader arrived with, if any.
 *
 * `ComposeEnquiry` bounces straight back to /inbox without a peak name, so the
 * message action is only offered when there is genuinely something to enquire
 * about. An enquiry with no objective is not a thing an operator could answer.
 */
interface EnquiryContext {
  peakName: string;
  /** 0 when the caller passed no elevation — never guessed. */
  elevationM: number;
  goalId?: string;
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

/* -------------------------------------------------------------------------- */
/* Mark                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * Initials for the tile.
 *
 * Built from the words before the dash — the region — so the tile doesn't read
 * "SL" for every listing in the directory. A monogram, never a logo: a drawn
 * mark would imply a brand, and there is no brand.
 */
function monogram(name: string): string {
  const head = name.split(/[—–-]/)[0];
  const words = head
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9]/g, ""))
    .filter((w) => w.length > 0);

  const initials = words
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return initials !== "" ? initials : (Array.from(name.trim())[0] ?? "?").toUpperCase();
}

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
  /**
   * Which country's permit rules to show. The listing's own regions, or — for
   * the multi-range fallback listing, which claims no region — whatever country
   * the objective supplied. ICEFALL never widens a listing's coverage itself.
   */
  const countries = useMemo(() => {
    if (operator.regions.length > 0) return operator.regions;
    const c = contextCountry?.trim();
    return c !== undefined && c !== "" ? [c] : [];
  }, [operator.regions, contextCountry]);

  const [picked, setPicked] = useState<string | null>(null);

  // Typed explicitly: `countries[0]` is `string` to the compiler but undefined
  // on the empty multi-range listing, and the empty case is a real branch.
  const fallbackCountry = useMemo<string | undefined>(() => {
    if (contextCountry !== undefined && countries.includes(contextCountry)) return contextCountry;
    // Lead with a country ICEFALL actually holds guidance for, so the section
    // opens with something useful rather than an empty state.
    const informative = countries.find((c) => {
      const a = accessFor({ country: c, requiresGuide: false, elevationM: 0 });
      return a.authority !== undefined || a.notes.length > 0;
    });
    return informative ?? countries[0];
  }, [countries, contextCountry]);

  // Falls back automatically when the chosen country is no longer on offer,
  // e.g. the route param changed to a different listing under the same screen.
  const country = picked !== null && countries.includes(picked) ? picked : fallbackCountry;

  const access = useMemo(
    () =>
      country !== undefined
        ? accessFor({ country, requiresGuide: false, elevationM: operator.minElevationM })
        : null,
    [country, operator.minElevationM],
  );

  /**
   * The universal pre-booking questions.
   *
   * `UNIVERSAL` is private to expeditionAccess, but `accessFor` with no country
   * returns exactly that list — so the wording stays single-sourced instead of
   * being retyped here, where it would quietly drift out of date.
   */
  const questions = useMemo(() => accessFor({ requiresGuide: true, elevationM: 0 }).notes, []);

  const searchSubject = ctx?.peakName ?? country ?? "";

  return (
    <Screen>
      <ScreenHeader title="Operator profile" back="/explore/expeditions" />

      <Stagger>
        {/* ---------------------------------------------------------------- */}
        {/* Identity                                                          */}
        {/* ---------------------------------------------------------------- */}
        <Rise>
          <Card className="flex items-start gap-4">
            <span
              aria-hidden="true"
              className="grid h-14 w-14 shrink-0 place-items-center rounded-tile border border-hairline bg-elevated/40 text-[15px] font-medium tracking-[0.1em] text-mist"
            >
              {monogram(operator.name)}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-[19px] font-light leading-snug tracking-[-0.02em] text-snow">
                {operator.name}
              </h2>
              <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                Expedition operator listing
              </p>
              <div className="mt-3">
                <Badge tone="azure">Sample listing</Badge>
              </div>
            </div>
          </Card>
        </Rise>

        {/* ---------------------------------------------------------------- */}
        {/* The sample treatment — above the fold, before anything else.      */}
        {/* Every listing is typed `sample: true`, so there is no non-sample  */}
        {/* branch to design for yet; when a real partner exists this panel   */}
        {/* is what gets a condition, not a redesign.                         */}
        {/* ---------------------------------------------------------------- */}
        <Rise className="pt-3">
          <Card className="border-azure/25 bg-azure/[0.04]">
            <div className="flex gap-3">
              <TriangleAlert size={16} strokeWidth={1.6} className="mt-px shrink-0 text-azure" />
              <div className="min-w-0">
                <p className="section-label text-azure/85">This is not a real company</p>
                <ul className="mt-3 space-y-2.5">
                  {[
                    "An illustrative listing, shown so you can see how an operator appears in ICEFALL. No business of this name is connected to the app.",
                    "ICEFALL has no operator partnerships. It does not vet, inspect, endorse or rank anyone, and takes no payment for expeditions.",
                    "Nothing sent from this profile reaches a business. Enquiries are drafted and kept on this device; no reply will ever arrive.",
                  ].map((line) => (
                    <li key={line} className="flex gap-3 text-[13px] leading-relaxed text-snow/85">
                      <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-azure/70" />
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
          <Disclaimer className="mt-4">{OPERATOR_DISCLAIMER}</Disclaimer>
        </Rise>

        {/* ---------------------------------------------------------------- */}
        {/* What the listing states — claims, labelled as claims.             */}
        {/* No rating, no review count, no years in business, no team size:   */}
        {/* the model holds none of it and none of it would be checkable.     */}
        {/* ---------------------------------------------------------------- */}
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
              <Fact
                label="Typical response"
                value={`Within ${operator.responseHours} hours`}
                numeric
              />
            </dl>
          </Card>
          <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
            Stated by the listing, checked by nobody. IFMGA/UIAGM is the only internationally
            recognised mountain guide qualification — ask any real operator for the guide's carnet
            number and confirm it with the national guides association yourself.
          </p>
        </Rise>

        {/* ---------------------------------------------------------------- */}
        {/* Permits — the genuinely checkable part of this screen.            */}
        {/* ---------------------------------------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>Permits & access</SectionLabel>

          {countries.length > 1 && (
            <div className="no-scrollbar mt-3 flex gap-2 overflow-x-auto">
              {countries.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={c === country}
                  onClick={() => setPicked(c)}
                  className={cn(
                    "shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] transition-colors",
                    c === country
                      ? "border-azure/50 bg-azure/10 text-azure"
                      : "border-hairline text-mist hover:border-hairline-strong hover:text-snow",
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <Card className="mt-3">
            {country === undefined ? (
              <p className="text-[13px] leading-relaxed text-mist">
                Permit rules follow the mountain, not the operator. Open a peak in Explore to see
                the authority that governs it — the questions below apply wherever you climb.
              </p>
            ) : access?.authority !== undefined ? (
              <div className="flex gap-3">
                <Landmark size={15} strokeWidth={1.5} className="mt-0.5 shrink-0 text-azure" />
                <div className="min-w-0">
                  <p className="section-label">{country}</p>
                  <p className="mt-2 text-[13px] leading-relaxed text-snow">{access.authority}</p>
                  {access.authorityNote !== undefined && (
                    <p className="mt-1.5 text-[12px] leading-relaxed text-mist">
                      {access.authorityNote}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-[13px] leading-relaxed text-mist">
                {/* An absence in the data is not evidence that nothing is required
                    — some of these countries have no central system, others
                    ICEFALL simply has not recorded. Saying which would be a
                    guess, so the copy says neither. */}
                No central permit authority is recorded for {country}. That may be because none
                exists, or because ICEFALL does not hold it — confirm with the local guides office
                and the land manager for the specific peak.
              </p>
            )}

            {access !== null && access.notes.length > 0 && (
              <ul className="mt-4 space-y-2.5 border-t border-hairline pt-4">
                {access.notes.map((n) => (
                  <li key={n} className="flex gap-3 text-[12px] leading-relaxed text-mist">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-mist-dim" />
                    {n}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Rise>

        {/* ---------------------------------------------------------------- */}
        {/* The questions — worth more than any rating this screen refuses.   */}
        {/* ---------------------------------------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>Ask before you book</SectionLabel>
          <Card className="mt-3">
            <ol className="space-y-3.5">
              {questions.map((q, i) => (
                <li key={q} className="flex gap-3">
                  <span className="tnum mt-px w-3 shrink-0 text-[11px] text-azure/70">{i + 1}</span>
                  <p className="flex-1 text-[12px] leading-relaxed text-mist">{q}</p>
                </li>
              ))}
            </ol>
          </Card>
        </Rise>

        {/* ---------------------------------------------------------------- */}
        {/* Enquiry                                                           */}
        {/* ---------------------------------------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>Enquiry</SectionLabel>
          {ctx !== null ? (
            <>
              <Card className="mt-3 flex items-center gap-3.5">
                <MountainThumb
                  peak={{
                    name: ctx.peakName,
                    elevationM: ctx.elevationM > 0 ? ctx.elevationM : undefined,
                  }}
                  size={44}
                />
                <div className="min-w-0 flex-1">
                  <p className="section-label">Your objective</p>
                  <p className="mt-1.5 truncate text-[14px] text-snow">{ctx.peakName}</p>
                  {ctx.elevationM > 0 && (
                    <p className="tnum mt-0.5 text-[11px] text-mist-dim">
                      {fmtElevation(ctx.elevationM)} m
                    </p>
                  )}
                </div>
              </Card>
              <Button asChild className="mt-3 w-full">
                <Link to={composeHref(operator.id, ctx)}>
                  <MessageSquare size={15} strokeWidth={1.8} />
                  Message this operator
                </Link>
              </Button>
              <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
                Opens a draft asking the questions above. It is saved to your enquiries on this
                device and is not transmitted — this listing has no inbox.
              </p>
            </>
          ) : (
            <>
              <Card className="mt-3">
                <p className="text-[13px] leading-relaxed text-mist">
                  An enquiry needs an objective — the peak, the season and the elevation are what an
                  operator answers. Open a mountain first and message from there.
                </p>
              </Card>
              <Button asChild variant="secondary" className="mt-3 w-full">
                <Link to="/explore">
                  Choose a mountain
                  <ChevronRight size={15} strokeWidth={1.8} />
                </Link>
              </Button>
            </>
          )}
        </Rise>

        {/* ---------------------------------------------------------------- */}
        {/* The outbound route to operators that actually exist.              */}
        {/* ---------------------------------------------------------------- */}
        <Rise className="pt-6">
          <SectionLabel>Find a real operator</SectionLabel>
          <a
            href={operatorSearchUrl(searchSubject)}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-3 flex items-center gap-2.5 rounded-card border border-hairline bg-graphite px-4 py-3.5 text-[13px] text-mist transition-colors hover:border-azure/50 hover:text-snow"
          >
            <span className="flex-1">
              Search IFMGA-certified operators
              {searchSubject !== "" && <span className="text-snow"> · {searchSubject}</span>}
            </span>
            <ArrowUpRight size={15} strokeWidth={1.6} className="shrink-0" />
          </a>
          <p className="mt-3 text-[11px] leading-relaxed text-mist-dim">
            {/* Points at the authority only when one was actually named above.
                A cross-reference to something this screen never showed is a
                dead instruction, and this is the instruction that matters. */}
            Cross-check anyone you find with the national guides association and
            {access?.authority !== undefined
              ? " the permit authority named above"
              : " the permit authority for the country you are climbing in"}{" "}
            before you send money.
          </p>
        </Rise>

        <Rise className="pt-6">
          <Disclaimer>{ACCESS_DISCLAIMER}</Disclaimer>
        </Rise>

        <Rise className="pt-5">
          <Link to="/messages">
            <Button variant="secondary" className="w-full">
              <MessageSquare size={15} strokeWidth={1.8} />
              Open your enquiries
            </Button>
          </Link>
        </Rise>
      </Stagger>
    </Screen>
  );
}

/* -------------------------------------------------------------------------- */
/* Pieces                                                                      */
/* -------------------------------------------------------------------------- */

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
 * Rendered as a designed state rather than a redirect: someone following a
 * stale share link deserves to be told the listing doesn't exist — and, more
 * importantly, that none of them ever did.
 */
function UnknownListing() {
  return (
    <Screen>
      <ScreenHeader title="Operator profile" back="/explore/expeditions" />
      <Stagger>
        <Rise>
          <Card>
            <p className="text-[14px] leading-relaxed text-snow">No listing with that reference.</p>
            <p className="mt-2 text-[13px] leading-relaxed text-mist">
              The directory holds sample listings only — illustrations of how an operator would
              appear. None of them is a real company, and ICEFALL has no operator partnerships.
            </p>
          </Card>
        </Rise>
        <Rise className="pt-4">
          <Disclaimer>{OPERATOR_DISCLAIMER}</Disclaimer>
        </Rise>
        <Rise className="pt-5">
          <Button asChild variant="secondary" className="w-full">
            <Link to="/explore/expeditions">
              Back to the directory
              <ChevronRight size={15} strokeWidth={1.8} />
            </Link>
          </Button>
        </Rise>
      </Stagger>
    </Screen>
  );
}
