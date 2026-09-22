export interface NavItem {
  label: string;
  href: string;
  icon: string;
}

/** Shown in both the mobile bottom nav and the top of the desktop sidebar. */
export const PRIMARY_NAV: NavItem[] = [
  { label: "Home", href: "/", icon: "🏠" },
  { label: "Portfolio", href: "/portfolio", icon: "📊" },
  { label: "Updates", href: "/updates", icon: "🚨" },
  { label: "Targets", href: "/targets", icon: "🎯" },
  { label: "AI", href: "/ai", icon: "💬" },
];

/**
 * Desktop-sidebar-only. "Positions" intentionally points at the same route
 * as primary "Portfolio" — the product spec describes one positions table,
 * not two distinct pages, so this is a second entry point rather than a
 * duplicated page.
 */
export const SECONDARY_NAV: NavItem[] = [
  { label: "Positions", href: "/portfolio", icon: "📈" },
  { label: "News", href: "/news", icon: "📰" },
  { label: "Scan", href: "/scan", icon: "🔎" },
  { label: "Catalysts", href: "/catalysts", icon: "📅" },
  { label: "Risk", href: "/risk", icon: "⚠️" },
  { label: "Analysts", href: "/analysts", icon: "👨‍💼" },
  { label: "Review", href: "/review", icon: "📋" },
  { label: "Settings", href: "/settings", icon: "⚙️" },
];
