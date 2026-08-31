/**
 * The mountain page editor — the third of three, and deliberately not a twin.
 *
 * ── WHY THIS SCREEN IS SHAPED DIFFERENTLY ───────────────────────────────────
 *
 * The company editor and the trip editor both open on a record the operator
 * owns and can type into. This one does not, and pretending otherwise would be
 * the lie the whole portal is built to avoid.
 *
 * An operator's block on an ICEFALL mountain page is ENTIRELY DERIVED.
 * `icefall-web/src/app/MountainDetail.tsx`'s `TripRow` draws six things — the
 * company mark, the company name, the trip's objective, the rating, the
 * from-price and the duration — and every one of them is read from the company
 * record or the product record. There is no per-mountain, operator-authored
 * content anywhere: `CompanyMountain` is the authorization boundary and nothing
 * else ("No position, no price, no term"), and inventing a schema field to give
 * this screen something to edit is not this session's to do.
 *
 * So the question this screen answers is not "what do you want to write here".
 * It is the question an operator looking at their Everest listing actually
 * asks, and which nothing else in the portal answers:
 *
 *     HOW DO I APPEAR ON THIS MOUNTAIN, AND WHERE IS EACH PART OF IT SET?
 *
 * The rail names the parts of the block a climber sees and says where each one
 * really lives. The centre draws the block. The inspector either hands over the
 * link to the screen that genuinely edits that part, or says plainly that the
 * part is ICEFALL's — a padlocked statement, never a disabled input, because a
 * greyed control reads as "ask us and we'll enable it".
 *
 * ── WHAT IS NOT REPRODUCED, AND WHY ─────────────────────────────────────────
 *
 * THE GILT "BEST MATCH" TREATMENT IS EXPLAINED IN WORDS AND NOT DRAWN. The web
 * page gives it to the FIRST listing when there is more than one, and its order
 * comes from how specifically each listing covers the peak — across every
 * company on the page. This portal can see one company's trips and nobody
 * else's, so it cannot know whether this operator's block is first. Drawing the
 * badge would be inventing a rank; drawing an "ordinary" card and calling it
 * faithful would be quietly promising they never get it. The card is drawn as
 * it stands for every listing, and the gilt state is described where it can be
 * described honestly — in the Position inspector, as ICEFALL's award and not a
 * switch.
 *
 * THE RATING IS DRAWN AS AN ABSENCE, not as a figure and not as "No ratings
 * published". Ratings are climbers' writing, computed by ICEFALL; no rating or
 * review count reaches this portal at all. Printing either the number or the
 * page's no-ratings sentence would be this screen claiming to know something it
 * does not, so the one line it cannot draw faithfully says so, in the space the
 * line occupies.
 *
 * ── PLACEMENT ───────────────────────────────────────────────────────────────
 *
 * `canEditPlacement()` is false for every operator, every role, every mountain,
 * always, and the backend exposes no placement mutation. Nothing on this screen
 * changes that, implies it, or offers it.
 *
 * ── THE DARK CENTRE ─────────────────────────────────────────────────────────
 *
 * The portal is light. The mountain page is not — `icefall-web` paints obsidian
 * with snow text — and the centre pane DEPICTS that page rather than being a
 * piece of portal chrome, exactly as `TripAppPreview.tsx` and
 * `CompanyPreview.tsx` already do. The palette below is copied from
 * `icefall-web/src/index.css` and is CONTENT. Nothing outside the depicted page
 * touches it, and the editor's own selection outline stays on the portal's
 * azure, because that belongs to the editor and not to the page being read.
 */

import { ArrowLeft, ChevronRight, ExternalLink, Lock, Minus, Star } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, LockedNotice, Notice, WEB_ASSET_ORIGIN, formatMoney } from "@/components/ui";
import { can, canManageMountain } from "@/domain/authz";
import { formatDay } from "@/domain/dates";
import { OPERATOR_NOTICES } from "@/domain/honesty";
import { placementFor, placementStatus } from "@/domain/placement";
import { SECTION_STATE_COLOUR, SECTION_STATE_LABEL, type SectionState } from "@/editor/sections";
import type { ContentVersion, Product } from "@/domain/types";
import { OFFLINE } from "@/offline/offline";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

/* -------------------------------------------------------------------------- */
/* The depicted page's palette — content, not chrome. See the header.         */
/* -------------------------------------------------------------------------- */

