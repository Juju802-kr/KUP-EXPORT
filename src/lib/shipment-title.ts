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
  const uniqueValues = (values: string[]) => [...new Set(values.filter(Boolean))];
  const products = shipment.products.map((product) => ({
    name: product.englishName?.trim() || product.productName?.trim() || "",
    piNo: product.piNo?.trim() || "",
  }));
  const productNames = uniqueValues(products.map((product) => product.name));
  const piNos = uniqueValues(products.map((product) => product.piNo));

  let productParts: string[];
  if (piNos.length === 1) {
    productParts = [...productNames, piNos[0]];
  } else if (productNames.length === 1) {
    productParts = [productNames[0], ...piNos];
  } else {
    const usedPairs = new Set<string>();
    productParts = products.flatMap((product) => {
      const pairKey = `${product.name}\u0000${product.piNo}`;
      if (usedPairs.has(pairKey)) return [];
      usedPairs.add(pairKey);
      return [product.name, product.piNo].filter(Boolean);
    });
  }

  return [shipment.exportCountry, shipment.buyer, ...productParts, shipment.invNo]
    .map((value) => value?.trim())
    .filter(Boolean)
    .join(" ");
}
