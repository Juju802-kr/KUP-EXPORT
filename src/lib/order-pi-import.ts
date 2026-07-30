import { compareOrdersByPiSequence } from "@/lib/order-board-linking";
import { type RegisteredDestination } from "@/lib/destination-registry";
import { resolvePiShipmentTerms } from "@/lib/pi-shipment-terms";

export type BuyerOption = { buyerName: string; exportCountry: string };

export type ExportProductOption = {
  exportCountry: string;
  productName: string;
  englishName: string;
};

export type PiImportRow = {
  exportCountry: string;
  buyer: string;
  piNo: string;
  productionRequestNo: string;
  productName: string;
  unitPrice: string;
  quantity: string;
  focQuantity?: string;
  piDate?: string;
  termsText?: string;
  destinationText?: string;
  paymentTerm?: string;
  incoterms?: string;
  transport?: string;
  destinationPort?: string;
};

export type PiImportExclusion = {
  exportCountry: string;
  buyer: string;
  piNo: string;
  productName: string;
  missing: Array<"거래처" | "제품명">;
};

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeBuyerName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\b(pt|p t|co|ltd|limited|inc|corp|corporation|llc|sa|bv|gmbh)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findRegisteredBuyer<T extends BuyerOption>(buyerName: string, buyers: T[]) {
  const query = buyerName.trim();
  if (!query || !buyers.length) return null;

  const exact =
    buyers.find((buyer) => buyer.buyerName === query) ??
    buyers.find((buyer) => buyer.buyerName.toLowerCase() === query.toLowerCase());
  if (exact) return exact;

  const normalizedQuery = normalizeBuyerName(query);
  if (!normalizedQuery) return null;

  const normalizedExact = buyers.find((buyer) => normalizeBuyerName(buyer.buyerName) === normalizedQuery);
  if (normalizedExact) return normalizedExact;

  const containsMatches = buyers.filter((buyer) => {
    const normalized = normalizeBuyerName(buyer.buyerName);
    return (
      normalized.includes(normalizedQuery) ||
      normalizedQuery.includes(normalized)
    );
  });
  if (containsMatches.length === 1) return containsMatches[0];
  if (containsMatches.length > 1) {
    return (
      containsMatches.find((buyer) => normalizeBuyerName(buyer.buyerName) === normalizedQuery) ??
      containsMatches.sort((a, b) => a.buyerName.length - b.buyerName.length)[0]
    );
  }

  return null;
}

export function findRegisteredProduct(
  exportCountry: string,
  productName: string,
  products: ExportProductOption[]
) {
  const country = exportCountry.trim();
  const query = normalizeLabel(productName);
  if (!country || !query) return null;

  const countryProducts = products.filter((product) => product.exportCountry === country);
  return (
    countryProducts.find(
      (product) =>
        normalizeLabel(product.productName) === query || normalizeLabel(product.englishName) === query
    ) ??
    countryProducts.find(
      (product) =>
        normalizeLabel(product.englishName).includes(query) ||
        query.includes(normalizeLabel(product.englishName))
    ) ??
    null
  );
}

export function boardProductName(
  exportCountry: string | null | undefined,
  productName: string | null | undefined,
  products: ExportProductOption[]
) {
  const country = (exportCountry ?? "").trim();
  const name = (productName ?? "").trim();
  if (!country || !name) return name;
  const matched =
    products.find((product) => product.exportCountry === country && product.productName === name) ??
    products.find(
      (product) =>
        product.exportCountry === country &&
        (normalizeLabel(product.productName) === normalizeLabel(name) ||
          normalizeLabel(product.englishName) === normalizeLabel(name))
    );
  return matched?.englishName?.trim() || name;
}

export function exportProductEnglishName(
  exportCountry: string | null | undefined,
  productName: string | null | undefined,
  products: ExportProductOption[]
) {
  return boardProductName(exportCountry, productName, products);
}

export function rowNeedsAdditionalInput(row: PiImportRow) {
  return (
    !row.productionRequestNo.trim() ||
    !row.piNo.trim() ||
    !row.unitPrice.trim() ||
    !row.quantity.trim()
  );
}

export function sortPiImportRows<T extends PiImportRow>(rows: T[]) {
  return [...rows].sort((left, right) => {
    const leftNeeds = rowNeedsAdditionalInput(left) ? 0 : 1;
    const rightNeeds = rowNeedsAdditionalInput(right) ? 0 : 1;
    if (leftNeeds !== rightNeeds) return leftNeeds - rightNeeds;
    return compareOrdersByPiSequence(left, right);
  });
}

export function formatPiExclusionMessage(item: PiImportExclusion) {
  const label = `[${item.exportCountry || "-"} ${item.buyer || "-"} ${item.piNo || "-"} ${item.productName || "-"}]`;
  return `${label}건은 (${item.missing.join(", ")})가 등록되어있지 않아 제외되었습니다. 등록 후 재시도해주시기 바랍니다.`;
}

export function partitionPiImportRows(
  extracted: PiImportRow[],
  buyers: BuyerOption[],
  products: ExportProductOption[],
  registeredDestinations: RegisteredDestination[] = []
) {
  const accepted: PiImportRow[] = [];
  const excluded: PiImportExclusion[] = [];

  for (const row of extracted) {
    const missing: Array<"거래처" | "제품명"> = [];
    const buyer = findRegisteredBuyer(row.buyer, buyers);
    if (!buyer) missing.push("거래처");

    const exportCountry = buyer?.exportCountry ?? row.exportCountry.trim();
    const product = buyer
      ? findRegisteredProduct(exportCountry, row.productName, products)
      : null;
    if (buyer && !product) missing.push("제품명");

    if (missing.length) {
      excluded.push({
        exportCountry: exportCountry || row.exportCountry,
        buyer: row.buyer,
        piNo: row.piNo,
        productName: row.productName,
        missing
      });
      continue;
    }

    accepted.push({
      ...row,
      exportCountry: buyer!.exportCountry,
      buyer: buyer!.buyerName,
      productName: product!.productName,
      ...resolvePiShipmentTerms(row.termsText ?? "", row.destinationText ?? "", {
        exportCountry,
        registeredDestinations
      })
    });
  }

  return { accepted: sortPiImportRows(accepted), excluded };
}
