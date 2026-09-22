import type { Position } from "@pcc/shared";

function formatCurrency(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

/** Mobile-width card representation of a single position; the Portfolio table uses this on narrow viewports instead of horizontal scroll. */
export function PositionCard({ position }: { position: Position }) {
  const pnlTone = (position.unrealizedPnl ?? 0) >= 0 ? "text-[var(--color-positive)]" : "text-[var(--color-negative)]";

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between">
        <span className="font-numeric text-base font-semibold text-[var(--text-primary)]">{position.symbol}</span>
        <span className="font-numeric text-sm text-[var(--text-secondary)]">{formatCurrency(position.marketValue)}</span>
      </div>
      <div className="flex items-center justify-between text-xs text-[var(--text-tertiary)]">
        <span>{position.shares} sh @ {formatCurrency(position.averageCost)}</span>
        <span className={`font-numeric ${pnlTone}`}>{formatPercent(position.unrealizedPnlPercent)}</span>
      </div>
    </div>
  );
}
