import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck, Ban, CalendarClock, ChevronRight, Crown, ExternalLink, Eye,
  MessageSquare, Mountain as MountainIcon, MousePointerClick, Pencil, PauseCircle,
  Plus, Search, Settings2, Shuffle, SlidersHorizontal, Star, TrendingUp, Trophy, X,
} from "lucide-react";
import { Avatar, Button, Card, Pill, SectionLabel } from "@/components/ui";
import { Resolve } from "@/components/states";
import { listBookingsDetailed, listCompanies, listDestinations, listEnquiries, listPlacements, listProducts, listLeadDestinations, type BookingDetailed } from "@/data/queries";
import { formatCents, formatCentsShort, loading, type Result } from "@/data/result";
import type { Company, Enquiry, Mountain, PlacementView, Product } from "@/data/types";
import { cn, daysUntil, formatDay } from "@/lib/utils";

/**
 * MOUNTAIN PLACEMENTS — one mental model.
 *
 *   MOUNTAIN → 5 SLOTS → COMPANY → EXPEDITION → TERM / PRICE
 *
 * What this replaced put mountains, companies, positions, terms and prices in
 * one flat table with every column weighted the same, which is why nobody could
 * answer "who is on Everest" without reading all of it. Here the mountain is the
 * unit of work: pick one on the left, manage its five commercial positions on
 * the right. Nothing else is on screen at that point.
 *
 * ── WHAT IS TAKEN FROM THE DESIGN AND WHAT IS TAKEN FROM THE DATA ───────────
 *
 * The LAYOUT is the owner's mockup: two columns, hero band, five slot rows, a
 * detail drawer, the gold accent. The FIGURES are whatever the data actually
 * holds — the brief says so twice ("do not invent real values if the underlying
 * data does not exist", "do not fabricate companies, mountains, pricing,
 * bookings or performance metrics"), and a mockup showing 142 mountains is
 * showing what a full screen looks like, not asserting there are 142.
 *
 * Performance is the sharpest case. The design shows impressions, clicks and
 * enquiries per placement. ICEFALL records none of them — nothing writes an
 * analytics event anywhere in the product — so those render as absent with the
 * reason. An operator deciding whether to renew a paid position must not be
 * shown a number nobody measured, and that is the one number on this page they
 * would act on.
 */

const GOLD = "#C79049";
/**
 * How many paid positions a destination has. Owner decision 17.
 *
 * Mountains five (1 Premium + 4 Featured), treks three. 252 treks at five apiece
 * would be 1,260 sellable positions, and scarcity is the whole of what makes a
 * featured slot worth buying. The database enforces the same numbers with a
 * trigger — this is the screen agreeing with it, not deciding it.
 */
const slotsFor = (kind: Mountain["kind"]) => (kind === "trek" ? [1, 2, 3] : [1, 2, 3, 4, 5]);

/**
 * One line describing a destination.
 *
 * A MOUNTAIN leads with its summit elevation. A TREK does not have one — its
 * high point is a different claim, and a metre figure beside a trek name reads
 * as a summit somebody stood on. So a trek leads with how long it takes, and
 * says "high point" explicitly where that is known.
 */
/**
 * A destination's photograph, or a neutral tile.
 *
 * There are 304 destinations and nine licensed photographs. ICEFALL does not
 * scrape imagery, so the rest have none — and an <img> that fails to load leaves
 * an empty box that reads as a broken page rather than a missing picture. The
 * tile underneath is always there; the photograph covers it when one exists.
 */
