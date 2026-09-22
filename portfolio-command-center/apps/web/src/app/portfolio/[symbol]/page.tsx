"use client";

import { use } from "react";
import { AuthGate } from "@/components/layout/auth-gate";
import { SectionHeader } from "@/components/ui/section-header";
import { EmptyState } from "@/components/ui/empty-state";

const PLANNED_SECTIONS: { title: string; icon: string; note: string }[] = [
  { title: "Price", icon: "💵", note: "Live price integration pending (Phase 2)." },
  { title: "Position", icon: "📦", note: "Live position integration pending (Phase 2)." },
  { title: "P&L", icon: "📉", note: "Live P&L integration pending (Phase 2)." },
  { title: "Portfolio Weight", icon: "⚖️", note: "Live weight integration pending (Phase 2)." },
  { title: "Charts", icon: "📈", note: "Market data integration pending (Phase 4)." },
  { title: "News", icon: "📰", note: "News integration pending (Phase 4)." },
  { title: "Analysts", icon: "👨‍💼", note: "Analyst data integration pending (Phase 4)." },
  { title: "Earnings", icon: "🗓️", note: "Earnings data integration pending (Phase 4)." },
  { title: "Catalysts", icon: "📅", note: "Catalyst tracking pending (Phase 5)." },
  { title: "Risks", icon: "⚠️", note: "Risk analysis pending (Phase 5)." },
  { title: "AI Analysis", icon: "💬", note: "Portfolio AI integration pending (Phase 3)." },
];

function PositionDetailContent({ symbol }: { symbol: string }) {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="font-numeric text-xl font-semibold text-[var(--text-primary)]">{symbol.toUpperCase()}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">No live position selected — connect IBKR to load real data for this symbol.</p>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {PLANNED_SECTIONS.map((section) => (
          <section key={section.title}>
            <SectionHeader title={section.title} icon={section.icon} />
            <EmptyState title={section.note} />
          </section>
        ))}
      </div>
    </div>
  );
}

export default function PositionDetailPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params);
  return (
    <AuthGate>
      <PositionDetailContent symbol={symbol} />
    </AuthGate>
  );
}
