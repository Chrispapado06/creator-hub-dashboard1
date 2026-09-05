"use client";

import * as React from "react";

import { Calculator, Check, Gauge, Info, Layers, Lock, Mountain, RotateCcw, Search, Tag, TrendingUp, Users } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BASE_EUR,
  BUNDLE_PACKAGES,
  TIERS,
  bundlePriceEur,
  isSoldPerSlot,
  quotePage,
  quoteSlot,
  slotWeights,
  tierForActiveUsers,
  type ListingKind,
} from "@/domain/slotPricing";
import { cn } from "@/lib/utils";

import { MOUNTAIN_LISTINGS, SLOT_LABELS, TREK_LISTINGS, type Listing } from "./data";

/**
 * WHAT TO CHARGE FOR A FEATURED SLOT — rebuilt in the new design, on the same
 * pricing model, which was ported unchanged from the previous CRM.
 *
 * THE ONE THING THIS SCREEN REFUSES TO DO is forecast. An earlier version
 * multiplied invented inputs — a 3.2% conversion, a €3,200 average booking —
 * into a figure a salesperson would quote out loud, labelled "not measured"
 * and used anyway. The framework is a FLAT PLACEMENT FEE, not a commission and
 * not tied to bookings made, so revenue projection has no place here and
 * cannot be built honestly until a listing view is recorded anywhere. Nothing
 * in ICEFALL records one today.
 *
 * The strip along the top is therefore the FORMULA, not a dashboard: the four
 * numbers that actually produce the price, live as the inputs change.
 *
 * ACTIVE USERS, NEVER REGISTERED ACCOUNTS. The tier is measured on people who
 * open the app. Claiming fifty thousand users when four thousand open it is
 * how a renewal conversation ends. The field is labelled to make the wrong
 * number awkward to type.
 */

