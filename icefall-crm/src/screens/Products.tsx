import { useEffect, useState } from "react";
import { Avatar, PageHead, Pill, StatusChip, TableCard } from "@/components/ui";
import { Resolve } from "@/components/states";
import { listProducts } from "@/data/queries";
import { formatCents, loading, type Result } from "@/data/result";
import type { Product, ProductStatus } from "@/data/types";

/**
 * The four product statuses, in the mockup's own vocabulary: live is settled,
 * pending review is waiting on somebody, archived is withdrawn, and draft is
 * none of the three — it has never been submitted, so it is neutral rather than
 * amber. The words printed are the status values themselves; the colour only
 * repeats what the word already says.
 */
const statusState = (s: ProductStatus): "ok" | "pending" | "bad" | "neutral" =>
  s === "live" ? "ok" : s === "pending_review" ? "pending" : s === "archived" ? "bad" : "neutral";

/**
 * Expeditions and treks.
 *
 * PRICE IS THREE-STATE, NOT A NUMBER-OR-ZERO. An 8,000 m expedition is quoted,
 * not priced off a card, so `price_state` distinguishes a real figure from "on
 * request" from "we do not know" — and the database refuses to store a figure
 * for the last two. A €0 expedition on a marketplace page is a bug that reads as
 * a bargain.
 *
 * WHICH IS ALSO WHY THE PRICE COLUMN IS NOT UNIFORMLY BOLD. A figure is set
 * heavy because it was measured; "On request" and "Not recorded" stay quiet and
 * small, so the weight of the column is a reliable signal that there is a real
 * number under it.
 */
export default function Products() {
  const [result, setResult] = useState<Result<Product[]>>(loading);
  useEffect(() => {
    void listProducts().then(setResult);
  }, []);

  return (
    <>
      <PageHead
        title="Products"
        subtitle="Expeditions and treks, owned by their operator and linked to one or more mountains. A product only becomes public when ICEFALL approves it."
      />
      <Resolve
        result={result}
        what="products"
        isEmpty={(v) => v.length === 0}
        empty="No operator has created a product yet."
      >
        {(products) => (
          <TableCard>
            <table className="w-full min-w-[680px] text-[13px]">
              <thead>
                <tr className="border-b border-line-soft text-left">
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Product</th>
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Type</th>
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">From</th>
                  <th className="px-5 py-3.5 text-[12px] font-semibold text-faint">Status</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} className="border-b border-line-soft last:border-0 hover:bg-raised">
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-3">
                        <Avatar name={p.name} size={34} />
                        <span className="font-medium text-ink">{p.name}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <Pill>{p.kind}</Pill>
                    </td>
                    <td className="px-5 py-3.5">
                      {p.price_state === "known" ? (
                        <span className="tnum text-[15px] font-bold tracking-[-0.02em] text-ink">
                          {formatCents(p.price_from_cents, p.currency)}
                        </span>
                      ) : (
                        <span className="text-[12.5px] text-faint">
                          {p.price_state === "on_request" ? "On request" : "Not recorded"}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5">
                      <StatusChip state={statusState(p.status)} label={p.status.replace("_", " ")} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableCard>
        )}
      </Resolve>
    </>
  );
}
