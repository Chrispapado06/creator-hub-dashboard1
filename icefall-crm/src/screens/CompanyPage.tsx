import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Eye } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { Resolve } from "@/components/states";
import { LivePreview, type PreviewBridge } from "@/editor/LivePreview";
import { createCompany, getCompany, updateCompanyRecord } from "@/data/queries";
import { OFFLINE } from "@/offline/offline";
import { NeedsConnection } from "@/offline/OfflineBanner";
import { loading, type Result } from "@/data/result";
import type { Company } from "@/data/types";
import { cn } from "@/lib/utils";

/**
 * The in-place company page editor — the CRM's counterpart to the operator
 * portal's `CompanyEditor`, with ONE deliberate asymmetry that is the whole
 * point of there being two:
 *
 *   THE OPERATOR SUBMITS. THE CRM DECIDES.
 *
 * An operator's edit becomes a `content_version` and waits for approval; live
 * stays untouched. Staff here are the approvers, so this screen WRITES THE
 * CANONICAL RECORD — nothing is queued, nothing says "submitted", because
 * nothing is being submitted to anybody. The RLS on `companies` encodes
 * exactly this split: operators cannot update the row, sales/operations staff
 * can. (See `updateCompanyRecord` in queries.ts.)
 *
 * THE PREVIEW IS THE REAL PAGE, PORTED NOT REBUILT — `editor/LivePreview.tsx`
 * embeds icefall-web's company page and pushes the draft in over the frozen
 * protocol. Two consequences stated in the UI rather than hidden:
 *
 *   - The two apps do not share a database yet, so a CRM company that has no
 *     page on icefall-web previews against a STAND-IN page, with a banner
 *     saying so. A brand-new company is exactly this case — the record is
 *     created first (that is what "Add company" does now), and the preview
 *     becomes that company's own page the day both apps read one store.
 *   - Only the fields the web page actually renders from this record (name,
 *     description) are pushed as draft; the rest save to the record and say
 *     they are not previewable. Pushing text the page would never show is a
 *     preview lying in the other direction.
 *
 * DEV-ONLY: `/app/*` is dropped from icefall-web production builds, so the
 * preview pane works in development and is unshippable until the marketplace
 * gate lifts.
 */

const SECTION_LABELS: Record<string, string> = {
  hero: "Hero",
  about: "About",
  story: "Story",
  "why-climb": "Why climb",
  "featured-trips": "Featured trips",
  credentials: "Credentials",
  reviews: "Reviews",
  team: "Team",
  gallery: "Gallery",
  faq: "FAQ",
  video: "Video",
};

const fieldCls =
  "w-full rounded-tile border border-line bg-surface px-3 py-2 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent";

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/**
 * Company intake — every question here lands in a real column, and only in a
 * real column. The owner asked for "more questions, not just a name" (30 Aug
 * 2026); the questions added are exactly the ones the record can hold — a form
 * that asks what it cannot store is collecting answers to discard them.
 *
 * Two halves, and the split is the schema's: the top half writes `companies`
 * (the canonical record the operator portal reads), the bottom half writes
 * `company_internal` — the staff-only sidecar operators have no row policy on
 * at all. Only the name is required: a prospect heard about at a trade fair IS
 * a company worth recording, and empty fields stay empty rather than inventing
 * placeholders.
 */
