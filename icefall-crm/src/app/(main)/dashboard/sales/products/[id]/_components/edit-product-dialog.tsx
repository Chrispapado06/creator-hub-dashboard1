"use client";
import * as React from "react";

import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";

import type { PriceState, Product, ProductStatus } from "../../_components/data";

type Draft = {
  name: string;
  status: ProductStatus;
  price_state: PriceState;
  price_from: string;
  duration_days_min: string;
  duration_days_max: string;
  difficulty: string;
  season: string;
  max_altitude_m: string;
};

function toDraft(product: Product): Draft {
  return {
    name: product.name,
    status: product.status,
    price_state: product.price_state,
    price_from: product.price_from_cents === null ? "" : String(product.price_from_cents / 100),
    duration_days_min: product.duration_days_min === null ? "" : String(product.duration_days_min),
    duration_days_max: product.duration_days_max === null ? "" : String(product.duration_days_max),
    difficulty: product.difficulty ?? "",
    season: product.season ?? "",
    max_altitude_m: product.max_altitude_m === null ? "" : String(product.max_altitude_m),
  };
}

function validate(draft: Draft): Partial<Record<keyof Draft, string>> {
  const errors: Partial<Record<keyof Draft, string>> = {};
  const number = (value: string) => (value.trim() === "" ? null : Number(value));

  if (draft.name.trim() === "") errors.name = "A product needs a name.";

  const price = number(draft.price_from);
  if (draft.price_state === "known") {
    if (price === null)
      errors.price_from = "A known price needs a figure. Set the price state instead if there is none.";
    else if (!Number.isFinite(price) || price <= 0) errors.price_from = "Enter the price in euros, above zero.";
  } else if (price !== null) {
    // The schema holds a NULL price for every state but "known" — a leftover
    // figure under "on request" would claim a price nobody agreed.
    errors.price_from = "Clear the price, or set the price state to known.";
  }

  const min = number(draft.duration_days_min);
  const max = number(draft.duration_days_max);
  if (min !== null && (!Number.isFinite(min) || min <= 0)) errors.duration_days_min = "Enter a whole number of days.";
  if (max !== null && (!Number.isFinite(max) || max <= 0)) errors.duration_days_max = "Enter a whole number of days.";
  if (min !== null && max !== null && Number.isFinite(min) && Number.isFinite(max) && max < min) {
    errors.duration_days_max = "The longest duration cannot be shorter than the shortest.";
  }

  const altitude = number(draft.max_altitude_m);
  if (altitude !== null && (!Number.isFinite(altitude) || altitude <= 0)) {
    errors.max_altitude_m = "Enter the altitude in metres.";
  }

  return errors;
}

function FieldRow({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}

export function EditProductDialog({ product, children }: { product: Product; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(() => toDraft(product));
  const [errors, setErrors] = React.useState<Partial<Record<keyof Draft, string>>>({});

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setDraft(toDraft(product));
      setErrors({});
    }
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const found = validate(draft);
    setErrors(found);
    if (Object.keys(found).length > 0) return;

    setOpen(false);
    toast("Not saved", {
      description: "The data layer is not connected yet, so this edit was not written to the product record.",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Edit Product</DialogTitle>
            <DialogDescription>{product.name}</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldRow id="edit-name" label="Name" error={errors.name}>
                <Input id="edit-name" value={draft.name} onChange={(e) => set("name", e.target.value)} />
              </FieldRow>
            </div>

            <FieldRow id="edit-status" label="Status">
              <NativeSelect
                id="edit-status"
                className="w-full"
                value={draft.status}
                onChange={(e) => set("status", e.target.value as ProductStatus)}
              >
                <option value="draft">Draft</option>
                <option value="pending_review">Pending review</option>
                <option value="live">Live</option>
                <option value="archived">Archived</option>
              </NativeSelect>
            </FieldRow>

            <FieldRow id="edit-price-state" label="Price state">
              <NativeSelect
                id="edit-price-state"
                className="w-full"
                value={draft.price_state}
                onChange={(e) => set("price_state", e.target.value as PriceState)}
              >
                <option value="known">Known</option>
                <option value="on_request">On request</option>
                <option value="unknown">Unknown</option>
              </NativeSelect>
            </FieldRow>

            <FieldRow id="edit-price" label="Price from (€ per person)" error={errors.price_from}>
              <Input
                id="edit-price"
                inputMode="decimal"
                value={draft.price_from}
                onChange={(e) => set("price_from", e.target.value)}
                placeholder={draft.price_state === "known" ? "" : "no price on this state"}
              />
            </FieldRow>

            <FieldRow id="edit-altitude" label="Max altitude (m)" error={errors.max_altitude_m}>
              <Input
                id="edit-altitude"
                inputMode="numeric"
                value={draft.max_altitude_m}
                onChange={(e) => set("max_altitude_m", e.target.value)}
              />
            </FieldRow>

            <FieldRow id="edit-duration-min" label="Duration — shortest (days)" error={errors.duration_days_min}>
              <Input
                id="edit-duration-min"
                inputMode="numeric"
                value={draft.duration_days_min}
                onChange={(e) => set("duration_days_min", e.target.value)}
              />
            </FieldRow>

            <FieldRow id="edit-duration-max" label="Duration — longest (days)" error={errors.duration_days_max}>
              <Input
                id="edit-duration-max"
                inputMode="numeric"
                value={draft.duration_days_max}
                onChange={(e) => set("duration_days_max", e.target.value)}
              />
            </FieldRow>

            <FieldRow id="edit-difficulty" label="Difficulty">
              <Input
                id="edit-difficulty"
                value={draft.difficulty}
                onChange={(e) => set("difficulty", e.target.value)}
                placeholder="left blank reads as not recorded"
              />
            </FieldRow>

            <FieldRow id="edit-season" label="Best season">
              <Input
                id="edit-season"
                value={draft.season}
                onChange={(e) => set("season", e.target.value)}
                placeholder="left blank reads as not recorded"
              />
            </FieldRow>
          </div>

          <p className="text-muted-foreground text-sm leading-relaxed">
            Nothing on this form is saved yet. The CRM has no data layer connected, so submitting checks the entry and
            tells you it went nowhere.
          </p>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" size="sm">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" size="sm">
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
