"use client";

import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup, FieldLabel, Field as UiField } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { CompanyLogo } from "../../_components/company-badges";
import type { CompanyRow, PlacementRecord } from "../../_components/data";
import { formatDay } from "../../_components/format";
import type { Result } from "../../_components/states";

/**
 * The record, read-only — the shape of the owner's "Add / Edit Company" mockup
 * with every control that could not act taken off it.
 *
 * WHY IT IS READ-ONLY RATHER THAN WIRED: the write already exists elsewhere.
 * Staff edit the canonical record in the company's page editor; operators
 * submit changes through the approval queue. A third write path drawn in an
 * afternoon is exactly how two copies of one company drift apart.
 *
 * PREFILL RULE, and it matters because real businesses appear in the roster: a
 * REAL company shows only its public facts. Inventing a phone number for a real
 * business is fabrication, not sample data. There are no placeholder example
 * strings behind an empty read-only field either — on a read-only field a
 * placeholder reads as the value.
 */

const SECTIONS = [
  "Basic Info",
  "Profile & Media",
  "Expeditions",
  "Slot Placements",
  "Certifications",
  "Documents",
  "Team Members",
  "Settings & Access",
] as const;

const STATUS_LABEL: Record<CompanyRow["status"], string> = {
  prospect: "Prospect",
  onboarding: "Onboarding",
  active: "Active",
  suspended: "Suspended",
  churned: "Churned",
};

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <UiField className="gap-1.5">
      <FieldLabel className="text-muted-foreground text-xs">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </FieldLabel>
      {children}
    </UiField>
  );
}

/**
 * A field that shows what the record holds and cannot be typed into.
 *
 * `readOnly` rather than `disabled`: the value stays selectable, copyable and
 * legible — a disabled input dims its own text, and dimming a company's real
 * website to advertise that this screen cannot save it is the wrong thing to
 * make hard to read.
 */
