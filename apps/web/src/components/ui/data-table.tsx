"use client";

import { useState } from "react";
import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  Row,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type { ColumnDef, Row };

interface DataTableProps<TData> {
  columns: ColumnDef<TData, unknown>[];
  data: TData[];
  pageSize?: number;
  className?: string;
  emptyMessage?: string;
}

export function DataTable<TData>({
  columns,
  data,
  pageSize = 20,
  className,
  emptyMessage = "No data",
}: DataTableProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    initialState: { pagination: { pageSize } },
    state: { sorting, columnFilters },
  });

  const { pageIndex, pageSize: currentPageSize } =
    table.getState().pagination;
  const totalRows = table.getFilteredRowModel().rows.length;
  const from = totalRows === 0 ? 0 : pageIndex * currentPageSize + 1;
  const to = Math.min((pageIndex + 1) * currentPageSize, totalRows);

  return (
    <div className={cn("flex flex-col gap-0", className)}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortDir = header.column.getIsSorted();
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        "sticky top-0 z-10 border-b border-[--border]",
                        "bg-[--bg-elevated] px-3 py-2",
                        "text-left text-[11px] font-medium uppercase",
                        "tracking-[0.04em] text-[--text-muted]",
                        canSort && "cursor-pointer select-none"
                      )}
                      onClick={
                        canSort
                          ? header.column.getToggleSortingHandler()
                          : undefined
                      }
                    >
                      <div className="flex items-center gap-1">
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                        {canSort && (
                          <span className="text-[--text-dim]">
                            {sortDir === "asc" ? (
                              <ChevronUp size={12} />
                            ) : sortDir === "desc" ? (
                              <ChevronDown size={12} />
                            ) : (
                              <ChevronsUpDown size={12} />
                            )}
                          </span>
                        )}
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-3 py-8 text-center text-[--text-muted]"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="group border-b border-[--border] hover:bg-[--bg-hover]"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-3 py-1.5">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalRows > currentPageSize && (
        <div className="flex items-center justify-between border-t border-[--border] px-3 py-2 text-[12px] text-[--text-muted]">
          <span>
            {from}–{to} of {totalRows}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className={cn(
                "rounded border border-[--border-strong] px-2 py-0.5",
                "hover:bg-[--bg-hover] disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              ‹
            </button>
            <span className="px-2 py-0.5">
              {pageIndex + 1} / {table.getPageCount()}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className={cn(
                "rounded border border-[--border-strong] px-2 py-0.5",
                "hover:bg-[--bg-hover] disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
