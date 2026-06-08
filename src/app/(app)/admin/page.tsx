import { AdminClient } from "@/components/AdminClient";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const params = await searchParams;
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
        sortOrder: option.sortOrder
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