function ReadOnly({ value }: { value?: string | null }) {
  return <Input readOnly value={value ?? ""} tabIndex={-1} className="cursor-default select-text bg-muted/40" />;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

/** The sentence that stands in for the two placement counts when the list did not resolve. */
function whyUncounted(placements: Result<PlacementRecord[]>): string | null {
  if (placements.state === "ok") return null;
  if (placements.state === "loading") return "Mountains and active slot placements are still loading.";
  return `Mountains and active slot placements could not be counted — ${placements.reason}`;
}

export function CompanyRecordCards({
  company,
  placements,
}: {
  company: CompanyRow;
  placements: Result<PlacementRecord[]>;
}) {
  const [section, setSection] = React.useState<(typeof SECTIONS)[number]>("Basic Info");

  // Counted from the placements listed on this page, so the card and the table
  // above it cannot disagree. Nothing here counts expeditions or bookings —
  // those live in modules this page does not read, and a figure assembled from
  // the wrong list is worse than no figure.
  //
  // The whole Result reaches this card rather than a flattened array: a list
  // that failed to load is not a list of no placements, and collapsing it to []
  // here would print "Mountains 0" for a company whose placements nobody could
  // read.
  const held = placements.state === "ok" ? placements.value.filter((p) => p.company_id === company.id) : null;
  const unread = whyUncounted(placements);
  const summary =
    held === null
      ? null
      : {
          mountains: new Set(held.map((p) => p.destination_id)).size,
          activePlacements: held.filter((p) => p.effective_status === "active").length,
        };
  const nothingToCount = held !== null && held.length === 0 && company.countries.length === 0;

  return (
    <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
      {/* The look is the theme's vertical line tab; the behaviour is a single
          scrolling form. These are buttons and not a real Tabs component on
          purpose — the list highlights a section, it does not switch panels,
          and wiring Tabs would produce seven empty panels and point
          aria-controls at nothing. */}
      <nav aria-label="Form sections" className="flex flex-col gap-1">
        {SECTIONS.map((s) => (
          <button
            key={s}
            type="button"
            aria-current={s === section ? "true" : undefined}
            onClick={() => setSection(s)}
            className={cn(
              "relative rounded-md px-3 py-1.5 text-left font-medium text-sm transition-colors",
              "after:absolute after:inset-y-1 after:-right-px after:w-0.5 after:bg-foreground after:transition-opacity",
              s === section
                ? "text-foreground after:opacity-100"
                : "text-foreground/60 after:opacity-0 hover:text-foreground",
            )}
          >
            {s}
          </button>
        ))}
      </nav>

      <div className="flex flex-col gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-xl leading-none">Basic Information</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-5 sm:grid-cols-2">
              <Field label="Company Name" required>
                <ReadOnly value={company.name} />
              </Field>
              <Field label="Status">
                <ReadOnly value={STATUS_LABEL[company.status]} />
              </Field>
              <Field label="Tagline">
                <ReadOnly />
              </Field>
              <Field label="Legal Name">
                <ReadOnly value={company.legal_name} />
              </Field>
              <Field label="Website">
                <ReadOnly />
              </Field>
              <Field label="Email">
                <ReadOnly />
              </Field>
              <Field label="Founded Year">
                <ReadOnly />
              </Field>
              <Field label="Phone">
                <ReadOnly />
              </Field>
            </FieldGroup>
            {/* An empty box is a fact, not an oversight, and it says which. */}
            <p className="mt-4 text-muted-foreground text-xs leading-relaxed">
              Empty fields are fields the record does not hold. For a real business only its public facts are kept —
              name, website, country and home city — and the rest stays blank rather than being filled in with something
              plausible.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl leading-none">Headquarters</CardTitle>
          </CardHeader>
          <CardContent>
            <FieldGroup className="grid gap-5 sm:grid-cols-[1fr_1fr_1.4fr]">
              <Field label="Country" required>
                <ReadOnly value={company.countries[0]} />
              </Field>
              <Field label="City" required>
                <ReadOnly />
              </Field>
              <Field label="Address">
                <ReadOnly />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl leading-none">Description</CardTitle>
          </CardHeader>
          <CardContent>
            {/* The mockup's formatting toolbar was deleted, not disabled: on a
                read-only screen an inert control stops being inert and becomes
                a decoration of a control, which is worse. The real toolbar
                lives in the page editor, which has an editor behind it. */}
            <Textarea
              rows={5}
              readOnly
              tabIndex={-1}
              value={company.description ?? ""}
              className="cursor-default select-text bg-muted/40 leading-relaxed"
            />
            <p className="mt-3 text-muted-foreground text-xs leading-relaxed">
              {company.description === null
                ? "No description is stored on this record. Descriptions are written and published in the company's page editor."
                : "Descriptions are written and published in the company's page editor."}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4 md:gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Company Logo</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center">
            <CompanyLogo name={company.name} size={72} />
            {/* The mockup's "Change logo" button and its "PNG, JPG up to 2MB"
                rule are both gone. A screen that cannot save has no business
                drawing an upload control, and stating a file-size limit nothing
                enforces is a rule invented to make a picture look finished. */}
            <p className="mt-3 text-center text-muted-foreground text-xs leading-relaxed">
              No logo is stored. Initials are drawn from the name.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {nothingToCount ? (
              /* Not a row of zeros and not a row of dashes: the sentence says
                 there is nothing to count yet, which is a different fact from
                 "we counted and got none". */
              <p className="text-muted-foreground text-sm leading-relaxed">
                Counts appear once this company has live content — nothing exists to count yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {/* The two placement counts appear only when the placement list
                    was actually read. Countries comes off the record itself, so
                    it is a measured figure either way. */}
                {summary ? (
                  <>
                    <Row label="Mountains">
                      <span className="font-medium tabular-nums">{summary.mountains}</span>
                    </Row>
                    <Row label="Active Slot Placements">
                      <span className="font-medium tabular-nums">{summary.activePlacements}</span>
                    </Row>
                  </>
                ) : null}
                <Row label="Countries">
                  <span className="font-medium tabular-nums">{company.countries.length}</span>
                </Row>
                {unread ? <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{unread}</p> : null}
                <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                  {summary
                    ? "Counted from the placements listed on this page and the record's own countries. Expeditions are counted in their own module, not here."
                    : "Counted from the record's own countries. Expeditions are counted in their own module, not here."}
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verification Status</CardTitle>
          </CardHeader>
          <CardContent>
            {company.documents_checked_at !== null ? (
              <div className="flex flex-col gap-2.5">
                <Row label="Trust">
                  <Badge
                    variant="outline"
                    className="border-emerald-500/20 bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400"
                  >
                    Documents checked
                  </Badge>
                </Row>
                <Row label="Last checked">
                  <span className="tabular-nums">{formatDay(company.documents_checked_at)}</span>
                </Row>
                <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
                  A member of ICEFALL staff read the papers on that date. No insurer, registrar or awarding association
                  was contacted.
                </p>
              </div>
            ) : (
              /* A company nobody has reviewed shows the absence of a review,
                 never an "Unverified" chip that reads like a finding. */
              <p className="text-muted-foreground text-sm leading-relaxed">
                No checks recorded — verification appears once a staff review has actually happened.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
