import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Bold,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  ListOrdered,
  Type,
  Underline,
} from "lucide-react";
import { CompanyLogo } from "@/components/CompanyLogo";
import { OFFLINE } from "@/offline/offline";
import { cn } from "@/lib/utils";
import { EDITOR_DEMO, operators } from "@/demo/operators";
import { Select } from "@/components/controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field as UiField, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

/**
 * Add / Edit Company — built 1:1 to the owner's mockup of 30 Aug 2026.
 *
 * A LOCAL MOCK SURFACE: nothing here writes anywhere. The real write path for
 * company records is the operator portal plus the approval boundary, and a
 * second, competing write path drawn in an afternoon would be exactly how two
 * copies of a company drift. "Save draft" and "Save & submit" therefore return
 * to the roster without claiming to have stored anything.
 *
 * PREFILL RULE, and it matters because real businesses appear in the roster:
 * a REAL company's form starts with only its public facts (name, website,
 * country, home city). Tagline, legal name, phone, address and description stay
 * empty — inventing a phone number for a real business is fabrication, not
 * demo data. The mockup's own strings live on as placeholders, which claim
 * nothing.
 *
 * ── THE RE-SKIN, 2026-09-03 ────────────────────────────────────────────────
 * Owner: "i dont see any change i want the designs 1:1". Shaped as the theme's
 * own form page, theme-ref /dashboard/invoice:
 *
 *   header      `font-medium text-3xl leading-none tracking-tight` over a
 *               muted line, with the actions on the right — the theme's
 *               invoice/page.tsx, verbatim, including the outline/primary
 *               button split.
 *   fields      the theme's `Field` + `FieldLabel className="text-xs"` +
 *               `Input` (invoice-details.tsx). The old hand-rolled 40px filled
 *               field is gone; the theme's is 32px, bordered and transparent.
 *   section nav the theme's VERTICAL line tab — `text-foreground/60` going to
 *               `text-foreground` with a 2px right rail on the active row,
 *               read off ui/tabs.tsx's `line` variant.
 *
 * WHY THE NAV IS BUTTONS AND NOT `<Tabs>`: this list highlights a section, it
 * does not switch panels — every form card stays on screen whichever row is
 * lit, which is how it behaved before and is the point of a single scrolling
 * form. Wiring real Tabs would have produced seven empty panels and pointed
 * `aria-controls` at nothing. The LOOK is the theme's line tab; the behaviour
 * is unchanged.
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

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <UiField className="gap-1.5">
      <FieldLabel className="text-xs text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </FieldLabel>
      {children}
    </UiField>
  );
}

/** The unwired form's status choice, in the kit's listbox. */
function StatusPicker({ initial }: { initial: string }) {
  const [v, setV] = useState(initial);
  return (
    <Select
      value={v}
      onChange={setV}
      ariaLabel="Company status"
      className="w-full"
      options={[
        { value: "active", label: "Active" },
        { value: "onboarding", label: "Onboarding" },
        { value: "suspended", label: "Suspended" },
        { value: "unverified", label: "Unverified" },
      ]}
    />
  );
}

