import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  BadgeCheck, Ban, CalendarClock, ChevronRight, Crown, ExternalLink, Eye,
  MessageSquare, Mountain as MountainIcon, MousePointerClick, Pencil, PauseCircle,
  Plus, Search, Settings2, Shuffle, Star, TrendingUp, Trophy,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Resolve } from "@/components/states";
import { listBookingsDetailed, listCompanies, listDestinations, listEnquiries, listPlacements, listProducts, listLeadDestinations, type BookingDetailed } from "@/data/queries";
import { formatCents, formatCentsShort, loading, type Result } from "@/data/result";
import type { Company, Enquiry, Mountain, PlacementView, Product } from "@/data/types";
import { DateButton } from "@/components/controls";
import { cn, daysUntil, formatDay, initials } from "@/lib/utils";

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
 * The LAYOUT is the reference theme's: white cards, neutral ink, one dark
 * primary button, tabs for a mode switch, a sheet for the detail drawer. The
 * FIGURES are whatever the data actually holds — the brief says so twice ("do
 * not invent real values if the underlying data does not exist", "do not
 * fabricate companies, mountains, pricing, bookings or performance metrics").
 *
 * Performance is the sharpest case. The design shows impressions, clicks and
 * enquiries per placement. ICEFALL records none of them — nothing writes an
 * analytics event anywhere in the product — so those render as absent with the
 * reason. An operator deciding whether to renew a paid position must not be
 * shown a number nobody measured, and that is the one number on this page they
 * would act on.
 *
 * ── WHERE THE GOLD WENT ─────────────────────────────────────────────────────
 * Every `#C79049` on this screen is now a theme token. The four things gold was
 * carrying meaning for kept their meaning in the theme's own palette: the
 * selected mountain is an ink ring, the premium slot is an ink outline over the
 * pale accent, a filled slot dash is ink and an expired one is amber, and the
 * primary action is the theme's near-black button.
 */

/**
 * How many paid positions a destination has. Owner decision 17.
 *
 * Mountains five (1 Premium + 4 Featured), treks three. 252 treks at five apiece
 * would be 1,260 sellable positions, and scarcity is the whole of what makes a
 * featured slot worth buying. The database enforces the same numbers with a
 * trigger — this is the screen agreeing with it, not deciding it.
 */
const slotsFor = (kind: Mountain["kind"]) => (kind === "trek" ? [1, 2, 3] : [1, 2, 3, 4, 5]);

/** The theme's status badge: an outline pill with a coloured dot. */
const DOT: Record<"ok" | "pending" | "bad" | "neutral", { badge: string; dot: string }> = {
  ok: { badge: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600", dot: "bg-emerald-500" },
  pending: { badge: "border-amber-500/20 bg-amber-500/10 text-amber-600", dot: "bg-amber-500" },
  bad: { badge: "border-destructive/20 bg-destructive/10 text-destructive", dot: "bg-destructive" },
  neutral: { badge: "border-border bg-ui-muted/50 text-muted-foreground", dot: "bg-muted-foreground" },
};

function StatusBadge({ state, label }: { state: "ok" | "pending" | "bad" | "neutral"; label: string }) {
  const m = DOT[state];
  return (
    <Badge variant="outline" className={cn("gap-1.5 border px-2 py-1 font-medium capitalize", m.badge)}>
      <span className={cn("size-1.5 rounded-full", m.dot)} />
      {label}
    </Badge>
  );
}

const placementState = (s: PlacementView["effective_status"]): "ok" | "pending" | "bad" | "neutral" =>
  s === "active" ? "ok" : s === "expired" ? "pending" : s === "cancelled" ? "bad" : "neutral";

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
    <span className={cn("grid shrink-0 place-items-center overflow-hidden bg-ui-muted", className)}>
      <MountainIcon className="size-4 text-muted-foreground" aria-hidden />
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

/**
 * One line describing a destination.
 *
 * A MOUNTAIN leads with its summit elevation. A TREK does not have one — its
 * high point is a different claim, and a metre figure beside a trek name reads
 * as a summit somebody stood on. So a trek leads with how long it takes, and
 * says "high point" explicitly where that is known.
 */
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
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h2 className="text-3xl tracking-tight">Mountain Placements</h2>
        <p className="max-w-3xl text-muted-foreground text-sm">
          Manage premium expedition visibility across ICEFALL mountains.
        </p>
      </div>

      <AttentionNeeded rows={rows} mountains={mountains} onGo={setSelected} />
      <Summary mountains={mountains} rows={rows} />

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[minmax(320px,360px)_1fr]">
        {/* ---- Left: find the mountain -------------------------------- */}
        <div className="flex flex-col gap-3">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <Search className="size-3.5" />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search mountains, regions or countries..."
            />
          </InputGroup>

          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
              <TabsList>
                {([
                  ["all", "All"],
                  ["mountain", "Mountains"],
                  ["trek", "Treks"],
                ] as [Kind, string][]).map(([k, label]) => (
                  <TabsTrigger key={k} value={k} className="px-2.5">
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {(["all", "active", "available", "expiring"] as Filter[]).map((f) => (
              <Button
                key={f}
                size="sm"
                variant={filter === f ? "default" : "outline"}
                aria-pressed={filter === f}
                className="capitalize"
                onClick={() => setFilter(f)}
              >
                {f}
              </Button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {mountains.state === "ok"
                ? `${visible.length} ${kind === "trek" ? "treks" : kind === "mountain" ? "mountains" : "destinations"}`
                : "Loading…"}
            </p>
            <span className="text-muted-foreground text-xs">Sorted A–Z</span>
          </div>

          <Resolve
            result={mountains}
            what="destinations"
            isEmpty={() => visible.length === 0}
            empty="No mountain matches that search."
          >
            {() => (
              <div className="flex flex-col gap-2.5">
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
            <div className="flex items-center justify-center gap-1.5">
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
            <Card>
              <CardContent className="grid h-64 place-items-center text-[13px] text-faint">
                Choose a mountain to manage its placements.
              </CardContent>
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
    </div>
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Tile icon={<MountainIcon className="size-4" />} label="Mountains"
        value={count === null ? null : String(count)} sub="In the catalogue" />
      <Tile icon={<Trophy className="size-4" />} label="Slots filled"
        value={capacity === null ? null : `${filled} / ${capacity}`} sub="Paid placements" />
      <Tile icon={<Star className="size-4" />} label="Available"
        value={capacity === null ? null : String(capacity - filled)} sub="Open slots" />
      <Tile icon={<TrendingUp className="size-4" />} label="Active placement value"
        value={formatCentsShort(value)}
        sub={unpriced ? `Excludes ${unpriced} with no agreed price` : "Active placements"} />
      <Tile icon={<CalendarClock className="size-4" />} label="Expiring soon"
        value={String(expiring)} sub="Within 30 days, or already past" />
    </div>
  );
}

/**
 * A figure, or the reason there is not one — never a dash, never a zero standing
 * in for an absence. `Not yet known` is what an unread catalogue says.
 */
function Tile({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | null; sub: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex size-7 items-center justify-center rounded-lg border bg-ui-muted text-muted-foreground">
            {icon}
          </div>
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {value === null ? (
          <p className="text-[13px] leading-snug text-faint">Not yet known</p>
        ) : (
          <p className="font-medium text-3xl tabular-nums leading-none tracking-tight">{value}</p>
        )}
        <p className="text-muted-foreground text-sm">{sub}</p>
      </CardContent>
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
    <Card>
      <CardHeader>
        <CardTitle>Attention needed</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {items.map((i) => (
            <button
              key={i.text}
              onClick={() => i.go && onGo(i.go)}
              className="flex w-full items-center gap-2 text-left text-sm hover:underline"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-foreground" />
              {i.text}
              <ChevronRight className="size-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
      </CardContent>
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
        "flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left transition-colors",
        // Selection is an ink ring, where the mockup used a gold one.
        selected ? "ring-2 ring-foreground" : "ring-1 ring-foreground/10 hover:bg-ui-muted/50",
      )}
    >
      <DestinationImage id={m.id} kind={m.kind} className="relative size-16 rounded-lg" />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-medium">{m.name}</span>
            {m.kind === "trek" && <Badge variant="outline">Trek</Badge>}
          </span>
          {open > 0 ? (
            <span className="shrink-0 font-medium text-emerald-600 text-xs">
              {open} slot{open === 1 ? "" : "s"} available
            </span>
          ) : (
            <span className="shrink-0 font-medium text-muted-foreground text-xs">Full</span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-muted-foreground text-xs">{describe(m)}</span>

        <span className="mt-2 flex items-center justify-between gap-3">
          <span className="flex gap-1">
            {slotsFor(m.kind).map((n) => {
              const p = placements.find((x) => x.slot_position === n);
              return (
                <span
                  key={n}
                  className={cn(
                    "h-1.5 w-6 rounded-full",
                    !p
                      ? "bg-border"
                      : p.effective_status === "expired"
                        ? "bg-amber-500"
                        : p.effective_status === "reserved"
                          ? "bg-muted-foreground/50"
                          : "bg-foreground",
                  )}
                />
              );
            })}
          </span>
          <span className="shrink-0 text-right tabular-nums">
            {/* An em dash: nothing priced has been agreed on this mountain yet. */}
            <span className="block font-medium text-sm">{formatCents(value) ?? "—"}</span>
            <span className="block text-muted-foreground text-xs">Active value</span>
          </span>
        </span>
        <span className="mt-1 block text-muted-foreground text-xs">{filled} / {total} slots filled</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function PageBtn({
  children, onClick, active, disabled,
}: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <Button
      size="sm"
      variant={active ? "default" : "outline"}
      onClick={onClick}
      disabled={disabled}
      className="min-w-7 justify-center px-1.5 tabular-nums"
    >
      {children}
    </Button>
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
    <div className="flex flex-col gap-4">
      {/* Hero band. Photograph credited in public/img/destinations/CREDITS.md. */}
      <div className="relative h-[128px] overflow-hidden rounded-xl">
        <DestinationImage id={m.id} kind={m.kind} className="absolute inset-0 h-full w-full" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/72 via-black/38 to-black/25" />
        <div className="relative flex h-full items-center justify-between gap-4 px-6">
          <div className="min-w-0">
            <h3 className="truncate font-medium text-2xl leading-none tracking-tight text-white">{m.name}</h3>
            <p className="mt-2 truncate text-sm text-white/80">
              {describe(m)}
              {m.country ? ` · ${m.country}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <Button variant="outline" className="border-transparent bg-background/90 hover:bg-background">
              <Settings2 />
              Mountain settings
            </Button>
            <span className="grid h-[54px] w-[74px] place-items-center rounded-lg bg-black/55 text-center">
              <span className="block font-medium text-white tabular-nums">{filled} / {slots.length}</span>
              <span className="mt-1 block text-[9.5px] uppercase tracking-widest text-white/70">Slots filled</span>
            </span>
          </div>
        </div>
      </div>

      {/* CR-06: performance of THIS mountain. Enquiries are counted from real
          lead rows; searches are not measured anywhere in the family (nothing
          emits a search event), and the strip says so instead of drawing 0. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="font-medium text-muted-foreground text-xs">Performance</span>
          <span className="text-muted-foreground text-sm">
            Enquiries:{" "}
            <span className="font-medium text-foreground tabular-nums">
              {enquiriesHere === null ? "—" : enquiriesHere}
            </span>
            {enquiriesHere === null && <span className="text-faint"> (leads could not be read)</span>}
          </span>
          <span className="text-muted-foreground text-sm">
            Searches: <span className="text-faint">not measured — nothing emits a search event yet</span>
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xl leading-none">Featured expedition placements</CardTitle>
          <CardDescription className="max-w-xl leading-snug">
            {slots.length} paid position{slots.length === 1 ? "" : "s"} on this{" "}
            {m.kind === "trek" ? "trek" : "mountain"}. There is no extra one — when they are all
            held, the only options are the waitlist or ending an existing placement.
          </CardDescription>
          {filled < slots.length && (
            <CardAction>
              <Button
                onClick={() => onAdd(slots.find((n) => !placements.some((p) => p.slot_position === n)) ?? 1)}
              >
                <Plus />
                Add placement
              </Button>
            </CardAction>
          )}
        </CardHeader>

        <CardContent className="flex flex-col gap-2.5">
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

          {filled === slots.length && (
            <p className="mt-1.5 rounded-lg border bg-ui-muted/50 px-4 py-3 text-muted-foreground text-sm leading-relaxed">
              <span className="font-medium text-foreground">
                All {slots.length} positions are held.
              </span>{" "}
              ICEFALL does not add another. A company wanting this {m.kind === "trek" ? "trek" : "mountain"}{" "}
              joins the waitlist, or waits for a term to end — and a term ending never moves anybody
              automatically.
            </p>
          )}
        </CardContent>
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
    // the most expensive slot, not the best operator. In the theme that
    // emphasis is an ink outline over the pale accent, not a gold one.
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border px-4 py-3.5",
        premium ? "border-foreground/25 bg-ui-accent" : "border-transparent bg-ui-muted/50",
      )}
    >
      <div className="flex w-[104px] shrink-0 flex-col items-start gap-1">
        {premium ? (
          <>
            <Badge className="gap-1">
              <Crown />
              Premium
            </Badge>
            <span className="text-muted-foreground text-xs">Highest position</span>
          </>
        ) : (
          <>
            <span className="font-medium text-sm tabular-nums">#{p.slot_position}</span>
            <span className="text-muted-foreground text-xs">Featured</span>
          </>
        )}
      </div>

      <Avatar>
        <AvatarFallback>{initials(company ?? "??")}</AvatarFallback>
      </Avatar>

      <div className="min-w-[180px] flex-1">
        <p className="flex items-center gap-1.5 font-medium text-sm">
          {company ?? <span className="text-faint">Unknown company</span>}
          {verified && <BadgeCheck className="size-3.5" />}
        </p>
        <p className="mt-0.5 text-muted-foreground text-xs">
          {product ?? <span className="text-faint">No expedition chosen for this slot yet</span>}
        </p>
      </div>

      <div className="w-[92px] shrink-0 tabular-nums">
        {/* Never a zero: an unpriced slot says nobody has agreed a price. */}
        <p className="font-medium text-sm">
          {formatCents(p.price_cents, p.currency) ?? <span className="font-normal text-xs text-faint">Not agreed</span>}
        </p>
        {p.price_cents !== null && <p className="text-muted-foreground text-xs">per term</p>}
      </div>

      <div className="w-[132px] shrink-0 text-muted-foreground text-xs tabular-nums">
        <p>{formatDay(p.starts_on)}</p>
        <p className="text-faint">→ {formatDay(p.ends_on)}</p>
      </div>

      <div className="w-[132px] shrink-0">
        <StatusBadge state={placementState(p.effective_status)} label={p.effective_status} />
        {expired && <p className="mt-1 text-[10.5px] leading-tight text-warn">Term ended — still holds this position</p>}
      </div>

      <div className="ml-auto flex shrink-0 gap-2">
        {expired && <Button size="sm" variant="outline">Renew</Button>}
        <Button size="sm" variant="outline" onClick={onManage}>Manage</Button>
      </div>
    </div>
  );
}

function EmptySlot({ slot, onAdd }: { slot: number; onAdd: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-lg border border-dashed px-4 py-3.5">
      <div className="flex w-[104px] shrink-0 flex-col gap-0.5">
        <span className="font-medium text-sm tabular-nums">#{slot}</span>
        <span className="text-muted-foreground text-xs">{slot === 1 ? "Premium" : "Featured"}</span>
      </div>
      <div className="flex-1">
        <p className="font-medium text-sm">Available</p>
        <p className="mt-0.5 text-muted-foreground text-xs">No company assigned</p>
      </div>
      <Button size="sm" onClick={onAdd}>
        <Plus />
        Add placement
      </Button>
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
    { icon: <Eye className="size-3.5" />, label: "Searches", value: null, sub: "Not measured — nothing records a search." },
    { icon: <MousePointerClick className="size-3.5" />, label: "Views", value: null, sub: "Not measured — nothing records a view." },
    { icon: <MessageSquare className="size-3.5" />, label: "Enquiries", value: measured ? String(measured.enq) : null, sub: measured ? "naming this destination" : "reading…" },
    { icon: <CalendarClock className="size-3.5" />, label: "Bookings", value: measured ? String(measured.bookings) : null, sub: measured ? "recorded here" : "reading…" },
    { icon: <TrendingUp className="size-3.5" />, label: "Booking value", value: measured ? eurShort(measured.value) : null, sub: measured ? (measured.valueless > 0 ? `${measured.valueless} carry no value yet` : "sum of recorded values") : "reading…" },
    { icon: <Trophy className="size-3.5" />, label: "ICEFALL commission", value: measured ? eurShort(measured.commission) : null, sub: measured ? "stored rows, waived excluded" : "reading…" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mountain performance</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((t) => (
            <div key={t.label}>
              <span className="mb-1.5 flex items-center gap-1.5 text-muted-foreground">{t.icon}</span>
              {/* An em dash is NOT MEASURED. It never stands in for a zero. */}
              <p
                className={cn(
                  "font-medium text-lg leading-none",
                  t.value === null ? "text-faint" : "tabular-nums",
                )}
              >
                {t.value ?? "—"}
              </p>
              <p className="mt-1.5 text-muted-foreground text-xs leading-snug">{t.label}</p>
              <p className="text-[10.5px] leading-snug text-faint">{t.sub}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-muted-foreground text-sm leading-relaxed">
          The four figures on the right are counted from real rows naming this destination. Searches and
          views keep the dash because nothing in the product records either — an operator deciding
          whether to renew a paid position should never be shown a number nobody measured.
        </p>
      </CardContent>
    </Card>
  );
}

function PlacementHistory({
  placements, companyName,
}: { placements: PlacementView[]; companyName: (id: string) => string | undefined }) {
  const past = placements.filter((p) => p.effective_status === "expired");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Placement history</CardTitle>
      </CardHeader>
      <CardContent className={cn(past.length > 0 && "px-0")}>
        {past.length === 0 ? (
          <p className="text-[13px] text-faint">No placement on this mountain has ended yet.</p>
        ) : (
          <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
            <TableHeader className="[&_tr]:border-t">
              <TableRow>
                <TableHead className="py-3 font-normal">Company</TableHead>
                <TableHead className="py-3 font-normal">Slot</TableHead>
                <TableHead className="py-3 font-normal">Term</TableHead>
                <TableHead className="py-3 font-normal">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {past.map((p) => (
                <TableRow key={p.id} className="border-border/60">
                  <TableCell className="py-3 align-middle">{companyName(p.company_id) ?? "Unknown"}</TableCell>
                  <TableCell className="py-3 align-middle text-muted-foreground tabular-nums">#{p.slot_position}</TableCell>
                  {/* The dash between two dates is a range separator, not the
                      not-measured dash. Both ends are real recorded days. */}
                  <TableCell className="py-3 align-middle text-muted-foreground tabular-nums">
                    {formatDay(p.starts_on)} — {formatDay(p.ends_on)}
                  </TableCell>
                  <TableCell className="py-3 align-middle">
                    <StatusBadge state="pending" label="expired" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* ========================================================================== */
/* Drawers — the theme's own Sheet                                            */
/* ========================================================================== */

function Drawer({ title, onClose, children }: { title: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-[440px]">
        <SheetHeader className="pr-12">{title}</SheetHeader>
        <div className="px-4 pb-8">{children}</div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b py-3 last:border-0">
      <p className="font-medium text-muted-foreground text-xs">{label}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function Action({ icon, label, danger }: { icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <Button
      variant={danger ? "destructive" : "outline"}
      size="lg"
      className="w-full justify-start gap-3"
    >
      {icon}
      {label}
    </Button>
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
          <Avatar size="lg">
            <AvatarFallback>{initials(company ?? "??")}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <SheetTitle className="flex items-center gap-1.5">
              {company ?? "Unknown company"}
              {verified && <BadgeCheck className="size-3.5" />}
            </SheetTitle>
            <p className="text-muted-foreground text-xs">
              {verified ? "Documents checked by ICEFALL" : "Documents not checked"}
            </p>
          </div>
        </div>
      }
    >
      <p className="mb-2 font-medium text-muted-foreground text-xs">Current placement</p>
      <div className="rounded-lg border bg-ui-muted/50 p-4">
        {premium ? (
          <Badge className="gap-1">
            <Crown /> #1 Premium
          </Badge>
        ) : (
          <Badge variant="outline">#{p.slot_position} Featured</Badge>
        )}
        <p className="mt-3 font-medium">{mountain?.name ?? p.destination_id}</p>
        <p className="text-muted-foreground text-xs">
          {mountain?.elevation_m ? `${mountain.elevation_m.toLocaleString("en-GB")}m` : ""}
          {mountain?.range ? ` · ${mountain.range}` : ""}
        </p>
        <p className="mt-2 text-sm">
          {product ?? <span className="text-faint">No expedition chosen for this slot yet</span>}
        </p>
      </div>

      <div className="mt-4">
        <Row label="Term">{formatDay(p.starts_on)} → {formatDay(p.ends_on)}</Row>
        <Row label="Price">
          {formatCents(p.price_cents, p.currency) ?? <span className="text-faint">Not agreed</span>}
          {p.price_cents !== null && <span className="text-muted-foreground text-xs"> per term</span>}
        </Row>
        <Row label="Status">
          <StatusBadge state={placementState(p.effective_status)} label={p.effective_status} />
          {p.effective_status === "expired" && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-warn">
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
      <p className="mb-2 mt-6 font-medium text-muted-foreground text-xs">Performance</p>
      <div className="rounded-lg border bg-ui-muted/50 p-4">
        <div className="grid grid-cols-2 gap-y-2.5">
          {["Impressions", "Clicks", "Enquiries", "Bookings", "Booking value", "ICEFALL commission"].map((l) => (
            <div key={l} className="flex items-center justify-between pr-3">
              <span className="text-muted-foreground text-sm">{l}</span>
              <span className="font-medium text-faint text-sm">—</span>
            </div>
          ))}
        </div>
        <Separator className="my-3" />
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          No performance data yet. Nothing in ICEFALL records an impression or a click, so these
          cannot be counted — and this is the figure a company would renew on.
        </p>
      </div>

      <p className="mb-2 mt-6 font-medium text-muted-foreground text-xs">Actions</p>
      <div className="space-y-2">
        <Action icon={<Shuffle />} label="Change slot" />
        <Action icon={<Pencil />} label="Edit placement" />
        <Action icon={<CalendarClock />} label="Extend placement" />
        <Action icon={<PauseCircle />} label="Pause placement" />
        <Action icon={<Ban />} label="End placement" danger />
        <Button variant="outline" size="lg" className="w-full justify-start gap-3" asChild>
          <Link to={`/admin/companies/${p.company_id}`}>
            <ExternalLink />
            View company profile
          </Link>
        </Button>
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
/** The drawer's term pickers, in the kit. The drawer's create path does not
 * read them yet (the write path is the audited placement functions); they
 * hold state so the control behaves, and wire in with the rest of the form. */
function TermDates() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  return (
    <div className="grid grid-cols-2 gap-3">
      <DateButton value={from} onChange={setFrom} placeholder="Starts" ariaLabel="Term starts" />
      <DateButton value={to} onChange={setTo} placeholder="Ends" ariaLabel="Term ends" />
    </div>
  );
}

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
          <SheetTitle>Add placement</SheetTitle>
          <p className="text-muted-foreground text-sm">{mountain.name}</p>
        </div>
      }
    >
      <Step n={1} label="Select company">
        <Input
          value={companyQuery}
          onChange={(e) => setCompanyQuery(e.target.value)}
          placeholder="Search companies..."
        />
        <div className="mt-2 space-y-1.5">
          {companyRows.map((c) => (
            <button
              key={c.id}
              onClick={() => { setCompanyId(c.id); setProductId(null); }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                companyId === c.id ? "border-foreground bg-ui-accent" : "border-border hover:bg-ui-muted/60",
              )}
            >
              <Avatar size="sm">
                <AvatarFallback>{initials(c.name)}</AvatarFallback>
              </Avatar>
              {c.name}
            </button>
          ))}
        </div>
      </Step>

      <Step n={2} label="Select expedition">
        {!companyId ? (
          <p className="text-[13px] text-faint">Choose a company first — a slot can only feature that company's own expedition.</p>
        ) : productRows.length === 0 ? (
          <p className="text-[13px] text-faint">This company has no expeditions yet.</p>
        ) : (
          <div className="space-y-1.5">
            {productRows.map((p) => (
              <button
                key={p.id}
                onClick={() => setProductId(p.id)}
                className={cn(
                  "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                  productId === p.id ? "border-foreground bg-ui-accent" : "border-border hover:bg-ui-muted/60",
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
            <Button
              key={n}
              variant={chosenSlot === n ? "default" : "outline"}
              onClick={() => setChosenSlot(n)}
            >
              {n === 1 ? "#1 Premium" : `#${n}`}
            </Button>
          ))}
        </div>
        {free.length === 0 && <p className="text-[13px] text-faint">All five positions are held.</p>}
      </Step>

      <Step n={4} label="Term">
        <TermDates />
      </Step>

      <Step n={5} label="Price">
        <Input placeholder="Placement price" />
        <p className="mt-1.5 text-xs text-faint">Leave empty if the price has not been agreed. It records as unagreed, not as zero.</p>
      </Step>

      <Step n={6} label="Status" last>
        <div className="flex gap-2">
          {["Draft", "Reserved", "Active"].map((s) => (
            <Badge key={s} variant="outline" className="px-2.5 py-1">{s}</Badge>
          ))}
        </div>
      </Step>

      <Button
        disabled
        size="lg"
        title="No database is connected to this build yet."
        className="mt-6 w-full"
      >
        Create placement
      </Button>
      <p className="mt-2 text-center text-xs text-faint">
        Not wired: there is no database behind this build, and a button that silently does nothing
        is worse than one that says so.
      </p>
    </Drawer>
  );
}

function Step({ n, label, children, last }: { n: number; label: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={cn("py-4", !last && "border-b")}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="grid size-6 place-items-center rounded-full bg-primary text-primary-foreground text-xs font-medium tabular-nums">{n}</span>
        <p className="font-medium text-sm">{label}</p>
      </div>
      {children}
    </div>
  );
}
