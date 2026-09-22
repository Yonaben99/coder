"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from "@/lib/navigation";

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
          : "text-[var(--text-secondary)] hover:bg-[var(--surface-raised)] hover:text-[var(--text-primary)]"
      }`}
    >
      <span aria-hidden>{item.icon}</span>
      {item.label}
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-[var(--border-subtle)] bg-[var(--surface)] px-3 py-4 md:flex">
      <div className="mb-6 flex items-center gap-2 px-2">
        <span className="text-xl" aria-hidden>📊</span>
        <span className="text-sm font-semibold text-[var(--text-primary)]">Portfolio Command Center</span>
      </div>
      <nav className="flex flex-col gap-1">
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.href} item={item} active={pathname === item.href} />
        ))}
      </nav>
      <div className="my-4 border-t border-[var(--border-subtle)]" />
      <nav className="flex flex-col gap-1">
        {SECONDARY_NAV.map((item) => (
          <NavLink key={item.label} item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} />
        ))}
      </nav>
    </aside>
  );
}
