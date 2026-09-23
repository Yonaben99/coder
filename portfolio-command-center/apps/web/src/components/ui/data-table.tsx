import type { ReactNode } from "react";

export interface DataTableColumn<Row> {
  key: string;
  header: string;
  align?: "left" | "right";
  render: (row: Row) => ReactNode;
}

export function DataTable<Row>({
  columns,
  rows,
  getRowKey,
}: {
  columns: DataTableColumn<Row>[];
  rows: Row[];
  getRowKey: (row: Row, index: number) => string | number;
}) {
  return (
    <div className="scroll-x rounded-lg border border-[var(--border-subtle)]">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface)]">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`px-4 py-3 text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)] ${
                  column.align === "right" ? "text-right" : "text-left"
                }`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={getRowKey(row, index)} className="border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--surface)]">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`font-numeric px-4 py-3 text-[var(--text-primary)] ${
                    column.align === "right" ? "text-right" : "text-left"
                  }`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
