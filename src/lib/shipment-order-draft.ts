import { findRegisteredProduct, type ExportProductOption } from "@/lib/order-pi-import";
import {
  buildDestinationRegistry,
  pickDestinationByCountry,
  type RegisteredDestination
} from "@/lib/destination-registry";
import { resolveDestinationPort } from "@/lib/pi-shipment-terms";

export type OrderRowShipmentSource = {
  exportCountry: string;
  buyer: string;
  currency: string;
  productName: string;
  productionRequestNo: string;
  piNo: string;
  unitPrice: number;
  quantity: number;
  orderFocQuantity: number;
  incoterms?: string;
  transport?: string;
  destinationPort?: string;
  paymentTerm?: string;
};

export type ShipmentOrderProductDraft = {
  productName: string;
  englishName: string;
  productionRequestNo: string;
  piNo: string;
  exportUnitPrice: number;
  bxQtyPaid: number;
  bxQtyFoc: number;
};

export type ShipmentOrderDraft = {
  exportCountry: string;
  buyer: string;
  currency: string;
  incoterms?: string;
  transport?: string;
  destinationPort?: string;
  paymentTerm?: string;
  products: ShipmentOrderProductDraft[];
};

const DRAFT_PREFIX = "kup-shipment-draft:";

export function orderRowToProductDraft(
  row: OrderRowShipmentSource,
  exportProducts?: ExportProductOption[]
): ShipmentOrderProductDraft {
  const bxQtyPaid = Math.round(Number(row.quantity) || 0);
  const bxQtyFoc = Math.round(Number(row.orderFocQuantity) || 0);
  const exportUnitPrice = Number(row.unitPrice) || 0;

  let productName = row.productName || "제품명 미입력";
  let englishName = row.productName || "";
  if (exportProducts?.length && row.exportCountry) {
    const matched = findRegisteredProduct(row.exportCountry, row.productName, exportProducts);
    if (matched) {
      productName = matched.productName;
      englishName = matched.englishName?.trim() || matched.productName;
    }
  }

  return {
    productName,
    englishName,
    productionRequestNo: row.productionRequestNo || "",
    piNo: row.piNo || "",
    exportUnitPrice,
    bxQtyPaid,
    bxQtyFoc
  };
}

export function mapOrderBoardRowToShipmentSource(
  row: OrderRowShipmentSource,
  countryFallback = ""
): OrderRowShipmentSource {
  return {
    ...row,
    exportCountry: (row.exportCountry || countryFallback).trim(),
    buyer: row.buyer.trim(),
    currency: row.currency || "USD",
    incoterms: row.incoterms?.trim() || "",
    transport: row.transport?.trim() || "",
    destinationPort: row.destinationPort?.trim() || "",
    paymentTerm: row.paymentTerm?.trim() || ""
  };
}

function resolveDraftDestinationPort(
  row: OrderRowShipmentSource,
  registeredDestinations?: RegisteredDestination[]
) {
  if (row.destinationPort?.trim()) return row.destinationPort.trim();
  if (
    !registeredDestinations?.length ||
    !row.incoterms?.trim() ||
    !row.transport?.trim() ||
    !row.exportCountry?.trim()
  ) {
    return "";
  }

  const registry = buildDestinationRegistry(registeredDestinations);
  const byCountry = pickDestinationByCountry(row.exportCountry, row.transport, registry);
  if (byCountry) return byCountry;

  return resolveDestinationPort("", row.transport, {
    exportCountry: row.exportCountry,
    transport: row.transport,
    registeredDestinations
  });
}

export function orderRowsToShipmentDraft(
  rows: OrderRowShipmentSource[],
  registeredDestinations?: RegisteredDestination[],
  exportProducts?: ExportProductOption[]
): ShipmentOrderDraft {
  const first = rows[0];
  return {
    exportCountry: first.exportCountry || "",
    buyer: first.buyer || "",
    currency: first.currency || "USD",
    incoterms: first.incoterms || "",
    transport: first.transport || "",
    destinationPort: resolveDraftDestinationPort(first, registeredDestinations),
    paymentTerm: first.paymentTerm || "",
    products: rows.map((row) => orderRowToProductDraft(row, exportProducts))
  };
}

export function orderBoardRowsToShipmentDraft(
  rows: OrderRowShipmentSource[],
  countryFallback = "",
  registeredDestinations?: RegisteredDestination[],
  exportProducts?: ExportProductOption[]
) {
  if (!rows.length) return orderRowsToShipmentDraft([], registeredDestinations, exportProducts);
  const mapped = rows.map((row) => mapOrderBoardRowToShipmentSource(row, countryFallback));
  return orderRowsToShipmentDraft(mapped, registeredDestinations, exportProducts);
}

export function storeShipmentDraft(draft: ShipmentOrderDraft) {
  const key = crypto.randomUUID();
  if (typeof window !== "undefined") {
    localStorage.setItem(`${DRAFT_PREFIX}${key}`, JSON.stringify(draft));
  }
  return key;
}

export function loadShipmentDraft(key: string): ShipmentOrderDraft | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ShipmentOrderDraft;
    if (!parsed || !Array.isArray(parsed.products)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function openShipmentRegistration(draft: ShipmentOrderDraft) {
  const key = storeShipmentDraft(draft);
  window.open(`/shipments/new?draft=${encodeURIComponent(key)}`, "_blank", "noopener,noreferrer");
}

export function openCombinedShipmentFromOrders(
  rows: OrderRowShipmentSource[],
  countryFallback = "",
  registeredDestinations?: RegisteredDestination[],
  exportProducts?: ExportProductOption[]
) {
  if (!rows.length) return;
  openShipmentRegistration(orderBoardRowsToShipmentDraft(rows, countryFallback, registeredDestinations, exportProducts));
}

export function openIndividualShipmentsFromOrders(
  rows: OrderRowShipmentSource[],
  countryFallback = "",
  registeredDestinations?: RegisteredDestination[],
  exportProducts?: ExportProductOption[]
) {
  for (const row of rows) {
    openShipmentRegistration(orderBoardRowsToShipmentDraft([row], countryFallback, registeredDestinations, exportProducts));
  }
}
