import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Calculator,
  Check,
  Gauge,
  Info,
  Layers,
  Lock,
  Mountain as MountainIcon,
  RotateCcw,
  Search,
  Tag,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
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
import { MOUNTAINS, TREKS } from "@/domain/visibilityIndex";
import { countAccounts } from "@/data/queries";

/**
 * WHAT TO CHARGE AN OPERATOR FOR A FEATURED SLOT.
 *
 * One question and only this one: given our active user base, a listing and a
 * slot position, what goes on the invoice?
 *
 * REBUILT TWICE. The first version answered a different question — it estimated
 * revenue from expected inquiries, expected bookings and an average booking
 * value, and never called the pricing model once. Every one of those inputs was
 * invented: a 3.2% conversion and a EUR 3,200 booking value, multiplied into a
 * figure a salesperson would quote out loud. It labelled them "not measured" and
 * multiplied by them anyway, which is worse than omitting them — a precise
 * number carrying a disclaimer nobody reads.
 *
 * THE FRAMEWORK IS A FLAT PLACEMENT FEE (§1), explicitly not a commission and
 * not tied to bookings made. A revenue forecast does not belong here and cannot
 * be built honestly until the funnel is instrumented — nothing in the ICEFALL
 * family emits a listing-view event today.
 *
 * THE SUMMARY STRIP IS THE FORMULA, NOT A DASHBOARD. The design this screen
 * follows put four platform metrics along the top: active users, monthly views,
 * inquiry click-through, booking conversion. Three of those are not measured
 * anywhere. Rather than drop the band — it carries the layout — it shows the
 * four numbers that actually produce the price, live as you change the inputs.
 * Same visual weight, and it teaches the model at a glance instead of asserting
 * traffic we cannot see.
 *
 * Every figure comes from `domain/slotPricing.ts`, which reproduces all 613
 * published prices exactly. There is no arithmetic in this file.
 */

/**
 * THE PAGE HEADER, INLINE AND NOT `PageHead` — see the note in Finance.tsx.
 * The theme draws page titles at `text-3xl tracking-tight` (30px / 400);
 * `PageHead` draws 31px extrabold and accepts no className.
 */