function DestinationImage({ id, kind, className }: { id: string; kind: Mountain["kind"]; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-raised", className)}>
      <MountainIcon size={18} strokeWidth={1.6} className="text-faint" aria-hidden />
      {!failed && (
        <img
          src={`/img/destinations/${id}.jpg`}
          alt=""
          aria-hidden
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
      {kind === "trek" && !failed && (
        <span aria-hidden className="absolute inset-0 bg-black/10" />
      )}
    </span>
  );
}

function describe(m: Mountain): string {
  const bits: string[] = [];
  if (m.kind === "mountain") {
    bits.push(m.elevation_m ? `${m.elevation_m.toLocaleString("en-GB")}m` : "Elevation not recorded");
    if (m.range) bits.push(m.range);
  } else {
    const lo = m.duration_days_min;
    const hi = m.duration_days_max;
    if (lo) bits.push(lo === hi || !hi ? `${lo} days` : `${lo}–${hi} days`);
    if (m.max_altitude_m) bits.push(`high point ${m.max_altitude_m.toLocaleString("en-GB")}m`);
  }
  if (m.region) bits.push(m.region);
  return bits.length ? bits.join(" · ") : "No detail recorded";
}
const PER_PAGE = 6;

type Filter = "all" | "active" | "available" | "expiring";
type Kind = "all" | "mountain" | "trek";

export default function MountainPlacements() {
  const [mountains, setMountains] = useState<Result<Mountain[]>>(loading);
  const [placements, setPlacements] = useState<Result<PlacementView[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);
  const [products, setProducts] = useState<Result<Product[]>>(loading);

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [kind, setKind] = useState<Kind>("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [leadDests, setLeadDests] = useState<Result<{ destination_id: string | null }[]>>(loading);
  const [openPlacement, setOpenPlacement] = useState<PlacementView | null>(null);
  const [addingSlot, setAddingSlot] = useState<number | null>(null);

  useEffect(() => {
    void listDestinations().then((r) => {
      setMountains(r);
      if (r.state === "ok" && r.value.length) setSelected((s) => s ?? r.value[0].id);
    });
    void listPlacements().then(setPlacements);
    void listCompanies().then(setCompanies);
    void listProducts().then(setProducts);
    void listLeadDestinations().then(setLeadDests);
  }, []);

  const rows = placements.state === "ok" ? placements.value : [];
  const held = (id: string) => rows.filter((p) => p.destination_id === id && p.effective_status !== "cancelled");
  const companyName = (id: string) =>
    companies.state === "ok" ? companies.value.find((c) => c.id === id)?.name : undefined;
  const companyVerified = (id: string) =>
    companies.state === "ok"
      ? companies.value.find((c) => c.id === id)?.verification_status === "verified"
      : false;
  const productName = (id: string | null) =>
    id && products.state === "ok" ? products.value.find((p) => p.id === id)?.name : undefined;

  /** Search is over the MOUNTAIN only — name, range, region, country. */
  const matches = (m: Mountain) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return [m.name, m.range, m.region, m.country, m.id]
      .filter(Boolean)
      .some((v) => (v as string).toLowerCase().includes(q));
  };

  const passes = (m: Mountain) => {
    if (kind !== "all" && m.kind !== kind) return false;
    const h = held(m.id);
    if (filter === "active") return h.some((p) => p.effective_status === "active");
    if (filter === "available") return h.length < slotsFor(m.kind).length;
    if (filter === "expiring")
      return h.some((p) => p.effective_status === "expired" || (p.days_remaining >= 0 && p.days_remaining <= 30));
    return true;
  };

  const visible = useMemo(
    () => (mountains.state === "ok" ? mountains.value.filter((m) => matches(m) && passes(m)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mountains, placements, query, filter, kind],
  );

  // Paginated rather than rendered whole: the catalogue is meant to grow to
  // thousands and one DOM list of that size is the failure the brief names.
  const pages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const pageRows = visible.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  useEffect(() => setPage(0), [query, filter, kind]);

  const current = mountains.state === "ok" ? mountains.value.find((m) => m.id === selected) : undefined;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-[26px] font-extrabold uppercase tracking-[-0.01em] text-ink">
          Mountain Placements
        </h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Manage premium expedition visibility across ICEFALL mountains.
        </p>
      </div>

      <AttentionNeeded rows={rows} mountains={mountains} onGo={setSelected} />
      <Summary mountains={mountains} rows={rows} />

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(320px,360px)_1fr]">
        {/* ---- Left: find the mountain -------------------------------- */}
        <div>
          <div className="relative mb-3">
            <Search size={16} strokeWidth={1.9} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search mountains, regions or countries..."
              className="h-12 w-full rounded-tile bg-surface pl-11 pr-11 text-[13.5px] text-ink shadow-soft outline-none placeholder:text-faint"
            />
            <SlidersHorizontal size={16} strokeWidth={1.9} className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-faint" />
          </div>

          <div className="mb-2.5 inline-flex rounded-pill bg-surface p-1 shadow-soft">
            {([
              ["all", "All"],
              ["mountain", "Mountains"],
              ["trek", "Treks"],
            ] as [Kind, string][]).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={cn(
                  "h-8 rounded-pill px-4 text-[12.5px] font-medium transition-colors",
                  kind === k ? "bg-solid text-white" : "text-muted hover:text-ink",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mb-4 flex flex-wrap gap-2">
            {(["all", "active", "available", "expiring"] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "h-9 rounded-pill px-4 text-[12.5px] font-medium capitalize transition-colors",
                  filter === f ? "text-white" : "bg-surface text-muted shadow-soft hover:text-ink",
                )}
                style={filter === f ? { backgroundColor: GOLD } : undefined}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="mb-3 flex items-center justify-between px-1">
            <p className="text-[12.5px] text-muted">
              {mountains.state === "ok"
                ? `${visible.length} ${kind === "trek" ? "treks" : kind === "mountain" ? "mountains" : "destinations"}`
                : "Loading…"}
            </p>
            <span className="text-[12px] text-faint">Sorted A–Z</span>
          </div>

          <Resolve
            result={mountains}
            what="destinations"
            isEmpty={() => visible.length === 0}
            empty="No mountain matches that search."
          >
            {() => (
              <div className="space-y-2.5">
                {pageRows.map((m) => (
                  <MountainCard
                    key={m.id}
                    mountain={m}
                    placements={held(m.id)}
                    selected={m.id === selected}
                    onSelect={() => {
                      setSelected(m.id);
                      setOpenPlacement(null);
                    }}
                  />
                ))}
              </div>
            )}
          </Resolve>

          {pages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-1.5">
              <PageBtn onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}>‹</PageBtn>
              {Array.from({ length: pages }, (_, i) => (
                <PageBtn key={i} onClick={() => setPage(i)} active={i === page}>{i + 1}</PageBtn>
              ))}
              <PageBtn onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1}>›</PageBtn>
            </div>
          )}
        </div>

        {/* ---- Right: manage its five positions ------------------------ */}
        <div>
          {current ? (
            <MountainPane
              mountain={current}
              placements={held(current.id)}
              enquiriesHere={
                leadDests.state === "ok"
                  ? leadDests.value.filter((l) => l.destination_id === current.id).length
                  : null
              }
              companyName={companyName}
              companyVerified={companyVerified}
              productName={productName}
              onManage={setOpenPlacement}
              onAdd={setAddingSlot}
            />
          ) : (
            <Card className="grid h-64 place-items-center text-[13.5px] text-faint">
              Choose a mountain to manage its placements.
            </Card>
          )}
        </div>
      </div>

      {openPlacement && (
        <PlacementDrawer
          placement={openPlacement}
          company={companyName(openPlacement.company_id)}
          verified={companyVerified(openPlacement.company_id)}
          mountain={current}
          product={productName(openPlacement.product_id ?? null)}
          onClose={() => setOpenPlacement(null)}
        />
      )}

      {addingSlot !== null && current && (
        <AddPlacementDrawer
          mountain={current}
          slot={addingSlot}
          taken={held(current.id).map((p) => p.slot_position)}
          companies={companies}
          products={products}
          onClose={() => setAddingSlot(null)}
        />
      )}
    </>
  );
}

/* ========================================================================== */
/* Admin metrics — deliberately secondary to the selector below them          */
/* ========================================================================== */

function Summary({ mountains, rows }: { mountains: Result<Mountain[]>; rows: PlacementView[] }) {
  const count = mountains.state === "ok" ? mountains.value.length : null;
  // Capacity is NOT count × 5 any more: a trek has three positions. Summing per
  // destination is the only way this stays right when the mix changes.
  const capacity =
    mountains.state === "ok"
      ? mountains.value.reduce((n, m) => n + slotsFor(m.kind).length, 0)
      : null;
  const filled = rows.filter((p) => p.effective_status !== "cancelled").length;
  const value = rows
    .filter((p) => p.effective_status === "active" && p.price_cents !== null)
    .reduce((n, p) => n + (p.price_cents ?? 0), 0);
  const unpriced = rows.filter((p) => p.effective_status === "active" && p.price_cents === null).length;
  const expiring = rows.filter(
    (p) => p.effective_status === "expired" || (p.days_remaining >= 0 && p.days_remaining <= 30),
  ).length;

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Tile icon={<MountainIcon size={17} strokeWidth={1.9} />} label="Mountains"
        value={count === null ? null : String(count)} sub="In the catalogue" />
      <Tile icon={<Trophy size={17} strokeWidth={1.9} />} label="Slots filled"
        value={capacity === null ? null : `${filled} / ${capacity}`} sub="Paid placements" />
      <Tile icon={<Star size={17} strokeWidth={1.9} />} label="Available"
        value={capacity === null ? null : String(capacity - filled)} sub="Open slots" />
      <Tile icon={<TrendingUp size={17} strokeWidth={1.9} />} label="Active placement value"
        value={formatCentsShort(value)}
        sub={unpriced ? `Excludes ${unpriced} with no agreed price` : "Active placements"} />
      <Tile icon={<CalendarClock size={17} strokeWidth={1.9} />} label="Expiring soon"
        value={String(expiring)} sub="Within 30 days, or already past" />
    </div>
  );
}

