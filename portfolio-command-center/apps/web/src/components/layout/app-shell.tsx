import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { BottomNavigation } from "./bottom-navigation";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="min-w-0 flex-1 px-4 pb-20 pt-6 sm:px-6 md:pb-6 lg:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
      <BottomNavigation />
    </div>
  );
}