const WEB = {
  obsidian: "oklch(0.1277 0.0108 259.6)", // page canvas
  graphite: "oklch(0.1814 0.0158 261.5)", // cards
  slate: "oklch(0.2213 0.0192 262.1)", // the monogram tile
  snow: "oklch(0.9481 0.0103 261.8)", // primary text
  mist: "oklch(0.6653 0.0287 264.4)", // secondary text
  mistDim: "oklch(0.4986 0.0309 264.2)", // tertiary text
  hairline: "oklch(1 0 0 / 7%)",
  hairlineStrong: "oklch(1 0 0 / 12%)",
} as const;

/* -------------------------------------------------------------------------- */
/* The rail                                                                   */
/* -------------------------------------------------------------------------- */

type RowKey = "mark" | "name" | "trip" | "rating" | "price" | "position" | "film" | "pitch";

/**
 * How a row's trailing indicator behaves.
 *
 *   state     — the row has a real publication state, so it carries a dot.
 *   locked    — nothing here is editable from the portal. A padlock, not a dot.
 *   notStored — ICEFALL has no field for this yet. Neither a dot nor a padlock,
 *               because both would say the thing exists and is merely shut.
 */
type Indicator = "state" | "locked" | "notStored";

interface RailRow {
  key: RowKey;
  label: string;
  /** WHERE IT IS SET. The whole reason this screen exists. */
  source: string;
  indicator: Indicator;
}

const ROWS: readonly RailRow[] = [
  { key: "mark", label: "Your mark", source: "Company profile", indicator: "state" },
  { key: "name", label: "Company name", source: "Icefall", indicator: "locked" },
  { key: "trip", label: "The trip shown", source: "This trip", indicator: "locked" },
  { key: "rating", label: "Rating", source: "Icefall", indicator: "locked" },
  { key: "price", label: "Price & duration", source: "This trip", indicator: "state" },
  { key: "position", label: "Position on this page", source: "Icefall", indicator: "locked" },
  { key: "film", label: "Promotional film", source: "Nowhere yet", indicator: "notStored" },
  { key: "pitch", label: "Your pitch for this mountain", source: "Nowhere yet", indicator: "notStored" },
] as const;

/** The fields on a product that the block actually draws. */
const PRICE_FIELDS = ["priceFromCents", "priceToCents", "durationDays", "seasonality"] as const;

/** Fields with a pending submission, for one entity only. */
function pendingFieldsFor(versions: readonly ContentVersion[], entityId: string): Set<string> {
  const out = new Set<string>();
  for (const v of versions) {
    if (v.state !== "pending" || v.entityId !== entityId) continue;
    for (const f of v.changedFields) out.add(f);
    for (const f of Object.keys(v.payload)) out.add(f);
  }
  return out;
}

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/* -------------------------------------------------------------------------- */