function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | null; sub: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-tile bg-raised text-ink">{icon}</span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">{label}</p>
      </div>
      {value === null ? (
        <p className="mt-2.5 text-[12px] leading-snug text-faint">Not yet known</p>
      ) : (
        <p className="tnum mt-2.5 text-[26px] font-bold leading-none tracking-[-0.02em] text-ink">{value}</p>
      )}
      <p className="mt-1.5 text-[11.5px] text-faint">{sub}</p>
    </Card>
  );
}

/**
 * Only shown when there is something to act on.
 *
 * The brief is explicit that these appear only when the data exists — an alert
 * panel reading "0 placements expire soon" trains people to stop looking at it,
 * which costs more than the panel is worth.
 */
function AttentionNeeded({
  rows, mountains, onGo,
}: { rows: PlacementView[]; mountains: Result<Mountain[]>; onGo: (id: string) => void }) {
  const expiring = rows.filter((p) => p.effective_status === "active" && p.days_remaining >= 0 && p.days_remaining <= 30);
  const expired = rows.filter((p) => p.effective_status === "expired");
  // Only destinations that ALREADY SELL — somewhere with placements but no
  // Premium partner is a gap worth closing. Counting every unsold destination
  // would report 297 of 304, which is not an alert, it is the catalogue. An
  // alert panel that reports the obvious teaches people to stop reading it.
  const noPremium =
    mountains.state === "ok"
      ? mountains.value.filter((m) => {
          const on = rows.filter((p) => p.destination_id === m.id && p.effective_status !== "cancelled");
          return on.length > 0 && !on.some((p) => p.slot_position === 1);
        })
      : [];

  const items: { text: string; go?: string }[] = [];
  if (expiring.length) items.push({ text: `${expiring.length} placement${expiring.length === 1 ? "" : "s"} expire within 30 days`, go: expiring[0].destination_id });
  if (expired.length) items.push({ text: `${expired.length} placement${expired.length === 1 ? " has" : "s have"} passed their term and still hold their position`, go: expired[0].destination_id });
  if (noPremium.length)
    items.push({
      text: `${noPremium.length} selling destination${noPremium.length === 1 ? " has" : "s have"} no Premium partner`,
      go: noPremium[0].id,
    });
  if (!items.length) return null;

  return (
    <Card className="mb-4 border-l-[3px] p-4" >
      <SectionLabel className="mb-2">Attention needed</SectionLabel>
      <div className="space-y-1.5">
        {items.map((i) => (
          <button
            key={i.text}
            onClick={() => i.go && onGo(i.go)}
            className="flex w-full items-center gap-2 text-left text-[13px] text-ink hover:text-accent"
          >
            <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: GOLD }} />
            {i.text}
            <ChevronRight size={14} strokeWidth={2} className="text-faint" />
          </button>
        ))}
      </div>
    </Card>
  );
}

/* ========================================================================== */
/* The mountain list                                                          */
/* ========================================================================== */

