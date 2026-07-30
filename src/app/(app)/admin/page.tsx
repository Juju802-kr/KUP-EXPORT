import { DropdownCategory, Team } from "@prisma/client";
import { AdminClient } from "@/components/AdminClient";
import { OVERSEAS_SALES_LEADER_PART, OVERSEAS_SALES_PROBATION_PART, overseasSalesSortOrder } from "@/lib/overseas-sales-roster";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DEFAULT_OVERSEAS_SALES_ROSTER: Array<{ label: string; partNo: number; rankNo: number }> = [
  { label: "조한선", partNo: OVERSEAS_SALES_LEADER_PART, rankNo: 1 },
  { label: "김상훈", partNo: 1, rankNo: 1 },
  { label: "도준현", partNo: 1, rankNo: 2 },
  { label: "변재형", partNo: 1, rankNo: 3 },
  { label: "최유라", partNo: 2, rankNo: 1 },
  { label: "박사라", partNo: 2, rankNo: 2 },
  { label: "음정현", partNo: 2, rankNo: 3 },
  { label: "심상완", partNo: 3, rankNo: 1 },
  { label: "권정현", partNo: 3, rankNo: 2 }
];

async function ensureOverseasSalesRoster() {
  for (const member of DEFAULT_OVERSEAS_SALES_ROSTER) {
    const isLeader = member.partNo === OVERSEAS_SALES_LEADER_PART;
    await prisma.dropdownOption.upsert({
      where: { category_label: { category: DropdownCategory.OVERSEAS_SALES_TEAM, label: member.label } },
      // 팀장(조한선)은 요청 기준으로 항상 맞추고, 나머지는 기존 수동 설정을 유지합니다.
      update: isLeader
        ? {
            partNo: member.partNo,
            rankNo: member.rankNo,
            sortOrder: overseasSalesSortOrder(member.partNo, member.rankNo),
            value: member.label
          }
        : {},
      create: {
        category: DropdownCategory.OVERSEAS_SALES_TEAM,
        label: member.label,
        value: member.label,
        partNo: member.partNo,
        rankNo: member.rankNo,
        sortOrder: overseasSalesSortOrder(member.partNo, member.rankNo)
      }
    });
  }

  // One-time fill for existing names that were created empty (no part yet).
  for (const member of DEFAULT_OVERSEAS_SALES_ROSTER) {
    await prisma.dropdownOption.updateMany({
      where: {
        category: DropdownCategory.OVERSEAS_SALES_TEAM,
        label: member.label,
        OR: [{ partNo: null }, { rankNo: null }]
      },
      data: {
        partNo: member.partNo,
        rankNo: member.rankNo,
        sortOrder: overseasSalesSortOrder(member.partNo, member.rankNo),
        value: member.label
      }
    });
  }

  const salesUsers = await prisma.user.findMany({
    where: { team: Team.OVERSEAS_SALES },
    orderBy: { createdAt: "asc" },
    select: { name: true }
  });
  const existing = await prisma.dropdownOption.findMany({
    where: { category: DropdownCategory.OVERSEAS_SALES_TEAM },
    select: { label: true, partNo: true, rankNo: true }
  });
  const existingNames = new Set(existing.map((row) => row.label));
  let probationRank = existing.filter((row) => (row.partNo ?? 0) === OVERSEAS_SALES_PROBATION_PART).length;

  for (const user of salesUsers) {
    if (existingNames.has(user.name)) continue;
    probationRank += 1;
    await prisma.dropdownOption.create({
      data: {
        category: DropdownCategory.OVERSEAS_SALES_TEAM,
        label: user.name,
        value: user.name,
        partNo: OVERSEAS_SALES_PROBATION_PART,
        rankNo: probationRank,
        sortOrder: overseasSalesSortOrder(OVERSEAS_SALES_PROBATION_PART, probationRank)
      }
    });
  }
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const params = await searchParams;
  try {
    await ensureOverseasSalesRoster();
  } catch {
    // Prisma client may be mid-generate; page still renders other masters.
  }

  const [products, buyers, dropdowns, productNames, users] = await Promise.all([
    prisma.productMaster.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.buyerMaster.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.dropdownOption.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
    prisma.exportProductName.findMany({ orderBy: [{ exportCountry: "asc" }, { productName: "asc" }] }),
    prisma.user.findMany({ orderBy: { name: "asc" } })
  ]);

  return (
    <AdminClient
      products={products.map((product) => ({
        id: product.id,
        name: product.name,
        factory: product.factory
      }))}
      buyers={buyers.map((buyer) => ({
        id: buyer.id,
        exportCountry: buyer.exportCountry,
        buyerName: buyer.buyerName,
        defaultCurrency: buyer.defaultCurrency,
        salesOwner: buyer.salesOwner,
        exportOwner: buyer.exportOwner,
        salesEmailRecipients: buyer.salesEmailRecipients
      }))}
      dropdowns={dropdowns.map((option) => ({
        id: option.id,
        category: option.category,
        label: option.label,
        value: option.value,
        sortOrder: option.sortOrder,
        destinationCountry: option.destinationCountry,
        destinationKind: option.destinationKind,
        partNo: option.partNo,
        rankNo: option.rankNo
      }))}
      productNames={productNames.map((product) => ({
        id: product.id,
        exportCountry: product.exportCountry,
        productName: product.productName,
        englishName: product.englishName,
        productCode: product.productCode
      }))}
      users={users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        team: user.team,
        createdAt: user.createdAt.toISOString().slice(0, 10)
      }))}
      error={params.error}
      success={params.success}
    />
  );
}