const eur = (n: number) => `€${n.toLocaleString("en-GB")}`;
const eur2 = (n: number) => `€${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A word for the Index band. OUR OWN RATING OF OUR OWN ESTIMATE — it describes
 * where this listing sits on a scale we set, and says nothing about observed
 * demand, which we do not measure.
 */
const demandBand = (i: number) => (i >= 0.4 ? "Strong competition" : i >= 0.2 ? "Moderate competition" : "Emerging");

const PANEL = "rounded-lg border border-border/60 bg-muted/40 p-3";

/**
 * THE `data-[state=active]:` CLASSES ARE A BUG FIX, NOT A STYLE CHOICE.
 * components/ui/tabs.tsx writes its active state as `data-active:…`, which
 * Tailwind compiles to `[data-active]` — an attribute @radix-ui/react-tabs
 * never sets; it sets `data-state="active"`. Restated here in the form Radix
 * actually emits, with the component's own intended values. This affects every
 * Tabs in the app, not just this one — flagged for whoever owns components/ui.
 */
const TAB_ACTIVE = "data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm";

export function SlotCalculator() {
  const [kind, setKind] = React.useState<ListingKind>("mountain");
  const [query, setQuery] = React.useState("");
  const [listing, setListing] = React.useState<Listing>(MOUNTAIN_LISTINGS[0]);
  const [slot, setSlot] = React.useState(1);
  const [usersText, setUsersText] = React.useState("");

  /**
   * EMPTY MEANS NOT ENTERED, NOT ZERO. With no figure there is no tier, no
   * multiplier and no price at all — a "€0" would read as a free slot.
   */
  const users = usersText.trim() === "" ? null : Math.max(0, parseInt(usersText, 10) || 0);

  const pool = kind === "mountain" ? MOUNTAIN_LISTINGS : TREK_LISTINGS;
  const weights = slotWeights(listing.kind);
  const safeSlot = Math.min(slot, weights.length);
  const tier = users === null ? null : tierForActiveUsers(users);

  const matches = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    // Capped at 7: an empty query showing 77 names buries the search box, which
    // is the way in.
    return (q ? pool.filter((l) => l.name.toLowerCase().includes(q)) : pool).slice(0, 7);
  }, [pool, query]);

  const result = React.useMemo(() => {
    if (users === null) return null;
    const quote = quoteSlot({ kind: listing.kind, index: listing.index, slot: safeSlot, monthlyActiveUsers: users });
    const page = quotePage({ kind: listing.kind, index: listing.index, monthlyActiveUsers: users });
    // Summed from the ROUNDED per-slot prices, so the header always equals the
    // rows underneath it.
    return { quote, page, pageTotal: page.reduce((s, q) => s + q.monthlyEur, 0) };
  }, [listing, safeSlot, users]);

  function pickKind(k: ListingKind) {
    setKind(k);
    setQuery("");
    setListing((k === "mountain" ? MOUNTAIN_LISTINGS : TREK_LISTINGS)[0]);
    // Clamped, not reset: someone on Slot 5 of a mountain lands on Slot 3 of a
    // trek rather than back at the top.
    setSlot((s) => Math.min(s, slotWeights(k).length));
  }

  function reset() {
    setKind("mountain");
    setQuery("");
    setListing(MOUNTAIN_LISTINGS[0]);
    setSlot(1);
    setUsersText("");
  }

  const metrics = [
    {
      icon: <Tag className="size-4" />,
      label: "Base price",
      value: eur(BASE_EUR),
      note: "Everest, Slot 1, at launch scale",
    },
    {
      icon: <Gauge className="size-4" />,
      label: "Visibility Index",
      value: listing.index.toFixed(2),
      note: `${listing.name} · ${demandBand(listing.index)}`,
    },
    {
      icon: <Layers className="size-4" />,
      label: "Slot weight",
      value: `×${weights[safeSlot - 1].toFixed(2)}`,
      note: `Slot ${safeSlot} of ${weights.length} · ${SLOT_LABELS[safeSlot - 1]}`,
    },
    {
      // An em dash: no user figure has been entered, so there is no tier and no
      // multiplier. Not ×1.00, which would be a claim.
      icon: <Users className="size-4" />,
      label: "Tier multiplier",
      value: tier ? `×${tier.multiplier.toFixed(2)}` : "—",
      note: tier ? `${tier.label} · ${users?.toLocaleString("en-GB")} active users` : "Enter our active users",
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-1">
          <h1 className="text-3xl tracking-tight">Slot Calculator</h1>
          <p className="max-w-3xl text-muted-foreground text-sm">
            What to charge an operator for a Featured slot on a mountain or trek. A flat monthly placement fee — not a
            commission, and not tied to bookings made.
          </p>
        </div>
        <Button className="shrink-0" onClick={reset} variant="outline">
          <RotateCcw className="size-4" />
          Reset calculator
        </Button>
      </div>

      {/* The formula, live — not a dashboard. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((m) => (
          <Card key={m.label}>
            <CardHeader>
              <CardDescription className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                  {m.icon}
                </span>
                {m.label}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              <div className="font-medium text-2xl tabular-nums leading-none tracking-tight">{m.value}</div>
              <p className="truncate text-muted-foreground text-sm">{m.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="flex items-center justify-center gap-1.5 text-muted-foreground text-sm">
        <Info className="size-3.5 shrink-0" />
        These four numbers multiply together to make the price. Nothing else affects it.
      </p>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Inputs */}
        <Card className="xl:col-span-7">
          <CardHeader>
            <CardTitle className="font-normal">Inputs</CardTitle>
            <CardDescription>Everything the price is computed from, and nothing else.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Step n={1} title="Select listing" />

              <Tabs onValueChange={(v) => pickKind(v as ListingKind)} value={kind}>
                <TabsList className="w-full">
                  <TabsTrigger className={cn("flex-1", TAB_ACTIVE)} value="mountain">
                    Mountain
                  </TabsTrigger>
                  <TabsTrigger className={cn("flex-1", TAB_ACTIVE)} value="trek">
                    Trek
                  </TabsTrigger>
                </TabsList>
              </Tabs>

              <div className="relative">
                <Search className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
                <Input
                  aria-label="Search listings"
                  className="pl-8"
                  id="listing"
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${pool.length} ${kind === "mountain" ? "mountains" : "treks"}…`}
                  value={query}
                />
              </div>

              <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
                {matches.length === 0 ? (
                  // The query is quoted back. "No results" would not tell you
                  // which spelling was tried.
                  <p className="p-3 text-muted-foreground text-sm">Nothing matches &ldquo;{query}&rdquo;.</p>
                ) : (
                  matches.map((l) => {
                    const on = l.name === listing.name && l.kind === listing.kind;
                    return (
                      <button
                        className={cn(
                          "flex w-full items-center justify-between gap-3 border-border border-b px-3 py-2 text-left text-sm last:border-0",
                          on ? "bg-accent font-medium text-accent-foreground" : "hover:bg-muted",
                        )}
                        key={`${l.kind}-${l.name}`}
                        onClick={() => setListing(l)}
                        type="button"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {on && <Check className="size-3.5 shrink-0" />}
                          <span className="truncate">{l.name}</span>
                        </span>
                        <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                          {l.index.toFixed(2)}
                        </span>
                      </button>
                    );
                  })
                )}
              </div>

              <div className={PANEL}>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                    <Mountain className="size-3.5" />
                    Visibility Index
                  </span>
                  <span className="font-medium text-lg tabular-nums leading-none">{listing.index.toFixed(2)}</span>
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-muted-foreground text-sm">
                  <TrendingUp className="size-3.5" />
                  {demandBand(listing.index)}
                </p>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              <Step n={2} title="Select slot position" />
              <div className="flex gap-2">
                {weights.map((w, i) => {
                  const on = safeSlot === i + 1;
                  return (
                    <button
                      className={cn(
                        "flex-1 rounded-lg border py-2.5 text-center transition-colors",
                        on ? "border-foreground bg-accent" : "border-border hover:bg-muted",
                      )}
                      key={i}
                      onClick={() => setSlot(i + 1)}
                      type="button"
                    >
                      <span className="block font-medium text-base leading-none">{i + 1}</span>
                      <span className="mt-1 block text-muted-foreground text-xs tabular-nums">×{w.toFixed(2)}</span>
                      <span className="mt-0.5 block text-muted-foreground text-xs">{SLOT_LABELS[i]}</span>
                    </button>
                  );
                })}
              </div>
              <div className={cn(PANEL, "flex gap-1.5 text-muted-foreground text-sm leading-relaxed")}>
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  {listing.kind === "trek"
                    ? "Treks carry 3 slots. The curve is deliberately flatter — with only three, position 3 still sits above the fold."
                    : "Mountains carry 5 slots. Positions 4 and 5 are genuinely worth less and are priced so they can actually be sold."}
                </span>
              </div>
            </div>

            <Separator />

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Step n={3} title="Our monthly active users" />
                <Button
                  onClick={() =>
                    toast("Nothing filled in", {
                      description:
                        "The registered account count comes from the database, and the data layer is not connected yet. Type the figure you are prepared to state out loud.",
                    })
                  }
                  size="sm"
                  variant="outline"
                >
                  Fill from registered accounts
                </Button>
              </div>
              <Input
                aria-label="Our monthly active users"
                className="tabular-nums"
                id="mau"
                inputMode="numeric"
                onChange={(e) => setUsersText(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="e.g. 4200"
                value={usersText}
              />
              {/*
                The icon sits in a FLEX WRAPPER and the prose in a plain <p>.
                Making the <p> itself the flex container turns every inline
                child into a flex item, so the <strong> becomes its own box and
                the sentence breaks into three columns.
              */}
              <div className="flex gap-1.5">
                <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground text-sm leading-relaxed">
                  People who <strong className="font-medium text-foreground">open the app</strong> in a month — never
                  registered accounts. Operators ask, and they check. ICEFALL does not measure this yet, so type the
                  figure you are prepared to state out loud.
                </p>
              </div>
              {tier && (
                <div className={cn(PANEL, "flex items-center justify-between")}>
                  <span className="font-medium text-sm">{tier.label}</span>
                  <span className="text-sm tabular-nums">×{tier.multiplier.toFixed(2)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4 xl:col-span-5">
          {result === null ? (
            /*
              A REASON, NOT A ZERO. An empty box reading "€0" says this slot is
              free. This says what is missing and why.
            */
            <Card>
              <CardContent className="flex min-h-75 flex-col items-center justify-center text-center">
                <span className="flex size-12 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                  <Calculator className="size-5" />
                </span>
                <p className="mt-3.5 font-medium text-base">No price yet</p>
                <p className="mt-1.5 max-w-75 text-muted-foreground text-sm leading-relaxed">
                  The price scales with our user base, so there is nothing to show until you enter it in step 3.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* The quote */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-normal">What goes on the invoice</CardTitle>
                  <CardDescription>Monthly price to charge</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <div className="font-medium text-4xl tabular-nums leading-none tracking-tight">
                    {eur(result.quote.monthlyEur)}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-muted-foreground text-sm">
                      {listing.name} · Slot {safeSlot} · {result.quote.tier.label}
                    </p>
                    {result.quote.soldAs === "per-slot" ? (
                      <Badge className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" variant="outline">
                        <Check className="size-3" /> Sold per slot
                      </Badge>
                    ) : (
                      <Badge className="border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400" variant="outline">
                        <Lock className="size-3" /> Regional bundle
                      </Badge>
                    )}
                  </div>

                  <Separator />

                  <div className="flex flex-col gap-2 text-sm">
                    <p className="text-muted-foreground">Show your working</p>
                    <dl className="flex flex-col gap-2">
                      <Row label="Base price" value={eur(BASE_EUR)} />
                      <Row label="Visibility Index" value={`×${listing.index.toFixed(2)}`} />
                      <Row label="Slot weight" value={`×${weights[safeSlot - 1].toFixed(2)}`} />
                      <Row label="Tier multiplier" value={`×${result.quote.tier.multiplier.toFixed(2)}`} />
                      {/* Two decimals: the rounding step is half-to-even to €5,
                          and the un-rounded figure is the evidence it was
                          applied correctly. */}
                      <Row label="Before rounding" muted value={eur2(result.quote.rawEur)} />
                    </dl>
                  </div>

                  <div className={cn(PANEL, "flex items-baseline justify-between")}>
                    <span className="font-medium text-sm">Monthly invoice</span>
                    <span className="font-medium text-lg tabular-nums leading-none">{eur(result.quote.monthlyEur)}</span>
                  </div>

                  {/*
                    The precision of the output is not evidence about the quality
                    of the input. The breakdown proves the arithmetic and says
                    nothing about whether the Index was earned.
                  */}
                  <div className="flex gap-1.5 text-muted-foreground text-xs leading-relaxed">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      The Index is an estimate from trip price, market size and competition — not from observed
                      behaviour, which ICEFALL does not measure yet. Correct it quarterly against what actually sells.
                    </span>
                  </div>

                  <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-muted-foreground text-xs leading-relaxed">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      A flat placement fee — not a commission, and not tied to bookings made. There is no revenue
                      forecast here because nothing in ICEFALL records a listing view, and a projection built on
                      invented conversion rates is worse than none.
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-normal">Whole page, sold out</CardTitle>
                  <CardDescription className="font-medium text-base text-foreground tabular-nums">
                    {eur(result.pageTotal)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border/50">
                    {result.page.map((q) => (
                      <li className="flex items-center justify-between py-2 text-sm" key={q.slot}>
                        <span className={cn(q.slot === safeSlot ? "font-medium" : "text-muted-foreground")}>
                          Slot {q.slot} · {SLOT_LABELS[q.slot - 1]}
                        </span>
                        <span className={cn("tabular-nums", q.slot === safeSlot && "font-medium")}>
                          {eur(q.monthlyEur)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="font-normal">This slot at every tier</CardTitle>
                  {/*
                    The tier table is published upfront so an operator sees the
                    renewal cost BEFORE signing. Predictable increases get
                    accepted; surprise increases get disputed.
                  */}
                  <CardDescription className="leading-relaxed">
                    Show this before they sign. The rate is locked for the term — a new tier applies at renewal only,
                    never mid-contract.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border/50">
                    {TIERS.map((t) => {
                      const q = quoteSlot({
                        kind: listing.kind,
                        index: listing.index,
                        slot: safeSlot,
                        monthlyActiveUsers: t.floorUsers,
                      });
                      const here = t.n === result.quote.tier.n;
                      const bundled = !isSoldPerSlot(listing.kind, listing.index, t);
                      return (
                        <li className="flex items-center justify-between gap-2 py-2 text-sm" key={t.n}>
                          <span className="flex min-w-0 items-center gap-1.5">
                            {here && <Check className="size-3.5 shrink-0" />}
                            <span className={cn(here ? "font-medium" : "text-muted-foreground")}>{t.label}</span>
                            <span className="truncate text-muted-foreground text-xs tabular-nums">
                              {t.minUsers.toLocaleString("en-GB")}
                              {t.maxUsers === null ? "+" : `–${t.maxUsers.toLocaleString("en-GB")}`}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {bundled && (
                              <Badge
                                className="border-amber-500/20 bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400"
                                variant="outline"
                              >
                                Bundled
                              </Badge>
                            )}
                            <span className={cn("tabular-nums", here && "font-medium")}>{eur(q.monthlyEur)}</span>
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>

              {result.quote.soldAs === "bundle" && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2.5 font-normal">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-muted/40 text-muted-foreground">
                        <Lock className="size-4" />
                      </span>
                      Sold in a Regional Bundle
                    </CardTitle>
                    {/*
                      The listing still HAS a per-slot price — the rule decides
                      how it is INVOICED, not what it is worth.
                    */}
                    <CardDescription className="leading-relaxed">
                      At {result.quote.tier.label} the lowest slot here falls under the €12 floor, where invoicing costs
                      more than the slot earns. It graduates to per-slot on its own as the user base grows — no
                      repricing needed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y divide-border/50">
                      {BUNDLE_PACKAGES.map((p) => (
                        <li className="flex items-center justify-between gap-2 py-2 text-sm" key={p.name}>
                          <span className="truncate text-muted-foreground">{p.name}</span>
                          <span className="shrink-0 font-medium tabular-nums">
                            {eur(bundlePriceEur(p.tier1Eur, result.quote.tier))}/mo
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <Note title="How the price is set">
            One formula, every listing: base × Index × slot weight × tier multiplier. Nothing is set by hand, so an
            operator on Toubkal is priced by the same logic as one on Everest.
          </Note>
          <Note title="What the Index means">
            How much a slot here is worth against the same slot on Everest. Built from trip price, market size and
            operator competition — competition being the strongest signal, which is why Kilimanjaro sits above K2 on a
            tenth of the trip price.
          </Note>
          <Note title="What money does not move">
            Featured slots are always labelled. Paid placement never reorders the organic list. No operator with an
            unresolved safety incident holds a slot, whatever they have paid.
          </Note>
        </CardContent>
      </Card>
    </div>
  );
}

/** The step number is load-bearing: the "No price yet" copy points at step 3. */
function Step({ n, title }: { n: number; title: string }) {
  return (
    <span className="flex items-center gap-2.5 font-medium text-sm">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground text-xs">
        {n}
      </span>
      {title}
    </span>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", muted ? "text-muted-foreground" : "font-medium")}>{value}</dd>
    </div>
  );
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="font-medium text-sm">{title}</p>
      <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">{children}</p>
    </div>
  );
}
