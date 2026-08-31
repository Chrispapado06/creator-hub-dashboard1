import { useEffect, useMemo, useState } from "react";
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
import { Button, Card, PageHead, Pill, SectionLabel } from "@/components/ui";
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
    <>
      <PageHead
        title="Slot Calculator"
        subtitle="What to charge an operator for a Featured slot on a mountain or trek. A flat monthly placement fee — not a commission, and not tied to bookings made."
        actions={
          <Button variant="secondary" onClick={reset}>
            <RotateCcw size={15} strokeWidth={1.9} />
            Reset calculator
          </Button>
        }
      />

      {/* ---- The formula, live ------------------------------------------- */}
      <Card className="mb-4">
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <Metric
            icon={<Tag size={17} strokeWidth={1.9} />}
            tone="sky"
            label="Base price"
            value={eur(BASE_EUR)}
            caption="Everest, Slot 1, at launch scale"
          />
          <Metric
            icon={<Gauge size={17} strokeWidth={1.9} />}
            tone="mint"
            label="Visibility Index"
            value={listing.index.toFixed(2)}
            caption={`${listing.name} · ${demandBand(listing.index)}`}
          />
          <Metric
            icon={<Layers size={17} strokeWidth={1.9} />}
            tone="lilac"
            label="Slot weight"
            value={`${slots[safeSlot - 1].toFixed(2)}×`}
            caption={`Slot ${safeSlot} of ${slots.length} · ${SLOT_LABELS[safeSlot - 1]}`}
          />
          <Metric
            icon={<Users size={17} strokeWidth={1.9} />}
            tone="butter"
            label="Tier multiplier"
            value={tier ? `${tier.multiplier.toFixed(2)}×` : "—"}
            caption={tier ? `${tier.label} · ${users?.toLocaleString("en-GB")} active users` : "Enter our active users"}
          />
        </div>
        <p className="mt-4 flex items-center justify-center gap-1.5 border-t border-line-soft pt-3 text-[12px] text-faint">
          <Info size={12.5} strokeWidth={1.9} />
          These four numbers multiply together to make the price. Nothing else affects it.
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_400px]">
        {/* ---- 1. Listing ------------------------------------------------- */}
        <Card>
          <Step n={1} title="Select listing" />

          <div className="mt-3 flex rounded-tile bg-raised p-1">
            {(["mountain", "trek"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => pickKind(k)}
                className={cn(
                  "flex-1 rounded-chip py-2 text-[13.5px] font-semibold transition-colors",
                  kind === k ? "bg-surface text-accent shadow-soft" : "text-muted hover:text-ink",
                )}
              >
                {k === "mountain" ? "Mountain" : "Trek"}
              </button>
            ))}
          </div>

          <div className="relative mt-3">
            <Search
              size={15}
              strokeWidth={1.9}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-faint"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${pool.length} ${kind === "mountain" ? "mountains" : "treks"}…`}
              className="h-11 w-full rounded-tile border border-line bg-surface pl-9 pr-3 text-[14px] text-ink outline-none transition-colors focus:border-accent"
            />
          </div>

          {matches.length === 0 ? (
            <p className="mt-3 text-[13px] text-faint">Nothing matches “{query}”.</p>
          ) : (
            <ul className="mt-2 max-h-[196px] overflow-y-auto">
              {matches.map((l) => {
                const on = l.name === listing.name && l.kind === listing.kind;
                return (
                  <li key={`${l.kind}-${l.name}`}>
                    <button
                      type="button"
                      onClick={() => setListing(l)}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-tile px-3 py-2.5 text-left transition-colors",
                        on ? "bg-accent-soft" : "hover:bg-raised",
                      )}
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {on && <Check size={14} strokeWidth={2.4} className="shrink-0 text-accent" />}
                        <span className={cn("truncate text-[13.5px]", on ? "font-semibold text-accent-ink" : "text-ink")}>
                          {l.name}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-[12px] text-faint">{l.index.toFixed(2)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-3 rounded-tile bg-mint/40 px-3.5 py-3">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-muted">
                <MountainIcon size={13.5} strokeWidth={2} />
                Visibility Index
              </span>
              <span className="tnum text-[19px] font-bold text-ink">{listing.index.toFixed(2)}</span>
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
              <TrendingUp size={12.5} strokeWidth={2} />
              {demandBand(listing.index)}
            </p>
          </div>
        </Card>

        {/* ---- 2. Slot, 3. Users ------------------------------------------ */}
        <div className="space-y-4">
          <Card>
            <Step n={2} title="Select slot position" />
            <div className="mt-3 flex gap-2">
              {slots.map((w, i) => {
                const on = safeSlot === i + 1;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSlot(i + 1)}
                    className={cn(
                      "flex-1 rounded-tile border py-2.5 text-center transition-colors",
                      on
                        ? "border-accent bg-accent-soft"
                        : "border-line bg-surface hover:border-faint",
                    )}
                  >
                    <span className={cn("block text-[17px] font-bold", on ? "text-accent-ink" : "text-ink")}>
                      {i + 1}
                    </span>
                    <span className="tnum block text-[11px] text-faint">×{w.toFixed(2)}</span>
                    <span className={cn("mt-0.5 block text-[10.5px] font-semibold", on ? "text-accent" : "text-faint")}>
                      {SLOT_LABELS[i]}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="mt-3 flex gap-1.5 rounded-tile bg-raised px-3 py-2.5 text-[12px] leading-relaxed text-muted">
              <Info size={13} strokeWidth={1.9} className="mt-[3px] shrink-0 text-faint" />
              <span>
              {listing.kind === "trek"
                ? "Treks carry 3 slots. The curve is deliberately flatter — with only three, position 3 still sits above the fold."
                : "Mountains carry 5 slots. Positions 4 and 5 are genuinely worth less and are priced so they can actually be sold."}
              </span>
            </div>
          </Card>

          <Card>
            <Step n={3} title="Our monthly active users" />
            <input
              value={usersText}
              onFocus={() => setTouched(true)}
              onChange={(e) => setUsersText(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              placeholder="e.g. 4200"
              className="tnum mt-3 h-12 w-full rounded-tile border border-line bg-surface px-3.5 text-[19px] font-bold text-ink outline-none transition-colors focus:border-accent"
            />
            {accounts !== null && !touched && usersText === String(accounts) && (
              <p className="mt-2 text-[12px] leading-relaxed text-muted">
                Filled automatically: <span className="tnum font-semibold text-ink">{accounts.toLocaleString("en-GB")}</span>{" "}
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
            <div className="mt-2.5 flex gap-1.5">
              <Info size={13} strokeWidth={1.9} className="mt-[3px] shrink-0 text-faint" />
              <p className="text-[12px] leading-relaxed text-faint">
                People who <strong className="font-semibold text-muted">open the app</strong> in a
                month — never registered accounts. Operators ask, and they check. ICEFALL does not
                measure this yet, so type the figure you are prepared to state out loud.
              </p>
            </div>
            {tier && (
              <div className="mt-3 flex items-center justify-between rounded-tile bg-accent-soft px-3.5 py-2.5">
                <span className="text-[13px] font-semibold text-accent-ink">{tier.label}</span>
                <span className="tnum text-[13px] text-accent-ink">
                  ×{tier.multiplier.toFixed(2)}
                </span>
              </div>
            )}
          </Card>
        </div>

        {/* ---- The price --------------------------------------------------- */}
        <div className="space-y-4">
          {result === null ? (
            /*
              A REASON, NOT A ZERO. An empty box reading "€0" says this slot is
              free. This says what is missing and why.
            */
            <Card className="flex min-h-[300px] flex-col items-center justify-center text-center">
              <span className="grid size-12 place-items-center rounded-pill bg-raised text-faint">
                <Calculator size={22} strokeWidth={1.6} />
              </span>
              <p className="mt-3.5 text-[15.5px] font-bold text-ink">No price yet</p>
              <p className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-muted">
                The price scales with our user base, so there is nothing to show until you enter it
                in step 3.
              </p>
            </Card>
          ) : (
            <>
              <Card>
                <div className="flex items-start justify-between gap-3">
                  <SectionLabel>Monthly price to charge</SectionLabel>
                  <Pill tone={result.quote.soldAs === "per-slot" ? "green" : "amber"}>
                    {result.quote.soldAs === "per-slot" ? "Sold per slot" : "Regional bundle"}
                  </Pill>
                </div>

                <p className="tnum mt-2 text-[46px] font-extrabold leading-none tracking-[-0.035em] text-accent">
                  {eur(result.quote.monthlyEur)}
                </p>
                <p className="mt-2 text-[13px] text-muted">
                  {listing.name} · Slot {safeSlot} · {result.quote.tier.label}
                </p>

                <dl className="mt-4 space-y-2 border-t border-line-soft pt-3.5">
                  <Row label="Base price" value={eur(BASE_EUR)} />
                  <Row label="Visibility Index" value={`×${listing.index.toFixed(2)}`} />
                  <Row label="Slot weight" value={`×${slots[safeSlot - 1].toFixed(2)}`} />
                  <Row label="Tier multiplier" value={`×${result.quote.tier.multiplier.toFixed(2)}`} />
                  <Row label="Before rounding" value={eur2(result.quote.rawEur)} muted />
                </dl>

                <div className="mt-3.5 flex items-baseline justify-between rounded-tile bg-mint/50 px-4 py-3">
                  <span className="text-[13.5px] font-bold text-ink">Monthly invoice</span>
                  <span className="tnum text-[21px] font-extrabold text-ink">
                    {eur(result.quote.monthlyEur)}
                  </span>
                </div>

                {/*
                  §6q — the precision of the output is not evidence about the
                  quality of the input. The breakdown proves the arithmetic and
                  says nothing about whether the Index was earned.
                */}
                <div className="mt-3 flex gap-1.5 text-[11.5px] leading-relaxed text-faint">
                  <Info size={12.5} strokeWidth={1.9} className="mt-[3px] shrink-0" />
                  <span>
                  The Index is an estimate from trip price, market size and competition — not from
                  observed behaviour, which ICEFALL does not measure yet. Correct it quarterly
                  against what actually sells.
                  </span>
                </div>
              </Card>

              <Card>
                <div className="flex items-baseline justify-between">
                  <SectionLabel>Whole page, sold out</SectionLabel>
                  <span className="tnum text-[17px] font-extrabold text-ink">
                    {eur(result.pageTotal)}
                  </span>
                </div>
                <ul className="mt-2.5 divide-y divide-line-soft">
                  {result.page.map((q) => (
                    <li key={q.slot} className="flex items-center justify-between py-2">
                      <span
                        className={cn(
                          "text-[13px]",
                          q.slot === safeSlot ? "font-semibold text-accent" : "text-muted",
                        )}
                      >
                        Slot {q.slot} · {SLOT_LABELS[q.slot - 1]}
                      </span>
                      <span
                        className={cn(
                          "tnum text-[13.5px]",
                          q.slot === safeSlot ? "font-bold text-accent" : "text-ink",
                        )}
                      >
                        {eur(q.monthlyEur)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card>
                <SectionLabel>This slot at every tier</SectionLabel>
                {/*
                  §11 requires the tier table be published upfront so an operator
                  sees renewal cost BEFORE signing. Predictable increases get
                  accepted; surprise increases get disputed.
                */}
                <p className="mt-1.5 text-[12px] leading-relaxed text-faint">
                  Show this before they sign. The rate is locked for the term — a new tier applies
                  at renewal only, never mid-contract.
                </p>
                <ul className="mt-2.5 divide-y divide-line-soft">
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
                      <li key={t.n} className="flex items-center justify-between gap-2 py-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          {here && <Check size={13} strokeWidth={2.6} className="shrink-0 text-accent" />}
                          <span className={cn("text-[13px]", here ? "font-semibold text-accent" : "text-muted")}>
                            {t.label}
                          </span>
                          <span className="tnum truncate text-[11.5px] text-faint">
                            {t.minUsers.toLocaleString("en-GB")}
                            {t.maxUsers === null ? "+" : `–${t.maxUsers.toLocaleString("en-GB")}`}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2">
                          {bundled && <Pill tone="amber">Bundled</Pill>}
                          <span className={cn("tnum text-[13.5px]", here ? "font-bold text-accent" : "text-ink")}>
                            {eur(q.monthlyEur)}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              {result.quote.soldAs === "bundle" && (
                <Card>
                  <div className="flex items-start gap-2.5">
                    <span className="grid size-8 shrink-0 place-items-center rounded-pill bg-butter text-ink">
                      <Lock size={15} strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <SectionLabel>Sold in a Regional Bundle</SectionLabel>
                      {/*
                        The listing still HAS a per-slot price — the rule decides
                        how it is INVOICED, not what it is worth. Below the floor
                        a slot costs more in fees and admin than it earns.
                      */}
                      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                        At {result.quote.tier.label} the lowest slot here falls under the €12 floor,
                        where invoicing costs more than the slot earns. It graduates to per-slot on
                        its own as the user base grows — no repricing needed.
                      </p>
                      <ul className="mt-3 space-y-1.5">
                        {BUNDLE_PACKAGES.map((p) => (
                          <li key={p.name} className="flex items-center justify-between gap-2">
                            <span className="truncate text-[12.5px] text-muted">{p.name}</span>
                            <span className="tnum shrink-0 text-[13px] font-bold text-ink">
                              {eur(bundlePriceEur(p.tier1Eur, result.quote.tier))}/mo
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* ---- Footnotes ---------------------------------------------------- */}
      <Card className="mt-4" tone="panel">
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
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function Step({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-6 shrink-0 place-items-center rounded-pill bg-accent text-[12px] font-bold text-white">
        {n}
      </span>
      <h2 className="text-[15px] font-bold tracking-[-0.01em] text-ink">{title}</h2>
    </div>
  );
}

function Metric({
  icon,
  tone,
  label,
  value,
  caption,
}: {
  icon: React.ReactNode;
  tone: "sky" | "mint" | "lilac" | "butter";
  label: string;
  value: string;
  caption: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <span
        className={cn(
          "grid size-10 shrink-0 place-items-center rounded-pill text-ink",
          tone === "sky" && "bg-sky",
          tone === "mint" && "bg-mint",
          tone === "lilac" && "bg-lilac",
          tone === "butter" && "bg-butter",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-muted">{label}</p>
        <p className="tnum mt-0.5 text-[22px] font-extrabold leading-none tracking-[-0.02em] text-ink">
          {value}
        </p>
        <p className="mt-1 truncate text-[11.5px] text-faint">{caption}</p>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className={cn("text-[12.5px]", muted ? "text-faint" : "text-muted")}>{label}</dt>
      <dd className={cn("tnum text-[13px]", muted ? "text-faint" : "font-semibold text-ink")}>
        {value}
      </dd>
    </div>
  );
}

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[13px] font-bold text-ink">{title}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{children}</p>
    </div>
  );
}
