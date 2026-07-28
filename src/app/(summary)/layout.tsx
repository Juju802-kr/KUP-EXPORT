import { requireUser } from "@/lib/auth";

export default async function SummaryLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="min-h-screen bg-slate-100">{children}</div>;
}
