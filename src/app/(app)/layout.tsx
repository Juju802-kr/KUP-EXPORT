import Link from "next/link";
import { Settings } from "lucide-react";
import { logoutAction } from "@/server/actions";
import { requireUser } from "@/lib/auth";
import { teamLabels } from "@/lib/constants";
import { GlobalMessageAlert } from "@/components/GlobalMessageAlert";

const nav = [
  ["선적의뢰", "/shipments"],
  ["입금내역", "/payments"],
  ["오더관리", "/orders"],
  ["공지", "/notices"],
  ["달력", "/calendar"]
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <nav className="flex items-center gap-2">
            <Link href="/shipments" className="mr-4 flex items-center">
              <img src="/logo.png" alt="Shipping Agent" className="h-9 w-9 object-contain" />
              <span className="ml-2 text-sm font-bold tracking-wide text-slate-900">KUP EXPORTER</span>
            </Link>
            {nav.map(([label, href]) => (
              <Link key={href} href={href} className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {teamLabels[user.team]} · {user.name}
            </span>
            <Link aria-label="관리 페이지" href="/admin" className="rounded-md p-2 text-slate-600 hover:bg-slate-100">
              <Settings size={18} />
            </Link>
            <form action={logoutAction}>
              <button className="text-xs text-slate-500 hover:text-slate-900">로그아웃</button>
            </form>
          </div>
        </div>
      </header>
      <GlobalMessageAlert />
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