function MountainCard({
  mountain: m, placements, selected, onSelect,
}: { mountain: Mountain; placements: PlacementView[]; selected: boolean; onSelect: () => void }) {
  const total = slotsFor(m.kind).length;
  const filled = placements.length;
  const open = total - filled;
  const value = placements
    .filter((p) => p.effective_status === "active" && p.price_cents !== null)
    .reduce((n, p) => n + (p.price_cents ?? 0), 0);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3.5 rounded-card bg-surface p-3 text-left transition-shadow",
        selected ? "shadow-lift" : "shadow-soft hover:shadow-lift",
      )}
      style={selected ? { boxShadow: `0 0 0 1.5px ${GOLD}, 0 8px 24px rgba(0,0,0,0.06)` } : undefined}
    >
      <DestinationImage id={m.id} kind={m.kind} className="relative h-[64px] w-[64px] rounded-tile" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-ink">{m.name}</span>
            {m.kind === "trek" && (
              <span className="shrink-0 rounded-pill bg-raised px-1.5 py-[1px] text-[9.5px] font-semibold uppercase tracking-[0.06em] text-faint">
                Trek
              </span>
            )}
          </span>
          {open > 0 ? (
            <span className="shrink-0 text-[11.5px] font-medium text-[oklch(0.55_0.13_150)]">
              {open} slot{open === 1 ? "" : "s"} available
            </span>
          ) : (
            <span className="shrink-0 text-[11.5px] font-medium text-faint">Full</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-muted">{describe(m)}</span>

        <span className="mt-2 flex items-center justify-between gap-3">
          <span className="flex gap-1">
            {slotsFor(m.kind).map((n) => {
              const p = placements.find((x) => x.slot_position === n);
              return (
                <span
                  key={n}
                  className="h-1.5 w-6 rounded-full"
                  style={{
                    backgroundColor:
                      !p ? "rgba(0,0,0,0.09)"
                        : p.effective_status === "expired" ? "#D9A244"
                        : p.effective_status === "reserved" ? "rgba(0,0,0,0.24)"
                        : GOLD,
                  }}
                />
              );
            })}
          </span>
          <span className="tnum shrink-0 text-right">
            <span className="block text-[13px] font-bold text-ink">{formatCents(value) ?? "—"}</span>
            <span className="block text-[10.5px] text-faint">Active value</span>
          </span>
        </span>
        <span className="mt-1 block text-[11px] text-faint">{filled} / {total} slots filled</span>
      </span>
      <ChevronRight size={16} strokeWidth={2} className="shrink-0 text-faint" />
    </button>
  );
}

