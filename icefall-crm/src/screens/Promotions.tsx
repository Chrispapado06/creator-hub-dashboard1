import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { GoldButton, Thumb } from "@/components/drawn";
import { DateButton, Select } from "@/components/controls";
import {
  createPromotion, listAudienceFacts, listCompanies, listCompanyPosts,
  listDestinations, listProducts, listPromotions, setPromotionStatus,
} from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Company, Mountain, Product, PromotedPlacement } from "@/data/types";
import { cn, formatDay } from "@/lib/utils";

/**
 * CR-17 — the campaign builder, rebuilt after the owner rejected the one-row
 * form flat ("this design is absolutely horrible"). Their spec, in their
 * words: "we promote a company for x amount of days, their daily budget,
 * reach, what countries to focus on, people that have the trek or mountain
 * that's promoted or general, so targeted or general, what image, etc."
 *
 * So: a stepped builder down the page — WHO → CREATIVE → AUDIENCE → REACH →
 * SCHEDULE & BUDGET → REVIEW — with a live summary beside it, now drawn in the
 * reference theme's language: white cards, neutral ink, one dark primary
 * button, and selection shown by an ink outline rather than a gold one.
 *
 * The three standing rules did not move, they just stopped shouting (quiet
 * footer): DECLARED GOALS ONLY for targeting, PREMIUM EXCLUDED from delivery,
 * and REAL COUNTS, NO FORECASTS. Reach is the rule made visible:
 *
 *   GENERAL reach is COUNTED — the real number of climber accounts (filtered
 *   by focus countries) in the database right now, computed from the same
 *   rows the count claims to describe.
 *
 *   TARGETED reach is stated as NOT COUNTABLE — goals live on people's own
 *   devices and have not synced to a server table, so no honest number
 *   exists. The targeting RULE still works: the reading app knows its own
 *   user's goals and applies it at delivery. The step says exactly that
 *   instead of inventing an estimate, because an invented audience size is
 *   the view-counts lie wearing a media plan.
 */

const STATUS_TONE: Record<PromotedPlacement["status"], string> = {
  draft: "border-border bg-ui-muted/50 text-muted-foreground",
  active: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600",
  suspended: "border-amber-500/20 bg-amber-500/10 text-amber-600",
  ended: "border-destructive/20 bg-destructive/10 text-destructive",
};

/** "CY" → 🇨🇾, via regional-indicator codepoints. */
const flagOf = (code: string) =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

const countryName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
};

const eurWhole = (cents: number) => `€${(cents / 100).toLocaleString("en-GB")}`;

/** The theme has one selected state: an ink outline over the pale accent fill. */
const CHOSEN = "border-foreground bg-ui-accent";
const UNCHOSEN = "border-border bg-card hover:bg-ui-muted/60";

