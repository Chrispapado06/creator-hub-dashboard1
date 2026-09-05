"use client";

import * as React from "react";

import Link from "next/link";

import { ArrowLeft, Eye, WifiOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { CompanyRow } from "../../../_components/data";
import { notSaved } from "../../../_components/not-connected";

/**
 * The in-place company page editor — the CRM's counterpart to the operator
 * portal's editor, with ONE deliberate asymmetry that is the whole point of
 * there being two:
 *
 *   THE OPERATOR SUBMITS. THE CRM DECIDES.
 *
 * An operator's edit becomes a content version and waits for approval; live
 * stays untouched. Staff here are the approvers, so this screen writes the
 * CANONICAL RECORD — nothing is queued, nothing says "submitted", because
 * nothing is being submitted to anybody.
 *
 * Today it writes nothing at all: there is no data layer behind this build, so
 * Save reports that plainly instead of printing the sentence it will print when
 * the write exists.
 */

/** Exactly the fields `updateCompanyRecord` accepts. `real_business` is not one. */
type RecordPatch = Partial<Pick<CompanyRow, "name" | "legal_name" | "description" | "countries" | "regions">>;

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

const sectionRow = (active: boolean) =>
  cn(
    "relative w-full rounded-md px-3 py-1.5 text-left font-medium text-sm transition-colors",
    "after:absolute after:inset-y-1 after:-right-px after:w-0.5 after:bg-foreground after:transition-opacity",
    active ? "text-foreground after:opacity-100" : "text-foreground/60 after:opacity-0 hover:text-foreground",
  );

export function CompanyEditor({ company }: { company: CompanyRow }) {
  const record = company;
  const [draft, setDraft] = React.useState({
    name: company.name,
    legal_name: company.legal_name ?? "",
    description: company.description ?? "",
    countries: company.countries.join(", "),
    regions: company.regions.join(", "),
  });
  const [selected, setSelected] = React.useState<string>("hero");

  /**
   * The patch, built field by field against the loaded record rather than
   * spread blindly: clearing a field to "" becomes an explicit null, and the
   * two list fields are compared after being split, trimmed and emptied of
   * blanks — so re-typing the same countries in a different spacing is not a
   * change.
   */
  const changed = React.useMemo(() => {
    const patch: RecordPatch = {};
    if (draft.name.trim() !== record.name) patch.name = draft.name.trim();
    if ((draft.legal_name.trim() || null) !== record.legal_name) patch.legal_name = draft.legal_name.trim() || null;
    if ((draft.description.trim() || null) !== record.description) patch.description = draft.description.trim() || null;
    const countries = draft.countries
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (countries.join("|") !== record.countries.join("|")) patch.countries = countries;
    const regions = draft.regions
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    if (regions.join("|") !== record.regions.join("|")) patch.regions = regions;
    return patch;
  }, [draft, record]);

  const changeCount = Object.keys(changed).length;
  const dirty = changeCount > 0;

  // The list the public page's own sections would confirm. Until a page
  // answers, these are the contract's sections and the note below says so.
  const sections = Object.keys(SECTION_LABELS).slice(0, 10);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Button variant="outline" size="icon" asChild aria-label="Back to companies">
            <Link href="/dashboard/sales/companies">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="font-medium text-3xl leading-none tracking-tight">{record.name}</h1>
            <p className="max-w-2xl text-muted-foreground text-sm">
              Page editor · edits the canonical record directly — the operator portal&apos;s matching screen submits for
              approval; this one is the approver.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {dirty ? (
            <span className="text-muted-foreground text-sm tabular-nums">
              {changeCount} unsaved change{changeCount === 1 ? "" : "s"}
            </span>
          ) : null}
          <Button
            disabled={!dirty}
            onClick={() =>
              notSaved(
                `${changeCount} change${changeCount === 1 ? "" : "s"} to ${record.name} are still only on this screen.`,
              )
            }
          >
            Save
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-[190px_minmax(0,1fr)_320px]">
        <nav aria-label="Page sections" className="flex flex-col gap-1">
          <p className="px-3 pb-1 font-medium text-muted-foreground text-xs">Page sections</p>
          {sections.map((id) => (
            <button
              key={id}
              type="button"
              aria-current={id === selected ? "true" : undefined}
              onClick={() => setSelected(id)}
              className={sectionRow(id === selected)}
            >
              {SECTION_LABELS[id] ?? id}
            </button>
          ))}
          {/* Where this list came from, said plainly. */}
          <p className="px-3 pt-2 text-muted-foreground text-xs leading-relaxed">
            Listed from the contract; the page confirms them when it connects.
          </p>
        </nav>

        <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
          <div className="flex h-[72vh] min-h-[480px] items-center justify-center p-8">
            {/* The preview is another origin's live page in a frame. There is
                no connection to it in this build, so the frame is NEVER MOUNTED
                and no request is attempted — a panel that says so immediately
                beats one that spends six seconds behind a grey overlay before
                admitting the same thing. */}
            <div className="flex max-w-md flex-col items-center gap-3 text-center">
              <WifiOff className="size-6 text-muted-foreground" aria-hidden />
              <p className="font-medium text-sm">The live company page needs a connection.</p>
              <p className="text-muted-foreground text-sm leading-relaxed">
                The preview embeds the real Icefall site from another server, which needs a connection. The form beside
                it works exactly as it does online — your edits are kept, and only this panel is missing.
              </p>
            </div>
          </div>
          <p className="border-t px-4 py-2 text-muted-foreground text-xs leading-relaxed">
            <Eye className="mr-1.5 inline size-3" aria-hidden />
            Development-only: /app/* is dropped from icefall-web production builds, so this preview is unshippable until
            the marketplace gate lifts.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>This record</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field className="gap-1.5">
                <FieldLabel
                  className="flex w-full items-center justify-between text-muted-foreground text-xs"
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
                  className="flex w-full items-center justify-between text-muted-foreground text-xs"
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
                <FieldLabel className="text-muted-foreground text-xs" htmlFor="editor-legal">
                  Legal name
                </FieldLabel>
                <Input
                  id="editor-legal"
                  value={draft.legal_name}
                  onChange={(e) => setDraft((d) => ({ ...d, legal_name: e.target.value }))}
                />
              </Field>

              <Field className="gap-1.5">
                <FieldLabel className="text-muted-foreground text-xs" htmlFor="editor-countries">
                  Countries (comma-separated)
                </FieldLabel>
                <Input
                  id="editor-countries"
                  value={draft.countries}
                  onChange={(e) => setDraft((d) => ({ ...d, countries: e.target.value }))}
                />
              </Field>

              <Field className="gap-1.5">
                <FieldLabel className="text-muted-foreground text-xs" htmlFor="editor-regions">
                  Regions (comma-separated)
                </FieldLabel>
                <Input
                  id="editor-regions"
                  value={draft.regions}
                  onChange={(e) => setDraft((d) => ({ ...d, regions: e.target.value }))}
                />
              </Field>
            </FieldGroup>

            {/* ═══ READ-ONLY BY DESIGN ═══
                The disclosure flag is not page content. Raising it is a separate
                deliberate act — it sits outside the editable set above — so the
                editor SHOWS what the listing claims about itself and cannot
                change it in passing. Deliberately not a Switch: a toggle here
                would be a control that cannot act, and this particular claim is
                a legal one. */}
            <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2.5">
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
              Legal name, countries and regions save to the record but are not rendered by the public page yet — the two
              apps do not share a database, so pushing them into the preview would show text no climber would see.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
