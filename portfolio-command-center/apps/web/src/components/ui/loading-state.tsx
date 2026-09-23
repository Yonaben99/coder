export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-8 text-sm text-[var(--text-secondary)]">
      <span
        className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--border)] border-t-[var(--color-accent)]"
        aria-hidden
      />
      {label}
    </div>
  );
}
