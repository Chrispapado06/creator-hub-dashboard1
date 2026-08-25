import { Mountain } from "lucide-react";
import { useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Badge, Button, Card, Disclaimer, SectionLabel } from "@/components/ui/primitives";
import { Rise, Screen, ScreenHeader, SegmentedTabs, Stagger } from "@/components/layout/chrome";
import { GearCard } from "@/components/domain/cards";
import { fmtPrice } from "@/lib/format";
import { sync } from "@/services/repository";
import { usePrimaryGoal } from "@/state/AppState";
import type { GearCategory } from "@/types";

const FILTERS = [
  { value: "all", label: "All" },
  { value: "shell", label: "Shells" },
  { value: "insulation", label: "Insulation" },
  { value: "midlayer", label: "Midlayers" },
  { value: "base", label: "Base" },
  { value: "pants", label: "Pants" },
  { value: "pack", label: "Packs" },
] as const;

/**
 * Screen 11 — gear.
 *
 * A recommendation engine wearing a catalogue's clothes: every product leads
 * with why it is right for the athlete's objective, not with a buy button.
 */
export default function Gear() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["value"]>("all");
  const goal = usePrimaryGoal();
  const system = goal?.mountainId ? sync.systemForMountain(goal.mountainId) : undefined;

  const list = useMemo(
    () =>
      filter === "all"
        ? sync.products
        : sync.products.filter((p) => p.category === (filter as GearCategory)),
    [filter],
  );

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title="Gear" subtitle="Recommended for your objectives" back="/profile" />
      </div>

      <Stagger className="px-5">
        {system && goal && (
          <Rise>
            <Card className="border-azure/20 bg-azure/[0.04]">
              <p className="section-label text-azure/80">Recommended for {goal.name}</p>
              <h2 className="mt-2 text-[16px] font-light text-snow">{system.title}</h2>
              <p className="mt-2 text-[12px] leading-relaxed text-mist">{system.summary}</p>
              <div className="mt-4 flex items-baseline justify-between border-t border-hairline pt-3.5">
                <span className="section-label">System total</span>
                <span className="tnum text-[15px] text-snow">
                  {fmtPrice(
                    system.productIds.reduce(
                      (a, id) => a + (sync.productById(id)?.priceEur ?? 0),
                      0,
                    ),
                  )}
                </span>
              </div>
            </Card>
          </Rise>
        )}

        <Rise className="pt-6">
          <SegmentedTabs tabs={FILTERS} value={filter} onChange={setFilter} />
        </Rise>

        <Stagger className="mt-5 space-y-2.5">
          {list.map((p) => (
            <Rise key={p.id}>
              <GearCard product={p} rationale />
            </Rise>
          ))}
        </Stagger>

        <Rise className="pt-6">
          <Disclaimer>
            The ICEFALL range shown here is illustrative in this build. Product imagery is
            typographic rather than photographic — real product photography drops straight in.
          </Disclaimer>
        </Rise>
      </Stagger>
    </Screen>
  );
}

export function GearDetail() {
  const { id } = useParams<{ id: string }>();
  const product = id ? sync.productById(id) : undefined;

  if (!product) return <Navigate to="/gear" replace />;

  return (
    <Screen padded={false}>
      <div className="px-5">
        <ScreenHeader title={product.name} subtitle={product.categoryLabel} back="/gear" />
      </div>

      <Stagger className="px-5">
        <Rise>
          <div className="grid aspect-[4/3] place-items-center rounded-card border border-hairline bg-gradient-to-br from-slate to-graphite">
            <div className="text-center">
              <Mountain size={40} strokeWidth={0.9} className="mx-auto text-snow/30" />
              <p className="section-label mt-4">ICEFALL</p>
              <p className="mt-2 px-8 text-[15px] font-light leading-snug text-snow/70">
                {product.name}
              </p>
            </div>
          </div>
        </Rise>

        <Rise className="pt-5">
          <div className="flex items-baseline justify-between">
            <span className="tnum text-[22px] font-light text-snow">
              {fmtPrice(product.priceEur)}
            </span>
            <Badge tone="azure">
              {product.tempRangeC[0]}° to {product.tempRangeC[1]}°C
            </Badge>
          </div>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>Why this is recommended</SectionLabel>
          <Card className="mt-3">
            <p className="text-[13px] leading-relaxed text-mist">{product.rationale}</p>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>Protection</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            {product.protection.map((p) => (
              <Badge key={p} size="md">
                {p}
              </Badge>
            ))}
          </div>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>Specification</SectionLabel>
          <Card className="mt-3" inset={false}>
            <div className="px-4">
              {product.specs.map((s) => (
                <div
                  key={s.label}
                  className="flex items-baseline justify-between gap-4 border-b border-hairline py-3 text-[13px] last:border-0"
                >
                  <span className="text-mist-dim">{s.label}</span>
                  <span className="tnum text-snow">{s.value}</span>
                </div>
              ))}
            </div>
          </Card>
        </Rise>

        <Rise className="pt-6">
          <SectionLabel>Suitable for</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            {product.suitableFor.map((s) => (
              <Badge key={s} size="md">
                {s.replace("-", " ")}
              </Badge>
            ))}
          </div>
        </Rise>

        <Rise className="pt-7">
          <Button size="lg" className="w-full">
            Add to system
          </Button>
        </Rise>
      </Stagger>
    </Screen>
  );
}
