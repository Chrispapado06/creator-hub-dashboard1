"use client";

import * as React from "react";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

import type { CompanyStatus } from "../../_components/data";
import { slugify } from "../../_components/format";
import { notSaved } from "../../_components/not-connected";

/**
 * Company intake — every question here lands in a real column, and only in a
 * real column. A form that asks what it cannot store is collecting answers to
 * discard them.
 *
 * Two halves, and the split is the schema's: the top half writes the canonical
 * company row the operator portal reads, the bottom half writes the staff-only
 * sidecar operators have no row policy on at all. Only the name is required: a
 * prospect heard about at a trade fair IS a company worth recording, and empty
 * fields stay empty rather than inventing placeholders.
 *
 * `real_business` is deliberately absent from this form. It defaults false and
 * only a deliberate staff act may raise it — a create form that could pass it
 * is a create form that could clear a real operator's disclosure.
 */
export function CompanyIntake() {
  const [f, setF] = React.useState({
    name: "",
    legal_name: "",
    countries: "",
    description: "",
    status: "prospect" as CompanyStatus,
    source: "",
    priority: "normal" as "low" | "normal" | "high",
    notes: "",
  });

  const set = (k: keyof typeof f) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF((v) => ({ ...v, [k]: event.target.value }));

  const slug = slugify(f.name);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 md:gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="font-medium text-3xl leading-none tracking-tight">New expedition company</h1>
        <p className="text-muted-foreground text-sm leading-relaxed">
          This creates the canonical record and opens its page editor — the editor works on the real (sparse) record the
          moment it exists, never on a mock-up of one. Only the name is required; everything else can follow.
        </p>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-xl leading-none">The record</CardTitle>
          <CardDescription>
            The top half writes the canonical company row; the bottom half writes the staff-only sidecar an operator has
            no access to.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <FieldGroup className="grid gap-5 sm:grid-cols-2">
            <Field className="gap-1.5 sm:col-span-2">
              <FieldLabel className="text-muted-foreground text-xs" htmlFor="new-company-name">
                Company name <span className="text-destructive">*</span>
              </FieldLabel>
              <Input
                id="new-company-name"
                autoFocus
                value={f.name}
                onChange={set("name")}
                placeholder="e.g. Highline Trekking Co."
              />
              {/* The URL key this record would be created under, shown before
                  anyone commits to it. */}
              {slug ? (
                <FieldDescription className="text-xs">
                  Record slug: <span className="tabular-nums">{slug}</span>
                </FieldDescription>
              ) : null}
            </Field>

            <Field className="gap-1.5">
              <FieldLabel className="text-muted-foreground text-xs" htmlFor="new-company-legal">
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
              <FieldLabel className="text-muted-foreground text-xs" htmlFor="new-company-countries">
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
              <FieldLabel className="text-muted-foreground text-xs" htmlFor="new-company-what">
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
              <FieldLabel className="text-muted-foreground text-xs" htmlFor="new-company-status">
                Where they stand with ICEFALL
              </FieldLabel>
              <Select
                value={f.status}
                onValueChange={(value) => setF((v) => ({ ...v, status: value as CompanyStatus }))}
              >
                <SelectTrigger id="new-company-status" className="w-full" aria-label="Company status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="prospect">Prospect — not yet in conversation</SelectItem>
                    <SelectItem value="onboarding">Onboarding — signed, being set up</SelectItem>
                    <SelectItem value="active">Active — live on the marketplace</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>

          <Separator className="my-5" />

          <p className="font-medium text-muted-foreground text-xs">
            For the desk — internal, never shown to the operator
          </p>

          <FieldGroup className="mt-3 grid gap-5 sm:grid-cols-2">
            <Field className="gap-1.5">
              <FieldLabel className="text-muted-foreground text-xs" htmlFor="new-company-source">
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
              <FieldLabel className="text-muted-foreground text-xs" htmlFor="new-company-priority">
                Priority
              </FieldLabel>
              <Select
                value={f.priority}
                onValueChange={(value) => setF((v) => ({ ...v, priority: value as "low" | "normal" | "high" }))}
              >
                <SelectTrigger id="new-company-priority" className="w-full" aria-label="Priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            <Field className="gap-1.5 sm:col-span-2">
              <FieldLabel className="text-muted-foreground text-xs" htmlFor="new-company-notes">
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

          <div className="mt-5 flex items-center justify-end gap-2">
            <Button variant="ghost" asChild>
              <Link href="/dashboard/sales/companies">Cancel</Link>
            </Button>
            <Button disabled={!f.name.trim()} onClick={() => notSaved(`No record was created for ${f.name.trim()}.`)}>
              Create &amp; open editor
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
