"use client";
import * as React from "react";

import {
  type ColumnFiltersState,
  type ColumnVisibilityState,
  type PaginationState,
  type SortingState,
  useTable,
} from "@tanstack/react-table";
import {
  CalendarCheck,
  Download,
  Euro,
  type LucideIcon,
  MessageSquare,
  Package,
  Percent,
  Plus,
  Search,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { dataTableFeatures } from "@/lib/data-table-features";

import { AddProductDialog } from "./add-product-dialog";
import type { BookingDetailed, Company, Enquiry, PlacementRow, Product } from "./data";
import { aggregateProducts, eur } from "./product-metrics";
import { productsColumns } from "./products-columns";
import { ProductsTable } from "./products-table";
import { ok, type Result } from "./result";
import { buildProductRows } from "./rows";
import { Resolve } from "./states";

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending_review", label: "Pending review" },
  { value: "live", label: "Live" },
  { value: "archived", label: "Archived" },
];

/**
 * One headline figure: outlined icon square, quiet label, large tabular number.
 *
 * A `null` value is a figure that has NOT ARRIVED YET and prints an ellipsis —
 * never a zero standing in for a read that has not come back.
 */
function StatTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <div className="flex size-7 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
            {icon}
          </div>
        </CardTitle>
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        {value === null ? (
          <p className="text-muted-foreground text-sm">…</p>
        ) : (
          <div className="font-medium text-3xl tabular-nums leading-none tracking-tight">{value}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function Products({
  products: productRows,
  companies: companyRows,
  bookings: bookingRows,
  enquiries: enquiryRows,
  placements: placementRows,
}: {
  products: Product[];
  companies: Company[];
  bookings: BookingDetailed[];
  enquiries: Enquiry[];
  placements: PlacementRow[];
}) {
  // The five reads the screen depends on. The data layer is not connected yet,
  // so each one starts settled on the placeholder rows; wiring it later means
  // replacing these initialisers, not the code that renders their states.
  const [products] = React.useState<Result<Product[]>>(() => ok(productRows));
  const [companies] = React.useState<Result<Company[]>>(() => ok(companyRows));
  const [bookings] = React.useState<Result<BookingDetailed[]>>(() => ok(bookingRows));
  const [enquiries] = React.useState<Result<Enquiry[]>>(() => ok(enquiryRows));
  const [placements] = React.useState<Result<PlacementRow[]>>(() => ok(placementRows));

  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = React.useState<ColumnVisibilityState>({
    search: false,
    companyId: false,
    status: false,
  });
  const [pagination, setPagination] = React.useState<PaginationState>({
    pageIndex: 0,
    pageSize: 15,
  });

  const commercialReady = bookings.state === "ok" && enquiries.state === "ok" && placements.state === "ok";

  const stats = React.useMemo(
    () =>
      aggregateProducts(
        bookings.state === "ok" ? bookings.value : [],
        enquiries.state === "ok" ? enquiries.value : [],
        placements.state === "ok" ? placements.value : [],
      ),
    [bookings, enquiries, placements],
  );

  const rows = React.useMemo(
    () =>
      buildProductRows(
        products.state === "ok" ? products.value : [],
        companies.state === "ok" ? companies.value : [],
        stats,
        commercialReady,
      ),
    [products, companies, stats, commercialReady],
  );

  const totals = React.useMemo(() => {
    if (products.state !== "ok" || !commercialReady) return null;
    let b = 0;
    let rev = 0;
    let com = 0;
    let enq = 0;
    for (const p of products.value) {
      const s = stats.get(p.id);
      if (!s) continue;
      b += s.bookings;
      rev += s.revenue_cents;
      com += s.commission_cents;
      enq += s.enquiries;
    }
    return { bookings: b, revenue: rev, commission: com, enquiries: enq };
  }, [products, stats, commercialReady]);

  const table = useTable({
    features: dataTableFeatures,
    data: rows,
    columns: productsColumns,
    state: { sorting, columnFilters, columnVisibility, pagination },
    getRowId: (row) => row.id,
    autoResetPageIndex: false,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
  });

  const searchQuery = (table.getColumn("search")?.getFilterValue() as string | undefined) ?? "";
  const companyFilter = (table.getColumn("companyId")?.getFilterValue() as string | undefined) ?? "all";
  const statusFilter = (table.getColumn("status")?.getFilterValue() as string | undefined) ?? "all";
  const shown = table.getFilteredRowModel().rows;

  function setColumnSelectFilter(columnId: string, value: string) {
    table.getColumn(columnId)?.setFilterValue(value === "all" ? undefined : value);
    table.setPageIndex(0);
  }

  /**
   * Exports exactly the rows on screen — the filtered set, every page of it,
   * not the whole catalogue and not just the visible page.
   */
  function exportCsv() {
    const csvRows = [
      ["product", "company", "status", "bookings", "revenue_eur", "icefall_commission_eur", "enquiries"],
      ...shown.map((r) => [
        r.original.name,
        r.original.company,
        r.original.status,
        String(r.original.bookings),
        (r.original.revenueCents / 100).toFixed(2),
        r.original.commissionRows > 0 ? (r.original.commissionCents / 100).toFixed(2) : "not recorded",
        String(r.original.enquiries),
      ]),
    ];
    const csv = csvRows.map((r) => r.map((c) => `"${c.replaceAll('"', '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "icefall-products.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const tiles: { label: string; value: string | null; Icon: LucideIcon }[] = [
    {
      label: "Total products",
      value: products.state === "ok" ? String(products.value.length) : null,
      Icon: Package,
    },
    {
      label: "Total bookings",
      value: totals ? String(totals.bookings) : null,
      Icon: CalendarCheck,
    },
    { label: "Total revenue", value: totals ? eur(totals.revenue) : null, Icon: Euro },
    { label: "ICEFALL commission", value: totals ? eur(totals.commission) : null, Icon: Percent },
    {
      label: "Total enquiries",
      value: totals ? String(totals.enquiries) : null,
      Icon: MessageSquare,
    },
  ];

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-3xl tracking-tight">Products</h1>
          <p className="max-w-3xl text-muted-foreground text-sm">All expeditions and treks sold on the platform.</p>
        </div>
      </div>

      {/* Totals across every product, not the filtered set. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {tiles.map(({ label, value, Icon }) => (
          <StatTile key={label} icon={<Icon className="size-4" />} label={label} value={value} />
        ))}
      </div>

      <Card className="w-0 min-w-full overflow-hidden">
        <CardHeader className="border-b has-data-[slot=card-action]:grid-cols-1 md:has-data-[slot=card-action]:grid-cols-[1fr_auto]">
          <CardTitle className="font-normal">All products</CardTitle>
          <CardDescription>{shown.length} shown</CardDescription>
          <CardAction className="col-start-1 row-start-auto flex w-full flex-wrap justify-start gap-2 justify-self-stretch md:col-start-2 md:row-span-2 md:row-start-1 md:w-auto md:flex-nowrap md:justify-end md:justify-self-end">
            {/* The search box lives outside the Resolve on purpose: a loading,
                empty or failed read must never take the controls off screen. */}
            <InputGroup className="h-8 w-full md:w-72">
              <InputGroupAddon align="inline-start">
                <Search className="size-3.5" />
              </InputGroupAddon>
              <InputGroupInput
                className="h-8"
                placeholder="Search products, companies or mountains…"
                value={searchQuery}
                onChange={(event) => {
                  table.getColumn("search")?.setFilterValue(event.target.value || undefined);
                  table.setPageIndex(0);
                }}
              />
            </InputGroup>
            <Button variant="outline" size="sm" onClick={exportCsv}>
              <Download data-icon="inline-start" /> CSV Export
            </Button>
            <AddProductDialog>
              <Button size="sm">
                <Plus data-icon="inline-start" /> Add Product
              </Button>
            </AddProductDialog>
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 px-0">
          <div className="flex flex-wrap items-center gap-2 px-4">
            <Select value={companyFilter} onValueChange={(value) => setColumnSelectFilter("companyId", value)}>
              <SelectTrigger size="sm" className="min-w-[170px]" aria-label="Filter by company">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectGroup>
                  <SelectItem value="all">All Companies</SelectItem>
                  {(companies.state === "ok"
                    ? [...companies.value].sort((a, b) => a.name.localeCompare(b.name))
                    : []
                  ).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>

            {/* Deliberately inert, and it says why rather than hiding the gap:
                a product carries no destination, so there is nothing to list. */}
            <Select value="all">
              <SelectTrigger size="sm" className="min-w-[150px]" aria-label="Filter by mountain">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectGroup>
                  <SelectItem value="all">All Mountains</SelectItem>
                </SelectGroup>
                <p className="px-1.5 pt-1 pb-0.5 text-muted-foreground text-xs">
                  fills when products link a destination
                </p>
              </SelectContent>
            </Select>

            <Select value={statusFilter} onValueChange={(value) => setColumnSelectFilter("status", value)}>
              <SelectTrigger size="sm" className="min-w-[150px]" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectGroup>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>

          <div className={products.state === "ok" && products.value.length > 0 ? undefined : "px-4"}>
            <Resolve
              result={products}
              what="products"
              isEmpty={(v) => v.length === 0}
              empty="No products yet. Operators create them in the portal; each arrives here for approval and then appears in this catalogue."
            >
              {(value) => <ProductsTable table={table} totalProducts={value.length} />}
            </Resolve>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
