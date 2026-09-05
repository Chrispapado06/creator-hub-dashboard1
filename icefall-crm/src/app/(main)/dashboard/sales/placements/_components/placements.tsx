"use client";

import * as React from "react";

import Link from "next/link";

import {
  BadgeCheckIcon,
  CalendarClockIcon,
  ChevronRightIcon,
  CrownIcon,
  EyeIcon,
  MessageSquareIcon,
  MountainIcon,
  MousePointerClickIcon,
  PlusIcon,
  SearchIcon,
  StarIcon,
  TrendingUpIcon,
  TrophyIcon,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

import { AddPlacementDrawer } from "./add-placement-drawer";
import type {
  BookingRow,
  CompanyRow,
  DestinationRow,
  EnquiryRow,
  LeadDestinationRow,
  PlacementView,
  ProductRow,
} from "./data";
import { slotsFor } from "./data";
import { formatCents, formatCentsShort, formatDay } from "./format";
import { initials } from "./format";
import { PlacementDrawer } from "./placement-drawer";
import { describe, DestinationImage, placementState, StatusBadge } from "./shared";

/**
 * MOUNTAIN PLACEMENTS — one mental model.
 *
 *   MOUNTAIN → 5 SLOTS → COMPANY → EXPEDITION → TERM / PRICE
 *
 * The mountain is the unit of work: pick one on the left, manage its five (or,
 * on a trek, three) commercial positions on the right. Nothing else is on
 * screen at that point.
 *
 * Every figure here is a sum or a count over rows that exist. There is no
 * forecast, no projection and no pricing model on this screen — the Slot
 * Calculator owns the rate card, and a computed rate next to an agreed price is
 * exactly the confusion this page must not create.
 */

const PER_PAGE = 6;

type Filter = "all" | "active" | "available" | "expiring";
type Kind = "all" | "mountain" | "trek";

export function Placements({
  destinations,
  placements,
  companies,
  products,
  leadDestinations,
  enquiries,
  bookings,
}: {
  destinations: DestinationRow[];
  placements: PlacementView[];
  companies: CompanyRow[];
  products: ProductRow[];
  leadDestinations: LeadDestinationRow[];
  enquiries: EnquiryRow[];
  bookings: BookingRow[];
}) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [kind, setKind] = React.useState<Kind>("all");
  const [page, setPage] = React.useState(0);
  // The destination the pane opens on is the first one in the list as drawn,
  // not the first row in the array — the two would otherwise disagree.
  const [selected, setSelected] = React.useState<string | null>(
    () => [...destinations].sort((a, b) => a.name.localeCompare(b.name, "en-GB"))[0]?.id ?? null,
  );
  const [openPlacement, setOpenPlacement] = React.useState<PlacementView | null>(null);
  const [addingSlot, setAddingSlot] = React.useState<number | null>(null);

  /** Cancelled rows are excluded from every count, the slot grid and the pane. */
  const held = React.useCallback(
    (id: string) => placements.filter((p) => p.destination_id === id && p.effective_status !== "cancelled"),
    [placements],
  );

  const companyName = React.useCallback(
    (id: string) => companies.find((c) => c.id === id)?.name,
    [companies],
  );
  const companyVerified = React.useCallback(
    (id: string) => companies.find((c) => c.id === id)?.verification_status === "verified",
    [companies],
  );
  const productName = React.useCallback(
    (id: string | null) => (id ? products.find((p) => p.id === id)?.name : undefined),
    [products],
  );

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    /** Search is over the DESTINATION only — name, range, region, country, id. */
    const matches = (m: DestinationRow) =>
      !q || [m.name, m.range, m.region, m.country, m.id].some((v) => v?.toLowerCase().includes(q));

    const passes = (m: DestinationRow) => {
      if (kind !== "all" && m.kind !== kind) return false;
      const h = held(m.id);
      if (filter === "active") return h.some((p) => p.effective_status === "active");
      if (filter === "available") return h.length < slotsFor(m.kind).length;
      if (filter === "expiring")
        return h.some((p) => p.effective_status === "expired" || (p.days_remaining >= 0 && p.days_remaining <= 30));
      return true;
    };

    // The list header claims A–Z, so the rows are actually in that order. A
    // label that contradicts what is on screen is worse than no label.
    return destinations
      .filter((m) => matches(m) && passes(m))
      .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
  }, [destinations, held, query, filter, kind]);

  // Paginated rather than rendered whole: the catalogue is meant to grow to
  // thousands and one DOM list of that size is the named failure.
  const pages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const safePage = Math.min(page, pages - 1);
  const pageRows = visible.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  const current = destinations.find((m) => m.id === selected);
  const currentHeld = current ? held(current.id) : [];

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <AttentionNeeded placements={placements} destinations={destinations} onGo={setSelected} />
      <Summary destinations={destinations} placements={placements} />

      <div className="grid grid-cols-1 gap-4 md:gap-6 xl:grid-cols-[minmax(320px,360px)_1fr]">
        {/* ---- Left: find the destination ------------------------------ */}
        <div className="flex flex-col gap-3">
          <InputGroup>
            <InputGroupAddon align="inline-start">
              <SearchIcon className="size-3.5" />
            </InputGroupAddon>
            <InputGroupInput
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(0);
              }}
              placeholder="Search mountains, regions or countries..."
              aria-label="Search mountains, regions or countries"
            />
          </InputGroup>

          <div className="flex flex-wrap items-center gap-2">
            <Tabs
              value={kind}
              onValueChange={(v) => {
                setKind(v as Kind);
                setPage(0);
              }}
            >
              <TabsList>
                {(
                  [
                    ["all", "All"],
                    ["mountain", "Mountains"],
                    ["trek", "Treks"],
                  ] as [Kind, string][]
                ).map(([k, label]) => (
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
                onClick={() => {
                  setFilter(f);
                  setPage(0);
                }}
              >
                {f}
              </Button>
            ))}
          </div>

          <div className="flex items-center justify-between">
            <p className="text-muted-foreground text-sm">
              {visible.length} {kind === "trek" ? "treks" : kind === "mountain" ? "mountains" : "destinations"}
            </p>
            <span className="text-muted-foreground text-xs">Sorted A–Z</span>
          </div>

          {visible.length === 0 ? (
            <Card>
              <CardContent className="grid h-32 place-items-center text-[13px] text-muted-foreground/70">
                No mountain matches that search.
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-2.5">
              {pageRows.map((m) => (
                <DestinationCard
                  key={m.id}
                  destination={m}
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

          {pages > 1 && (
            <div className="flex items-center justify-center gap-1.5">
              <PageBtn onClick={() => setPage(Math.max(0, safePage - 1))} disabled={safePage === 0}>
                ‹
              </PageBtn>
              {Array.from({ length: pages }, (_, i) => (
                <PageBtn key={`page-${i + 1}`} onClick={() => setPage(i)} active={i === safePage}>
                  {i + 1}
                </PageBtn>
              ))}
              <PageBtn
                onClick={() => setPage(Math.min(pages - 1, safePage + 1))}
                disabled={safePage >= pages - 1}
              >
                ›
              </PageBtn>
            </div>
          )}
        </div>

        {/* ---- Right: manage its positions ------------------------------ */}
        <div>
          {current ? (
            <DestinationPane
              destination={current}
              placements={currentHeld}
              enquiriesHere={leadDestinations.filter((l) => l.destination_id === current.id).length}
              enquiries={enquiries}
              bookings={bookings}
              companyName={companyName}
              companyVerified={companyVerified}
              productName={productName}
              onManage={setOpenPlacement}
              onAdd={setAddingSlot}
            />
          ) : (
            <Card>
              <CardContent className="grid h-64 place-items-center text-[13px] text-muted-foreground/70">
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
          destination={destinations.find((m) => m.id === openPlacement.destination_id)}
          product={productName(openPlacement.product_id)}
          takenSlots={held(openPlacement.destination_id).map((p) => p.slot_position)}
          products={products}
          onClose={() => setOpenPlacement(null)}
        />
      )}

      {addingSlot !== null && current && (
        <AddPlacementDrawer
          destination={current}
          slot={addingSlot}
          taken={currentHeld.map((p) => p.slot_position)}
          companies={companies}
          products={products}
          onClose={() => setAddingSlot(null)}
        />
      )}
    </div>
  );
}

/* ========================================================================== */
/* Admin metrics                                                              */
/* ========================================================================== */

/**
 * Active placement money, kept apart by the currency it was agreed in.
 *
 * Nothing in ICEFALL records an exchange rate, so adding a pound to a euro
 * would be inventing the rate that made them addable. Each currency is summed
 * on its own and the caller renders every subtotal, or says why there is no
 * single figure.
 */
function activeValueByCurrency(rows: PlacementView[]): { currency: string; cents: number }[] {
  const totals = new Map<string, number>();
  for (const p of rows) {
    if (p.effective_status !== "active" || p.price_cents === null) continue;
    totals.set(p.currency, (totals.get(p.currency) ?? 0) + p.price_cents);
  }
  return [...totals].map(([currency, cents]) => ({ currency, cents }));
}

function Summary({
  destinations,
  placements,
}: {
  destinations: DestinationRow[];
  placements: PlacementView[];
}) {
  // Capacity is NOT count × 5: a trek has three positions. Summing per
  // destination is the only way this stays right when the mix changes.
  const capacity = destinations.reduce((n, m) => n + slotsFor(m.kind).length, 0);
  const filled = placements.filter((p) => p.effective_status !== "cancelled").length;
  const totals = activeValueByCurrency(placements);
  const unpriced = placements.filter((p) => p.effective_status === "active" && p.price_cents === null).length;
  const expiring = placements.filter(
    (p) => p.effective_status === "expired" || (p.days_remaining >= 0 && p.days_remaining <= 30),
  ).length;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Tile
        icon={<MountainIcon className="size-4" />}
        label="Mountains"
        value={String(destinations.length)}
        sub="In the catalogue"
      />
      <Tile
        icon={<TrophyIcon className="size-4" />}
        label="Slots filled"
        value={`${filled} / ${capacity}`}
        sub="Paid placements"
      />
      <Tile
        icon={<StarIcon className="size-4" />}
        label="Available"
        value={String(capacity - filled)}
        sub="Open slots"
      />
      <Tile
        icon={<TrendingUpIcon className="size-4" />}
        label="Active placement value"
        value={totals.length === 1 ? formatCentsShort(totals[0].cents, totals[0].currency) : null}
        absent={
          totals.length === 0
            ? "No price agreed on an active placement"
            : `${totals
                .map((t) => formatCentsShort(t.cents, t.currency))
                .join(" and ")} — agreed in different currencies, so they are not added`
        }
        sub={unpriced ? `Excludes ${unpriced} with no agreed price` : "Active placements"}
      />
      <Tile
        icon={<CalendarClockIcon className="size-4" />}
        label="Expiring soon"
        value={String(expiring)}
        sub="Within 30 days, or already past"
      />
    </div>
  );
}

/**
 * A figure, or the reason there is not one — never a dash, never a zero
 * standing in for an absence.
 */
function Tile({
  icon,
  label,
  value,
  sub,
  absent = "Not yet known",
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  sub: string;
  /** Why there is no figure. Only ever read when `value` is null. */
  absent?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
            {icon}
          </div>
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {value === null ? (
          <p className="text-[13px] text-muted-foreground/70 leading-snug">{absent}</p>
        ) : (
          <p className="font-medium text-3xl leading-none tracking-tight tabular-nums">{value}</p>
        )}
        <p className="text-muted-foreground text-sm">{sub}</p>
      </CardContent>
    </Card>
  );
}

/**
 * Only shown when there is something to act on — an alert panel reading
 * "0 placements expire soon" trains people to stop looking at it, which costs
 * more than the panel is worth.
 */
function AttentionNeeded({
  placements,
  destinations,
  onGo,
}: {
  placements: PlacementView[];
  destinations: DestinationRow[];
  onGo: (id: string) => void;
}) {
  const expiring = placements.filter(
    (p) => p.effective_status === "active" && p.days_remaining >= 0 && p.days_remaining <= 30,
  );
  const expired = placements.filter((p) => p.effective_status === "expired");
  // Only destinations that ALREADY SELL. Counting every unsold destination
  // would report almost the whole catalogue, which is not an alert.
  const noPremium = destinations.filter((m) => {
    const on = placements.filter((p) => p.destination_id === m.id && p.effective_status !== "cancelled");
    return on.length > 0 && !on.some((p) => p.slot_position === 1);
  });

  const items: { text: string; go: string }[] = [];
  if (expiring.length)
    items.push({
      text: `${expiring.length} placement${expiring.length === 1 ? "" : "s"} expire within 30 days`,
      go: expiring[0].destination_id,
    });
  if (expired.length)
    items.push({
      text: `${expired.length} placement${expired.length === 1 ? " has" : "s have"} passed their term and still hold their position`,
      go: expired[0].destination_id,
    });
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
              type="button"
              onClick={() => onGo(i.go)}
              className="flex w-full items-center gap-2 text-left text-sm hover:underline"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-foreground" />
              {i.text}
              <ChevronRightIcon className="size-3.5 text-muted-foreground" />
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/* ========================================================================== */
/* The destination list                                                       */
/* ========================================================================== */

function DestinationCard({
  destination: m,
  placements,
  selected,
  onSelect,
}: {
  destination: DestinationRow;
  placements: PlacementView[];
  selected: boolean;
  onSelect: () => void;
}) {
  const total = slotsFor(m.kind).length;
  const filled = placements.length;
  const open = total - filled;
  // Nothing to sum is not a value of zero: no price has been agreed on any
  // active placement here, and a €0 in this spot reads as one that was.
  const totals = activeValueByCurrency(placements);
  const anyActive = placements.some((p) => p.effective_status === "active");
  const noValueReason = anyActive ? "No price agreed on an active placement" : "Nothing active here";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl bg-card p-3 text-left transition-colors",
        selected ? "ring-2 ring-foreground" : "ring-1 ring-foreground/10 hover:bg-muted/50",
      )}
    >
      <DestinationImage id={m.id} kind={m.kind} className="size-16 rounded-lg" />
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
          <span className="max-w-[9.5rem] shrink-0 text-right tabular-nums">
            {totals.length === 0 ? (
              <span className="block text-[11px] text-muted-foreground/70 leading-snug">{noValueReason}</span>
            ) : (
              <>
                {/* One line per currency: two currencies added together would be
                    a figure nobody agreed to. */}
                {totals.map((t) => (
                  <span key={t.currency} className="block font-medium text-sm">
                    {formatCents(t.cents, t.currency)}
                  </span>
                ))}
                <span className="block text-muted-foreground text-xs">
                  {totals.length === 1 ? "Active value" : "Active value, per currency"}
                </span>
              </>
            )}
          </span>
        </span>
        <span className="mt-1 block text-muted-foreground text-xs">
          {filled} / {total} slots filled
        </span>
      </span>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function PageBtn({
  children,
  onClick,
  active,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
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
/* The destination pane — its commercial positions                            */
/* ========================================================================== */

function DestinationPane({
  destination: m,
  placements,
  enquiriesHere,
  enquiries,
  bookings,
  companyName,
  companyVerified,
  productName,
  onManage,
  onAdd,
}: {
  destination: DestinationRow;
  placements: PlacementView[];
  enquiriesHere: number;
  enquiries: EnquiryRow[];
  bookings: BookingRow[];
  companyName: (id: string) => string | undefined;
  companyVerified: (id: string) => boolean;
  productName: (id: string | null) => string | undefined;
  onManage: (p: PlacementView) => void;
  onAdd: (slot: number) => void;
}) {
  const slots = slotsFor(m.kind);
  const filled = placements.length;
  const noun = m.kind === "trek" ? "trek" : "mountain";

  return (
    <div className="flex flex-col gap-4">
      <div className="relative h-[128px] overflow-hidden rounded-xl">
        <DestinationImage id={m.id} kind={m.kind} className="absolute inset-0 h-full w-full" />
        <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/72 via-black/38 to-black/25" />
        <div className="relative flex h-full items-center justify-between gap-4 px-6">
          <div className="min-w-0">
            <h3 className="truncate font-medium text-2xl text-white leading-none tracking-tight">{m.name}</h3>
            <p className="mt-2 truncate text-sm text-white/80">
              {describe(m)}
              {m.country ? ` · ${m.country}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="grid h-[54px] w-[74px] place-items-center rounded-lg bg-black/55 text-center">
              <span className="block font-medium text-white tabular-nums">
                {filled} / {slots.length}
              </span>
              <span className="mt-1 block text-[9.5px] text-white/70 uppercase tracking-widest">
                Slots filled
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Enquiries are counted from real lead rows naming this destination.
          Nothing in ICEFALL emits a search event, and the strip says so in
          words rather than drawing a 0. */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <span className="font-medium text-muted-foreground text-xs">Performance</span>
          <span className="text-muted-foreground text-sm">
            Enquiries: <span className="font-medium text-foreground tabular-nums">{enquiriesHere}</span>
          </span>
          <span className="text-muted-foreground text-sm">
            Searches:{" "}
            <span className="text-muted-foreground/70">not measured — nothing emits a search event yet</span>
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xl leading-none">Featured expedition placements</CardTitle>
          <CardDescription className="max-w-xl leading-snug">
            {slots.length} paid position{slots.length === 1 ? "" : "s"} on this {noun}. There is no extra
            one — when they are all held, the only options are the waitlist or ending an existing
            placement.
          </CardDescription>
          {filled < slots.length && (
            <CardAction>
              <Button onClick={() => onAdd(slots.find((n) => !placements.some((p) => p.slot_position === n)) ?? 1)}>
                <PlusIcon />
                Add placement
              </Button>
            </CardAction>
          )}
        </CardHeader>

        <CardContent className="flex flex-col gap-4 px-0">
          <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
            <TableHeader>
              <TableRow>
                <TableHead className="w-36 font-normal">Slot</TableHead>
                <TableHead className="font-normal">Company</TableHead>
                <TableHead className="font-normal">Term</TableHead>
                <TableHead className="font-normal">Agreed price</TableHead>
                <TableHead className="font-normal">Status</TableHead>
                <TableHead className="text-right font-normal">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {slots.map((n) => {
                const p = placements.find((x) => x.slot_position === n);
                return p ? (
                  <SlotRow
                    key={n}
                    placement={p}
                    company={companyName(p.company_id)}
                    verified={companyVerified(p.company_id)}
                    product={productName(p.product_id)}
                    onManage={() => onManage(p)}
                  />
                ) : (
                  <EmptySlotRow key={n} slot={n} onAdd={() => onAdd(n)} />
                );
              })}
            </TableBody>
          </Table>

          {filled === slots.length && (
            <p className="mx-4 rounded-lg border bg-muted/50 px-4 py-3 text-muted-foreground text-sm leading-relaxed">
              <span className="font-medium text-foreground">All {slots.length} positions are held.</span>{" "}
              ICEFALL does not add another. A company wanting this {noun} joins the waitlist, or waits
              for a term to end — and a term ending never moves anybody automatically.
            </p>
          )}
        </CardContent>
      </Card>

      <DestinationPerformance destinationId={m.id} enquiries={enquiries} bookings={bookings} />
      <PlacementHistory placements={placements} companyName={companyName} />
    </div>
  );
}

function SlotRow({
  placement: p,
  company,
  verified,
  product,
  onManage,
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
    <TableRow className={cn("border-border/60", premium && "bg-accent/60")}>
      <TableCell className="py-3.5 align-middle">
        <Link href={`/dashboard/sales/placements/${p.id}`} className="block hover:underline">
          {premium ? (
            <>
              <Badge className="gap-1">
                <CrownIcon />
                Premium
              </Badge>
              <span className="mt-1 block text-muted-foreground text-xs">Highest position</span>
            </>
          ) : (
            <>
              <span className="block font-medium text-sm tabular-nums">#{p.slot_position}</span>
              <span className="mt-1 block text-muted-foreground text-xs">Featured</span>
            </>
          )}
        </Link>
      </TableCell>

      <TableCell className="py-3.5 align-middle">
        <div className="flex items-center gap-2.5">
          <Avatar size="sm">
            <AvatarFallback>{initials(company ?? "")}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 font-medium text-sm">
              {company ?? <span className="text-muted-foreground/70">Unknown company</span>}
              {verified && <BadgeCheckIcon className="size-3.5" />}
            </p>
            <p className="mt-0.5 text-muted-foreground text-xs">
              {product ?? (
                <span className="text-muted-foreground/70">No expedition chosen for this slot yet</span>
              )}
            </p>
          </div>
        </div>
      </TableCell>

      <TableCell className="py-3.5 align-middle text-muted-foreground text-xs tabular-nums">
        <p>{formatDay(p.starts_on)}</p>
        <p className="text-muted-foreground/70">→ {formatDay(p.ends_on)}</p>
      </TableCell>

      <TableCell className="py-3.5 align-middle tabular-nums">
        {/* Never a zero: an unpriced slot says nobody has agreed a price. */}
        <p className="font-medium text-sm">
          {formatCents(p.price_cents, p.currency) ?? (
            <span className="font-normal text-muted-foreground/70 text-xs">Not agreed</span>
          )}
        </p>
        {p.price_cents !== null && <p className="text-muted-foreground text-xs">per term</p>}
      </TableCell>

      <TableCell className="py-3.5 align-middle">
        <StatusBadge state={placementState(p.effective_status)} label={p.effective_status} />
        {expired && (
          <p className="mt-1 max-w-[132px] text-[10.5px] text-amber-600 leading-tight dark:text-amber-500">
            Term ended — still holds this position
          </p>
        )}
      </TableCell>

      <TableCell className="py-3.5 text-right align-middle">
        <div className="flex justify-end gap-2">
          {expired && (
            <Button size="sm" variant="outline" onClick={onManage}>
              Renew
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onManage}>
            Manage
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** An unsold position. It has no term and no price because nobody bought it. */
function EmptySlotRow({ slot, onAdd }: { slot: number; onAdd: () => void }) {
  return (
    <TableRow className="border-border/60">
      <TableCell className="py-3.5 align-middle">
        <span className="block font-medium text-sm tabular-nums">#{slot}</span>
        <span className="mt-1 block text-muted-foreground text-xs">{slot === 1 ? "Premium" : "Featured"}</span>
      </TableCell>
      <TableCell className="py-3.5 align-middle" colSpan={4}>
        <p className="font-medium text-sm">Available</p>
        <p className="mt-0.5 text-muted-foreground text-xs">No company assigned</p>
      </TableCell>
      <TableCell className="py-3.5 text-right align-middle">
        <Button size="sm" onClick={onAdd}>
          <PlusIcon />
          Add placement
        </Button>
      </TableCell>
    </TableRow>
  );
}

/**
 * Enquiries, bookings, booking value and commission are COUNTED from real rows
 * naming this destination. Searches and views have no source — nothing in
 * ICEFALL records either — so those two keep the dash and the reason.
 */
function DestinationPerformance({
  destinationId,
  enquiries,
  bookings,
}: {
  destinationId: string;
  enquiries: EnquiryRow[];
  bookings: BookingRow[];
}) {
  const enq = enquiries.filter((e) => e.destination_id === destinationId).length;
  const mine = bookings.filter((b) => b.destination_id === destinationId);
  const value = mine.reduce((s, b) => s + (b.value_cents ?? 0), 0);
  const valueless = mine.filter((b) => b.value_cents === null).length;
  const commission = mine.reduce(
    (s, b) => s + b.commissions.filter((c) => c.status !== "waived").reduce((x, c) => x + c.amount_cents, 0),
    0,
  );

  const eurShort = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;

  const tiles: { icon: React.ReactNode; label: string; value: string | null; sub: string }[] = [
    {
      icon: <EyeIcon className="size-3.5" />,
      label: "Searches",
      value: null,
      sub: "Not measured — nothing records a search.",
    },
    {
      icon: <MousePointerClickIcon className="size-3.5" />,
      label: "Views",
      value: null,
      sub: "Not measured — nothing records a view.",
    },
    {
      icon: <MessageSquareIcon className="size-3.5" />,
      label: "Enquiries",
      value: String(enq),
      sub: "naming this destination",
    },
    {
      icon: <CalendarClockIcon className="size-3.5" />,
      label: "Bookings",
      value: String(mine.length),
      sub: "recorded here",
    },
    {
      icon: <TrendingUpIcon className="size-3.5" />,
      label: "Booking value",
      value: eurShort(value),
      sub: valueless > 0 ? `${valueless} carry no value yet` : "sum of recorded values",
    },
    {
      icon: <TrophyIcon className="size-3.5" />,
      label: "ICEFALL commission",
      value: eurShort(commission),
      sub: "stored rows, waived excluded",
    },
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
                  t.value === null ? "text-muted-foreground/70" : "tabular-nums",
                )}
              >
                {t.value ?? "—"}
              </p>
              <p className="mt-1.5 text-muted-foreground text-xs leading-snug">{t.label}</p>
              <p className="text-[10.5px] text-muted-foreground/70 leading-snug">{t.sub}</p>
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
  placements,
  companyName,
}: {
  placements: PlacementView[];
  companyName: (id: string) => string | undefined;
}) {
  const past = placements.filter((p) => p.effective_status === "expired");
  return (
    <Card>
      <CardHeader>
        <CardTitle>Placement history</CardTitle>
      </CardHeader>
      <CardContent className={cn(past.length > 0 && "px-0")}>
        {past.length === 0 ? (
          <p className="text-[13px] text-muted-foreground/70">No placement on this mountain has ended yet.</p>
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
                  <TableCell className="py-3 align-middle text-muted-foreground tabular-nums">
                    #{p.slot_position}
                  </TableCell>
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
