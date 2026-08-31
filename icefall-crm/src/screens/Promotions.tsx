import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { Button, Card, PageHead, Pill, SectionLabel, TableCard } from "@/components/ui";
import { GoldButton, Thumb } from "@/components/drawn";
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
 * SCHEDULE & BUDGET → REVIEW — with a live summary beside it, in the drawn
 * language (white canvas, gold primary, generous cards).
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

const STATUS_TONE: Record<PromotedPlacement["status"], "neutral" | "green" | "amber" | "red"> = {
  draft: "neutral", active: "green", suspended: "amber", ended: "red",
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

function StepCard({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <p className="flex items-center gap-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink text-[11.5px] font-bold text-white">{n}</span>
        <span className="text-[13px] font-semibold text-ink">{title}</span>
      </p>
      <div className="mt-3">{children}</div>
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
    <>
      <PageHead
        title="Promotions"
        subtitle="Build a campaign step by step: who is promoted, with what image, to whom, at what budget. A promoted row is always labelled in the feed."
      />
      {err && <p className="mb-3 text-[12.5px] text-bad">{err}</p>}
      {done && <p className="mb-3 text-[12.5px] font-medium text-ok">Draft created — it is in the campaigns list below, ready to activate.</p>}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── The steps ─────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <StepCard n={1} title="Who is being promoted">
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="h-10 w-full max-w-sm rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none"
            >
              <option value="">Choose the company paying for this…</option>
              {companies.state === "ok" && companies.value.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {companyId && (
              <div className="mt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">What of theirs runs</p>
                <div className="mt-1.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {companyProducts.map((p) => (
                    <button key={p.id} type="button" onClick={() => setTarget(`product:${p.id}`)}
                      className={cn("rounded-tile border px-3 py-2.5 text-left",
                        target === `product:${p.id}` ? "border-[#C79049] bg-butter/30" : "border-line-soft bg-surface hover:bg-raised")}>
                      <span className="block truncate text-[12.5px] font-semibold text-ink">{p.name}</span>
                      <span className="block text-[11px] text-faint">
                        {p.price_state === "known" && p.price_from_cents !== null ? `from ${eurWhole(p.price_from_cents)}` : "price on request"} · {p.kind}
                      </span>
                    </button>
                  ))}
                  {posts.map((p) => (
                    <button key={p.id} type="button" onClick={() => setTarget(`post:${p.id}`)}
                      className={cn("rounded-tile border px-3 py-2.5 text-left",
                        target === `post:${p.id}` ? "border-[#C79049] bg-butter/30" : "border-line-soft bg-surface hover:bg-raised")}>
                      <span className="block truncate text-[12.5px] font-semibold text-ink">Post: {p.body.slice(0, 44)}</span>
                      <span className="block text-[11px] text-faint">promotes the post itself</span>
                    </button>
                  ))}
                  {companyProducts.length === 0 && posts.length === 0 && (
                    <p className="col-span-full text-[12px] text-faint">
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
                <select
                  value={creative}
                  onChange={(e) => setCreative(e.target.value)}
                  className="h-10 w-full rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none"
                >
                  <option value="">Choose a mountain or trek photo…</option>
                  {destinations.state === "ok" &&
                    destinations.value.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
                  Photos come from the licensed destination set. Company uploads join in when the
                  media store is wired to this screen.
                </p>
              </div>
              {/* The preview IS the promise: this is how the promotion renders. */}
              <div className="max-w-[360px] overflow-hidden rounded-card border border-line-soft bg-surface shadow-soft">
                {creative ? (
                  <Thumb slug={creative} className="h-40 w-full rounded-none" />
                ) : (
                  <div className="grid h-40 w-full place-items-center bg-panel text-[12px] text-faint">no image chosen</div>
                )}
                <div className="px-3.5 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-faint">Promoted</p>
                  <p className="truncate text-[13px] font-semibold text-ink">{targetLabel ?? "— pick what runs in step 1"}</p>
                  <p className="text-[11.5px] text-muted">{companyId ? companyName(companyId) : ""}</p>
                </div>
              </div>
            </div>
          </StepCard>

          <StepCard n={3} title="Audience — targeted or general">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <button type="button" onClick={() => setMode("targeted")}
                className={cn("rounded-tile border px-4 py-3 text-left",
                  mode === "targeted" ? "border-[#C79049] bg-butter/30" : "border-line-soft bg-surface hover:bg-raised")}>
                <p className="text-[12.5px] font-semibold text-ink">Targeted</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                  People whose declared goals name the promoted mountain or trek. Their own words, never
                  an inference.
                </p>
              </button>
              <button type="button" onClick={() => setMode("general")}
                className={cn("rounded-tile border px-4 py-3 text-left",
                  mode === "general" ? "border-[#C79049] bg-butter/30" : "border-line-soft bg-surface hover:bg-raised")}>
                <p className="text-[12.5px] font-semibold text-ink">General</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                  Everyone in the feed. Premium members are excluded either way — that is part of what
                  membership buys.
                </p>
              </button>
            </div>

            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">Focus countries</p>
            <p className="mt-0.5 text-[11.5px] text-faint">Pick none for worldwide. Countries appear here as real accounts exist in them.</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {countryRows === null ? (
                <p className="text-[12px] text-faint">Reading who is out there…</p>
              ) : countryRows.length === 0 ? (
                <p className="text-[12px] text-faint">No account has stated a country yet — worldwide is the only honest choice today.</p>
              ) : (
                countryRows.map(([code, n]) => (
                  <button key={code} type="button"
                    onClick={() => setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]))}
                    className={cn("flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12px] font-medium",
                      picked.includes(code) ? "border-[#C79049] bg-butter/40 text-ink" : "border-line-soft bg-surface text-muted hover:text-ink")}>
                    <span aria-hidden>{flagOf(code)}</span> {countryName(code)}
                    <span className="tnum text-[10.5px] text-faint">{n}</span>
                  </button>
                ))
              )}
            </div>
          </StepCard>

          <StepCard n={4} title="Reach — counted, never forecast">
            {mode === "general" ? (
              <>
                <p className="tnum text-[34px] font-extrabold leading-none text-ink">
                  {reach === null ? "…" : reach.toLocaleString("en-GB")}
                </p>
                <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
                  climber account{reach === 1 ? "" : "s"} match this audience <span className="font-semibold text-ink">today</span>
                  {picked.length > 0 ? ` across ${picked.map(flagOf).join(" ")}` : ", worldwide"} — counted from the
                  live accounts table this second, not projected. It moves when the accounts do.
                </p>
              </>
            ) : (
              <p className="max-w-2xl text-[12.5px] leading-relaxed text-muted">
                <span className="font-semibold text-ink">Targeted reach cannot be counted yet, and this screen
                will not invent it.</span> Goals live on people's own devices and no server table holds them, so
                no honest number exists. The targeting still works — each person's app knows their goals and
                applies the rule at delivery — and the moment goals sync to the server, the real count appears
                here.
              </p>
            )}
          </StepCard>

          <StepCard n={5} title="Schedule &amp; budget">
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">Starts</span>
                <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)}
                  className="mt-1 block h-10 rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none" />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">Days</span>
                <input type="number" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)}
                  className="mt-1 block h-10 w-24 rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none" />
              </label>
              <label className="block">
                <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-faint">Daily budget (€)</span>
                <input type="number" min={1} step="1" value={dailyEur} onChange={(e) => setDailyEur(e.target.value)}
                  placeholder="e.g. 40"
                  className="mt-1 block h-10 w-32 rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none placeholder:text-faint" />
              </label>
              <div className="min-w-[160px] rounded-tile bg-panel px-3.5 py-2">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-faint">Campaign total</p>
                <p className="tnum text-[18px] font-extrabold text-ink">
                  {totalCents > 0 ? eurWhole(totalCents) : "—"}
                </p>
                <p className="text-[10.5px] text-faint">
                  {dayCount >= 1 && dailyCents > 0
                    ? `${dayCount} day${dayCount === 1 ? "" : "s"} × ${eurWhole(dailyCents)}${endsOn ? `, ends ${formatDay(endsOn)}` : ""}`
                    : "days × daily budget"}
                </p>
              </div>
            </div>
          </StepCard>

          <StepCard n={6} title="Review &amp; create">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-[12.5px] leading-relaxed text-muted">
                {ready ? (
                  <>Promote <span className="font-semibold text-ink">{targetLabel}</span> for{" "}
                  <span className="font-semibold text-ink">{companyName(companyId)}</span>, {mode},{" "}
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
        <Card className="xl:sticky xl:top-4">
          <SectionLabel>This campaign</SectionLabel>
          <dl className="mt-2 space-y-1.5 text-[12.5px]">
            <div className="flex justify-between gap-3"><dt className="text-muted">Company</dt><dd className="text-right font-medium text-ink">{companyId ? companyName(companyId) : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Promotes</dt><dd className="text-right font-medium text-ink">{targetLabel ?? "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Image</dt><dd className="text-right font-medium text-ink">{creative || "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Audience</dt><dd className="text-right font-medium capitalize text-ink">{mode}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Countries</dt><dd className="text-right font-medium text-ink">{picked.length > 0 ? picked.map(flagOf).join(" ") : "worldwide"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Reach today</dt><dd className="tnum text-right font-medium text-ink">{mode === "general" ? (reach ?? "…") : "not countable"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Runs</dt><dd className="tnum text-right font-medium text-ink">{startsOn && endsOn ? `${formatDay(startsOn)} – ${formatDay(endsOn)}` : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Daily</dt><dd className="tnum text-right font-medium text-ink">{dailyCents > 0 ? eurWhole(dailyCents) : "—"}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Total</dt><dd className="tnum text-right font-extrabold text-ink">{totalCents > 0 ? eurWhole(totalCents) : "—"}</dd></div>
          </dl>
          <p className="mt-3 border-t border-line-soft pt-2.5 text-[10.5px] leading-relaxed text-faint">
            Targeting uses declared goals only. Premium members never see promotions. Nothing here
            forecasts impressions or clicks — counts are real or absent.
          </p>
        </Card>
      </div>

      {/* ── Campaigns ─────────────────────────────────────────────────────── */}
      <div className="mt-6">
        <SectionLabel>Campaigns</SectionLabel>
        {promos.state === "loading" ? (
          <Card className="mt-2"><p className="text-[12.5px] text-faint">Reading campaigns…</p></Card>
        ) : promos.state !== "ok" ? (
          <Card className="mt-2">
            <p className="text-[12.5px] leading-relaxed text-bad">
              Campaigns could not be read: {"reason" in promos ? promos.reason : ""}
            </p>
            <p className="mt-1 text-[12px] text-faint">
              If this says the table does not exist, the S2 social migration has not been pushed yet.
            </p>
          </Card>
        ) : promos.value.length === 0 ? (
          <Card className="mt-2">
            <p className="flex items-center gap-2 text-[12.5px] text-faint">
              <Megaphone size={14} strokeWidth={2} /> No campaigns yet — the first draft appears here.
            </p>
          </Card>
        ) : (
          <TableCard className="mt-2">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-faint">
                  <th className="px-4 py-3 font-medium">Campaign</th>
                  <th className="px-3 py-3 font-medium">Audience</th>
                  <th className="px-3 py-3 font-medium">Runs</th>
                  <th className="px-3 py-3 text-right font-medium">Daily</th>
                  <th className="px-3 py-3 text-right font-medium">Total</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {promos.value.map((p) => {
                  const pDays = Math.round((new Date(p.ends_on).getTime() - new Date(p.starts_on).getTime()) / 86_400_000) + 1;
                  return (
                    <tr key={p.id} className="border-t border-line-soft">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2.5">
                          {p.creative_path ? (
                            <img src={p.creative_path} alt="" className="h-9 w-12 shrink-0 rounded-[6px] object-cover" />
                          ) : (
                            <span className="h-9 w-12 shrink-0 rounded-[6px] bg-panel" aria-hidden />
                          )}
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink">
                              {p.product_id ? (productName(p.product_id) ?? "a product") : "a company post"}
                            </span>
                            <span className="block truncate text-[11px] text-faint">{companyName(p.company_id)}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3 text-muted">
                        <span className="capitalize">{p.audience_mode}</span>
                        {p.countries.length > 0 && <span className="ml-1.5">{p.countries.map(flagOf).join(" ")}</span>}
                      </td>
                      <td className="tnum whitespace-nowrap px-3 py-3 text-muted">
                        {formatDay(p.starts_on)} – {formatDay(p.ends_on)}
                      </td>
                      <td className="tnum px-3 py-3 text-right text-ink">
                        {p.daily_budget_cents !== null ? eurWhole(p.daily_budget_cents) : <span className="text-faint">not set</span>}
                      </td>
                      <td className="tnum px-3 py-3 text-right font-semibold text-ink">
                        {p.daily_budget_cents !== null ? eurWhole(p.daily_budget_cents * pDays) : <span className="font-normal text-faint">—</span>}
                      </td>
                      <td className="px-3 py-3"><Pill tone={STATUS_TONE[p.status]}>{p.status}</Pill></td>
                      <td className="px-3 py-3 text-right">
                        <span className="flex justify-end gap-1.5">
                          {p.status === "draft" && (
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void move(p.id, "active")}>Activate</Button>
                          )}
                          {p.status === "active" && (
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void move(p.id, "suspended")}>Suspend</Button>
                          )}
                          {p.status === "suspended" && (
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void move(p.id, "active")}>Resume</Button>
                          )}
                          {p.status !== "ended" && (
                            <Button size="sm" variant="secondary" disabled={busy} onClick={() => void move(p.id, "ended")}>End</Button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableCard>
        )}
      </div>
    </>
  );
}
