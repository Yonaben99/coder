export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-[var(--color-negative-muted)] bg-[var(--color-negative-muted)]/40 px-6 py-8 text-center"
    >
      <p className="text-sm font-medium text-[var(--color-negative)]">Something went wrong</p>
      <p className="max-w-sm text-sm text-[var(--text-secondary)]">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-overlay)]"
        >
          Try again
        </button>
      )}
    </div>
  );
}
