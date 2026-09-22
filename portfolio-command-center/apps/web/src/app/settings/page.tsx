import Link from "next/link";
import { AuthGate } from "@/components/layout/auth-gate";

const SETTINGS_LINKS = [
  { href: "/settings/connections", label: "Connections", icon: "🔌", description: "IBKR, OpenAI, market data, and news integration status." },
  { href: "/settings/system-health", label: "System Health", icon: "🩺", description: "Operational status of every backend component." },
];

export default function SettingsPage() {
  return (
    <AuthGate>
      <div className="flex flex-col gap-4">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-[var(--text-primary)]">
          <span aria-hidden>⚙️</span> Settings
        </h1>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {SETTINGS_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] p-4 hover:border-[var(--color-accent)]"
            >
              <p className="flex items-center gap-2 font-medium text-[var(--text-primary)]">
                <span aria-hidden>{link.icon}</span> {link.label}
              </p>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">{link.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </AuthGate>
  );
}
