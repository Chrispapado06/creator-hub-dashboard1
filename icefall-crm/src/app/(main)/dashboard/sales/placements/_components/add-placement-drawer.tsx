"use client";

import * as React from "react";

import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

import type { CompanyRow, DestinationRow, PlacementStoredStatus, ProductRow } from "./data";
import { slotsFor } from "./data";
import { initials } from "./format";
import { DateButton } from "./shared";

/** The company list is truncated so the step stays one glance, not a directory. */
const COMPANY_RESULTS = 6;

export function AddPlacementDrawer({
  destination,
  slot,
  taken,
  companies,
  products,
  onClose,
}: {
  destination: DestinationRow;
  slot: number;
  /** Slot positions already held on this destination. */
  taken: number[];
  companies: CompanyRow[];
  products: ProductRow[];
  onClose: () => void;
}) {
  const [companyQuery, setCompanyQuery] = React.useState("");
  const [companyId, setCompanyId] = React.useState<string | null>(null);
  const [productId, setProductId] = React.useState<string | null>(null);
  const [chosenSlot, setChosenSlot] = React.useState<number | null>(slot);
  const [startsOn, setStartsOn] = React.useState("");
  const [endsOn, setEndsOn] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [currency, setCurrency] = React.useState("EUR");
  const [status, setStatus] = React.useState<PlacementStoredStatus>("reserved");

  const companyMatches = React.useMemo(() => {
    const q = companyQuery.trim().toLowerCase();
    return companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [companies, companyQuery]);
  const companyRows = companyMatches.slice(0, COMPANY_RESULTS);

  const productRows = React.useMemo(
    () => (companyId ? products.filter((p) => p.company_id === companyId) : []),
    [products, companyId],
  );

  const free = slotsFor(destination.kind).filter((n) => !taken.includes(n));
  const allHeld = free.length === 0;

  const priceInvalid = price.trim() !== "" && !/^\d+(\.\d{1,2})?$/.test(price.trim());
  const termInvalid = Boolean(startsOn) && Boolean(endsOn) && endsOn <= startsOn;
  const complete =
    companyId !== null && chosenSlot !== null && Boolean(startsOn) && Boolean(endsOn) && !termInvalid && !priceInvalid;

  // Every reason the button is disabled, not only the empty fields — a form
  // that refuses without saying why is the one people stop trusting.
  const missing: string[] = [];
  if (!companyId) missing.push("a company");
  if (chosenSlot === null) missing.push("a free position");
  if (!startsOn || !endsOn) missing.push("both ends of the term");
  if (termInvalid) missing.push("a term that ends after it starts");
  if (priceInvalid) missing.push("a price in the right format");

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-[440px]">
        <SheetHeader className="pr-12">
          <SheetTitle>Add placement</SheetTitle>
          <SheetDescription>{destination.name}</SheetDescription>
        </SheetHeader>

        <div className="px-4 pb-8">
          <Step n={1} label="Select company">
            <Input
              value={companyQuery}
              onChange={(e) => setCompanyQuery(e.target.value)}
              placeholder="Search companies..."
              aria-label="Search companies"
            />
            <div className="mt-2 space-y-1.5">
              {companyRows.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setCompanyId(c.id);
                    // A slot can only feature the slot-holder's own expedition,
                    // so a different company invalidates the one chosen.
                    setProductId(null);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    companyId === c.id ? "border-foreground bg-accent" : "border-border hover:bg-muted/60",
                  )}
                >
                  <Avatar size="sm">
                    <AvatarFallback>{initials(c.name)}</AvatarFallback>
                  </Avatar>
                  {c.name}
                </button>
              ))}
              {companyRows.length === 0 && (
                <p className="text-[13px] text-muted-foreground/70">No company matches that search.</p>
              )}
              {companyMatches.length > COMPANY_RESULTS && (
                <p className="text-muted-foreground/70 text-xs">
                  Showing {COMPANY_RESULTS} of {companyMatches.length} — type to narrow the list.
                </p>
              )}
            </div>
          </Step>

          <Step n={2} label="Select expedition">
            {!companyId ? (
              <p className="text-[13px] text-muted-foreground/70">
                Choose a company first — a slot can only feature that company&apos;s own expedition.
              </p>
            ) : productRows.length === 0 ? (
              <p className="text-[13px] text-muted-foreground/70">This company has no expeditions yet.</p>
            ) : (
              <div className="space-y-1.5">
                {productRows.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProductId(productId === p.id ? null : p.id)}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                      productId === p.id ? "border-foreground bg-accent" : "border-border hover:bg-muted/60",
                    )}
                  >
                    {p.name}
                  </button>
                ))}
                <p className="text-muted-foreground/70 text-xs">
                  A slot with no expedition on it is a real state — the company can choose one later.
                </p>
              </div>
            )}
          </Step>

          <Step n={3} label="Select slot">
            {allHeld ? (
              <p className="text-[13px] text-muted-foreground/70">
                All {slotsFor(destination.kind).length} positions are held.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {/* Only free positions are offered: offering a taken slot and
                    refusing it afterwards is how an admin learns not to trust
                    the form. */}
                {free.map((n) => (
                  <Button
                    key={n}
                    variant={chosenSlot === n ? "default" : "outline"}
                    onClick={() => setChosenSlot(n)}
                  >
                    {n === 1 ? "#1 Premium" : `#${n}`}
                  </Button>
                ))}
              </div>
            )}
          </Step>

          <Step n={4} label="Term">
            <div className="grid grid-cols-2 gap-3">
              <DateButton value={startsOn} onChange={setStartsOn} placeholder="Starts" ariaLabel="Term starts" />
              <DateButton value={endsOn} onChange={setEndsOn} placeholder="Ends" ariaLabel="Term ends" />
            </div>
            {termInvalid && <p className="mt-1.5 text-destructive text-xs">The term must end after it starts.</p>}
          </Step>

          <Step n={5} label="Price">
            <div className="flex gap-2">
              <Input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="Placement price"
                inputMode="decimal"
                aria-label="Placement price"
                aria-invalid={priceInvalid}
              />
              <NativeSelect
                aria-label="Currency"
                className="w-24"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              >
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="USD">USD</option>
              </NativeSelect>
            </div>
            {priceInvalid ? (
              <p className="mt-1.5 text-destructive text-xs">Enter an amount, or leave it empty.</p>
            ) : (
              <p className="mt-1.5 text-muted-foreground/70 text-xs">
                Leave empty if the price has not been agreed. It records as unagreed, not as zero.
              </p>
            )}
          </Step>

          <Step n={6} label="Status" last>
            <div className="flex gap-2">
              {(
                [
                  ["reserved", "Reserved"],
                  ["active", "Active"],
                ] as [PlacementStoredStatus, string][]
              ).map(([value, label]) => (
                <Button
                  key={value}
                  size="sm"
                  variant={status === value ? "default" : "outline"}
                  aria-pressed={status === value}
                  onClick={() => setStatus(value)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {/* The old form offered a third badge, "Draft". No such placement
                status exists — a row is reserved, active or cancelled, and
                `expired` is worked out when the row is read, never stored. */}
            <p className="mt-2 text-muted-foreground/70 text-xs">
              A placement is reserved or active. There is no draft, and expiry is not a status anybody
              sets — it is worked out when the row is read.
            </p>
          </Step>

          <Button
            size="lg"
            className="mt-6 w-full"
            disabled={!complete}
            onClick={() => {
              toast.info("Not saved — the data layer is not connected yet.", {
                description: `A placement on ${destination.name} at position #${chosenSlot} was not created.`,
              });
              onClose();
            }}
          >
            Create placement
          </Button>
          <p className="mt-2 text-center text-muted-foreground/70 text-xs">
            {missing.length > 0
              ? `Still needed: ${missing.join(", ")}.`
              : "There is no database behind this build, so confirming will say the placement was not created rather than pretending it was."}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Step({
  n,
  label,
  children,
  last,
}: {
  n: number;
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={cn("py-4", !last && "border-b")}>
      <div className="mb-2.5 flex items-center gap-2.5">
        <span className="grid size-6 place-items-center rounded-full bg-primary font-medium text-primary-foreground text-xs tabular-nums">
          {n}
        </span>
        <p className="font-medium text-sm">{label}</p>
      </div>
      {children}
    </div>
  );
}
