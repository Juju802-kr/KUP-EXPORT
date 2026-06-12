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
  products: ShipmentOrderProductDraft[];
};

const DRAFT_PREFIX = "kup-shipment-draft:";

export function orderRowToProductDraft(row: OrderRowShipmentSource): ShipmentOrderProductDraft {
  const bxQtyPaid = Math.round(Number(row.quantity) || 0);
  const bxQtyFoc = Math.round(Number(row.orderFocQuantity) || 0);
  const exportUnitPrice = Number(row.unitPrice) || 0;
  return {
    productName: row.productName || "제품명 미입력",
    englishName: row.productName || "",
    productionRequestNo: row.productionRequestNo || "",
    piNo: row.piNo || "",
    exportUnitPrice,
    bxQtyPaid,
    bxQtyFoc
  };
}

export function orderRowsToShipmentDraft(rows: OrderRowShipmentSource[]): ShipmentOrderDraft {
  const first = rows[0];
  return {
    exportCountry: first.exportCountry || "",
    buyer: first.buyer || "",
    currency: first.currency || "USD",
    products: rows.map(orderRowToProductDraft)
  };
}

export function storeShipmentDraft(draft: ShipmentOrderDraft) {
  const key = crypto.randomUUID();
  sessionStorage.setItem(`${DRAFT_PREFIX}${key}`, JSON.stringify(draft));
  return key;
}

export function loadShipmentDraft(key: string): ShipmentOrderDraft | null {
  if (!key) return null;
  try {
    const raw = sessionStorage.getItem(`${DRAFT_PREFIX}${key}`);
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

export function openCombinedShipmentFromOrders(rows: OrderRowShipmentSource[]) {
  if (!rows.length) return;
  openShipmentRegistration(orderRowsToShipmentDraft(rows));
}

export function openIndividualShipmentsFromOrders(rows: OrderRowShipmentSource[]) {
  for (const row of rows) {
    openShipmentRegistration(orderRowsToShipmentDraft([row]));
  }
}
