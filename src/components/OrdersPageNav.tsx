"use client";

import { GuardedLink } from "@/components/OrderUnsavedGuard";
import { OVERSEAS_SALES_ALL_OWNER, type OverseasSalesPartGroup } from "@/lib/overseas-sales-roster";

const fallbackSalesParts: OverseasSalesPartGroup[] = [
  { label: "팀장", partNo: -1, children: ["조한선"] },
  { label: "1파트", partNo: 1, children: ["김상훈", "도준현", "변재형"] },
  { label: "2파트", partNo: 2, children: ["최유라", "박사라", "음정현"] },
  { label: "3파트", partNo: 3, children: ["심상완", "권정현"] }
];

const supportOwners = ["이해원", "김영민", "박휘원"] as const;
const marketingOwners = ["최재혁", "이주연"] as const;

function ownerHref(owner: string, sheet = "관리") {
  return `/orders?owner=${encodeURIComponent(owner)}&sheet=${encodeURIComponent(sheet)}`;
}

export function OrdersSidebar({
  owner,
  currentUser,
  salesParts,
  isOverseasLeader = false
}: {
  owner: string;
  currentUser: string;
  salesParts?: OverseasSalesPartGroup[];
  isOverseasLeader?: boolean;
}) {
  const overseasSalesParts = salesParts?.length ? salesParts : fallbackSalesParts;
  const homeOwner = isOverseasLeader ? OVERSEAS_SALES_ALL_OWNER : currentUser;
  const homeLabel = isOverseasLeader ? OVERSEAS_SALES_ALL_OWNER : currentUser;
  const ownerLinkClass = (name: string) =>
    `block rounded px-2 py-1.5 text-sm ${name === owner ? "bg-blue-50 font-semibold text-blue-700" : "hover:bg-slate-50"}`;

  return (
    <aside className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">담당자</h2>
      <GuardedLink href={ownerHref(homeOwner)} className="mb-3 block rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
        {homeLabel}
      </GuardedLink>
      <div className="space-y-2">
        <details className="rounded-md border border-slate-100" open={false}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">해외영업</summary>
          <div className="space-y-1 border-t border-slate-100 p-2">
            {isOverseasLeader ? (
              <GuardedLink href={ownerHref(OVERSEAS_SALES_ALL_OWNER)} className={ownerLinkClass(OVERSEAS_SALES_ALL_OWNER)}>
                {OVERSEAS_SALES_ALL_OWNER}
              </GuardedLink>
            ) : null}
            {overseasSalesParts.map((part) => (
              <details key={part.label} className="rounded bg-slate-50" open={false}>
                <summary className="cursor-pointer px-2 py-1.5 text-sm text-slate-600">{part.label}</summary>
                <div className="p-1">
                  {part.children.map((name) =>
                    name === currentUser && !isOverseasLeader ? null : (
                      <GuardedLink key={name} href={ownerHref(name)} className={ownerLinkClass(name)}>
                        {name}
                      </GuardedLink>
                    )
                  )}
                </div>
              </details>
            ))}
          </div>
        </details>

        <details className="rounded-md border border-slate-100" open={false}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">해외마케팅</summary>
          <div className="space-y-1 border-t border-slate-100 p-2">
            {marketingOwners.map((name) =>
              name === currentUser ? null : (
                <GuardedLink key={name} href={ownerHref(name)} className={ownerLinkClass(name)}>
                  {name}
                </GuardedLink>
              )
            )}
          </div>
        </details>

        <details className="rounded-md border border-slate-100" open={false}>
          <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">해외영업지원</summary>
          <div className="space-y-1 border-t border-slate-100 p-2">
            {supportOwners.map((name) =>
              name === currentUser ? null : (
                <GuardedLink key={name} href={ownerHref(name)} className={ownerLinkClass(name)}>
                  {name}
                </GuardedLink>
              )
            )}
          </div>
        </details>
      </div>
    </aside>
  );
}

export function OrdersSheetTabs({ owner, sheet, countries }: { owner: string; sheet: string; countries: string[] }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200">
      {["관리", ...countries].map((name) => (
        <GuardedLink
          key={name}
          href={ownerHref(owner, name)}
          className={`rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium ${sheet === name ? "bg-white text-blue-700" : "bg-slate-100 text-slate-500 hover:bg-white"}`}
        >
          {name}
        </GuardedLink>
      ))}
    </div>
  );
}
