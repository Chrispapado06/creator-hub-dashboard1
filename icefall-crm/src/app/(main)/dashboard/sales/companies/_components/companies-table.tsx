"use client";

import type { MouseEvent } from "react";

import type { ReactTable } from "@tanstack/react-table";

import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { DataTableFeatures } from "@/lib/data-table-features";

import type { CompanyRow } from "./data";

function preventPaginationNavigation(event: MouseEvent<HTMLAnchorElement>) {
  event.preventDefault();
}

export function CompaniesTable({
  table,
  pages,
  safePage,
  perPage,
  onPerPage,
  onPage,
  onOpenCompany,
}: {
  table: ReactTable<DataTableFeatures, CompanyRow>;
  pages: number;
  safePage: number;
  perPage: number;
  onPerPage: (size: number) => void;
  onPage: (page: number) => void;
  onOpenCompany: (id: string) => void;
}) {
  // 1..pages while there are few enough to list; otherwise the first three, a
  // gap, and the last — so the pager keeps a fixed width however long the
  // roster gets.
  const pageItems: (number | "…")[] =
    pages <= 5 ? Array.from({ length: pages }, (_, i) => i + 1) : [1, 2, 3, "…", pages];

  return (
    <>
      <Table className="**:data-[slot='table-cell']:px-4 **:data-[slot='table-head']:px-4">
        <TableHeader className="[&_tr]:border-t">
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id} className="py-4 font-normal">
                  {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            // The whole row is the link to the company's record. There is no
            // per-row link element and no per-row menu.
            <TableRow
              key={row.id}
              onClick={() => onOpenCompany(row.original.id)}
              className="cursor-pointer border-border/60"
            >
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id} className="py-4 align-middle">
                  <table.FlexRender cell={cell} />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Separator />

      <div className="flex flex-wrap items-center justify-between gap-3 px-4">
        <div className="flex flex-wrap items-center gap-4 text-muted-foreground text-sm">
          <div className="flex items-center gap-2">
            <span>Rows per page</span>
            <Select value={String(perPage)} onValueChange={(value) => onPerPage(Number(value))}>
              <SelectTrigger size="sm" className="w-20" aria-label="Results per page">
                <SelectValue placeholder={String(perPage)} />
              </SelectTrigger>
              <SelectContent side="top">
                <SelectGroup>
                  {[8, 16, 24].map((size) => (
                    <SelectItem key={size} value={String(size)}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <span className="tabular-nums">
            Page {safePage} of {pages}
          </span>
        </div>

        <Pagination className="mx-0 w-auto justify-start md:justify-end">
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                href="#"
                text=""
                className={safePage <= 1 ? "pointer-events-none opacity-50" : undefined}
                onClick={(event) => {
                  preventPaginationNavigation(event);
                  onPage(Math.max(1, safePage - 1));
                }}
              />
            </PaginationItem>
            {pageItems.map((item, index) =>
              item === "…" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: the gap marker has no identity of its own.
                <PaginationItem key={`gap-${index}`}>
                  <PaginationEllipsis />
                </PaginationItem>
              ) : (
                <PaginationItem key={item}>
                  <PaginationLink
                    href="#"
                    isActive={item === safePage}
                    onClick={(event) => {
                      preventPaginationNavigation(event);
                      onPage(item);
                    }}
                  >
                    {item}
                  </PaginationLink>
                </PaginationItem>
              ),
            )}
            <PaginationItem>
              <PaginationNext
                href="#"
                text=""
                className={safePage >= pages ? "pointer-events-none opacity-50" : undefined}
                onClick={(event) => {
                  preventPaginationNavigation(event);
                  onPage(Math.min(pages, safePage + 1));
                }}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </>
  );
}
