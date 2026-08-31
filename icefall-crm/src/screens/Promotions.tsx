import { useCallback, useEffect, useMemo, useState } from "react";
import { Megaphone } from "lucide-react";
import { Button, Card, PageHead, Pill, SectionLabel, TableCard } from "@/components/ui";
import {
  createPromotion, listCompanies, listCompanyPosts, listProducts, listPromotions, setPromotionStatus,
} from "@/data/queries";
import { loading, type Result } from "@/data/result";
import type { Company, Product, PromotedPlacement } from "@/data/types";
import { formatDay } from "@/lib/utils";

/**
 * CR-17 — the promotion builder, on the S2 contract, whose three rules this
 * screen must not soften:
 *
 *   DECLARED GOALS ONLY. A campaign targets what people SAID they are
 *   training for — their own words, never an inference about them. The input
 *   here writes those goal tags and nothing else.
 *
 *   PREMIUM EXCLUDED. Paid members never see promotions — that is what part
 *   of the membership buys. Delivery-side rule, enforced by the reading apps,
 *   stated here so nobody sells a campaign as reaching everyone.
 *
 *   REAL COUNTS, NO FORECASTS. Nothing on this screen predicts reach,
 *   impressions or clicks. ICEFALL records none of those today, so no number
 *   of that kind exists to show — and inventing an "estimated audience" is
 *   the same lie as the view counts this product refuses everywhere else.
 *
 * A promoted row lives in its own table precisely so a feed cannot render it
 * unlabelled. Activation is honest state, not delivery: 'active' inside its
 * dates is what the apps read.
 */

const STATUS_TONE: Record<PromotedPlacement["status"], "neutral" | "green" | "amber" | "red"> = {
  draft: "neutral", active: "green", suspended: "amber", ended: "red",
};

export default function Promotions() {
  const [promos, setPromos] = useState<Result<PromotedPlacement[]>>(loading);
  const [companies, setCompanies] = useState<Result<Company[]>>(loading);
  const [products, setProducts] = useState<Result<Product[]>>(loading);
  const [posts, setPosts] = useState<{ id: string; body: string }[]>([]);

  const [companyId, setCompanyId] = useState("");
  const [target, setTarget] = useState(""); // "post:<id>" | "product:<id>"
  const [goals, setGoals] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(() => {
    void listPromotions().then(setPromos);
    void listCompanies().then(setCompanies);
    void listProducts().then(setProducts);
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

  const create = async () => {
    setBusy(true);
    setErr(null);
    const [kind, id] = target.split(":");
    const r = await createPromotion({
      companyId,
      postId: kind === "post" ? id : null,
      productId: kind === "product" ? id : null,
      goals: goals.split(",").map((g) => g.trim().toLowerCase()).filter(Boolean),
      startsOn, endsOn,
    });
    setBusy(false);
    if (r.state !== "ok") setErr(r.state === "error" ? r.reason : "No database is configured.");
    else { setTarget(""); setGoals(""); setStartsOn(""); setEndsOn(""); }
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
        subtitle="Paid feed placements. A promoted row is always labelled — it lives in its own table so no app can render it as organic. Targeting is by the audience's own declared goals; premium members never see promotions; and nothing here forecasts reach, because nothing measures it."
      />
      {err && <p className="mb-3 text-[12.5px] text-bad">{err}</p>}

      <Card>
        <p className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
          <Megaphone size={14} strokeWidth={2} /> New campaign
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
            className="h-10 min-w-[200px] rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none">
            <option value="">Company…</option>
            {companies.state === "ok" && companies.value.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={target} onChange={(e) => setTarget(e.target.value)} disabled={!companyId}
            className="h-10 min-w-[240px] rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none disabled:opacity-50">
            <option value="">What is promoted…</option>
            {companyProducts.length > 0 && (
              <optgroup label="Products">
                {companyProducts.map((p) => <option key={p.id} value={`product:${p.id}`}>{p.name}</option>)}
              </optgroup>
            )}
            {posts.length > 0 && (
              <optgroup label="Company posts">
                {posts.map((p) => <option key={p.id} value={`post:${p.id}`}>{p.body.slice(0, 60)}</option>)}
              </optgroup>
            )}
          </select>
          <input value={goals} onChange={(e) => setGoals(e.target.value)}
            placeholder="Declared goals, comma-separated (empty = everyone non-premium)"
            className="h-10 min-w-[280px] flex-1 rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent" />
          <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)}
            className="h-10 rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none" />
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)}
            className="h-10 rounded-tile border border-line bg-surface px-3 text-[12.5px] text-ink outline-none" />
          <Button variant="secondary" disabled={busy || !companyId || !target || !startsOn || !endsOn} onClick={() => void create()}>
            Create draft
          </Button>
        </div>
        <p className="mt-2 text-[11.5px] leading-relaxed text-faint">
          A campaign is born a draft and reaches no feed until it is activated inside its dates. No
          audience size is shown because none is measured — activating states what will run, not what it
          will achieve.
        </p>
      </Card>

      <div className="mt-4">
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
            <p className="text-[12.5px] text-faint">No campaigns yet. The first draft appears here the moment one is created.</p>
          </Card>
        ) : (
          <TableCard className="mt-2">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-[0.06em] text-faint">
                  <th className="px-4 py-3 font-medium">Company</th>
                  <th className="px-3 py-3 font-medium">Promotes</th>
                  <th className="px-3 py-3 font-medium">Declared goals</th>
                  <th className="px-3 py-3 font-medium">Runs</th>
                  <th className="px-3 py-3 font-medium">Status</th>
                  <th className="px-3 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {promos.value.map((p) => (
                  <tr key={p.id} className="border-t border-line-soft">
                    <td className="px-4 py-3 font-medium text-ink">{companyName(p.company_id)}</td>
                    <td className="px-3 py-3 text-muted">
                      {p.product_id ? (productName(p.product_id) ?? "a product") : "a company post"}
                    </td>
                    <td className="px-3 py-3">
                      {p.declared_goals.length === 0 ? (
                        <span className="text-[11.5px] text-faint">everyone (non-premium)</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {p.declared_goals.map((g) => <Pill key={g} tone="neutral">{g}</Pill>)}
                        </span>
                      )}
                    </td>
                    <td className="tnum whitespace-nowrap px-3 py-3 text-muted">
                      {formatDay(p.starts_on)} – {formatDay(p.ends_on)}
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
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
        <p className="mt-2 max-w-3xl text-[11.5px] leading-relaxed text-faint">
          Real counts appear here when something real is counted — nothing is yet, and this line is the
          placeholder rather than an invented number.
        </p>
      </div>
    </>
  );
}
