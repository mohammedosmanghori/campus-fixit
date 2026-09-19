import { ReactNode } from "react";
import { BottomNav } from "./BottomNav";

export function AppShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="mx-auto max-w-md">
        {title && (
          <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-lg">
            <div className="px-5 py-4">
              <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            </div>
          </header>
        )}
        <main className="px-5 py-4">{children}</main>
      </div>
      <BottomNav />
    </div>
  );
}
