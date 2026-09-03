import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CircleAlert, Eye } from "lucide-react";
import { Resolve } from "@/components/states";
import { LivePreview, type PreviewBridge } from "@/editor/LivePreview";
import { createCompany, getCompany, updateCompanyRecord } from "@/data/queries";
import { OFFLINE } from "@/offline/offline";
import { NeedsConnection } from "@/offline/OfflineBanner";
import { loading, type Result } from "@/data/result";
import { Select } from "@/components/controls";
import type { Company } from "@/data/types";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

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
 *
 * ── THE RE-SKIN, 2026-09-03 ────────────────────────────────────────────────
 * Owner: "i dont see any change i want the designs 1:1". Both halves take the
 * theme's form shapes: the intake form is a single theme `Card` of `Field` +
 * `FieldLabel` + `Input` (theme-ref invoice/_components/invoice-details.tsx),
 * and the editor takes the theme's page header, its outline/primary button
 * pair, its `Alert` for the save result and its vertical line tab for the
 * section list.
 *
 * ═══ TWO THINGS A RE-SKIN MUST NOT TOUCH, AND DID NOT ═══
 * 1. THE `real_business` ROW IS STILL READ-ONLY AND STILL RENDERED. See
 *    domain/companies.ts: the disclosure hangs off the record, so every surface
 *    that shows a company shows this. It is deliberately outside
 *    `updateCompanyRecord`'s editable set, and the theme's Switch was NOT
 *    reached for — a toggle here would be a control that cannot act.
 * 2. THE PAGE'S REFUSALS ARE PRINTED VERBATIM. `bridge.rejected` carries the
 *    field and the page's own reason; they render as an Alert that stays on
 *    screen, never a toast that leaves.
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

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** The theme's `line` TabsTrigger, as a plain button — see CompanyEdit's note. */
const sectionRow = (active: boolean) =>
  cn(
    "relative w-full rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors",
    "after:absolute after:inset-y-1 after:-right-px after:w-0.5 after:bg-foreground after:transition-opacity",
    active
      ? "text-foreground after:opacity-100"
      : "text-foreground/60 after:opacity-0 hover:text-foreground",
  );

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
  const set =
    (k: keyof typeof f) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
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
    else
      setError(
        res.state === "error"
          ? res.reason
          : "No database is configured, so nothing can be created.",
      );
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 md:gap-6">
      {/* The theme's page header, so this screen has a real <h1> the way
          /dashboard/invoice does — the card title it used before was a div, and
          the page had no heading at all. */}
      <div className="flex flex-col gap-1">
        <h1 className="font-medium text-3xl leading-none tracking-tight">
          New expedition company
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          This creates the canonical record and opens its page editor — the editor works on the
          real (sparse) record the moment it exists, never on a mock-up of one. Only the name is
          required; everything else can follow.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xl leading-none">The record</CardTitle>
          <CardDescription>
            The top half writes the canonical company row; the bottom half writes the staff-only
            sidecar an operator has no access to.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup className="grid gap-5 sm:grid-cols-2">
            <Field className="gap-1.5 sm:col-span-2">
              <FieldLabel className="text-xs text-muted-foreground" htmlFor="new-company-name">
                Company name <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="new-company-name"
                autoFocus
                value={f.name}
                onChange={set("name")}
                placeholder="e.g. Highline Trekking Co."
              />
              {slug && (
                <FieldDescription className="text-xs">
                  Record slug: <span className="tabular-nums">{slug}</span>
                </FieldDescription>
              )}
            </Field>

            <Field className="gap-1.5">
              <FieldLabel className="text-xs text-muted-foreground" htmlFor="new-company-legal">
                Legal name
              </FieldLabel>
              <Input
                id="new-company-legal"
                value={f.legal_name}
                onChange={set("legal_name")}
                placeholder="As registered, if known"
              />
            </Field>

            <Field className="gap-1.5">
              <FieldLabel className="text-xs text-muted-foreground" htmlFor="new-company-countries">
                Where they operate
              </FieldLabel>
              <Input
                id="new-company-countries"
                value={f.countries}
                onChange={set("countries")}
                placeholder="Countries, comma-separated"
              />
            </Field>

            <Field className="gap-1.5 sm:col-span-2">
              <FieldLabel className="text-xs text-muted-foreground" htmlFor="new-company-what">
                What they do
              </FieldLabel>
              <Textarea
                id="new-company-what"
                rows={3}
                value={f.description}
                onChange={set("description")}
                placeholder="A sentence or two — this seeds the public description"
                className="leading-relaxed"
              />
            </Field>

            <Field className="gap-1.5">
              <FieldLabel className="text-xs text-muted-foreground">
                Where they stand with ICEFALL
              </FieldLabel>
              <Select
                value={f.status}
                onChange={(v: string) =>
                  set("status")({ target: { value: v } } as React.ChangeEvent<HTMLSelectElement>)
                }
                ariaLabel="Company status"
                className="w-full"
                options={[
                  { value: "prospect", label: "Prospect — not yet in conversation" },
                  { value: "onboarding", label: "Onboarding — signed, being set up" },
                  { value: "active", label: "Active — live on the marketplace" },
                ]}
              />
            </Field>
          </FieldGroup>

          <Separator className="my-5" />

          <p className="text-muted-foreground text-xs font-medium">
            For the desk — internal, never shown to the operator
          </p>

          <FieldGroup className="mt-3 grid gap-5 sm:grid-cols-2">
            <Field className="gap-1.5">
              <FieldLabel className="text-xs text-muted-foreground" htmlFor="new-company-source">
                How we found them
              </FieldLabel>
              <Input
                id="new-company-source"
                value={f.source}
                onChange={set("source")}
                placeholder="Referral, outbound, event, enquiry…"
              />
            </Field>

            <Field className="gap-1.5">
              <FieldLabel className="text-xs text-muted-foreground">Priority</FieldLabel>
              <Select
                value={f.priority}
                onChange={(v: string) =>
                  set("priority")({ target: { value: v } } as React.ChangeEvent<HTMLSelectElement>)
                }
                ariaLabel="Priority"
                className="w-full"
                options={[
                  { value: "low", label: "Low" },
                  { value: "normal", label: "Normal" },
                  { value: "high", label: "High" },
                ]}
              />
            </Field>

            <Field className="gap-1.5 sm:col-span-2">
              <FieldLabel className="text-xs text-muted-foreground" htmlFor="new-company-notes">
                Notes
              </FieldLabel>
              <Textarea
                id="new-company-notes"
                rows={2}
                value={f.notes}
                onChange={set("notes")}
                placeholder="Anything the next person at this desk should know"
                className="leading-relaxed"
              />
            </Field>
          </FieldGroup>

          {/* The refusal, in the database's own words. It stays on screen — a
              toast that fades takes the reason with it. */}
          {error && (
            <Alert variant="destructive" className="mt-4">
              <CircleAlert />
              <AlertTitle>Nothing was created</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="ghost" onClick={() => navigate("/admin/companies")}>
              Cancel
            </Button>
            <Button disabled={!f.name.trim() || busy} onClick={() => void create()}>
              {busy ? "Creating…" : "Create & open editor"}
            </Button>
          </div>
        </CardContent>
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
        text:
          res.state === "error"
            ? res.reason
            : "No database is configured, so nothing can be saved.",
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
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="icon" asChild aria-label="Back to companies">
            <Link to="/admin/companies">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-medium text-3xl leading-none tracking-tight">{record.name}</h1>
            <p className="max-w-2xl text-muted-foreground text-sm">
              Page editor · edits the canonical record directly — the operator portal's matching
              screen submits for approval; this one is the approver.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {dirty && (
            <span className="text-muted-foreground text-sm tabular-nums">
              {Object.keys(changed).length} unsaved change
              {Object.keys(changed).length === 1 ? "" : "s"}
            </span>
          )}
          <Button disabled={!dirty || busy} onClick={() => void save()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* The save result, in full, staying put. */}
      {message && (
        <Alert variant={message.tone === "ok" ? "default" : "destructive"}>
          {message.tone === "ok" ? <Eye /> : <CircleAlert />}
          <AlertTitle>{message.tone === "ok" ? "Saved" : "Nothing was saved"}</AlertTitle>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-[190px_minmax(0,1fr)_320px]">
        {/* ── Sections of the real page ─────────────────────────────── */}
        <nav aria-label="Page sections" className="flex flex-col gap-1">
          <p className="px-3 pb-1 text-muted-foreground text-xs font-medium">Page sections</p>
          {sections.map((id) => (
            <button
              key={id}
              type="button"
              aria-current={id === selected ? "true" : undefined}
              onClick={() => {
                setSelected(id);
                setRequestTab(id);
              }}
              className={sectionRow(id === selected)}
            >
              {SECTION_LABELS[id] ?? id}
            </button>
          ))}
          {/* Where this list came from, said plainly: until the page answers,
              these are the contract's sections and not the page's own. */}
          {!bridge?.connected && (
            <p className="px-3 pt-2 text-muted-foreground text-xs leading-relaxed">
              Listed from the contract; the page confirms them when it connects.
            </p>
          )}
        </nav>

        {/* ── The real page ─────────────────────────────────────────── */}
        {/* The theme's Card, minus its vertical padding — the frame has to run
            to the edges, so the classes are spelled out rather than fought. */}
        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
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
          <p className="border-t border-border px-4 py-2 text-muted-foreground text-xs leading-relaxed">
            <Eye className="mr-1.5 inline size-3" aria-hidden />
            Development-only: /app/* is dropped from icefall-web production builds, so this preview
            is unshippable until the marketplace gate lifts.
          </p>
        </div>

        {/* ── Inspector ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle>This record</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field className="gap-1.5">
                <FieldLabel
                  className="flex w-full items-center justify-between text-xs text-muted-foreground"
                  htmlFor="editor-name"
                >
                  Name
                  <Badge variant="outline" className="font-normal">
                    Previewed live
                  </Badge>
                </FieldLabel>
                <Input
                  id="editor-name"
                  value={draft.name}
                  onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </Field>

              <Field className="gap-1.5">
                <FieldLabel
                  className="flex w-full items-center justify-between text-xs text-muted-foreground"
                  htmlFor="editor-description"
                >
                  Description
                  <Badge variant="outline" className="font-normal">
                    Previewed live
                  </Badge>
                </FieldLabel>
                <Textarea
                  id="editor-description"
                  rows={5}
                  value={draft.description}
                  onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
                  className="leading-relaxed"
                />
              </Field>

              <Field className="gap-1.5">
                <FieldLabel className="text-xs text-muted-foreground" htmlFor="editor-legal">
                  Legal name
                </FieldLabel>
                <Input
                  id="editor-legal"
                  value={draft.legal_name}
                  onChange={(e) => setDraft((d) => ({ ...d, legal_name: e.target.value }))}
                />
              </Field>

              <Field className="gap-1.5">
                <FieldLabel className="text-xs text-muted-foreground" htmlFor="editor-countries">
                  Countries (comma-separated)
                </FieldLabel>
                <Input
                  id="editor-countries"
                  value={draft.countries}
                  onChange={(e) => setDraft((d) => ({ ...d, countries: e.target.value }))}
                />
              </Field>

              <Field className="gap-1.5">
                <FieldLabel className="text-xs text-muted-foreground" htmlFor="editor-regions">
                  Regions (comma-separated)
                </FieldLabel>
                <Input
                  id="editor-regions"
                  value={draft.regions}
                  onChange={(e) => setDraft((d) => ({ ...d, regions: e.target.value }))}
                />
              </Field>
            </FieldGroup>

            {/* ═══ READ-ONLY BY DESIGN — domain/companies.ts ═══
                The disclosure flag is not page content. Raising it is a
                separate deliberate act (it is outside updateCompanyRecord's
                editable set), so the editor SHOWS what the listing claims about
                itself and cannot change it in passing. This is deliberately NOT
                the theme's Switch: a toggle here would be a control that cannot
                act, and this particular claim is a legal one. */}
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-ui-muted px-3 py-2.5">
              <span className="text-muted-foreground text-sm">Real business</span>
              {record.real_business ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/20 bg-amber-500/10 font-medium text-amber-600 dark:text-amber-400"
                >
                  Yes — public disclosure shown
                </Badge>
              ) : (
                <Badge variant="outline" className="font-medium">
                  No — invented company
                </Badge>
              )}
            </div>

            <p className="mt-3 text-muted-foreground text-xs leading-relaxed">
              Legal name, countries and regions save to the record but are not rendered by the
              public page yet — the two apps do not share a database, so pushing them into the
              preview would show text no climber would see.
            </p>

            {/* THE PAGE'S OWN WORDS, VERBATIM. Each refusal names the field and
                the reason the page gave for turning it down. It is never
                summarised, never re-worded and never turned into a toast. */}
            {bridge && bridge.rejected.length > 0 && (
              <Alert variant="destructive" className="mt-3">
                <CircleAlert />
                <AlertTitle>The page refused:</AlertTitle>
                <AlertDescription>
                  {bridge.rejected.map((r, i) => (
                    <p key={i}>
                      {r.field} — {r.why}
                    </p>
                  ))}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
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