function Head({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="space-y-1">
        <h1 className="text-3xl tracking-tight">{title}</h1>
        {subtitle && <p className="max-w-3xl text-muted-foreground text-sm">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type Listing = { name: string; kind: ListingKind; index: number; refPriceEur?: number };

const MOUNTAIN_LISTINGS: readonly Listing[] = MOUNTAINS.map((l) => ({
  name: l.name,
  kind: "mountain" as const,
  index: l.index,
}));
const TREK_LISTINGS: readonly Listing[] = TREKS.map((l) => ({
  name: l.name,
  kind: "trek" as const,
  index: l.index,
  refPriceEur: l.refPriceEur,
}));

/** Names for the positions, as the sales conversation says them out loud. */
const SLOT_LABELS = ["Featured", "Top", "Prime", "Standard", "Basic"] as const;

const eur = (n: number) => `€${n.toLocaleString("en-GB")}`;
const eur2 = (n: number) =>
  `€${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A word for the Index band. OUR OWN RATING OF OUR OWN ESTIMATE — it describes
 * where this listing sits on a scale we set, and says nothing about observed
 * demand, which we do not measure.
 */
const demandBand = (i: number) =>
  i >= 0.4 ? "Strong competition" : i >= 0.2 ? "Moderate competition" : "Emerging";

/** The theme's quiet inner panel, from its own `pipeline-activity` card:
 * `rounded-lg border border-border/60 p-3`. Used for every callout on this
 * screen that used to be a pastel block. */
const PANEL = "rounded-lg border border-border/60 bg-ui-muted/50 p-3";

export default function SlotCalculator() {
  const [kind, setKind] = useState<ListingKind>("mountain");
  const [query, setQuery] = useState("");
  const [listing, setListing] = useState<Listing>(MOUNTAIN_LISTINGS[0]);
  const [slot, setSlot] = useState(1);
  const [usersText, setUsersText] = useState("");
  const [accounts, setAccounts] = useState<number | null>(null);
  const [touched, setTouched] = useState(false);

  /**
   * PREFILLED FROM THE DATABASE — owner's ruling, CR-07 (§6p, recorded here at
   * the point of change): "the total users need to be automatic since the CRM
   * knows the active signups and users." What the CRM knows is the REGISTERED
   * account count, a real number counted live; monthly-active is still measured
   * nowhere, and the caption says so beside the figure rather than letting a
   * precise count pass for activity. The field stays editable — pricing a
   * hypothetical is legitimate; asserting one is not.
   */
  useEffect(() => {
    void countAccounts().then((r) => {
      if (r.state === "ok") setAccounts(r.value);
    });
  }, []);
  useEffect(() => {
    if (!touched && accounts !== null) setUsersText(String(accounts));
  }, [accounts, touched]);

  const users = usersText.trim() === "" ? null : Math.max(0, parseInt(usersText, 10) || 0);

  const pool = kind === "mountain" ? MOUNTAIN_LISTINGS : TREK_LISTINGS;
  const slots = slotWeights(listing.kind);
  const safeSlot = Math.min(slot, slots.length);
  const tier = users === null ? null : tierForActiveUsers(users);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (q ? pool.filter((l) => l.name.toLowerCase().includes(q)) : pool).slice(0, 7);
  }, [query, pool]);

  const result = useMemo(() => {
    if (users === null) return null;
    const quote = quoteSlot({
      kind: listing.kind,
      index: listing.index,
      slot: safeSlot,
      monthlyActiveUsers: users,
    });
    const page = quotePage({ kind: listing.kind, index: listing.index, monthlyActiveUsers: users });
    return { quote, page, pageTotal: page.reduce((s, q) => s + q.monthlyEur, 0) };
  }, [users, listing, safeSlot]);

  function pickKind(k: ListingKind) {
    setKind(k);
    setQuery("");
    const first = (k === "mountain" ? MOUNTAIN_LISTINGS : TREK_LISTINGS)[0];
    setListing(first);
    setSlot((s) => Math.min(s, slotWeights(k).length));
  }

  function reset() {
    setKind("mountain");
    setQuery("");
    setListing(MOUNTAIN_LISTINGS[0]);
    setSlot(1);
    setUsersText("");
  }

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Head
        title="Slot Calculator"
        subtitle="What to charge an operator for a Featured slot on a mountain or trek. A flat monthly placement fee — not a commission, and not tied to bookings made."
        actions={
          <Button variant="outline" onClick={reset}>
            <RotateCcw data-icon="inline-start" />
            Reset calculator
          </Button>
        }
      />

      {/* ---- The formula, live ------------------------------------------- */}
      <Card>
        <CardContent>
          <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            <Metric
              icon={<Tag className="size-4" />}
              label="Base price"
              value={eur(BASE_EUR)}
              caption="Everest, Slot 1, at launch scale"
            />
            <Metric
              icon={<Gauge className="size-4" />}
              label="Visibility Index"
              value={listing.index.toFixed(2)}
              caption={`${listing.name} · ${demandBand(listing.index)}`}
            />
            <Metric
              icon={<Layers className="size-4" />}
              label="Slot weight"
              value={`${slots[safeSlot - 1].toFixed(2)}×`}
              caption={`Slot ${safeSlot} of ${slots.length} · ${SLOT_LABELS[safeSlot - 1]}`}
            />
            {/* An em dash: no user figure has been entered, so there is no tier
                and no multiplier. Not ×1.00, which would be a claim. */}
            <Metric
              icon={<Users className="size-4" />}
              label="Tier multiplier"
              value={tier ? `${tier.multiplier.toFixed(2)}×` : "—"}
              caption={tier ? `${tier.label} · ${users?.toLocaleString("en-GB")} active users` : "Enter our active users"}
            />
          </div>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="flex items-center gap-1.5 text-muted-foreground text-sm">
            <Info className="size-3.5" />
            These four numbers multiply together to make the price. Nothing else affects it.
          </p>
        </CardFooter>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_400px]">
        {/* ---- 1. Listing ------------------------------------------------- */}
        <Card>
          <CardHeader>
            <CardTitle className="leading-none">
              <Step n={1} title="Select listing" />
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* The theme's own segmented control: `TabsList` default variant,
                a `bg-muted` track with a white active pill.

                THE `data-[state=active]:` CLASSES ARE A BUG FIX, NOT A STYLE
                CHOICE. components/ui/tabs.tsx writes its active state as
                `data-active:bg-background data-active:text-foreground
                data-active:shadow-sm`, which Tailwind compiles to
                `[data-active]` — an attribute Radix never sets. Radix sets
                `data-state="active"`. Measured on the running app: the selected
                trigger came back with the same `foreground/60` and transparent
                background as the unselected one, i.e. NOTHING SHOWED WHICH
                LISTING KIND WAS CHOSEN. Restated here in the form Radix
                actually emits, with the component's own intended values. This
                affects every `Tabs` in the app, not just this one — flagged for
                whoever owns components/ui. */}
            <Tabs value={kind} onValueChange={(v) => pickKind(v as ListingKind)}>
              <TabsList className="w-full">
                <TabsTrigger
                  value="mountain"
                  className="flex-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Mountain
                </TabsTrigger>
                <TabsTrigger
                  value="trek"
                  className="flex-1 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm"
                >
                  Trek
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative">
              <Search
                className="-translate-y-1/2 absolute top-1/2 left-2.5 size-4 text-muted-foreground"
                aria-hidden
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${pool.length} ${kind === "mountain" ? "mountains" : "treks"}…`}
                className="pl-8"
                aria-label="Search listings"
              />
            </div>

            {matches.length === 0 ? (
              // The query is quoted back. "No results" would not tell you which
              // spelling was tried.
              <p className="text-muted-foreground text-sm">Nothing matches “{query}”.</p>
            ) : (
              <ul className="max-h-49 overflow-y-auto">
                {matches.map((l) => {
                  const on = l.name === listing.name && l.kind === listing.kind;
                  return (
                    <li key={`${l.kind}-${l.name}`}>
                      <button
                        type="button"
                        onClick={() => setListing(l)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors",
                          on ? "bg-ui-accent font-medium" : "hover:bg-ui-muted",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          {on && <Check className="size-3.5 shrink-0" />}
                          <span className="truncate">{l.name}</span>
                        </span>
                        <span className="shrink-0 text-muted-foreground tabular-nums">
                          {l.index.toFixed(2)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className={PANEL}>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-muted-foreground text-sm">
                  <MountainIcon className="size-3.5" />
                  Visibility Index
                </span>
                <span className="font-medium text-lg tabular-nums leading-none">
                  {listing.index.toFixed(2)}
                </span>
              </div>
              <p className="mt-1.5 flex items-center gap-1.5 text-muted-foreground text-sm">
                <TrendingUp className="size-3.5" />
                {demandBand(listing.index)}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ---- 2. Slot, 3. Users ------------------------------------------ */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="leading-none">
                <Step n={2} title="Select slot position" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                {slots.map((w, i) => {
                  const on = safeSlot === i + 1;
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setSlot(i + 1)}
                      className={cn(
                        "flex-1 rounded-lg border py-2.5 text-center transition-colors",
                        // The theme selects with INK, not with a tint — it is
                        // the same near-black it puts on a primary Button and
                        // on its stat-tile delta pill.
                        on
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-border bg-card hover:bg-ui-muted",
                      )}
                    >
                      <span className="block font-medium text-base leading-none">{i + 1}</span>
                      <span
                        className={cn(
                          "mt-1 block text-xs tabular-nums",
                          on ? "text-primary-foreground/70" : "text-muted-foreground",
                        )}
                      >
                        ×{w.toFixed(2)}
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 block text-xs",
                          on ? "text-primary-foreground/70" : "text-muted-foreground",
                        )}
                      >
                        {SLOT_LABELS[i]}
                      </span>
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="leading-none">
                <Step n={3} title="Our monthly active users" />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5">
              <Input
                value={usersText}
                onFocus={() => setTouched(true)}
                onChange={(e) => setUsersText(e.target.value.replace(/[^\d]/g, ""))}
                inputMode="numeric"
                placeholder="e.g. 4200"
                aria-label="Our monthly active users"
                className="tabular-nums"
              />
              {accounts !== null && !touched && usersText === String(accounts) && (
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Filled automatically:{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {accounts.toLocaleString("en-GB")}
                  </span>{" "}
                  registered accounts, counted live from the database. Monthly-active is not
                  measured yet, so this is the honest ceiling, not activity — edit it to price a
                  different figure.
                </p>
              )}
              {/*
                The framework is blunt about why the wording matters: "Claiming
                50,000 users when 4,000 open the app is the kind of thing that ends
                a renewal conversation and travels fast in a small industry."
              */}
              {/*
                The icon sits in a FLEX WRAPPER and the prose in a plain <p>.
                Making the <p> itself the flex container turns every inline child
                into a flex item, so the <strong> below became its own box and the
                sentence broke into "People who / open the / app". Caught by
                looking at it; it typechecks perfectly either way.
              */}
              <div className="flex gap-1.5">
                <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <p className="text-muted-foreground text-sm leading-relaxed">
                  People who <strong className="font-medium text-foreground">open the app</strong> in a
                  month — never registered accounts. Operators ask, and they check. ICEFALL does not
                  measure this yet, so type the figure you are prepared to state out loud.
                </p>
              </div>
              {tier && (
                <div className={cn(PANEL, "flex items-center justify-between")}>
                  <span className="font-medium text-sm">{tier.label}</span>
                  <span className="text-sm tabular-nums">×{tier.multiplier.toFixed(2)}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ---- The price --------------------------------------------------- */}
        <div className="flex flex-col gap-4">
          {result === null ? (
            /*
              A REASON, NOT A ZERO. An empty box reading "€0" says this slot is
              free. This says what is missing and why.
            */
            <Card>
              <CardContent className="flex min-h-75 flex-col items-center justify-center text-center">
                <span className="flex size-12 items-center justify-center rounded-lg border bg-ui-muted text-muted-foreground">
                  <Calculator className="size-5" />
                </span>
                <p className="mt-3.5 font-medium text-base">No price yet</p>
                <p className="mt-1.5 max-w-75 text-muted-foreground text-sm leading-relaxed">
                  The price scales with our user base, so there is nothing to show until you enter it
                  in step 3.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card>
                <CardHeader>
                  <CardDescription>Monthly price to charge</CardDescription>
                  <CardTitle className="font-normal text-4xl leading-none tracking-tight tabular-nums">
                    {eur(result.quote.monthlyEur)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-muted-foreground text-sm">
                      {listing.name} · Slot {safeSlot} · {result.quote.tier.label}
                    </p>
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-medium",
                        result.quote.soldAs === "per-slot"
                          ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                          : "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
                      )}
                    >
                      {result.quote.soldAs === "per-slot" ? "Sold per slot" : "Regional bundle"}
                    </Badge>
                  </div>

                  <dl className="space-y-2 border-border/60 border-t pt-3.5">
                    <Row label="Base price" value={eur(BASE_EUR)} />
                    <Row label="Visibility Index" value={`×${listing.index.toFixed(2)}`} />
                    <Row label="Slot weight" value={`×${slots[safeSlot - 1].toFixed(2)}`} />
                    <Row label="Tier multiplier" value={`×${result.quote.tier.multiplier.toFixed(2)}`} />
                    <Row label="Before rounding" value={eur2(result.quote.rawEur)} muted />
                  </dl>

                  <div className={cn(PANEL, "flex items-baseline justify-between")}>
                    <span className="font-medium text-sm">Monthly invoice</span>
                    <span className="font-medium text-lg tabular-nums leading-none">
                      {eur(result.quote.monthlyEur)}
                    </span>
                  </div>

                  {/*
                    §6q — the precision of the output is not evidence about the
                    quality of the input. The breakdown proves the arithmetic and
                    says nothing about whether the Index was earned.
                  */}
                  <div className="flex gap-1.5 text-muted-foreground text-xs leading-relaxed">
                    <Info className="mt-0.5 size-3.5 shrink-0" />
                    <span>
                      The Index is an estimate from trip price, market size and competition — not from
                      observed behaviour, which ICEFALL does not measure yet. Correct it quarterly
                      against what actually sells.
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="leading-none">Whole page, sold out</CardTitle>
                  <CardDescription className="font-medium text-foreground text-base tabular-nums">
                    {eur(result.pageTotal)}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-border/50">
                    {result.page.map((q) => (
                      <li key={q.slot} className="flex items-center justify-between py-2 text-sm">
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
                  <CardTitle className="leading-none">This slot at every tier</CardTitle>
                  {/*
                    §11 requires the tier table be published upfront so an operator
                    sees renewal cost BEFORE signing. Predictable increases get
                    accepted; surprise increases get disputed.
                  */}
                  <CardDescription className="leading-relaxed">
                    Show this before they sign. The rate is locked for the term — a new tier applies
                    at renewal only, never mid-contract.
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
                        <li key={t.n} className="flex items-center justify-between gap-2 py-2 text-sm">
                          <span className="flex min-w-0 items-center gap-1.5">
                            {here && <Check className="size-3.5 shrink-0" />}
                            <span className={cn(here ? "font-medium" : "text-muted-foreground")}>
                              {t.label}
                            </span>
                            <span className="truncate text-muted-foreground text-xs tabular-nums">
                              {t.minUsers.toLocaleString("en-GB")}
                              {t.maxUsers === null ? "+" : `–${t.maxUsers.toLocaleString("en-GB")}`}
                            </span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2">
                            {bundled && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/20 bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400"
                              >
                                Bundled
                              </Badge>
                            )}
                            <span className={cn("tabular-nums", here && "font-medium")}>
                              {eur(q.monthlyEur)}
                            </span>
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
                    <CardTitle className="flex items-center gap-2.5 leading-none">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-ui-muted text-muted-foreground">
                        <Lock className="size-4" />
                      </span>
                      Sold in a Regional Bundle
                    </CardTitle>
                    {/*
                      The listing still HAS a per-slot price — the rule decides
                      how it is INVOICED, not what it is worth. Below the floor
                      a slot costs more in fees and admin than it earns.
                    */}
                    <CardDescription className="leading-relaxed">
                      At {result.quote.tier.label} the lowest slot here falls under the €12 floor,
                      where invoicing costs more than the slot earns. It graduates to per-slot on
                      its own as the user base grows — no repricing needed.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="divide-y divide-border/50">
                      {BUNDLE_PACKAGES.map((p) => (
                        <li key={p.name} className="flex items-center justify-between gap-2 py-2 text-sm">
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

      {/* ---- Footnotes ---------------------------------------------------- */}
      <Card>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <Note title="How the price is set">
              One formula, every listing: base × Index × slot weight × tier multiplier. Nothing is set
              by hand, so an operator on Toubkal is priced by the same logic as one on Everest.
            </Note>
            <Note title="What the Index means">
              How much a slot here is worth against the same slot on Everest. Built from trip price,
              market size and operator competition — competition being the strongest signal, which is
              why Kilimanjaro sits above K2 on a tenth of the trip price.
            </Note>
            <Note title="What money does not move">
              Featured slots are always labelled. Paid placement never reorders the organic list. No
              operator with an unresolved safety incident holds a slot, whatever they have paid.
            </Note>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/**
 * The step number, as the theme's own numbered chip: a `bg-primary` square in
 * the radius the theme uses for small marks. Was a gold circle.
 */
function Step({ n, title }: { n: number; title: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary font-medium text-primary-foreground text-xs">
        {n}
      </span>
      {title}
    </span>
  );
}

/**
 * One term of the formula.
 *
 * The four icon squares were four PASTELS — sky, mint, lilac, butter — and
 * index.css now resolves all four to the same neutral, so four differently
 * named tones drew four identical blocks. They take the theme's one neutral
 * square (`rounded-lg border bg-muted text-muted-foreground`, its metric-card
 * idiom) and are told apart by the glyph, which is what the theme does too.
 */
function Metric({
  icon,
  label,
  value,
  caption,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border bg-ui-muted text-muted-foreground">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="mt-1 font-medium text-2xl tabular-nums leading-none tracking-tight">{value}</p>
        <p className="mt-1 truncate text-muted-foreground text-xs">{caption}</p>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("tabular-nums", muted ? "text-muted-foreground" : "font-medium")}>{value}</dd>
    </div>
  );
}

function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-medium text-sm">{title}</p>
      <p className="mt-1.5 text-muted-foreground text-sm leading-relaxed">{children}</p>
    </div>
  );
}