export default function MountainEditor() {
  const { id = "" } = useParams();
  const session = useSession();
  const navigate = useNavigate();
  const { backend, company, access, placements, mountains, revision } = useOperator();

  const products = useAsync(() => backend.getProducts(session), [session, revision], []);
  const productVersions = useAsync(() => backend.getVersions(session, "product"), [session, revision], []);
  const companyVersions = useAsync(() => backend.getVersions(session, "company"), [session, revision], []);
  /*
   * The company's mark, resolved THROUGH THE BACKEND rather than composed here.
   * `getMediaUrl` is session-scoped and returns null for an asset that is not
   * this company's or is not yet approved, so an unapproved logo cannot appear
   * on a depiction whose whole job is to show what a climber sees.
   */
  const companyLogoUrl = useAsync(
    () => backend.getMediaUrl(session, company?.logoMediaId ?? null),
    [session, company?.logoMediaId, revision],
    null,
  );

  const [selected, setSelected] = useState<RowKey>("mark");
  /** Which card the inspector is talking about, when a company lists several. */
  const [focusId, setFocusId] = useState<string | null>(null);

  const mountain = mountains.find((m) => m.id === id);
  const assignment = access.find((a) => a.mountainId === id);

  /**
   * TWO LISTS, AND THE DIFFERENCE IS THE WHOLE HONESTY OF THE CENTRE PANE.
   *
   * `mine` is every trip this company holds on the mountain. `shown` is the
   * ones a climber actually meets — LIVE ONLY. A draft or a trip in review is
   * not on the page, and drawing it in a pane titled "your block" would tell an
   * operator they are published when they are not, which is the single worst
   * thing this screen could say.
   */
  const mine = useMemo(
    () => products.filter((p) => p.mountainIds.includes(id) && p.status !== "archived"),
    [products, id],
  );
  const shown = useMemo(() => mine.filter((p) => p.status === "live"), [mine]);

  const focused: Product | null =
    mine.find((p) => p.id === focusId) ?? shown[0] ?? mine[0] ?? null;

  /* ---- the two guards, in the order they matter ------------------------- */

  if (!mountain || !assignment) {
    return (
      <Refusal
        title="Icefall has not assigned this mountain to your company"
        detail="There is no listing of yours on this page, so there is nothing here to explain. If you think that is wrong, reply to your Icefall contact."
      />
    );
  }

  /*
   * ACCESS, NOT PLACEMENT. `canManageMountain` mirrors
   * `company_may_edit_mountain` and requires an ACTIVE assignment. A company
   * whose access has ended keeps its trips and its history — which is why this
   * sends them to the mountain workspace, where all of it is still readable,
   * rather than telling them it is gone.
   */
  if (!canManageMountain(session, access, id)) {
    return (
      <Refusal
        title={`Your Icefall arrangement for ${mountain.name} has ended`}
        detail="Your trips, enquiries and bookings on this mountain are kept exactly as they are and stay readable in the mountain workspace. This screen is about changing how you appear, so it is closed while access is paused."
        backTo={`/operator/mountains/${id}`}
      />
    );
  }

  const placement = placementFor(placements, id);
  const placementState = placement ? placementStatus(placement) : null;
  const mayEditProducts = can(session, "editProducts");

  /* ---- the state dots, derived and never decorative --------------------- */

  const logoPending = pendingFieldsFor(companyVersions, company?.id ?? "").has("logoMediaId");
  const pricePending = mine.some((p) => {
    const f = pendingFieldsFor(productVersions, p.id);
    return PRICE_FIELDS.some((k) => f.has(k));
  });

  const stateOf = (key: RowKey): SectionState => {
    if (key === "mark") return logoPending ? "pending" : "live";
    if (key === "price") return pricePending ? "pending" : "live";
    return "live";
  };

  /**
   * The chip in the top bar. Derived from the same records the rest of the
   * screen reads: what is on the page, and whether anything about it is with
   * ICEFALL.
   */
  const chip: { dot: string; text: string; fg: string } = shown.length === 0
    ? { dot: "var(--op-draft)", text: "Nothing published on this page", fg: "var(--op-muted)" }
    : logoPending || pricePending
      ? { dot: "var(--op-pending)", text: "Waiting on Icefall", fg: "var(--op-pending)" }
      : { dot: "var(--op-live)", text: "Live", fg: "var(--op-live)" };

  const selectPart = (key: RowKey, productId?: string) => {
    setSelected(key);
    if (productId) setFocusId(productId);
  };

  return (
    <div className="flex h-screen flex-col bg-canvas">
      {/* ── TOP BAR ───────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-5 border-b border-line bg-surface px-5 py-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <button
            onClick={() => navigate(`/operator/mountains/${id}`)}
            className="flex items-center gap-1.5 text-[12.5px] text-muted hover:text-ink"
          >
            <ArrowLeft size={14} aria-hidden /> Back
          </button>
          <span className="h-3.5 w-px bg-line-soft" aria-hidden />
          <span className="truncate text-[13px] text-muted">
            How you appear on <span className="text-ink">{mountain.name}</span>
          </span>
          <span
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill border border-line px-2.5 py-0.5 text-[10.5px]"
            style={{ color: chip.fg }}
          >
            <span className="h-1.5 w-1.5 rounded-pill" style={{ background: chip.dot }} aria-hidden />
            {chip.text}
          </span>
        </div>

        {/*
          NO SAVE AND NO SUBMIT, and their absence is the honest statement. This
          screen writes nothing: every part of the block is written somewhere
          else, and the inspector hands over the link to that somewhere else.
        */}
        <div className="flex items-center gap-3">
          {/*
            OFFLINE: the real page is served by the Icefall website, so the
            button would open a browser error. Saying that is more use than
            offering a link that cannot work.
          */}
          {OFFLINE ? (
            <span className="text-[11.5px] text-muted">
              Your real page is on the Icefall website, which this offline demo cannot reach.
            </span>
          ) : (
            <Button
              onClick={() =>
                window.open(`${WEB_ASSET_ORIGIN}/app/mountains/${id}`, "_blank", "noopener,noreferrer")
              }
            >
              <ExternalLink size={13} aria-hidden /> Open the real page
            </Button>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* ── THE PARTS OF THE BLOCK ──────────────────────────────────────── */}
        <div className="flex w-[248px] shrink-0 flex-col border-r border-line bg-surface">
          <div className="px-4.5 pt-4 pb-2.5">
            <span className="lbl">What a climber sees</span>
          </div>
          <div className="flex flex-1 flex-col gap-px overflow-auto px-2.5">
            {ROWS.map((r) => {
              const active = selected === r.key;
              const st = stateOf(r.key);
              return (
                <button
                  key={r.key}
                  onClick={() => setSelected(r.key)}
                  className={`relative flex items-center gap-2.5 rounded-tile px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-raised text-ink" : "text-muted hover:bg-raised hover:text-ink"
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute top-1/2 left-0 h-4 w-[2px] -translate-y-1/2 rounded-pill bg-azure"
                      style={{ boxShadow: "0 0 10px var(--op-azure-glow)" }}
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px]">{r.label}</span>
                    {/* WHERE IT IS SET — the point of the rail on this screen. */}
                    <span className="mt-0.5 block truncate text-[10.5px] text-faint">{r.source}</span>
                  </span>
                  {r.indicator === "state" ? (
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-pill"
                      style={{ background: SECTION_STATE_COLOUR[st] }}
                      title={SECTION_STATE_LABEL[st]}
                      aria-label={SECTION_STATE_LABEL[st]}
                    />
                  ) : r.indicator === "locked" ? (
                    <Lock size={11} className="shrink-0 text-faint" aria-hidden />
                  ) : (
                    <Minus size={11} className="shrink-0 text-faint" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>

          {/* The legend. Without it the indicators are decoration. */}
          <div className="mt-auto flex flex-col gap-1.5 border-t border-line px-4.5 py-3.5">
            {(["live", "pending"] as const).map((st) => (
              <div key={st} className="flex items-center gap-2">
                <span
                  className="h-1.5 w-1.5 rounded-pill"
                  style={{ background: SECTION_STATE_COLOUR[st] }}
                  aria-hidden
                />
                <span className="text-[11px] text-faint">{SECTION_STATE_LABEL[st]}</span>
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Lock size={10} className="text-faint" aria-hidden />
              <span className="text-[11px] text-faint">Not editable from the portal</span>
            </div>
            <div className="flex items-center gap-2">
              <Minus size={10} className="text-faint" aria-hidden />
              <span className="text-[11px] text-faint">Icefall does not store this yet</span>
            </div>
          </div>
        </div>

        {/* ── THE BLOCK ITSELF ────────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-canvas">
          <div className="flex items-center justify-between gap-3.5 border-b border-line-soft px-5 py-2">
            <span className="flex items-center gap-2 text-[10.5px]">
              <span className="h-1.5 w-1.5 rounded-pill" style={{ background: "var(--op-live)" }} aria-hidden />
              <span className="tracking-[0.14em] text-faint uppercase">
                Your block on the {mountain.name} page
              </span>
            </span>
            <span className="text-[10.5px] text-faint">Icefall, Expeditions tab</span>
          </div>

          <div className="flex-1 overflow-auto p-5">
            <div
              className="mx-auto max-w-[620px] rounded-card p-5"
              style={{ background: WEB.obsidian, border: `1px solid ${WEB.hairline}` }}
            >
              {shown.length === 0 ? (
                <EmptyBlock mountainName={mountain.name} unpublished={mine.length} />
              ) : (
                <>
                  <div className="flex flex-col gap-4">
                    {shown.map((p) => (
                      <BlockCard
                        key={p.id}
                        product={p}
                        companyName={company?.name ?? ""}
                        logoUrl={companyLogoUrl}
                        selected={selected}
                        isFocused={focused?.id === p.id}
                        onSelect={(key) => selectPart(key, p.id)}
                      />
                    ))}
                  </div>
                  {/*
                    The page's own sentence about its order, rendered as the page
                    renders it — copied from `MountainDetail.tsx` rather than
                    paraphrased, because what the climber is told about ranking
                    is exactly what the operator needs to have read.
                  */}
                  <p className="mt-4 text-[10.5px] leading-relaxed" style={{ color: WEB.mistDim }}>
                    Ordered on how specifically a listing covers {mountain.name}. No position here is for sale,
                    and ICEFALL takes no part in a booking.
                  </p>
                </>
              )}
            </div>

            <p className="mx-auto mt-3 max-w-[620px] text-[10.5px] leading-relaxed text-faint">
              Your listings only. Other companies also appear on this page, and their blocks are not visible
              from your portal — so this cannot show you where yours falls among them.
            </p>

            {shown.length === 0 && (
              <div className="mx-auto mt-4 max-w-[620px]">
                {/*
                  Two different empty cases and two different fixes. A company
                  with nothing on the peak needs to create a trip; a company
                  whose only trips are drafts needs to finish and submit one,
                  and sending them to "create a trip" would have them build a
                  second copy of what they already have.
                */}
                {mine.length > 0 && focused ? (
                  <Link to={`/operator/products/${focused.id}/edit`}>
                    <Button variant="primary">Open {focused.name}</Button>
                  </Link>
                ) : mayEditProducts ? (
                  <Link to="/operator/products/new">
                    <Button variant="primary">Create a trip on {mountain.name}</Button>
                  </Link>
                ) : (
                  <Notice>
                    Trips are created by a Company Admin at your company. Ask them to add one on{" "}
                    {mountain.name} and your block appears on this page.
                  </Notice>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── INSPECTOR ───────────────────────────────────────────────────── */}
        <div className="flex w-[340px] shrink-0 flex-col border-l border-line bg-surface">
          <div className="flex items-center justify-between px-4.5 pt-4 pb-2.5">
            <span className="lbl">{ROWS.find((r) => r.key === selected)?.label ?? "Part"}</span>
            <span className="text-[10.5px] text-faint">
              {ROWS.find((r) => r.key === selected)?.source}
            </span>
          </div>

          <div className="flex flex-1 flex-col gap-3.5 overflow-auto px-4.5 pb-5">
            <Inspector
              part={selected}
              mountainName={mountain.name}
              companyName={company?.name ?? ""}
              logoUrl={companyLogoUrl}
              logoOnRecord={!!company?.logoMediaId}
              logoPending={logoPending}
              pricePending={pricePending}
              shown={shown}
              focused={focused}
              mayEditProducts={mayEditProducts}
              placementLabel={
                placement
                  ? placementState?.effectiveStatus === "expired"
                    ? `Featured #${placement.slotPosition}, term ended${
                        placement.endsOn ? ` ${formatDay(placement.endsOn)}` : ""
                      }`
                    : `Featured #${placement.slotPosition}`
                  : null
              }
            />

            <p className="mt-auto text-[10.5px] leading-relaxed text-faint">
              This screen writes nothing. Every part of your block is written on the screen named beside it,
              or is Icefall's.{" "}
              <Link to={`/operator/mountains/${id}`} className="text-azure-ink hover:underline">
                Back to {mountain.name}
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* The depicted block                                                         */
/* ========================================================================== */

/**
 * One listing, as `TripRow` in `icefall-web/src/app/MountainDetail.tsx` draws
 * it: a 46px rounded mark, the company name, the trip's objective, the rating
 * line, the from-price right-aligned, and the duration on a divider row.
 *
 * NOT A LINK. The real card navigates to the trip page; this one selects the
 * part of the rail that explains the piece clicked. Making it navigate would
 * make the depiction a control and lose the click that is worth having.
 */
function BlockCard({
  product,
  companyName,
  logoUrl,
  selected,
  isFocused,
  onSelect,
}: {
  product: Product;
  companyName: string;
  logoUrl: string | null;
  selected: RowKey;
  isFocused: boolean;
  onSelect: (key: RowKey) => void;
}) {
  /** The editor's own outline, on the PORTAL's azure — chrome, not content. */
  const ring = (key: RowKey): React.CSSProperties =>
    isFocused && selected === key
      ? { outline: "2px solid var(--op-azure)", outlineOffset: "3px", borderRadius: "6px" }
      : {};

  const price =
    product.priceFromCents === null ? null : formatMoney(product.priceFromCents, product.currency);

  return (
    <div
      className="flex flex-col rounded-card p-4"
      style={{ background: WEB.graphite, border: `1px solid ${WEB.hairline}` }}
    >
      <div className="flex items-start gap-3.5">
        {/*
          The operator's own mark, or their monogram. NEVER a mark of Icefall's
          making: among the companies in this catalogue at least one is a real
          business whose logo is its trademark, and a substitute would be worse
          than initials. The monogram is the honest common case.
        */}
        <button onClick={() => onSelect("mark")} style={ring("mark")} className="shrink-0" title="Your mark">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt=""
              aria-hidden
              className="h-[46px] w-[46px] rounded-tile object-contain"
              style={{ border: `1px solid ${WEB.hairline}` }}
            />
          ) : (
            <span
              className="grid h-[46px] w-[46px] place-items-center rounded-tile text-[12px] tracking-[0.06em]"
              style={{ background: WEB.slate, border: `1px solid ${WEB.hairline}`, color: WEB.mist }}
            >
              {initialsOf(companyName)}
            </span>
          )}
        </button>

        <span className="min-w-0 flex-1">
          <button
            onClick={() => onSelect("name")}
            style={ring("name")}
            className="block max-w-full truncate text-left text-[13.5px]"
          >
            <span style={{ color: WEB.snow }}>{companyName || "Your company"}</span>
          </button>
          <button
            onClick={() => onSelect("trip")}
            style={ring("trip")}
            className="mt-0.5 block max-w-full truncate text-left text-[11.5px]"
          >
            <span style={{ color: WEB.mistDim }}>{product.name}</span>
          </button>
          {/*
            THE ONE LINE THIS SCREEN CANNOT DRAW FAITHFULLY, marked as such.
            No rating and no review count reaches the operator portal, so a
            number would be invented and the page's own "No ratings published"
            would be a claim we cannot make either.
          */}
          <button onClick={() => onSelect("rating")} style={ring("rating")} className="mt-1 block text-left">
            <span
              className="inline-flex items-center gap-1.5 rounded-pill px-2 py-0.5 text-[10.5px]"
              style={{ border: `1px dashed ${WEB.hairlineStrong}`, color: WEB.mistDim }}
            >
              <Star size={9} strokeWidth={1.8} aria-hidden />
              Rating — not carried by your portal
            </span>
          </button>
        </span>

        <button onClick={() => onSelect("price")} style={ring("price")} className="shrink-0 text-right">
          <span
            className="block text-[9px] font-semibold tracking-[0.11em] uppercase"
            style={{ color: WEB.mistDim }}
          >
            From
          </span>
          {price ? (
            <span className="tnum mt-1 block text-[13px]" style={{ color: WEB.snow }}>
              {price}
            </span>
          ) : (
            <span className="mt-1 block text-[11.5px]" style={{ color: WEB.mistDim }}>
              No price set
            </span>
          )}
        </button>
      </div>

      <button
        onClick={() => onSelect("price")}
        className="mt-3 flex items-center gap-2 pt-3 text-left text-[11.5px]"
        style={{ borderTop: `1px solid ${WEB.hairline}`, color: WEB.mistDim, ...ring("price") }}
      >
        <span className="tnum">
          {product.durationDays === null ? "Duration not set" : `${product.durationDays} days`}
        </span>
        <span>&middot;</span>
        <span>{product.seasonality ?? "Season not set"}</span>
        <ChevronRight size={15} strokeWidth={1.9} className="ml-auto" aria-hidden />
      </button>
    </div>
  );
}

/**
 * They hold the mountain and publish nothing on it, so no block is drawn.
 *
 * `unpublished` counts the trips they DO have here. Nought and some-but-none-
 * live are different situations with different fixes, and telling a company
 * with three drafts that they "have no trips" would be false.
 */
function EmptyBlock({ mountainName, unpublished }: { mountainName: string; unpublished: number }) {
  return (
    <div
      className="rounded-card px-4 py-8 text-center"
      style={{ border: `1px dashed ${WEB.hairlineStrong}` }}
    >
      <p className="text-[13px]" style={{ color: WEB.snow }}>
        You have no block on this page
      </p>
      <p className="mx-auto mt-1.5 max-w-[46ch] text-[11.5px] leading-relaxed" style={{ color: WEB.mistDim }}>
        {unpublished === 0
          ? `Icefall has assigned ${mountainName} to you, but you publish no trip on it. A climber browsing this peak sees the companies that do and never sees your company at all.`
          : `You have ${unpublished === 1 ? "one trip" : `${unpublished} trips`} on ${mountainName}, and ${
              unpublished === 1 ? "it is" : "none of them is"
            } published. Until Icefall approves and publishes ${
              unpublished === 1 ? "it" : "one"
            }, a climber browsing this peak never sees your company here.`}
      </p>
    </div>
  );
}

/* ========================================================================== */
/* The inspector                                                              */
/* ========================================================================== */

function Inspector({
  part,
  mountainName,
  companyName,
  logoUrl,
  logoOnRecord,
  logoPending,
  pricePending,
  shown,
  focused,
  mayEditProducts,
  placementLabel,
}: {
  part: RowKey;
  mountainName: string;
  companyName: string;
  logoUrl: string | null;
  logoOnRecord: boolean;
  logoPending: boolean;
  pricePending: boolean;
  /** LIVE trips only — the blocks a climber actually meets on this page. */
  shown: readonly Product[];
  focused: Product | null;
  mayEditProducts: boolean;
  placementLabel: string | null;
}) {
  const tripCount = shown.length;
  /** The focused trip may be one that is NOT on the page. Say so, never imply. */
  const onPage = focused?.status === "live";

  switch (part) {
    case "mark":
      return (
        <>
          <Seen>
            {tripCount === 0
              ? "Nothing here yet — with no published trip on this mountain there is no block for your mark to sit on."
              : logoUrl
                ? `Your logo, at 46 pixels, beside your company name on ${
                    tripCount === 1 ? "your listing" : "each of your listings"
                  } here.`
                : `${initialsOf(companyName) || "Your initials"} — your initials in a plain tile. Icefall never substitutes a mark it made up, so with no logo on record this is what a climber meets. It is not a broken image and not a placeholder.`}
          </Seen>
          {logoPending && (
            <Notice tone="pending" title="A change to your logo is with Icefall">
              {OPERATOR_NOTICES.PENDING_LIVE_UNCHANGED}
            </Notice>
          )}
          <GoTo to="/operator/company/edit" label="Edit in your company profile" />
          <Aside>
            {logoOnRecord
              ? "One logo covers every mountain and every trip. Changing it here would mean changing it everywhere, which is why it is edited in one place."
              : "One logo covers every mountain and every trip, so it is added once in your company profile rather than per mountain."}
          </Aside>
        </>
      );

    case "name":
      return (
        <>
          <Seen>
            {companyName || "Your company name"} —{" "}
            {tripCount === 0
              ? "the first line of your block, once you have one on this page."
              : "the first line of your block."}
          </Seen>
          <LockedNotice>
            Icefall sets your company name. It is the same on this page, on your profile and on every trip, and
            it cannot be changed from the portal. If it is wrong, reply to your Icefall contact.
          </LockedNotice>
        </>
      );

    case "trip":
      if (!focused) {
        return (
          <>
            <Seen>Nothing. You publish no trip on {mountainName}, so no block of yours is drawn here.</Seen>
            <Aside>
              This page lists a company once per trip it runs on the peak. With no trips, there is no line for
              a climber to read.
            </Aside>
          </>
        );
      }
      return (
        <>
          <Seen>
            {onPage
              ? `${focused.name} — the second line of your block, under your company name. This page calls it the objective.`
              : `Nothing yet. ${focused.name} is not published, so this page draws no block for it and no climber reads its name here.`}
          </Seen>
          <LockedNotice>
            A trip's name is fixed when the trip is created and cannot be edited afterwards, in this portal or
            in the trip editor. Everything else about it is yours.
          </LockedNotice>
          <GoTo to={`/operator/products/${focused.id}/edit`} label={`Open ${focused.name}`} />
          {tripCount > 1 && (
            <Aside>
              You publish {tripCount} trips on {mountainName} and this page draws a block for each one. Click a
              card to read about that one.
            </Aside>
          )}
        </>
      );

    case "rating":
      return (
        <>
          <Seen>
            A rating and a review count, when climbers have written them, and the words “No ratings published”
            when they have not. Which of the two your block shows is not something this portal can see.
          </Seen>
          <LockedNotice>
            Ratings are written by climbers who travelled with you and counted by Icefall. There is no operator
            write path for them, and no figure reaches this portal — so this screen shows you where the line
            sits rather than a number it would have to invent.
          </LockedNotice>
        </>
      );

    case "price": {
      if (!focused) {
        return (
          <Seen>
            Nothing. With no trip on {mountainName} there is no price and no duration for this page to show.
          </Seen>
        );
      }
      const line = [
        focused.priceFromCents === null
          ? "no price, so the From line stands empty"
          : `From ${formatMoney(focused.priceFromCents, focused.currency)}`,
        focused.durationDays === null ? "no duration set" : `${focused.durationDays} days`,
        focused.seasonality ?? "no season set",
      ].join(" · ");
      return (
        <>
          <Seen>
            {onPage
              ? `${line}.`
              : `Nothing — ${focused.name} is not published. The figures it would carry are ${line}.`}
          </Seen>
          {pricePending && (
            <Notice tone="pending" title="A change here is with Icefall">
              {OPERATOR_NOTICES.PENDING_LIVE_UNCHANGED}
            </Notice>
          )}
          {mayEditProducts ? (
            <GoTo to={`/operator/products/${focused.id}/edit`} label={`Edit ${focused.name}`} />
          ) : (
            <Aside>
              Prices and durations are edited by a Company Admin at your company, in the trip editor for{" "}
              {focused.name}.
            </Aside>
          )}
          <Aside>
            The price on this page is the trip's From price, not a per-mountain rate. There is no way to price
            a trip differently on one mountain than another.
          </Aside>
        </>
      );
    }

    case "position":
      return (
        <>
          <Seen>
            Where your block falls among the other companies on this page, and whether it carries the gold
            “Best match” mark that the page gives its first listing when there is more than one.
          </Seen>
          <LockedNotice>{OPERATOR_NOTICES.PLACEMENT_READ_ONLY}</LockedNotice>
          <Aside>
            The page orders listings on how specifically each one covers {mountainName}, across every company
            on it. Your portal can see your trips and nobody else's, so it cannot show you your position — and
            it will not guess at one.
          </Aside>
          <Aside>
            The gold “Best match” mark is Icefall's ranking, awarded and never bought. It is not a setting, and
            it is not drawn on the cards above because this portal cannot know whether you have it. There is no
            control for it anywhere, by design.
          </Aside>
          {placementLabel && (
            <>
              <div className="my-1 h-px bg-line" aria-hidden />
              <div className="flex flex-col gap-2">
                <span className="lbl">On record with Icefall</span>
                <div className="flex items-center justify-between gap-2 rounded-tile border border-line bg-raised px-2.5 py-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-faint">Placement</div>
                    <div className="truncate text-[12.5px] text-ink">{placementLabel}</div>
                  </div>
                  <Lock size={13} className="shrink-0 text-faint" aria-hidden />
                </div>
                <p className="text-[10.5px] leading-relaxed text-faint">
                  A separate commercial record, kept on your mountain workspace. It is Icefall's to set, and
                  this screen does not claim it moves your block on the page above.
                </p>
              </div>
            </>
          )}
        </>
      );

    /*
     * ── THE TWO FIELDS THAT DO NOT EXIST ────────────────────────────────────
     *
     * Owner decision 15 moved the promotional film off the company record and
     * onto the mountain surface, and `PromoVideo` in `src/domain/types.ts` is
     * now used by nothing — it is homeless. A per-mountain pitch was never
     * modelled at all.
     *
     * They are rows rather than omissions because an operator who has been told
     * their film belongs on the mountain will come here looking for it, and an
     * absent row makes them think they missed it. They carry NO INPUT of any
     * kind: a disabled field says "ask us and we'll enable it", which is the
     * negotiation this portal exists to avoid, and a live field would collect
     * typing that nothing can store. When the schema lands, these two rows gain
     * inputs and nothing else on this screen moves.
     */
    case "film":
      return (
        <NotYet
          what={`A short film for ${mountainName} — your own footage of this peak, played on the mountain surface where a climber is deciding between companies.`}
          why="Owner decision 15 moved the promotional film off the company profile and onto the mountain. Icefall has no field to store a per-mountain film in yet, so there is nothing to fill in and nothing here is saving."
        />
      );

    case "pitch":
      return (
        <NotYet
          what={`A short pitch for ${mountainName} — why your company, on this peak specifically, rather than the general description that already sits on your profile.`}
          why="Icefall stores no per-mountain text today: the record that links your company to a mountain carries permission and nothing else. Until that changes, your block reads from your company record and the trip, exactly as shown."
        />
      );
  }
}

/* ========================================================================== */
/* Inspector pieces                                                           */
/* ========================================================================== */

/**
 * WHAT A CLIMBER SEES TODAY. Every part carries one, so the screen can be read
 * straight down without clicking through to anywhere.
 */
function Seen({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="lbl">A climber sees</span>
      <p className="text-[12.5px] leading-relaxed text-ink">{children}</p>
    </div>
  );
}

/** The link to where the thing is really edited. */
function GoTo({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-2 rounded-tile border border-line bg-raised px-3 py-2.5 text-[12.5px] text-ink transition-colors hover:bg-elevated"
    >
      <span className="min-w-0 truncate">{label}</span>
      <ChevronRight size={14} className="shrink-0 text-faint" aria-hidden />
    </Link>
  );
}

function Aside({ children }: { children: React.ReactNode }) {
  return <p className="text-[10.5px] leading-relaxed text-faint">{children}</p>;
}

/**
 * A field ICEFALL cannot store yet.
 *
 * Deliberately NOT a disabled input and NOT a greyed placeholder: both draw a
 * control and then withhold it, which reads as something nearly ready. This
 * names what the field would do and says plainly that it does not exist.
 */
function NotYet({ what, why }: { what: string; why: string }) {
  return (
    <>
      <Seen>Nothing — this does not appear on the page today.</Seen>
      <div className="rounded-tile border border-dashed border-line bg-raised px-3 py-2.5">
        <p className="text-[12px] leading-relaxed text-ink">{what}</p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">{why}</p>
        <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
          A request for the field is with the team that owns the schema. There is no draft of it here, nothing
          on this screen is holding text for it, and it is listed so you know where it will appear rather than
          so it can be filled in now.
        </p>
      </div>
    </>
  );
}

/**
 * A refusal, full-bleed like the rest of the screen.
 *
 * Says which of the two facts is true — the mountain is not yours, or your
 * access to it has ended — because those are different things and an operator
 * told the wrong one goes looking for the wrong fix.
 */
function Refusal({ title, detail, backTo }: { title: string; detail: string; backTo?: string }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-3 bg-canvas px-8 text-center">
      <p className="text-[13.5px] text-ink">{title}</p>
      <p className="max-w-[52ch] text-[12.5px] leading-relaxed text-muted">{detail}</p>
      <Link to={backTo ?? "/operator/mountains"} className="text-[12.5px] text-azure-ink hover:underline">
        {backTo ? "Back to the mountain" : "Back to my mountains"}
      </Link>
    </div>
  );
}
