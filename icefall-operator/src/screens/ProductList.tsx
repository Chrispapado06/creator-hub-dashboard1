/**
 * The Expeditions and Treks catalogue, built to the mockup.
 *
 * One component behind two routes. Spec §7 treats expedition and trek as
 * distinct product types sharing the same infrastructure, and that is exactly
 * what this is: the operator gets two catalogues in the nav, the code has one
 * table and one editor.
 *
 * The filter tabs carry counts, as the mockup has them — and the counts come
 * from the same searched rows the table renders, so a tab can never claim a
 * number the list does not contain. Per the mockup there is no separate
 * Pending tab: an item awaiting approval sits under All wearing its amber chip.
 *
 * The Enquiries / Bookings figures on each row are COUNTED from the same lead
 * rows `getProductPerformance` counts everywhere else — never typed, never
 * defaulted. Until that read lands the row shows "—", not 0.
 */

import { Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Button, Card, EmptyState, ListingPhoto, PageHeader, Pill, RowMenu, SearchInput,
  StatusChip, Tabs, Toolbar, peakPhotoUrl, trekPhotoUrl,
} from "@/components/ui";
import { can } from "@/domain/authz";
import { chipForProduct, type Product, type ProductKind } from "@/domain/types";
import { useAsync, useOperator, useSession } from "@/state/OperatorContext";

type Filter = "all" | "live" | "draft" | "archived";

export function ProductList({ kind }: { kind: ProductKind }) {
  const session = useSession();
  const navigate = useNavigate();
  const { backend, mountains, revision } = useOperator();
  const all = useAsync(() => backend.getProducts(session), [session, revision], []);
  const versions = useAsync(() => backend.getVersions(session, "product"), [session, revision], []);
  const performance = useAsync(() => backend.getProductPerformance(session), [session, revision], []);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const noun = kind === "expedition" ? "Expedition" : "Trek";
  const mountainName = (id: string) => mountains.find((m) => m.id === id)?.name ?? "—";
  const mountainsOf = (p: Product) => p.mountainIds.map(mountainName).join(", ");

  // Search over name + mountain, then tab over the searched rows — so the tab
  // counts always describe exactly what a click on that tab will show.
  const q = search.trim().toLowerCase();
  const searched = all.filter(
    (p) =>
      p.kind === kind &&
      (q === "" || p.name.toLowerCase().includes(q) || mountainsOf(p).toLowerCase().includes(q)),
  );
  const count = (f: Filter) => (f === "all" ? searched.length : searched.filter((p) => p.status === f).length);
  const shown = searched.filter((p) => filter === "all" || p.status === filter);

  const statsFor = (productId: string) => performance.find((r) => r.productId === productId) ?? null;

  const photoSources = (p: Product): string[] => {
    const peak = p.mountainIds[0] ? [peakPhotoUrl(p.mountainIds[0])] : [];
    return kind === "trek" ? [trekPhotoUrl(p.slug), ...peak] : peak;
  };

  return (
    <>
      <PageHeader
        title={`${noun}s`}
        detail={kind === "expedition" ? "Manage your expeditions." : "Manage all your treks and packages."}
      />

      <Toolbar
        search={
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={`Search ${noun.toLowerCase()}s...`}
          />
        }
      >
        {can(session, "editProducts") && (
          <Link to="/operator/products/new">
            <Button variant="primary">
              <Plus size={14} aria-hidden /> Add {noun}
            </Button>
          </Link>
        )}
      </Toolbar>

      <div className="mb-3">
        <Tabs
          active={filter}
          onChange={setFilter}
          tabs={[
            { key: "all" as const, label: "All", count: count("all") },
            { key: "live" as const, label: "Published", count: count("live") },
            { key: "draft" as const, label: "Draft", count: count("draft") },
            { key: "archived" as const, label: "Archived", count: count("archived") },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          title={q ? `No ${noun.toLowerCase()}s match “${search.trim()}”` : `No ${noun.toLowerCase()}s here`}
          detail={
            q
              ? "Try a different name or mountain."
              : "Add one on a mountain Icefall has assigned to you, or change the filter above."
          }
        />
      ) : (
        <Card>
          {shown.map((p, i) => {
            const pending = versions.some((v) => v.entityId === p.id && v.state === "pending");
            const rejected = versions.some((v) => v.entityId === p.id && v.state === "rejected");
            const stats = statsFor(p.id);
            return (
              <div
                key={p.id}
                className={`flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 ${
                  i > 0 ? "border-t border-line-soft" : ""
                }`}
              >
                <Link
                  to={`/operator/products/${p.id}`}
                  className="group flex min-w-0 flex-1 items-center gap-3.5"
                >
                  <ListingPhoto
                    sources={photoSources(p)}
                    alt={p.name}
                    seed={p.mountainIds[0] ?? p.name}
                    className="h-10 w-14 shrink-0 rounded-tile"
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-ink transition-colors group-hover:text-azure-ink">
                      {p.name}
                    </span>
                    <span className="block truncate text-[12px] text-muted">{mountainsOf(p)}</span>
                  </span>
                </Link>

                <span className="flex items-center gap-1.5">
                  {rejected && <Pill>Changes rejected</Pill>}
                  {pending && <Pill tone="azure">Edit pending</Pill>}
                  <StatusChip status={chipForProduct(p.status)} />
                </span>

                {/* Number above, tiny label under — counted rows, or an honest dash. */}
                <span className="hidden w-[72px] text-center sm:block">
                  <span className="tnum block text-[14px] font-medium leading-tight text-ink">
                    {stats ? stats.enquiries : "—"}
                  </span>
                  <span className="block text-[10.5px] text-faint">Enquiries</span>
                </span>
                <span className="hidden w-[72px] text-center sm:block">
                  <span className="tnum block text-[14px] font-medium leading-tight text-ink">
                    {stats ? stats.bookings : "—"}
                  </span>
                  <span className="block text-[10.5px] text-faint">Bookings</span>
                </span>

                <RowMenu
                  label={`Actions for ${p.name}`}
                  items={[
                    { label: "Edit", onClick: () => navigate(`/operator/products/${p.id}`) },
                    { label: "Edit page", onClick: () => navigate(`/operator/products/${p.id}/edit`) },
                    { label: "Preview", onClick: () => navigate(`/operator/products/${p.id}/preview`) },
                    {
                      label: "Archive",
                      tone: "danger",
                      onClick: () => {
                        // No archive write path exists in the backend adapter yet,
                        // and inventing one is not this screen's job. Say so.
                        window.alert(
                          `Archiving is not available from this portal yet — contact Icefall to archive “${p.name}”.`,
                        );
                      },
                    },
                  ]}
                />
              </div>
            );
          })}
        </Card>
      )}
    </>
  );
}
