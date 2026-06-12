"use client";

import { DropdownCategory, DropdownOption } from "@prisma/client";
import { useEffect, useState } from "react";
import { ShipmentForm } from "@/components/ShipmentForm";
import { loadShipmentDraft, type ShipmentOrderDraft } from "@/lib/shipment-order-draft";

type BuyerOption = {
  id: string;
  exportCountry: string;
  buyerName: string;
  defaultCurrency: string | null;
  salesOwner: string | null;
  exportOwner: string | null;
  salesEmailRecipients: string | null;
};

export function ShipmentNewPage({
  draftKey,
  options,
  buyers
}: {
  draftKey?: string;
  options: Record<DropdownCategory, DropdownOption[]>;
  buyers: BuyerOption[];
}) {
  const [draft, setDraft] = useState<ShipmentOrderDraft | null>(null);

  useEffect(() => {
    if (!draftKey) return;
    setDraft(loadShipmentDraft(draftKey));
  }, [draftKey]);

  return <ShipmentForm options={options} buyers={buyers} draft={draft ?? undefined} />;
}
