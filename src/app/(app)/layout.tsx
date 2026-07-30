import { AppHeaderNav } from "@/components/AppHeaderNav";
import { OrderUnsavedGuardHost } from "@/components/OrderUnsavedGuard";
import { logoutAction } from "@/server/actions";
import { requireUser } from "@/lib/auth";
import { teamLabels } from "@/lib/constants";
import { GlobalMessageAlert } from "@/components/GlobalMessageAlert";
import { DropdownCategory, Team } from "@prisma/client";
import { OVERSEAS_SALES_PROBATION_PART } from "@/lib/overseas-sales-roster";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  let showProbationNotice = false;
  if (user.team === Team.OVERSEAS_SALES) {
    try {
      const roster = await prisma.dropdownOption.findFirst({
        where: { category: DropdownCategory.OVERSEAS_SALES_TEAM, label: user.name },
        select: { partNo: true }
      });
      showProbationNotice = !roster || (roster.partNo ?? OVERSEAS_SALES_PROBATION_PART) === OVERSEAS_SALES_PROBATION_PART;
    } catch {
      showProbationNotice = false;
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AppHeaderNav teamLabel={teamLabels[user.team]} userName={user.name} logoutAction={logoutAction} />
      <GlobalMessageAlert />
      <OrderUnsavedGuardHost />
      {showProbationNotice ? (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-6 py-3 text-sm text-amber-900">
            <p>
              현재 파트가 <strong>수습</strong>입니다.{" "}
              <Link href="/admin" className="font-semibold underline">
                관리 &gt; 공통 드롭다운 관리 &gt; 해외영업팀
              </Link>
              에서 파트와 우선순위를 수정해주세요.
            </p>
          </div>
        </div>
      ) : null}
      <main className="mx-auto max-w-7xl px-6 py-6">{children}</main>
    </div>
  );
}
