import { DropdownCategory, DropdownOption } from "@prisma/client";
import { ShipmentFormWithDraft } from "@/components/ShipmentFormWithDraft";
import { dropdownOptionsToRegisteredDestinations } from "@/lib/destination-registry";
import { prisma } from "@/lib/prisma";

export default async function NewShipmentPage({
  searchParams
}: {
  searchParams: Promise<{ draft?: string; error?: string; success?: string }>;
}) {
  const params = await searchParams;
  const [dropdowns, buyers] = await Promise.all([
    prisma.dropdownOption.findMany({ orderBy: [{ category: "asc" }, { sortOrder: "asc" }] }),
    prisma.buyerMaster.findMany({ orderBy: [{ exportCountry: "asc" }, { buyerName: "asc" }] })
  ]);
  const options = Object.fromEntries(
    Object.values(DropdownCategory).map((category) => [category, dropdowns.filter((option) => option.category === category)])
  ) as Record<DropdownCategory, DropdownOption[]>;
  const destinationPorts = dropdownOptionsToRegisteredDestinations(options.DESTINATION_PORT);

  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">선적의뢰 등록</h1>
      {params.error ? (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{params.error}</div>
      ) : null}
      {params.success ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{params.success}</div>
      ) : null}
      <ShipmentFormWithDraft
        options={options}
        destinationPorts={destinationPorts}
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
