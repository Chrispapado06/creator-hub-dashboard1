/**
 * All trips.
 *
 * Expeditions and treks in one list, because an operator thinks about "my
 * trips", not about two product tables. The type is a column, not a separate
 * screen — spec §7 treats them as distinct types sharing one infrastructure.
 */

import { Plus } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, EmptyState, PageHeader, Pill, StatusChip, formatPriceRange } from "@/components/ui";
import { can } from "@/domain/authz";
import { chipForProduct } from "@/domain/types";
import type { ProductKind } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

type Filter = "all" | ProductKind;

export default function Products() {
  const session = useSession();
  const { backend, mountains, revision } = useOperator();
  const products = useAsync(() => backend.getProducts(session), [session, revision], []);
  const versions = useAsync(() => backend.getVersions(session, "product"), [session, revision], []);
  const [filter, setFilter] = useState<Filter>("all");

  const shown = products.filter((p) => filter === "all" || p.kind === filter);
  const mountainName = (id: string) => mountains.find((m) => m.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        title="Trips"
        detail="Your expeditions and treks. Edits are reviewed by Icefall before they change what climbers see."
        action={
          can(session, "editProducts") ? (
            <Link to="/operator/products/new">
              <Button variant="primary">
                <Plus size={14} aria-hidden /> New trip
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className="mb-3 flex gap-1.5">
        {(["all", "expedition", "trek"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-pill px-3 py-1 text-[12.5px] font-medium capitalize transition-colors ${
              filter === f ? "bg-azure text-canvas" : "hairline bg-surface text-muted hover:text-ink"
            }`}
          >
            {f === "all" ? "All" : `${f}s`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title="No trips yet"
          detail="Add an expedition or trek on one of the mountains Icefall has assigned to you."
        />
      ) : (
        <Card>
          {shown.map((p, i) => {
            const pending = versions.some((v) => v.entityId === p.id && v.state === "pending");
            const rejected = versions.some((v) => v.entityId === p.id && v.state === "rejected");
            const price = formatPriceRange(p.priceFromCents, p.priceToCents, p.currency);
            return (
              <Link
                key={p.id}
                to={`/operator/products/${p.id}`}
                className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 transition-colors hover:bg-raised ${
                  i > 0 ? "border-t border-line-soft" : ""
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-ink">{p.name}</span>
                  <span className="block truncate text-[11.5px] text-muted">
                    <span className="capitalize">{p.kind}</span> · {p.mountainIds.map(mountainName).join(", ")}
                    {p.durationDays ? ` · ${p.durationDays} days` : ""}
                  </span>
                </span>
                <span className="tnum text-[12.5px] text-muted">
                  {/* No price is "not priced", never €0. An expedition is quoted. */}
                  {price ?? "Not priced"}
                </span>
                <span className="flex items-center gap-1.5">
                  {rejected && <Pill>Changes rejected</Pill>}
                  {pending && <Pill tone="azure">Edit pending</Pill>}
                  <StatusChip status={chipForProduct(p.status)} />
                </span>
              </Link>
            );
          })}
        </Card>
      )}
    </>
  );
}
