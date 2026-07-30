"use client";

import { DropdownCategory, DropdownOption } from "@prisma/client";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo } from "react";
import { ShipmentForm } from "@/components/ShipmentForm";
import { type RegisteredDestination } from "@/lib/destination-registry";
import { loadShipmentDraft, type ShipmentOrderProductDraft } from "@/lib/shipment-order-draft";

type BuyerOption = {
  id: string;
  exportCountry: string;
  buyerName: string;
  defaultCurrency: string | null;
  salesOwner: string | null;
  exportOwner: string | null;
  salesEmailRecipients: string | null;
};

function ShipmentFormFromDraft({
  options,
  buyers,
  destinationPorts
}: {
  options: Record<DropdownCategory, DropdownOption[]>;
  buyers: BuyerOption[];
  destinationPorts: RegisteredDestination[];
}) {
  const searchParams = useSearchParams();
  const draftKey = searchParams.get("draft") ?? "";
  const { initial, draftProducts } = useMemo(() => {
    if (!draftKey) return { initial: undefined, draftProducts: [] as ShipmentOrderProductDraft[] };
    const draft = loadShipmentDraft(draftKey);
    if (!draft) return { initial: undefined, draftProducts: [] as ShipmentOrderProductDraft[] };
    return {
      draftProducts: draft.products,
      initial: {
        id: "",
        salesOwner: null,
        exportCountry: draft.exportCountry || null,
        buyer: draft.buyer || null,
        destinationPort: draft.destinationPort || null,
        incoterms: draft.incoterms || null,
        transport: draft.transport || null,
        storageCondition: null,
        paymentTerm: draft.paymentTerm || null,
        currency: draft.currency || "USD",
        depositStatus: null,
        lcSd: null,
        salesRequest: null,
        note: null,
        emailSent: null,
        exportOwner: null,
        salesEmailRecipients: null,
        invNo: null,
        releaseDate: null,
        etd: null,
        eta: null
      } satisfies Parameters<typeof ShipmentForm>[0]["shipment"]
    };
  }, [draftKey]);

  return (
    <ShipmentForm
      key={draftKey ? `draft-${draftKey}` : "new-shipment"}
      shipment={initial}
      draftProducts={draftProducts}
      draftKey={draftKey}
      options={options}
      buyers={buyers}
      destinationPorts={destinationPorts}
    />
  );
}

export function ShipmentFormWithDraft({
  options,
  buyers,
  destinationPorts
}: {
  options: Record<DropdownCategory, DropdownOption[]>;
  buyers: BuyerOption[];
  destinationPorts: RegisteredDestination[];
}) {
  return (
    <Suspense fallback={<ShipmentForm options={options} buyers={buyers} destinationPorts={destinationPorts} />}>
      <ShipmentFormFromDraft options={options} buyers={buyers} destinationPorts={destinationPorts} />
    </Suspense>
  );
}
