"use client";

import { useState } from "react";

const SUGGESTED_PROMPTS = [
  "What changed in my portfolio?",
  "Why did my portfolio move today?",
  "What are my biggest risks?",
  "What news affects my holdings?",
  "What should I pay attention to this week?",
];

/**
 * The layout (conversation list + message thread + composer) is built now
 * so Phase 3 only has to replace the disabled composer and empty thread
 * with real data — no redesign needed.
 */
export function AIChat() {
  const [draft, setDraft] = useState("");

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col gap-4 md:h-[calc(100vh-4rem)] md:flex-row">
      <aside className="flex shrink-0 flex-col gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-3 md:w-64">
        <p className="px-1 text-xs font-medium uppercase tracking-wide text-[var(--text-tertiary)]">Conversations</p>
        <p className="rounded-md px-2 py-6 text-center text-xs text-[var(--text-tertiary)]">
          No conversations yet. Ask a question once Portfolio AI is connected.
        </p>
      </aside>

      <section className="flex flex-1 flex-col rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)]">
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="text-3xl" aria-hidden>💬</span>
          <p className="font-medium text-[var(--text-primary)]">Portfolio AI is not connected yet.</p>
          <p className="max-w-sm text-sm text-[var(--text-secondary)]">
            OpenAI tool-calling integration ships in Phase 3. Once connected, the AI will answer using your real
            portfolio, market, and news data — never a static prompt.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled
                className="cursor-not-allowed rounded-full border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-tertiary)]"
                title="Available once Portfolio AI is connected"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>

        <form
          className="flex items-center gap-2 border-t border-[var(--border-subtle)] p-3"
          onSubmit={(event) => event.preventDefault()}
        >
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled
            placeholder="Portfolio AI is not connected yet"
            className="flex-1 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled
            className="cursor-not-allowed rounded-md bg-[var(--surface-overlay)] px-4 py-2 text-sm font-medium text-[var(--text-tertiary)]"
          >
            Send
          </button>
        </form>
      </section>
    </div>
  );
}