function StepCard({
  n,
  title,
  description,
  action,
  children,
}: {
  n: number;
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium tabular-nums">
            {n}
          </span>
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function Promotions() {
  const [promos, setPromos] = useState<Result<PromotedPlacement[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);
  const [products, setProducts] = useState<Result<Product[]>>(loading);
  const [destinations, setDestinations] = useState<Result<Mountain[]>>(loading);
  const [audience, setAudience] = useState<Result<{ role: string; country_code: string | null }[]>>(loading);
  const [posts, setPosts] = useState<{ id: string; body: string }[]>([]);

  // The build in progress.
  const [companyId, setCompanyId] = useState("");
  const [target, setTarget] = useState(""); // "post:<id>" | "product:<id>"
  const [creative, setCreative] = useState(""); // destination slug for the image
  const [mode, setMode] = useState<"targeted" | "general">("general");
  const [picked, setPicked] = useState<string[]>([]); // focus countries
  const [startsOn, setStartsOn] = useState("");
  const [days, setDays] = useState("14");
  const [dailyEur, setDailyEur] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const refresh = useCallback(() => {
    void listPromotions().then(setPromos);
    void listCompanies().then(setCompanies);
    void listProducts().then(setProducts);
    void listDestinations().then(setDestinations);
    void listAudienceFacts().then(setAudience);
  }, []);
  useEffect(refresh, [refresh]);

  useEffect(() => {
    setTarget("");
    if (!companyId) return void setPosts([]);
    void listCompanyPosts(companyId).then((r) => setPosts(r.state === "ok" ? r.value : []));
  }, [companyId]);

  const companyName = useMemo(() => {
    const m = new Map<string, string>();
    if (companies.state === "ok") for (const c of companies.value) m.set(c.id, c.name);
    return (id: string) => m.get(id) ?? id.slice(0, 8);
  }, [companies]);
  const productName = useMemo(() => {
    const m = new Map<string, string>();
    if (products.state === "ok") for (const p of products.value) m.set(p.id, p.name);
    return (id: string | null) => (id ? (m.get(id) ?? id.slice(0, 8)) : null);
  }, [products]);

  const companyProducts =
    products.state === "ok" && companyId ? products.value.filter((p) => p.company_id === companyId) : [];
  const [tKind, tId] = target.split(":");
  const targetLabel =
    tKind === "product" ? productName(tId) : tKind === "post" ? "a company post" : null;

  /** Countries offered = countries where real accounts exist, with their real
   * counts. Nothing to pick in a country nobody is in — and the list says so. */
  const countryRows = useMemo(() => {
    if (audience.state !== "ok") return null;
    const byCode = new Map<string, number>();
    for (const a of audience.value)
      if (a.country_code && a.role === "athlete")
        byCode.set(a.country_code, (byCode.get(a.country_code) ?? 0) + 1);
    return [...byCode.entries()].sort((x, y) => y[1] - x[1]);
  }, [audience]);

  /** THE reach number: climbers matching the audience, counted from rows. */
  const reach = useMemo(() => {
    if (audience.state !== "ok") return null;
    const climbers = audience.value.filter((a) => a.role === "athlete");
    if (picked.length === 0) return climbers.length;
    return climbers.filter((a) => a.country_code && picked.includes(a.country_code)).length;
  }, [audience, picked]);

  const dayCount = Math.max(0, parseInt(days, 10) || 0);
  const dailyCents = Math.round((parseFloat(dailyEur) || 0) * 100);
  const totalCents = dayCount * dailyCents;
  const endsOn = useMemo(() => {
    if (!startsOn || dayCount < 1) return null;
    const d = new Date(startsOn + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + dayCount - 1);
    return d.toISOString().slice(0, 10);
  }, [startsOn, dayCount]);

  const ready = companyId && target && startsOn && endsOn && dayCount >= 1 && dailyCents > 0;

  const create = async () => {
    if (!ready || !endsOn) return;
    setBusy(true);
    setErr(null);
    setDone(false);
    const r = await createPromotion({
      companyId,
      postId: tKind === "post" ? tId : null,
      productId: tKind === "product" ? tId : null,
      audienceMode: mode,
      countries: picked,
      dailyBudgetCents: dailyCents,
      creativePath: creative ? `/img/destinations/${creative}.jpg` : null,
      startsOn, endsOn,
    });
    setBusy(false);
    if (r.state !== "ok") setErr(r.state === "error" ? r.reason : "No database is configured.");
    else {
      setDone(true);
      setTarget(""); setCreative(""); setPicked([]); setStartsOn(""); setDailyEur("");
    }
    refresh();
  };

  const move = async (id: string, status: PromotedPlacement["status"]) => {
    setBusy(true);
    const r = await setPromotionStatus(id, status);
    setBusy(false);
    if (r.state !== "ok") setErr(r.state === "error" ? r.reason : "No database is configured.");
    refresh();
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h2 className="text-3xl tracking-tight">Promotions</h2>
        <p className="max-w-3xl text-muted-foreground text-sm">
          Build a campaign step by step: who is promoted, with what image, to whom, at what budget. A
          promoted row is always labelled in the feed.
        </p>
      </div>

      {err && <p className="text-destructive text-sm">{err}</p>}
      {done && (
        <p className="font-medium text-ok text-sm">
          Draft created — it is in the campaigns list below, ready to activate.
        </p>
      )}

      <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── The steps ─────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 md:gap-6">
          <StepCard n={1} title="Who is being promoted">
            <Select
              value={companyId}
              onChange={setCompanyId}
              ariaLabel="Company paying for this campaign"
              placeholder="Choose the company paying for this…"
              className="w-full max-w-sm"
              options={companies.state === "ok" ? companies.value.map((c) => ({ value: c.id, label: c.name })) : []}
            />
            {companyId && (
              <div className="mt-4">
                <p className="font-medium text-muted-foreground text-xs">What of theirs runs</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {companyProducts.map((p) => (
                    <button key={p.id} type="button" onClick={() => setTarget(`product:${p.id}`)}
                      className={cn("rounded-lg border px-3 py-2.5 text-left transition-colors",
                        target === `product:${p.id}` ? CHOSEN : UNCHOSEN)}>
                      <span className="block truncate font-medium text-sm">{p.name}</span>
                      <span className="block text-muted-foreground text-xs">
                        {p.price_state === "known" && p.price_from_cents !== null ? `from ${eurWhole(p.price_from_cents)}` : "price on request"} · {p.kind}
                      </span>
                    </button>
                  ))}
                  {posts.map((p) => (
                    <button key={p.id} type="button" onClick={() => setTarget(`post:${p.id}`)}
                      className={cn("rounded-lg border px-3 py-2.5 text-left transition-colors",
                        target === `post:${p.id}` ? CHOSEN : UNCHOSEN)}>
                      <span className="block truncate font-medium text-sm">Post: {p.body.slice(0, 44)}</span>
                      <span className="block text-muted-foreground text-xs">promotes the post itself</span>
                    </button>
                  ))}
                  {companyProducts.length === 0 && posts.length === 0 && (
                    <p className="col-span-full text-[13px] text-faint">
                      This company has no products or posts to promote yet.
                    </p>
                  )}
                </div>
              </div>
            )}
          </StepCard>

          <StepCard n={2} title="The image">
            <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
              <div>
                <Select
                  value={creative}
                  onChange={setCreative}
                  ariaLabel="Photo for the promotion"
                  placeholder="Choose a mountain or trek photo…"
                  options={destinations.state === "ok"
                    ? destinations.value.map((d) => ({ value: d.id, label: d.name, hint: d.kind }))
                    : []}
                />
                <p className="mt-2 text-[13px] leading-relaxed text-faint">
                  Photos come from the licensed destination set. Company uploads join in when the
                  media store is wired to this screen.
                </p>
              </div>
              {/* The preview IS the promise: this is how the promotion renders. */}
              <div className="max-w-[360px] overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
                {creative ? (
                  <Thumb slug={creative} className="h-40 w-full rounded-none border-0" />
                ) : (
                  <div className="grid h-40 w-full place-items-center bg-ui-muted text-[13px] text-faint">no image chosen</div>
                )}
                <div className="px-3.5 py-2.5">
                  <p className="font-medium text-muted-foreground text-xs uppercase tracking-wide">Promoted</p>
                  <p className="truncate font-medium text-sm">{targetLabel ?? "— pick what runs in step 1"}</p>
                  <p className="text-muted-foreground text-xs">{companyId ? companyName(companyId) : ""}</p>
                </div>
              </div>
            </div>
          </StepCard>

          <StepCard n={3} title="Audience — targeted or general">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <button type="button" onClick={() => setMode("targeted")}
                className={cn("rounded-lg border px-4 py-3 text-left transition-colors",
                  mode === "targeted" ? CHOSEN : UNCHOSEN)}>
                <p className="font-medium text-sm">Targeted</p>
                <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                  People whose declared goals name the promoted mountain or trek. Their own words, never
                  an inference.
                </p>
              </button>
              <button type="button" onClick={() => setMode("general")}
                className={cn("rounded-lg border px-4 py-3 text-left transition-colors",
                  mode === "general" ? CHOSEN : UNCHOSEN)}>
                <p className="font-medium text-sm">General</p>
                <p className="mt-0.5 text-muted-foreground text-xs leading-relaxed">
                  Everyone in the feed. Premium members are excluded either way — that is part of what
                  membership buys.
                </p>
              </button>
            </div>

            <Separator className="my-4" />

            <p className="font-medium text-muted-foreground text-xs">Focus countries</p>
            <p className="mt-0.5 text-xs text-faint">Pick none for worldwide. Countries appear here as real accounts exist in them.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {countryRows === null ? (
                <p className="text-[13px] text-faint">Reading who is out there…</p>
              ) : countryRows.length === 0 ? (
                <p className="text-[13px] text-faint">No account has stated a country yet — worldwide is the only honest choice today.</p>
              ) : (
                countryRows.map(([code, n]) => (
                  <button key={code} type="button"
                    onClick={() => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]))}
                    className={cn("flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-[0.8rem] font-medium transition-colors",
                      picked.includes(code) ? CHOSEN : "border-border bg-card text-muted-foreground hover:bg-ui-muted/60 hover:text-foreground")}>
                    <span aria-hidden>{flagOf(code)}</span> {countryName(code)}
                    <span className="text-xs text-faint tabular-nums">{n}</span>
                  </button>
                ))
              )}
            </div>
          </StepCard>

          <StepCard n={4} title="Reach — counted, never forecast">
            {mode === "general" ? (
              <>
                <p className="font-medium text-4xl tabular-nums leading-none tracking-tight">
                  {reach === null ? "…" : reach.toLocaleString("en-GB")}
                </p>
                <p className="mt-2 max-w-2xl text-muted-foreground text-sm leading-relaxed">
                  climber account{reach === 1 ? "" : "s"} match this audience <span className="font-medium text-foreground">today</span>
                  {picked.length > 0 ? ` across ${picked.map(flagOf).join(" ")}` : ", worldwide"} — counted from the
                  live accounts table this second, not projected. It moves when the accounts do.
                </p>
              </>
            ) : (
              <p className="max-w-2xl text-muted-foreground text-sm leading-relaxed">
                <span className="font-medium text-foreground">Targeted reach cannot be counted yet, and this screen
                will not invent it.</span> Goals live on people's own devices and no server table holds them, so
                no honest number exists. The targeting still works — each person's app knows their goals and
                applies the rule at delivery — and the moment goals sync to the server, the real count appears
                here.
              </p>
            )}
          </StepCard>

          <StepCard n={5} title="Schedule &amp; budget">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="promo-starts">Starts</Label>
                <DateButton
                  value={startsOn}
                  onChange={setStartsOn}
                  className="block"
                  ariaLabel="Campaign start date"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="promo-days">Days</Label>
                <Input id="promo-days" type="number" min={1} max={365} value={days}
                  onChange={(e) => setDays(e.target.value)} className="w-24" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="promo-daily">Daily budget (€)</Label>
                <Input id="promo-daily" type="number" min={1} step="1" value={dailyEur}
                  onChange={(e) => setDailyEur(e.target.value)} placeholder="e.g. 40" className="w-32" />
              </div>
              <div className="min-w-[180px] rounded-lg border bg-ui-muted/50 px-3.5 py-2">
                <p className="font-medium text-muted-foreground text-xs">Campaign total</p>
                <p className="font-medium text-xl tabular-nums">
                  {totalCents > 0 ? eurWhole(totalCents) : "—"}
                </p>
                <p className="text-xs text-faint">
                  {dayCount >= 1 && dailyCents > 0
                    ? `${dayCount} day${dayCount === 1 ? "" : "s"} × ${eurWhole(dailyCents)}${endsOn ? `, ends ${formatDay(endsOn)}` : ""}`
                    : "days × daily budget"}
                </p>
              </div>
            </div>
          </StepCard>

          <StepCard n={6} title="Review &amp; create">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-muted-foreground text-sm leading-relaxed">
                {ready ? (
                  <>Promote <span className="font-medium text-foreground">{targetLabel}</span> for{" "}
                  <span className="font-medium text-foreground">{companyName(companyId)}</span>, {mode},{" "}
                  {picked.length > 0 ? picked.map(flagOf).join(" ") : "worldwide"}, {dayCount} days at{" "}
                  {eurWhole(dailyCents)}/day — {eurWhole(totalCents)} total. Born a draft; it reaches no feed
                  until you activate it below.</>
                ) : (
                  "Complete the steps above — the summary appears here before anything is created."
                )}
              </p>
              <GoldButton disabled={!ready || busy} onClick={() => void create()}>
                {busy ? "Creating…" : "Create draft campaign"}
              </GoldButton>
            </div>
          </StepCard>
        </div>

        {/* ── Live summary ──────────────────────────────────────────────── */}
        <Card className="xl:sticky xl:top-16">
          <CardHeader>
            <CardTitle>This campaign</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Company</dt><dd className="text-right font-medium">{companyId ? companyName(companyId) : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Promotes</dt><dd className="text-right font-medium">{targetLabel ?? "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Image</dt><dd className="text-right font-medium">{creative || "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Audience</dt><dd className="text-right font-medium capitalize">{mode}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Countries</dt><dd className="text-right font-medium">{picked.length > 0 ? picked.map(flagOf).join(" ") : "worldwide"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Reach today</dt><dd className="text-right font-medium tabular-nums">{mode === "general" ? (reach ?? "…") : "not countable"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Runs</dt><dd className="text-right font-medium tabular-nums">{startsOn && endsOn ? `${formatDay(startsOn)} – ${formatDay(endsOn)}` : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Daily</dt><dd className="text-right font-medium tabular-nums">{dailyCents > 0 ? eurWhole(dailyCents) : "—"}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Total</dt><dd className="text-right font-semibold tabular-nums">{totalCents > 0 ? eurWhole(totalCents) : "—"}</dd></div>
            </dl>
            <Separator className="my-3" />
            <p className="text-xs leading-relaxed text-faint">
              Targeting uses declared goals only. Premium members never see promotions. Nothing here
              forecasts impressions or clicks — counts are real or absent.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Campaigns ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xl leading-none">Campaigns</CardTitle>
          <CardDescription className="leading-snug">
            Every campaign that has been built, and what it is doing now.
          </CardDescription>
        </CardHeader>
        <CardContent className={cn(promos.state === "ok" && promos.value.length > 0 && "px-0")}>
          {promos.state === "loading" ? (
            <p className="text-[13px] text-faint">Reading campaigns…</p>
          ) : promos.state !== "ok" ? (
            <>
              <p className="text-destructive text-sm leading-relaxed">
                Campaigns could not be read: {"reason" in promos ? promos.reason : ""}
              </p>
              <p className="mt-1 text-[13px] text-faint">
                If this says the table does not exist, the S2 social migration has not been pushed yet.
              </p>
            </>
          ) : promos.value.length === 0 ? (
            <p className="flex items-center gap-2 text-[13px] text-faint">
              <Megaphone className="size-3.5" /> No campaigns yet — the first draft appears here.
            </p>
          ) : (
            <Table className="**:data-[slot='table-cell']:px-3 **:data-[slot='table-head']:px-3">
              <TableHeader className="[&_tr]:border-t">
                <TableRow>
                  <TableHead className="py-3 font-normal">Campaign</TableHead>
                  <TableHead className="py-3 font-normal">Audience</TableHead>
                  <TableHead className="py-3 font-normal">Runs</TableHead>
                  <TableHead className="py-3 text-right font-normal">Daily</TableHead>
                  <TableHead className="py-3 text-right font-normal">Total</TableHead>
                  <TableHead className="py-3 font-normal">Status</TableHead>
                  <TableHead className="py-3 text-right font-normal">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {promos.value.map((p) => {
                  const pDays = Math.round((new Date(p.ends_on).getTime() - new Date(p.starts_on).getTime()) / 86_400_000) + 1;
                  return (
                    <TableRow key={p.id} className="border-border/60">
                      <TableCell className="py-3 align-middle">
                        <span className="flex items-center gap-2.5">
                          {p.creative_path ? (
                            <img src={p.creative_path} alt="" className="h-9 w-12 shrink-0 rounded-md object-cover" />
                          ) : (
                            <span className="h-9 w-12 shrink-0 rounded-md bg-ui-muted" aria-hidden />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-medium">
                              {p.product_id ? (productName(p.product_id) ?? "a product") : "a company post"}
                            </span>
                            <span className="block truncate text-muted-foreground text-xs">{companyName(p.company_id)}</span>
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="py-3 align-middle text-muted-foreground">
                        <span className="capitalize">{p.audience_mode}</span>
                        {p.countries.length > 0 && <span className="ml-1.5">{p.countries.map(flagOf).join(" ")}</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap py-3 align-middle text-muted-foreground tabular-nums">
                        {formatDay(p.starts_on)} – {formatDay(p.ends_on)}
                      </TableCell>
                      <TableCell className="py-3 text-right align-middle tabular-nums">
                        {p.daily_budget_cents !== null ? eurWhole(p.daily_budget_cents) : <span className="text-faint">not set</span>}
                      </TableCell>
                      <TableCell className="py-3 text-right align-middle font-medium tabular-nums">
                        {p.daily_budget_cents !== null ? eurWhole(p.daily_budget_cents * pDays) : <span className="font-normal text-faint">—</span>}
                      </TableCell>
                      <TableCell className="py-3 align-middle">
                        <Badge variant="outline" className={cn("border px-2 py-1 font-medium capitalize", STATUS_TONE[p.status])}>
                          {p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="py-3 text-right align-middle">
                        <span className="flex justify-end gap-1.5">
                          {p.status === "draft" && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void move(p.id, "active")}>Activate</Button>
                          )}
                          {p.status === "active" && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void move(p.id, "suspended")}>Suspend</Button>
                          )}
                          {p.status === "suspended" && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void move(p.id, "active")}>Resume</Button>
                          )}
                          {p.status !== "ended" && (
                            <Button size="sm" variant="outline" disabled={busy} onClick={() => void move(p.id, "ended")}>End</Button>
                          )}
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
