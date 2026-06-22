import { DropdownCategory, DropdownOption } from "@prisma/client";
import { ShipmentForm } from "@/components/ShipmentForm";
import { prisma } from "@/lib/prisma";

export default async function NewShipmentPage() {
  const [dropdowns, buyers] = await Promise.all([
    prisma.dropdownOption.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
    prisma.buyerMaster.findMany({ orderBy: { buyerName: "asc" } })
  ]);
  const options = Object.fromEntries(
    Object.values(DropdownCategory).map((category) => [category, dropdowns.filter((option) => option.category === category)])
  ) as Record<DropdownCategory, DropdownOption[]>;

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">선적의뢰 등록</h1>
      <ShipmentForm
        options={options}
        buyers={buyers.map((buyer) => ({
          id: buyer.id,
          exportCountry: buyer.exportCountry,
          buyerName: buyer.buyerName,
          defaultCurrency: buyer.defaultCurrency,
          salesOwner: buyer.salesOwner,
          exportOwner: buyer.exportOwner,
          salesEmailRecipients: buyer.salesEmailRecipients
        }))}
      />
    </div>
  );
}