function CreateCompany() {
  const navigate = useNavigate();
  const [f, setF] = useState({
    name: "",
    legal_name: "",
    countries: "",
    description: "",
    status: "prospect" as Company["status"],
    source: "",
    priority: "normal" as "low" | "normal" | "high",
    notes: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((v) => ({ ...v, [k]: e.target.value }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const slug = slugify(f.name);

  const create = async () => {
    setBusy(true);
    setError(null);
    const res = await createCompany(
      {
        name: f.name.trim(),
        slug,
        legal_name: f.legal_name.trim() || null,
        description: f.description.trim() || null,
        countries: f.countries.split(",").map((c) => c.trim()).filter(Boolean),
        status: f.status,
      },
      {
        source: f.source.trim() || null,
        priority: f.priority,
        notes: f.notes.trim() || null,
      },
    );
    setBusy(false);
    if (res.state === "ok") navigate(`/admin/companies/${res.value.id}/page`, { replace: true });
    else setError(res.state === "error" ? res.reason : "No database is configured, so nothing can be created.");
  };

  const label = "mb-1.5 block text-[12px] font-medium text-muted";

  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <p className="text-[15px] font-bold text-ink">New expedition company</p>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          This creates the canonical record and opens its page editor — the editor works on
          the real (sparse) record the moment it exists, never on a mock-up of one. Only the
          name is required; everything else can follow.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={label}>Company name *</span>
            <input autoFocus value={f.name} onChange={set("name")} placeholder="e.g. Highline Trekking Co." className={fieldCls} />
            {slug && (
              <span className="mt-1.5 block text-[11.5px] text-faint">
                Record slug: <span className="tnum">{slug}</span>
              </span>
            )}
          </label>
          <label className="block">
            <span className={label}>Legal name</span>
            <input value={f.legal_name} onChange={set("legal_name")} placeholder="As registered, if known" className={fieldCls} />
          </label>
          <label className="block">
            <span className={label}>Where they operate</span>
            <input value={f.countries} onChange={set("countries")} placeholder="Countries, comma-separated" className={fieldCls} />
          </label>
          <label className="block sm:col-span-2">
            <span className={label}>What they do</span>
            <textarea rows={3} value={f.description} onChange={set("description")} placeholder="A sentence or two — this seeds the public description" className={cn(fieldCls, "leading-relaxed")} />
          </label>
          <label className="block">
            <span className={label}>Where they stand with ICEFALL</span>
            <select value={f.status} onChange={set("status")} className={fieldCls}>
              <option value="prospect">Prospect — not yet in conversation</option>
              <option value="onboarding">Onboarding — signed, being set up</option>
              <option value="active">Active — live on the marketplace</option>
            </select>
          </label>
        </div>

        <div className="mt-5 border-t border-line-soft pt-4">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">
            For the desk — internal, never shown to the operator
          </p>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={label}>How we found them</span>
              <input value={f.source} onChange={set("source")} placeholder="Referral, outbound, event, enquiry…" className={fieldCls} />
            </label>
            <label className="block">
              <span className={label}>Priority</span>
              <select value={f.priority} onChange={set("priority")} className={fieldCls}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className={label}>Notes</span>
              <textarea rows={2} value={f.notes} onChange={set("notes")} placeholder="Anything the next person at this desk should know" className={cn(fieldCls, "leading-relaxed")} />
            </label>
          </div>
        </div>

        {error && <p className="mt-3 text-[12px] text-bad">{error}</p>}
        <div className="mt-5 flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => navigate("/admin/companies")}>
            Cancel
          </Button>
          <Button
            className="!bg-accent text-white hover:opacity-90"
            disabled={!f.name.trim() || busy}
            onClick={() => void create()}
          >
            {busy ? "Creating…" : "Create & open editor"}
          </Button>
        </div>
      </Card>
    </div>
  );
}


export function Editor({ company }: { company: Company }) {
  const [record, setRecord] = useState(company);
  const [draft, setDraft] = useState({
    name: company.name,
    legal_name: company.legal_name ?? "",
    description: company.description ?? "",
    countries: company.countries.join(", "),
    regions: company.regions.join(", "),
  });
  const [selected, setSelected] = useState<string | null>("hero");
  const [requestTab, setRequestTab] = useState<string | null>(null);
  const [bridge, setBridge] = useState<PreviewBridge | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);

  const changed = useMemo(() => {
    const patch: Parameters<typeof updateCompanyRecord>[1] = {};
    if (draft.name.trim() !== record.name) patch.name = draft.name.trim();
    if ((draft.legal_name.trim() || null) !== record.legal_name)
      patch.legal_name = draft.legal_name.trim() || null;
    if ((draft.description.trim() || null) !== record.description)
      patch.description = draft.description.trim() || null;
    const countries = draft.countries.split(",").map((c) => c.trim()).filter(Boolean);
    if (countries.join("|") !== record.countries.join("|")) patch.countries = countries;
    const regions = draft.regions.split(",").map((c) => c.trim()).filter(Boolean);
    if (regions.join("|") !== record.regions.join("|")) patch.regions = regions;
    return patch;
  }, [draft, record]);

  const dirty = Object.keys(changed).length > 0;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    const res = await updateCompanyRecord(record.id, changed);
    setBusy(false);
    if (res.state === "ok") {
      setRecord(res.value);
      setMessage({
        tone: "ok",
        text: "Saved to the canonical record — live everywhere this record is read. Nothing was queued for approval: this desk is the approval side.",
      });
    } else {
      setMessage({
        tone: "bad",
        text: res.state === "error" ? res.reason : "No database is configured, so nothing can be saved.",
      });
    }
  };

  // Only fields the web page renders from this record go into the preview
  // draft. The page falls back to its stored content for everything omitted.
  const previewDraft = useMemo(
    () => ({ name: draft.name, description: draft.description }),
    [draft.name, draft.description],
  );

  const sections = bridge?.known?.length ? bridge.known : Object.keys(SECTION_LABELS).slice(0, 10);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            to="/admin/companies"
            className="grid h-9 w-9 place-items-center rounded-tile border border-line bg-surface text-muted hover:text-ink"
            aria-label="Back to companies"
          >
            <ArrowLeft size={16} strokeWidth={2} />
          </Link>
          <div>
            <h1 className="text-[20px] font-extrabold tracking-[-0.02em] text-ink">{record.name}</h1>
            <p className="text-[12px] text-muted">
              Page editor · edits the canonical record directly — the operator portal's
              matching screen submits for approval; this one is the approver.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {dirty && <span className="text-[12px] text-faint">{Object.keys(changed).length} unsaved change{Object.keys(changed).length === 1 ? "" : "s"}</span>}
          <Button
            className="!bg-accent text-white hover:opacity-90"
            disabled={!dirty || busy}
            onClick={() => void save()}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {message && (
        <p
          className={cn(
            "mb-3 rounded-tile px-3.5 py-2.5 text-[12.5px] leading-relaxed",
            message.tone === "ok" ? "bg-mint text-[oklch(0.4_0.08_155)]" : "bg-[oklch(0.955_0.03_25)] text-bad",
          )}
        >
          {message.text}
        </p>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[190px_minmax(0,1fr)_320px]">
        {/* ── Sections of the real page ─────────────────────────────── */}
        <Card pad={false} className="py-2">
          <p className="px-4 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
            Page sections
          </p>
          {sections.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => {
                setSelected(id);
                setRequestTab(id);
              }}
              className={cn(
                "block w-full px-4 py-2 text-left text-[12.5px] font-medium",
                id === selected
                  ? "border-l-2 border-accent bg-accent-soft/60 text-accent-ink"
                  : "border-l-2 border-transparent text-muted hover:text-ink",
              )}
            >
              {SECTION_LABELS[id] ?? id}
            </button>
          ))}
          {!bridge?.connected && (
            <p className="px-4 pt-2 text-[11px] leading-relaxed text-faint">
              Listed from the contract; the page confirms them when it connects.
            </p>
          )}
        </Card>

        {/* ── The real page ─────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-card bg-surface shadow-soft">
          <div className="h-[72vh] min-h-[480px]">
            {/* OFFLINE: the preview is another origin's live page in a frame.
                It cannot load without a network, and the component's own
                failure path spends six seconds behind a grey overlay before
                saying so. Say it immediately instead — and never mount the
                iframe, so no request is attempted at all. */}
            {OFFLINE ? (
              <NeedsConnection
                what="The live company page"
                detail="The preview embeds the real Icefall site from another server, which needs a connection. The form beside it works exactly as it does online — your edits are kept, and only this panel is missing."
              />
            ) : (
              <LivePreview
                companyId={record.slug}
                draft={previewDraft}
                selected={selected}
                requestTab={requestTab}
                onBridge={setBridge}
              />
            )}
          </div>
          <p className="border-t border-line-soft px-4 py-2 text-[11px] leading-relaxed text-faint">
            <Eye size={11} strokeWidth={2} className="mr-1.5 inline" aria-hidden />
            Development-only: /app/* is dropped from icefall-web production builds, so this
            preview is unshippable until the marketplace gate lifts.
          </p>
        </div>

        {/* ── Inspector ─────────────────────────────────────────────── */}
        <Card>
          <p className="text-[13.5px] font-bold text-ink">This record</p>
          <div className="mt-3 space-y-3.5">
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-[12px] font-medium text-muted">
                Name <span className="rounded-pill bg-accent-soft px-2 py-[2px] text-[10.5px] font-medium text-accent-ink">Previewed live</span>
              </span>
              <input
                value={draft.name}
                onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                className={fieldCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center justify-between text-[12px] font-medium text-muted">
                Description <span className="rounded-pill bg-accent-soft px-2 py-[2px] text-[10.5px] font-medium text-accent-ink">Previewed live</span>
              </span>
              <textarea
                rows={5}
                value={draft.description}
                onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                className={cn(fieldCls, "leading-relaxed")}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">Legal name</span>
              <input
                value={draft.legal_name}
                onChange={(e) => setDraft((d) => ({ ...d, legal_name: e.target.value }))}
                className={fieldCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">Countries (comma-separated)</span>
              <input
                value={draft.countries}
                onChange={(e) => setDraft((d) => ({ ...d, countries: e.target.value }))}
                className={fieldCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[12px] font-medium text-muted">Regions (comma-separated)</span>
              <input
                value={draft.regions}
                onChange={(e) => setDraft((d) => ({ ...d, regions: e.target.value }))}
                className={fieldCls}
              />
            </label>
          </div>
          {/* Read-only by design: the disclosure flag is not page content.
              Raising it is a separate deliberate act (it is outside
              updateCompanyRecord's editable set), so the editor SHOWS what the
              listing claims about itself and cannot change it in passing. */}
          <div className="mt-3.5 flex items-center justify-between rounded-tile bg-raised px-3 py-2.5">
            <span className="text-[12px] font-medium text-muted">Real business</span>
            <span className={cn("text-[12px] font-semibold", record.real_business ? "text-[oklch(0.5_0.11_75)]" : "text-ink")}>
              {record.real_business ? "Yes — public disclosure shown" : "No — invented company"}
            </span>
          </div>
          <p className="mt-3 text-[11.5px] leading-relaxed text-faint">
            Legal name, countries and regions save to the record but are not rendered by the
            public page yet — the two apps do not share a database, so pushing them into the
            preview would show text no climber would see.
          </p>
          {bridge && bridge.rejected.length > 0 && (
            <div className="mt-3 rounded-tile bg-[oklch(0.955_0.03_25)] px-3 py-2.5">
              <p className="text-[11.5px] font-semibold text-bad">The page refused:</p>
              {bridge.rejected.map((r, i) => (
                <p key={i} className="mt-0.5 text-[11.5px] text-bad">
                  {r.field} — {r.why}
                </p>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

export default function CompanyPage({ create = false }: { create?: boolean }) {
  const { id } = useParams();
  const [result, setResult] = useState<Result<Company>>(loading);

  useEffect(() => {
    if (create || !id) return;
    void getCompany(id).then(setResult);
  }, [create, id]);

  if (create) return <CreateCompany />;

  return (
    <Resolve result={result} what="the company">
      {(company) => <Editor key={company.id} company={company} />}
    </Resolve>
  );
}