function PageBtn({
  children, onClick, active, disabled,
}: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "tnum grid h-8 min-w-8 place-items-center rounded-tile px-2 text-[12.5px] transition-colors disabled:opacity-35",
        active ? "bg-solid font-semibold text-white" : "bg-surface text-muted shadow-soft hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/* ========================================================================== */
/* The mountain pane — its five commercial positions                          */
/* ========================================================================== */

function MountainPane({
  mountain: m, placements, companyName, companyVerified, productName, onManage, onAdd, enquiriesHere,
}: {
  mountain: Mountain;
  placements: PlacementView[];
  enquiriesHere: number | null;
  companyName: (id: string) => string | undefined;
  companyVerified: (id: string) => boolean;
  productName: (id: string | null) => string | undefined;
  onManage: (p: PlacementView) => void;
  onAdd: (slot: number) => void;
}) {
  const slots = slotsFor(m.kind);
  const filled = placements.length;

  return (
    <div className="space-y-4">
      {/* Hero band. Photograph credited in public/img/destinations/CREDITS.md. */}
      <div className="relative h-[128px] overflow-hidden rounded-card">
        <DestinationImage id={m.id} kind={m.kind} className="absolute inset-0 h-full w-full" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/72 via-black/38 to-black/25" />
        <div className="relative flex h-full items-center justify-between px-6">
          <div>
            <h2 className="text-[27px] font-bold leading-none tracking-[-0.02em] text-white">{m.name}</h2>
            <p className="mt-2 text-[13px] text-white/80">
              {describe(m)}
              {m.country ? ` · ${m.country}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button className="inline-flex h-9 items-center gap-2 rounded-tile bg-white/92 px-3.5 text-[12.5px] font-medium text-ink hover:bg-white">
              <Settings2 size={15} strokeWidth={1.9} />
              Mountain settings
            </button>
            <span className="grid h-[54px] w-[74px] place-items-center rounded-tile bg-black/55 text-center">
              <span className="tnum block text-[16px] font-bold leading-none text-white">{filled} / {slots.length}</span>
              <span className="mt-1 block text-[9.5px] uppercase tracking-[0.08em] text-white/70">Slots filled</span>
            </span>
          </div>
        </div>
      </div>

      {/* CR-06: performance of THIS mountain. Enquiries are counted from real
          lead rows; searches are not measured anywhere in the family (nothing
          emits a search event), and the strip says so instead of drawing 0. */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 rounded-card bg-surface px-5 py-3 shadow-soft">
        <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">Performance</span>
        <span className="text-[12.5px] text-muted">
          Enquiries:{" "}
          <span className="tnum font-semibold text-ink">
            {enquiriesHere === null ? "—" : enquiriesHere}
          </span>
          {enquiriesHere === null && <span className="text-faint"> (leads could not be read)</span>}
        </span>
        <span className="text-[12.5px] text-muted">
          Searches: <span className="text-faint">not measured — nothing emits a search event yet</span>
        </span>
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-bold uppercase tracking-[0.01em] text-ink">
              Featured expedition placements
            </h3>
            <p className="mt-1 text-[12.5px] text-muted">
              {slots.length} paid position{slots.length === 1 ? "" : "s"} on this{" "}
              {m.kind === "trek" ? "trek" : "mountain"}. There is no extra one — when they are all
              held, the only options are the waitlist or ending an existing placement.
            </p>
          </div>
          {filled < slots.length && (
            <button
              onClick={() => onAdd(slots.find((n) => !placements.some((p) => p.slot_position === n)) ?? 1)}
              className="inline-flex h-10 shrink-0 items-center gap-2 rounded-tile px-4 text-[13px] font-semibold text-white"
              style={{ backgroundColor: GOLD }}
            >
              <Plus size={16} strokeWidth={2.2} />
              Add placement
            </button>
          )}
        </div>

        <div className="space-y-2.5">
          {slots.map((n) => {
            const p = placements.find((x) => x.slot_position === n);
            return p ? (
              <SlotRow
                key={n}
                placement={p}
                company={companyName(p.company_id)}
                verified={companyVerified(p.company_id)}
                product={productName(p.product_id ?? null)}
                onManage={() => onManage(p)}
              />
            ) : (
              <EmptySlot key={n} slot={n} onAdd={() => onAdd(n)} />
            );
          })}
        </div>

        {filled === slots.length && (
          <p className="mt-4 rounded-tile bg-raised px-4 py-3 text-[12.5px] leading-relaxed text-muted">
            <span className="font-semibold text-ink">
              All {slots.length} positions are held.
            </span>{" "}
            ICEFALL does not add another. A company wanting this {m.kind === "trek" ? "trek" : "mountain"}{" "}
            joins the waitlist, or waits for a term to end — and a term ending never moves anybody
            automatically.
          </p>
        )}
      </Card>

      <MountainPerformance destinationId={m.id} />
      <PlacementHistory placements={placements} companyName={companyName} />
    </div>
  );
}

function SlotRow({
  placement: p, company, verified, product, onManage,
}: {
  placement: PlacementView;
  company?: string;
  verified: boolean;
  product?: string;
  onManage: () => void;
}) {
  const premium = p.slot_position === 1;
  const expired = p.effective_status === "expired";

  return (
    // Slot #1 carries slightly stronger emphasis as the highest featured
    // POSITION — never as a claim that the company holding it is better. It is
    // the most expensive slot, not the best operator.
    <div
      className="rounded-tile"
      style={premium ? { boxShadow: `inset 0 0 0 1.5px ${GOLD}66` } : undefined}
    >
      <div className={cn("flex flex-wrap items-center gap-x-4 gap-y-3 rounded-tile px-4 py-3.5", premium ? "bg-[#FDF8F1]" : "bg-raised")}>
        <div className="flex w-[104px] shrink-0 flex-col gap-0.5">
          {premium ? (
            <>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-pill px-2 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.06em] text-white" style={{ backgroundColor: GOLD }}>
                <Crown size={11} strokeWidth={2.4} />
                Premium
              </span>
              <span className="text-[10.5px] text-faint">Highest position</span>
            </>
          ) : (
            <>
              <span className="tnum text-[13px] font-bold text-ink">#{p.slot_position}</span>
              <span className="text-[10.5px] uppercase tracking-[0.06em] text-faint">Featured</span>
            </>
          )}
        </div>

        <Avatar name={company ?? "??"} size={34} />

        <div className="min-w-[180px] flex-1">
          <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-ink">
            {company ?? <span className="text-faint">Unknown company</span>}
            {verified && <BadgeCheck size={14} strokeWidth={2.2} className="text-accent" />}
          </p>
          <p className="mt-0.5 text-[12px] text-muted">
            {product ?? <span className="text-faint">No expedition chosen for this slot yet</span>}
          </p>
        </div>

        <div className="tnum w-[92px] shrink-0">
          <p className="text-[13.5px] font-semibold text-ink">
            {formatCents(p.price_cents, p.currency) ?? <span className="text-[12px] font-normal text-faint">Not agreed</span>}
          </p>
          {p.price_cents !== null && <p className="text-[10.5px] text-faint">per term</p>}
        </div>

        <div className="tnum w-[132px] shrink-0 text-[12px] text-muted">
          <p>{formatDay(p.starts_on)}</p>
          <p className="text-faint">→ {formatDay(p.ends_on)}</p>
        </div>

        <div className="w-[128px] shrink-0">
          <Pill tone={expired ? "amber" : p.effective_status === "active" ? "green" : "neutral"}>
            {p.effective_status}
          </Pill>
          {expired && <p className="mt-1 text-[10.5px] leading-tight text-warn">Term ended — still holds this position</p>}
        </div>

        <div className="ml-auto flex shrink-0 gap-2">
          {expired && <Button size="sm" variant="secondary">Renew</Button>}
          <Button size="sm" variant="secondary" onClick={onManage}>Manage</Button>
        </div>
      </div>
    </div>
  );
}

function EmptySlot({ slot, onAdd }: { slot: number; onAdd: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-tile border border-dashed border-line px-4 py-3.5">
      <div className="flex w-[104px] shrink-0 flex-col gap-0.5">
        <span className="tnum text-[13px] font-bold text-ink">#{slot}</span>
        <span className="text-[10.5px] uppercase tracking-[0.06em] text-faint">
          {slot === 1 ? "Premium" : "Featured"}
        </span>
      </div>
      <div className="flex-1">
        <p className="text-[13.5px] font-semibold text-ink">Available</p>
        <p className="mt-0.5 text-[12px] text-faint">No company assigned</p>
      </div>
      <button
        onClick={onAdd}
        className="inline-flex h-9 shrink-0 items-center gap-2 rounded-tile px-4 text-[12.5px] font-semibold text-white"
        style={{ backgroundColor: GOLD }}
      >
        <Plus size={15} strokeWidth={2.2} />
        Add placement
      </button>
    </div>
  );
}

/**
 * Mountain performance — CR-06b, in its honest form.
 *
 * When this section was first built NOTHING here was measurable and it said
 * so. The enquiries table changed half of that: enquiries, bookings, booking
 * value and commission are now COUNTED from real rows naming this
 * destination. Searches and views still have no source — nothing in ICEFALL
 * records a search or a view anywhere, and a row written by a browser about
 * itself would be self-reported — so those two keep the dash and the reason.
 * The mockup's word "searches" gets its measured neighbour, stated as such,
 * exactly like views everywhere else.
 *
 * Scope stated plainly: enquiries counted here are the ones naming this
 * destination directly. A product enquiry names its product and company;
 * products do not yet link a destination, so those cannot be attributed here
 * and are not — an undercount said out loud beats a guess.
 */
function MountainPerformance({ destinationId }: { destinationId: string }) {
  const [enquiries, setEnquiries] = useState<Result<Enquiry[]>>(loading);
  const [bookings, setBookings] = useState<Result<BookingDetailed[]>>(loading);
  useEffect(() => {
    void listEnquiries().then(setEnquiries);
    void listBookingsDetailed().then(setBookings);
  }, []);

  const measured = (() => {
    if (enquiries.state !== "ok" || bookings.state !== "ok") return null;
    const enq = enquiries.value.filter((e) => e.destination_id === destinationId).length;
    const mine = bookings.value.filter((b) => b.destination_id === destinationId);
    const value = mine.reduce((s2, b) => s2 + (b.value_cents ?? 0), 0);
    const valueless = mine.filter((b) => b.value_cents === null).length;
    const commission = mine.reduce(
      (s2, b) => s2 + b.commissions.filter((c) => c.status !== "waived").reduce((x, c) => x + c.amount_cents, 0), 0);
    return { enq, bookings: mine.length, value, valueless, commission };
  })();

  const eurShort = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;

  const tiles: { icon: React.ReactNode; label: string; value: string | null; sub: string }[] = [
    { icon: <Eye size={15} strokeWidth={1.9} />, label: "Searches", value: null, sub: "Not measured — nothing records a search." },
    { icon: <MousePointerClick size={15} strokeWidth={1.9} />, label: "Views", value: null, sub: "Not measured — nothing records a view." },
    { icon: <MessageSquare size={15} strokeWidth={1.9} />, label: "Enquiries", value: measured ? String(measured.enq) : null, sub: measured ? "naming this destination" : "reading…" },
    { icon: <CalendarClock size={15} strokeWidth={1.9} />, label: "Bookings", value: measured ? String(measured.bookings) : null, sub: measured ? "recorded here" : "reading…" },
    { icon: <TrendingUp size={15} strokeWidth={1.9} />, label: "Booking value", value: measured ? eurShort(measured.value) : null, sub: measured ? (measured.valueless > 0 ? `${measured.valueless} carry no value yet` : "sum of recorded values") : "reading…" },
    { icon: <Trophy size={15} strokeWidth={1.9} />, label: "ICEFALL commission", value: measured ? eurShort(measured.commission) : null, sub: measured ? "stored rows, waived excluded" : "reading…" },
  ];

  return (
    <Card>
      <SectionLabel className="mb-3">Mountain performance</SectionLabel>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label}>
            <span className="mb-1.5 flex items-center gap-1.5 text-faint">{t.icon}</span>
            <p className={t.value === null ? "text-[18px] font-bold leading-none text-faint" : "tnum text-[18px] font-bold leading-none text-ink"}>
              {t.value ?? "—"}
            </p>
            <p className="mt-1.5 text-[11.5px] leading-snug text-faint">{t.label}</p>
            <p className="text-[10.5px] leading-snug text-faint">{t.sub}</p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-[12.5px] leading-relaxed text-muted">
        The four figures on the right are counted from real rows naming this destination. Searches and
        views keep the dash because nothing in the product records either — an operator deciding
        whether to renew a paid position should never be shown a number nobody measured.
      </p>
    </Card>
  );
}

function PlacementHistory({
  placements, companyName,
}: { placements: PlacementView[]; companyName: (id: string) => string | undefined }) {
  const past = placements.filter((p) => p.effective_status === "expired");
  return (
    <Card>
      <SectionLabel className="mb-3">Placement history</SectionLabel>
      {past.length === 0 ? (
        <p className="text-[12.5px] text-faint">No placement on this mountain has ended yet.</p>
      ) : (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="pb-2 font-semibold text-faint">Company</th>
              <th className="pb-2 font-semibold text-faint">Slot</th>
              <th className="pb-2 font-semibold text-faint">Term</th>
              <th className="pb-2 font-semibold text-faint">Status</th>
            </tr>
          </thead>
          <tbody>
            {past.map((p) => (
              <tr key={p.id} className="border-b border-line-soft last:border-0">
                <td className="py-2.5 text-ink">{companyName(p.company_id) ?? "Unknown"}</td>
                <td className="tnum py-2.5 text-muted">#{p.slot_position}</td>
                <td className="tnum py-2.5 text-muted">{formatDay(p.starts_on)} — {formatDay(p.ends_on)}</td>
                <td className="py-2.5"><Pill tone="amber">expired</Pill></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

/* ========================================================================== */
/* Drawers                                                                    */
/* ========================================================================== */

function Drawer({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20" onClick={onClose} aria-hidden />
      <aside className="no-scrollbar fixed inset-y-0 right-0 z-50 w-full max-w-[420px] overflow-y-auto bg-surface shadow-lift">
        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          {title}
          <button onClick={onClose} aria-label="Close" className="grid h-8 w-8 shrink-0 place-items-center rounded-tile text-faint hover:bg-raised hover:text-ink">
            <X size={17} strokeWidth={2} />
          </button>
        </div>
        <div className="px-6 pb-8">{children}</div>
      </aside>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-line-soft py-3 last:border-0">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-faint">{label}</p>
      <div className="mt-1 text-[13.5px] text-ink">{children}</div>
    </div>
  );
}

function Action({ icon, label, danger }: { icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <button
      className={cn(
        "flex w-full items-center gap-3 rounded-tile border border-line px-4 py-3 text-left text-[13px] font-medium transition-colors hover:bg-raised",
        danger ? "text-bad" : "text-ink",
      )}
    >
      <span className={danger ? "text-bad" : "text-faint"}>{icon}</span>
      {label}
    </button>
  );
}

function PlacementDrawer({
  placement: p, company, verified, mountain, product, onClose,
}: {
  placement: PlacementView;
  company?: string;
  verified: boolean;
  mountain?: Mountain;
  product?: string;
  onClose: () => void;
}) {
  const premium = p.slot_position === 1;
  return (
    <Drawer
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <Avatar name={company ?? "??"} size={42} />
          <div>
            <p className="flex items-center gap-1.5 text-[16px] font-bold text-ink">
              {company ?? "Unknown company"}
              {verified && <BadgeCheck size={15} strokeWidth={2.2} className="text-accent" />}
            </p>
            <p className="text-[12px] text-faint">
              {verified ? "Documents checked by ICEFALL" : "Documents not checked"}
            </p>
          </div>
        </div>
      }
    >
      <SectionLabel className="mb-2">Current placement</SectionLabel>
      <div className="rounded-tile bg-raised p-4">
        {premium ? (
          <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[10.5px] font-bold uppercase tracking-[0.06em] text-white" style={{ backgroundColor: GOLD }}>
            <Crown size={11} strokeWidth={2.4} /> #1 Premium
          </span>
        ) : (
          <Pill tone="neutral">#{p.slot_position} Featured</Pill>
        )}
        <p className="mt-3 text-[15px] font-bold text-ink">{mountain?.name ?? p.destination_id}</p>
        <p className="text-[12px] text-muted">
          {mountain?.elevation_m ? `${mountain.elevation_m.toLocaleString("en-GB")}m` : ""}
          {mountain?.range ? ` · ${mountain.range}` : ""}
        </p>
        <p className="mt-2 text-[13px] text-ink">
          {product ?? <span className="text-faint">No expedition chosen for this slot yet</span>}
        </p>
      </div>

      <div className="mt-4">
        <Row label="Term">{formatDay(p.starts_on)} → {formatDay(p.ends_on)}</Row>
        <Row label="Price">
          {formatCents(p.price_cents, p.currency) ?? <span className="text-faint">Not agreed</span>}
          {p.price_cents !== null && <span className="text-[12px] text-faint"> per term</span>}
        </Row>
        <Row label="Status">
          <Pill tone={p.effective_status === "active" ? "green" : p.effective_status === "expired" ? "amber" : "neutral"}>
            {p.effective_status}
          </Pill>
          {p.effective_status === "expired" && (
            <p className="mt-1.5 text-[12px] leading-relaxed text-warn">
              The term ended {daysUntil(p.ends_on) * -1} days ago. This company keeps the position
              until an administrator moves or ends the placement — nothing happens on a timer.
            </p>
          )}
        </Row>
      </div>

      {/*
        PERFORMANCE. The design lists impressions, clicks, enquiries, bookings,
        booking value and commission for this placement. ICEFALL measures none of
        them, and this is the screen where inventing one would do the most damage:
        it is what an operator is shown when deciding whether to pay again.
      */}
      <SectionLabel className="mb-2 mt-6">Performance</SectionLabel>
      <div className="rounded-tile bg-raised p-4">
        <div className="grid grid-cols-2 gap-y-2.5">
          {["Impressions", "Clicks", "Enquiries", "Bookings", "Booking value", "ICEFALL commission"].map((l) => (
            <div key={l} className="flex items-center justify-between pr-3">
              <span className="text-[12.5px] text-muted">{l}</span>
              <span className="text-[13px] font-semibold text-faint">—</span>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-muted">
          No performance data yet. Nothing in ICEFALL records an impression or a click, so these
          cannot be counted — and this is the figure a company would renew on.
        </p>
      </div>

      <SectionLabel className="mb-2 mt-6">Actions</SectionLabel>
      <div className="space-y-2">
        <Action icon={<Shuffle size={15} strokeWidth={1.9} />} label="Change slot" />
        <Action icon={<Pencil size={15} strokeWidth={1.9} />} label="Edit placement" />
        <Action icon={<CalendarClock size={15} strokeWidth={1.9} />} label="Extend placement" />
        <Action icon={<PauseCircle size={15} strokeWidth={1.9} />} label="Pause placement" />
        <Action icon={<Ban size={15} strokeWidth={1.9} />} label="End placement" danger />
        <Link
          to={`/admin/companies/${p.company_id}`}
          className="flex w-full items-center gap-3 rounded-tile border border-line px-4 py-3 text-[13px] font-medium text-ink transition-colors hover:bg-raised"
        >
          <ExternalLink size={15} strokeWidth={1.9} className="text-faint" />
          View company profile
        </Link>
      </div>
    </Drawer>
  );
}

/**
 * Add placement — the six steps the brief asks for, and nothing else.
 *
 * The slot step lists only slots that are actually free, because offering a
 * taken one and refusing it afterwards is how an admin learns not to trust the
 * form. Creation is not wired: there is no database behind this build, and a
 * Create button that silently does nothing is worse than one that says so.
 */
function AddPlacementDrawer({
  mountain, slot, taken, companies, products, onClose,
}: {
  mountain: Mountain;
  slot: number;
  taken: number[];
  companies: Result<Company[]>;
  products: Result<Product[]>;
  onClose: () => void;
}) {
  const [companyQuery, setCompanyQuery] = useState("");
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [productId, setProductId] = useState<string | null>(null);
  const [chosenSlot, setChosenSlot] = useState(slot);

  const companyRows = companies.state === "ok"
    ? companies.value.filter((c) => c.name.toLowerCase().includes(companyQuery.trim().toLowerCase())).slice(0, 6)
    : [];
  const productRows = products.state === "ok" && companyId
    ? products.value.filter((p) => p.company_id === companyId)
    : [];
  const free = slotsFor(mountain.kind).filter((n) => !taken.includes(n));

  return (
    <Drawer
      onClose={onClose}
      title={
        <div>
          <p className="text-[17px] font-bold text-ink">Add placement</p>
          <p className="text-[12.5px] text-muted">{mountain.name}</p>
        </div>
      }
    >
      <Step n={1} label="Select company">
        <input
          value={companyQuery}
          onChange={(e) => setCompanyQuery(e.target.value)}
          placeholder="Search companies..."
          className="h-11 w-full rounded-tile border border-line px-3.5 text-[13.5px] outline-none focus:border-accent"
        />
        <div className="mt-2 space-y-1.5">
          {companyRows.map((c) => (
            <button
              key={c.id}
              onClick={() => { setCompanyId(c.id); setProductId(null); }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-tile border px-3 py-2 text-left text-[13px]",
                companyId === c.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line hover:bg-raised",
              )}
            >
              <Avatar name={c.name} size={26} />
              {c.name}
            </button>
          ))}
        </div>
      </Step>

      <Step n={2} label="Select expedition">
        {!companyId ? (
          <p className="text-[12.5px] text-faint">Choose a company first — a slot can only feature that company's own expedition.</p>
        ) : productRows.length === 0 ? (
          <p className="text-[12.5px] text-faint">This company has no expeditions yet.</p>
        ) : (
          <div className="space-y-1.5">
            {productRows.map((p) => (
              <button
                key={p.id}
                onClick={() => setProductId(p.id)}
                className={cn(
                  "w-full rounded-tile border px-3 py-2 text-left text-[13px]",
                  productId === p.id ? "border-accent bg-accent-soft text-accent-ink" : "border-line hover:bg-raised",
                )}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </Step>

      <Step n={3} label="Select slot">
        <div className="flex flex-wrap gap-2">
          {free.map((n) => (
            <button
              key={n}
              onClick={() => setChosenSlot(n)}
              className={cn(
                "h-10 rounded-tile border px-4 text-[12.5px] font-medium",
                chosenSlot === n ? "text-white" : "border-line text-ink hover:bg-raised",
              )}
              style={chosenSlot === n ? { backgroundColor: GOLD, borderColor: GOLD } : undefined}
            >
              {n === 1 ? "#1 Premium" : `#${n}`}
            </button>
          ))}
        </div>
        {free.length === 0 && <p className="text-[12.5px] text-faint">All five positions are held.</p>}
      </Step>

      <Step n={4} label="Term">
        <div className="grid grid-cols-2 gap-3">
          <input type="date" className="h-11 rounded-tile border border-line px-3 text-[13px] outline-none focus:border-accent" />
          <input type="date" className="h-11 rounded-tile border border-line px-3 text-[13px] outline-none focus:border-accent" />
        </div>
      </Step>

      <Step n={5} label="Price">
        <input placeholder="Placement price" className="h-11 w-full rounded-tile border border-line px-3.5 text-[13.5px] outline-none focus:border-accent" />
        <p className="mt-1.5 text-[11.5px] text-faint">Leave empty if the price has not been agreed. It records as unagreed, not as zero.</p>
      </Step>

      <Step n={6} label="Status" last>
        <div className="flex gap-2">
          {["Draft", "Reserved", "Active"].map((s) => (
            <span key={s} className="rounded-pill border border-line px-3.5 py-1.5 text-[12.5px] text-ink">{s}</span>
          ))}
        </div>
      </Step>

      <button
        disabled
        title="No database is connected to this build yet."
        className="mt-6 h-12 w-full cursor-not-allowed rounded-tile text-[14px] font-semibold text-white opacity-45"
        style={{ backgroundColor: GOLD }}
      >
        Create placement
      </button>
      <p className="mt-2 text-center text-[11.5px] text-faint">
        Not wired: there is no database behind this build, and a button that silently does nothing
        is worse than one that says so.
      </p>
    </Drawer>
  );
}

function Step({ n, label, children, last }: { n: number; label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={cn("py-4", !last && "border-b border-line-soft")}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="tnum grid h-6 w-6 place-items-center rounded-full bg-solid text-[11px] font-bold text-white">{n}</span>
        <p className="text-[12px] font-bold uppercase tracking-[0.06em] text-ink">{label}</p>
      </div>
      {children}
    </div>
  );
}