/** A quiet label/value line, as the theme's profile sidebar draws one. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

export default function CompanyEdit() {
  const navigate = useNavigate();
  const { rosterId } = useParams();
  const row = operators.find((r) => r.id === rosterId) ?? null;
  const [section, setSection] = useState<(typeof SECTIONS)[number]>("Basic Info");

  const demo = EDITOR_DEMO;
  const done = () => navigate("/admin/companies");

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-medium text-3xl leading-none tracking-tight">Add / Edit Company</h1>
          <p className="max-w-2xl text-muted-foreground text-sm">
            Nothing on this screen is stored. The record itself is written from the company's page
            editor and from the operator portal's approval queue.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" onClick={done}>
            Cancel
          </Button>
          {/* Neither button stores anything — see the header. They end the
              mock edit, which is all a mock edit can honestly do. */}
          <Button variant="outline" onClick={done}>
            Save draft
          </Button>
          <Button onClick={done}>Save &amp; submit</Button>
        </div>
      </div>

      <div className="grid items-start gap-4 md:gap-6 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
        {/* ── Section nav ────────────────────────────────────────────── */}
        <nav aria-label="Form sections" className="flex flex-col gap-1">
          {SECTIONS.map((s) => (
            <button
              key={s}
              type="button"
              aria-current={s === section ? "true" : undefined}
              onClick={() => setSection(s)}
              className={cn(
                "relative rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors",
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

        {/* ── The form ───────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 md:gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl leading-none">Basic Information</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-5 sm:grid-cols-2">
                <Field label="Company Name" required>
                  <Input defaultValue={row?.name ?? ""} placeholder="Elite Expeditions" />
                </Field>
                <Field label="Status">
                  <StatusPicker initial={row?.status ?? "active"} />
                </Field>
                <Field label="Tagline">
                  <Input placeholder="Crafting unforgettable mountain experiences" />
                </Field>
                <Field label="Legal Name">
                  <Input placeholder="Elite Expeditions Pvt. Ltd." />
                </Field>
                <Field label="Website">
                  <Input
                    defaultValue={row?.domain ? `https://${row.domain}` : ""}
                    placeholder="https://eliteexpeditions.com"
                  />
                </Field>
                <Field label="Email">
                  <Input placeholder="info@eliteexpeditions.com" />
                </Field>
                <Field label="Founded Year">
                  <Input placeholder="2015" />
                </Field>
                <Field label="Phone">
                  <Input placeholder="+977 1 4412345" />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl leading-none">Headquarters</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup className="grid gap-5 sm:grid-cols-[1fr_1fr_1.4fr]">
                <Field label="Country" required>
                  <Input defaultValue={row?.countries.split(",")[0] ?? ""} placeholder="Nepal" />
                </Field>
                <Field label="City" required>
                  <Input defaultValue={row?.city ?? ""} placeholder="Kathmandu" />
                </Field>
                <Field label="Address">
                  <Input placeholder="Thamel, Kathmandu 44600, Nepal" />
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-xl leading-none">Description</CardTitle>
            </CardHeader>
            <CardContent>
              {/* The toolbar is drawn because the mockup draws it; no editor sits
                  behind it yet, so the glyphs are decoration, not buttons. It
                  stays aria-hidden and stays un-clickable: a formatting bar that
                  looks live and does nothing is the same class of problem as a
                  figure that looks measured and is not. */}
              <div
                className="flex items-center gap-3 rounded-t-lg border border-b-0 border-input px-3 py-2 text-muted-foreground"
                aria-hidden
              >
                <Bold className="size-3.5" strokeWidth={2.25} />
                <Italic className="size-3.5" strokeWidth={2.25} />
                <Underline className="size-3.5" strokeWidth={2.25} />
                <Type className="size-3.5" strokeWidth={2.25} />
                <ImageIcon className="size-3.5" strokeWidth={2} />
                <Separator orientation="vertical" className="h-4" />
                <List className="size-4" strokeWidth={2} />
                <ListOrdered className="size-4" strokeWidth={2} />
                <Separator orientation="vertical" className="h-4" />
                <Link2 className="size-3.5" strokeWidth={2} />
              </div>
              <Textarea
                rows={5}
                className="rounded-t-none leading-relaxed"
                placeholder="Elite Expeditions is a premier expedition company specializing in high-altitude climbs and treks across the Himalaya…"
              />
            </CardContent>
          </Card>
        </div>

        {/* ── Right rail ─────────────────────────────────────────────── */}
        <div className="flex flex-col gap-4 md:gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Company Logo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {/* Offline the logo is never fetched from the company's own site — there
                  is nothing to reach. Initials render instead. */}
              <CompanyLogo
                name={row?.name ?? "New Company"}
                domain={OFFLINE ? null : row?.domain}
                size={72}
              />
              {/* A SPAN, not a Button, and deliberately so: no upload exists
                  behind it. It keeps the theme's outline-button shape because
                  that is what the mockup draws, and keeps its inertness because
                  that is what the code does. */}
              <span className="mt-3 inline-flex h-8 items-center rounded-lg border border-border px-2.5 text-sm font-medium">
                Change logo
              </span>
              <p className="mt-1.5 text-muted-foreground text-xs">PNG, JPG up to 2MB</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Summary</CardTitle>
            </CardHeader>
            <CardContent>
              {demo ? (
                <div className="flex flex-col gap-2">
                  {(
                    [
                      ["Total Expeditions", demo.totalExpeditions],
                      ["Mountains", demo.mountains],
                      ["Active Slot Placements", demo.activeSlotPlacements],
                      ["Countries", demo.countries],
                    ] as const
                  ).map(([k, v]) => (
                    <Row key={k} label={k}>
                      <span className="font-medium tabular-nums">{v}</span>
                    </Row>
                  ))}
                </div>
              ) : (
                /* Not a row of zeros and not a row of dashes: the sentence says
                   there is nothing to count yet, which is a different fact from
                   "we counted and got none". */
                <p className="text-muted-foreground text-sm leading-relaxed">
                  Counts appear once this company has live content — nothing exists to count yet.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Verification Status</CardTitle>
            </CardHeader>
            <CardContent>
              {demo && row ? (
                <div className="flex flex-col gap-2.5">
                  <Row label="Trust">
                    {row.trust === "verified" ? (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/20 bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400"
                      >
                        Verified
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-border bg-ui-muted/50 font-medium text-muted-foreground"
                      >
                        {row.trust === "pending" ? "Pending" : "Unverified"}
                      </Badge>
                    )}
                  </Row>
                  <Row label="ICEFALL Check">
                    <Badge
                      variant="outline"
                      className="border-emerald-500/20 bg-emerald-500/10 font-medium text-emerald-600 dark:text-emerald-400"
                    >
                      {demo.icefallCheck}
                    </Badge>
                  </Row>
                  <Row label="Last checked">
                    <span className="tabular-nums">{demo.lastChecked}</span>
                  </Row>
                </div>
              ) : (
                /* A company nobody has reviewed shows the absence of a review,
                   never an "Unverified" chip that reads like a finding. */
                <p className="text-muted-foreground text-sm leading-relaxed">
                  No checks recorded — verification appears once a staff review has actually
                  happened.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
