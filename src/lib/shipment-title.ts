type ShipmentTitleProduct = {
  productName: string | null;
  englishName: string | null;
  piNo: string | null;
};

type ShipmentTitleSource = {
  exportCountry: string | null;
  buyer: string | null;
  invNo: string | null;
  products: ShipmentTitleProduct[];
};

export function shipmentDisplayTitle(shipment: ShipmentTitleSource) {
  const usedPiNos = new Set<string>();
  const productParts = shipment.products.flatMap((product) => {
    const productName = product.englishName || product.productName || "";
    const piNo = product.piNo?.trim() ?? "";
    const shouldShowPiNo = piNo && !usedPiNos.has(piNo);
    if (shouldShowPiNo) usedPiNos.add(piNo);
    return [productName, shouldShowPiNo ? piNo : ""].filter(Boolean);
  });
  return [shipment.exportCountry, shipment.buyer, ...productParts, shipment.invNo]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");
}
