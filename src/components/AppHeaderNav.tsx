"use client";

import { Settings } from "lucide-react";
import { GuardedLink } from "@/components/OrderUnsavedGuard";

const nav = [
  ["선적의뢰", "/shipments"],
  ["입금내역", "/payments"],
  ["오더관리", "/orders"],
  ["공지", "/notices"],
  ["달력", "/calendar"]
] as const;

export function AppHeaderNav({
  teamLabel,
  userName,
  logoutAction
}: {
  teamLabel: string;
  userName: string;
  logoutAction: () => void;
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <nav className="flex items-center gap-2">
          <GuardedLink href="/shipments" className="mr-4 flex items-center">
            <img src="/logo.png" alt="Shipping Agent" className="h-9 w-9 object-contain" />
            <span className="ml-2 text-sm font-bold tracking-wide text-slate-900">KUP EXPORTER</span>
          </GuardedLink>
          {nav.map(([label, href]) => (
            <GuardedLink
              key={href}
              href={href}
              className="inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {label}
              {href === "/orders" ? (
                <span className="rounded bg-sky-100 px-1 py-px text-[9px] font-semibold uppercase leading-none tracking-wide text-sky-700">
                  Beta
                </span>
              ) : null}
            </GuardedLink>
          ))}
        </nav>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {teamLabel} · {userName}
          </span>
          <GuardedLink aria-label="관리 페이지" href="/admin" className="rounded-md p-2 text-slate-600 hover:bg-slate-100">
            <Settings size={18} />
          </GuardedLink>
          <form action={logoutAction}>
            <button type="submit" className="text-xs text-slate-500 hover:text-slate-900">
              로그아웃
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
