"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { APP_NAV } from "@/lib/nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Soft navigation can keep a stale RSC payload (e.g. Overview Cash now vs Forecast).
  // Refresh the active route whenever the path changes so money screens stay aligned.
  useEffect(() => {
    router.refresh();
  }, [pathname, router]);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-cc-border bg-cc-card lg:border-b-0 lg:border-r">
        <div className="flex flex-col gap-5 px-4 py-5 lg:sticky lg:top-0 lg:min-h-screen lg:px-5 lg:py-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-display text-2xl tracking-tight text-cc-primary">CashCue</p>
              <p className="mt-0.5 text-sm text-cc-muted">Cash-flow control</p>
            </div>
            <button
              type="button"
              className="rounded-md border border-cc-border px-2.5 py-1.5 text-sm text-cc-ink lg:hidden"
              aria-expanded={open}
              aria-controls="app-nav"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Close" : "Menu"}
            </button>
          </div>

          <nav
            id="app-nav"
            className={`${open ? "flex" : "hidden"} flex-col gap-1 lg:flex`}
            aria-label="Main"
          >
            {APP_NAV.map((item) => {
              const active =
                item.href === "/"
                  ? pathname === "/"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={
                    active
                      ? "rounded-md bg-cc-primary/10 px-3 py-2 text-sm font-medium text-cc-primary"
                      : "rounded-md px-3 py-2 text-sm text-cc-muted transition hover:bg-cc-bg hover:text-cc-ink"
                  }
                >
                  <span className="lg:hidden">{item.shortLabel}</span>
                  <span className="hidden lg:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="min-w-0">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-app-glow" aria-hidden />
        <main className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-10">{children}</main>
      </div>
    </div>
  );
}
