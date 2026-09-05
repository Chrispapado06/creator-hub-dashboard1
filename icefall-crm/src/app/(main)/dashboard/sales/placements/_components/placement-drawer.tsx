"use client";

import * as React from "react";

import Link from "next/link";

import {
  ArrowLeftIcon,
  BadgeCheckIcon,
  BanIcon,
  CalendarClockIcon,
  CrownIcon,
  ExternalLinkIcon,
  MaximizeIcon,
  PauseCircleIcon,
  PencilIcon,
  ShuffleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import type { DestinationRow, PlacementView, ProductRow } from "./data";
import { slotsFor } from "./data";
import { daysUntil, formatCents, formatDay, initials } from "./format";
import { DateButton, placementState, StatusBadge } from "./shared";

/**
 * Nothing here writes. Each action opens the interface the real operation
 * needs, validates what it can against the row on screen, and then says the
 * change was not saved — a button that silently does nothing is worse than one
 * that says so.
 */
function notSaved(what: string) {
  toast.info("Not saved — the data layer is not connected yet.", {
    description: `${what} No record was changed.`,
  });
}

type Panel = "none" | "slot" | "edit" | "extend" | "pause" | "end";

export function PlacementDrawer({
  placement: p,
  company,
  verified,
  destination,
  product,
  takenSlots,
  products,
  onClose,
}: {
  placement: PlacementView;
  company?: string;
  verified: boolean;
  destination?: DestinationRow;
  product?: string;
  /** Every slot number currently held on this destination, this row included. */
  takenSlots: number[];
  products: ProductRow[];
  onClose: () => void;
}) {
  const [panel, setPanel] = React.useState<Panel>("none");
  const premium = p.slot_position === 1;

  return (
    <Sheet
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-[440px]">
        <SheetHeader className="pr-12">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarFallback>{initials(company ?? "")}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <SheetTitle className="flex items-center gap-1.5">
                {company ?? "Unknown company"}
                {verified && <BadgeCheckIcon className="size-3.5" />}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {verified ? "Documents checked by ICEFALL" : "Documents not checked"}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="px-4 pb-8">
          {panel === "none" ? (
            <Overview
              placement={p}
              destination={destination}
              product={product}
              premium={premium}
              onPanel={setPanel}
            />
          ) : (
            <ActionPanel
              panel={panel}
              placement={p}
              company={company}
              destination={destination}
              products={products}
              takenSlots={takenSlots}
              onBack={() => setPanel("none")}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b py-3 last:border-0">
      <p className="font-medium text-muted-foreground text-xs">{label}</p>
      <div className="mt-1 text-sm">{children}</div>
    </div>
  );
}

function Overview({
  placement: p,
  destination,
  product,
  premium,
  onPanel,
}: {
  placement: PlacementView;
  destination?: DestinationRow;
  product?: string;
  premium: boolean;
  onPanel: (panel: Panel) => void;
}) {
  return (
    <>
      <p className="mb-2 font-medium text-muted-foreground text-xs">Current placement</p>
      <div className="rounded-lg border bg-muted/50 p-4">
        {premium ? (
          <Badge className="gap-1">
            <CrownIcon /> #1 Premium
          </Badge>
        ) : (
          <Badge variant="outline">#{p.slot_position} Featured</Badge>
        )}
        <p className="mt-3 font-medium">{destination?.name ?? p.destination_id}</p>
        <p className="text-muted-foreground text-xs">
          {destination?.elevation_m ? `${destination.elevation_m.toLocaleString("en-GB")}m` : ""}
          {destination?.range ? ` · ${destination.range}` : ""}
        </p>
        <p className="mt-2 text-sm">
          {product ?? (
            <span className="text-muted-foreground/70">No expedition chosen for this slot yet</span>
          )}
        </p>
      </div>

      <div className="mt-4">
        <Row label="Term">
          {formatDay(p.starts_on)} → {formatDay(p.ends_on)}
        </Row>
        <Row label="Price">
          {formatCents(p.price_cents, p.currency) ?? (
            <span className="text-muted-foreground/70">Not agreed</span>
          )}
          {p.price_cents !== null && <span className="text-muted-foreground text-xs"> per term</span>}
        </Row>
        <Row label="Status">
          <StatusBadge state={placementState(p.effective_status)} label={p.effective_status} />
          {p.effective_status === "expired" && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-amber-600 dark:text-amber-500">
              The term ended {daysUntil(p.ends_on) * -1} days ago. This company keeps the position until
              an administrator moves or ends the placement — nothing happens on a timer.
            </p>
          )}
        </Row>
      </div>

      {/*
        The design lists impressions, clicks, enquiries, bookings, booking value
        and commission for this placement. ICEFALL measures none of them, and
        this is the screen where inventing one would do the most damage: it is
        what an operator is shown when deciding whether to pay again.
      */}
      <p className="mt-6 mb-2 font-medium text-muted-foreground text-xs">Performance</p>
      <div className="rounded-lg border bg-muted/50 p-4">
        <div className="grid grid-cols-2 gap-y-2.5">
          {["Impressions", "Clicks", "Enquiries", "Bookings", "Booking value", "ICEFALL commission"].map((l) => (
            <div key={l} className="flex items-center justify-between pr-3">
              <span className="text-muted-foreground text-sm">{l}</span>
              <span className="font-medium text-muted-foreground/70 text-sm">—</span>
            </div>
          ))}
        </div>
        <Separator className="my-3" />
        <p className="text-muted-foreground text-[13px] leading-relaxed">
          No performance data yet. Nothing in ICEFALL records an impression or a click, so these cannot
          be counted — and this is the figure a company would renew on.
        </p>
      </div>

      <p className="mt-6 mb-2 font-medium text-muted-foreground text-xs">Actions</p>
      <div className="space-y-2">
        <Action icon={<ShuffleIcon />} label="Change slot" onClick={() => onPanel("slot")} />
        <Action icon={<PencilIcon />} label="Edit placement" onClick={() => onPanel("edit")} />
        <Action icon={<CalendarClockIcon />} label="Extend placement" onClick={() => onPanel("extend")} />
        <Action icon={<PauseCircleIcon />} label="Pause placement" onClick={() => onPanel("pause")} />
        <Action icon={<BanIcon />} label="End placement" danger onClick={() => onPanel("end")} />
        <Button variant="outline" size="lg" className="w-full justify-start gap-3" asChild>
          <Link href={`/dashboard/sales/placements/${p.id}`}>
            <MaximizeIcon />
            Open the full record
          </Link>
        </Button>
        <Button variant="outline" size="lg" className="w-full justify-start gap-3" asChild>
          <Link href={`/dashboard/sales/companies/${p.company_id}`}>
            <ExternalLinkIcon />
            View company profile
          </Link>
        </Button>
      </div>
    </>
  );
}

function Action({
  icon,
  label,
  danger,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={danger ? "destructive" : "outline"}
      size="lg"
      className="w-full justify-start gap-3"
      onClick={onClick}
    >
      {icon}
      {label}
    </Button>
  );
}

const PANEL_TITLE: Record<Exclude<Panel, "none">, string> = {
  slot: "Change slot",
  edit: "Edit placement",
  extend: "Extend placement",
  pause: "Pause placement",
  end: "End placement",
};

function ActionPanel({
  panel,
  placement: p,
  company,
  destination,
  products,
  takenSlots,
  onBack,
}: {
  panel: Exclude<Panel, "none">;
  placement: PlacementView;
  company?: string;
  destination?: DestinationRow;
  products: ProductRow[];
  takenSlots: number[];
  onBack: () => void;
}) {
  return (
    <>
      <Button variant="ghost" size="sm" className="-ml-2 mb-3" onClick={onBack}>
        <ArrowLeftIcon /> Back
      </Button>
      <p className="mb-3 font-medium text-sm">{PANEL_TITLE[panel]}</p>

      {panel === "slot" && (
        <ChangeSlot placement={p} destination={destination} takenSlots={takenSlots} onDone={onBack} />
      )}
      {panel === "edit" && <EditPlacement placement={p} products={products} onDone={onBack} />}
      {panel === "extend" && <ExtendPlacement placement={p} onDone={onBack} />}
      {panel === "pause" && <PausePlacement onDone={onBack} />}
      {panel === "end" && <EndPlacement placement={p} company={company} destination={destination} onDone={onBack} />}
    </>
  );
}

/**
 * Only genuinely free positions are offered. The real move is refused by a
 * database uniqueness rule when the target is taken, and offering a slot the
 * write would then reject is how an admin learns not to trust the form.
 */
function ChangeSlot({
  placement: p,
  destination,
  takenSlots,
  onDone,
}: {
  placement: PlacementView;
  destination?: DestinationRow;
  takenSlots: number[];
  onDone: () => void;
}) {
  const all = slotsFor(destination?.kind ?? "mountain");
  const free = all.filter((n) => !takenSlots.includes(n));
  const [chosen, setChosen] = React.useState<number | null>(null);

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-[13px] leading-relaxed">
        This placement holds position #{p.slot_position}. Only positions nobody holds are offered — one
        company per slot.
      </p>
      {free.length === 0 ? (
        <p className="text-[13px] text-muted-foreground/70">
          Every other position on this {destination?.kind === "trek" ? "trek" : "mountain"} is held.
          There is nowhere to move this placement to.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {free.map((n) => (
            <Button key={n} variant={chosen === n ? "default" : "outline"} onClick={() => setChosen(n)}>
              {n === 1 ? "#1 Premium" : `#${n}`}
            </Button>
          ))}
        </div>
      )}
      <Button
        className="w-full"
        size="lg"
        disabled={chosen === null}
        onClick={() => {
          notSaved(`Moving this placement to position #${chosen} was not written.`);
          onDone();
        }}
      >
        Move to {chosen === null ? "a position" : `#${chosen}`}
      </Button>
    </div>
  );
}

function EditPlacement({
  placement: p,
  products,
  onDone,
}: {
  placement: PlacementView;
  products: ProductRow[];
  onDone: () => void;
}) {
  const [price, setPrice] = React.useState(p.price_cents === null ? "" : String(p.price_cents / 100));
  const [currency, setCurrency] = React.useState(p.currency);
  const [productId, setProductId] = React.useState(p.product_id ?? "");
  const [startsOn, setStartsOn] = React.useState(p.starts_on);
  const [endsOn, setEndsOn] = React.useState(p.ends_on);

  const mine = products.filter((x) => x.company_id === p.company_id);
  const priceInvalid = price.trim() !== "" && !/^\d+(\.\d{1,2})?$/.test(price.trim());
  const termInvalid = Boolean(startsOn) && Boolean(endsOn) && endsOn <= startsOn;
  const blocked = priceInvalid || termInvalid || !startsOn || !endsOn;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="edit-price">Agreed price</Label>
        <div className="flex gap-2">
          <Input
            id="edit-price"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Placement price"
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
          <p className="text-destructive text-xs">Enter an amount, or leave it empty.</p>
        ) : (
          <p className="text-muted-foreground/70 text-xs">
            Leave empty if the price has not been agreed. It records as unagreed, not as zero.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="edit-product">Expedition</Label>
        <NativeSelect
          id="edit-product"
          className="w-full"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
        >
          <option value="">No expedition chosen for this slot yet</option>
          {mine.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </NativeSelect>
        {mine.length === 0 && (
          <p className="text-muted-foreground/70 text-xs">
            This company has no expeditions yet — a slot can only feature that company&apos;s own
            expedition.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Term</Label>
        <div className="grid grid-cols-2 gap-3">
          <DateButton value={startsOn} onChange={setStartsOn} placeholder="Starts" ariaLabel="Term starts" />
          <DateButton value={endsOn} onChange={setEndsOn} placeholder="Ends" ariaLabel="Term ends" />
        </div>
        {termInvalid && <p className="text-destructive text-xs">The term must end after it starts.</p>}
      </div>

      <Button
        className="w-full"
        size="lg"
        disabled={blocked}
        onClick={() => {
          notSaved("The edits to this placement were not written.");
          onDone();
        }}
      >
        Save changes
      </Button>
    </div>
  );
}

function ExtendPlacement({ placement: p, onDone }: { placement: PlacementView; onDone: () => void }) {
  const [endsOn, setEndsOn] = React.useState("");
  const tooEarly = Boolean(endsOn) && endsOn <= p.ends_on;

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-[13px] leading-relaxed">
        The term currently ends {formatDay(p.ends_on)}. Extending writes a new end date and nothing else
        — the position, company and price stay as they are.
      </p>
      <div className="space-y-2">
        <Label>New end date</Label>
        <DateButton value={endsOn} onChange={setEndsOn} placeholder="Ends" ariaLabel="New term end" />
        {tooEarly && (
          <p className="text-destructive text-xs">
            An extension has to be later than {formatDay(p.ends_on)}.
          </p>
        )}
      </div>
      <Button
        className="w-full"
        size="lg"
        disabled={!endsOn || tooEarly}
        onClick={() => {
          notSaved(`The new end date of ${formatDay(endsOn)} was not written.`);
          onDone();
        }}
      >
        Extend the term
      </Button>
    </div>
  );
}

function PausePlacement({ onDone }: { onDone: () => void }) {
  const [reason, setReason] = React.useState("");
  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-[13px] leading-relaxed">
        A pause is a staff action on the row, and the reason is written into the audit log beside it.
      </p>
      <div className="space-y-2">
        <Label htmlFor="pause-reason">Reason</Label>
        <Textarea
          id="pause-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why this placement is being paused"
          rows={3}
        />
        {reason.trim().length === 0 && (
          <p className="text-muted-foreground/70 text-xs">
            A reason is required — an unexplained change in the log is a change nobody can answer for.
          </p>
        )}
      </div>
      <Button
        className="w-full"
        size="lg"
        disabled={reason.trim().length === 0}
        onClick={() => {
          notSaved("The pause was not written.");
          onDone();
        }}
      >
        Pause this placement
      </Button>
    </div>
  );
}

/**
 * The only destructive control on this screen. Ending a placement frees the
 * position, so it asks for the reason and a deliberate confirmation rather than
 * acting on one click.
 */
function EndPlacement({
  placement: p,
  company,
  destination,
  onDone,
}: {
  placement: PlacementView;
  company?: string;
  destination?: DestinationRow;
  onDone: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3">
        <p className="text-[13px] leading-relaxed">
          Ending this placement cancels it and frees position #{p.slot_position} on{" "}
          {destination?.name ?? p.destination_id}. {company ?? "This company"} stops holding the
          position, and nothing moves anybody else into it — a company wanting it joins the waitlist.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="end-reason">Reason</Label>
        <Textarea
          id="end-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why this placement is being ended"
          rows={3}
        />
      </div>
      <div className="flex items-start gap-2.5">
        <Checkbox
          id="end-confirm"
          className="mt-0.5"
          checked={confirmed}
          onCheckedChange={(next) => setConfirmed(next === true)}
        />
        <Label
          htmlFor="end-confirm"
          className={cn("text-[13px] leading-relaxed font-normal", !confirmed && "text-muted-foreground")}
        >
          I understand this cancels the placement and frees the position.
        </Label>
      </div>
      <Button
        variant="destructive"
        className="w-full"
        size="lg"
        disabled={!confirmed || reason.trim().length === 0}
        onClick={() => {
          notSaved("Ending this placement was not written.");
          onDone();
        }}
      >
        End placement
      </Button>
    </div>
  );
}
