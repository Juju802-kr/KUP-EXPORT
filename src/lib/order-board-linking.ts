export type BoardPaymentLine = {
  type: string;
  date: string;
  amount: number;
  source: string;
  paymentId?: string;
  paymentTab?: "tt" | "lc";
};

export type BoardShipmentLine = {
  invNo: string;
  etd: string;
  lotNo: string;
  quantity: number;
  focQuantity: number;
  amount: number;
  shipmentId?: string;
};

export type BoardOrderRow = {
  key: string;
  salesOwner: string;
  exportCountry: string;
  buyer: string;
  currency: string;
  piDate: string;
  piNo: string;
  productionRequestNo: string;
  productName: string;
  unitPrice: number;
  quantity: number;
  orderFocQuantity: number;
  orderAmount: number;
  shipments: BoardShipmentLine[];
  payments: BoardPaymentLine[];
  note: string;
  leaderNote?: string;
  leaderPrivateNote?: string;
  shipmentId: string;
};

export type ModulePaymentSlot = {
  rowKey: string;
  paymentId: string;
  date: string;
  amount: number;
  productionRequestNo?: string;
};

const LEDGER_SOURCES = new Set(["엑셀", "수동", "선적액"]);

export function normalizeOrderRef(value?: string | null) {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

export function splitOrderRefs(value?: string | null) {
  return (value ?? "")
    .split(/[,，]/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function normalizeLedgerDate(value?: string | null) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const date = new Date(trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString().slice(0, 10);
}

export function piDateFromPiNo(piNo?: string | null) {
  const match = (piNo ?? "").match(/KUP-(\d{2})(\d{2})(\d{2})/i);
  if (!match) return "";
  return `20${match[1]}-${match[2]}-${match[3]}`;
}

export function resolveOrderPiDate(row: { piDate?: string | null; piNo?: string | null }) {
  const explicit = normalizeLedgerDate(row.piDate);
  if (explicit) return explicit;
  return piDateFromPiNo(row.piNo);
}

/** PI Date → PI No. → 생산의뢰번호 순 (같은 날짜면 No. 순, 같은 PI면 생산의뢰번호 순) */
export function compareOrdersByPiSequence(
  a: { piDate?: string | null; piNo?: string | null; productionRequestNo?: string | null },
  b: { piDate?: string | null; piNo?: string | null; productionRequestNo?: string | null }
) {
  const dateCompare = resolveOrderPiDate(a).localeCompare(resolveOrderPiDate(b));
  if (dateCompare) return dateCompare;

  const piCompare = normalizeOrderRef(a.piNo).localeCompare(normalizeOrderRef(b.piNo));
  if (piCompare) return piCompare;

  return normalizeOrderRef(a.productionRequestNo).localeCompare(normalizeOrderRef(b.productionRequestNo));
}

export function roundLedgerAmount(value: number) {
  return Math.round(value * 100) / 100;
}

export function orderKey(value: {
  productionRequestNo?: string | null;
  piNo?: string | null;
  invNo?: string | null;
  exportCountry?: string | null;
  buyer?: string | null;
  productName?: string | null;
}) {
  const productionNo = value.productionRequestNo?.trim();
  if (productionNo) return `prod:${productionNo}`;
  const piNo = value.piNo?.trim();
  if (piNo) return `pi:${piNo}`;
  const invNo = value.invNo?.trim();
  if (invNo && !invNo.includes(",")) return `inv:${invNo}`;
  return `misc:${value.exportCountry ?? ""}:${value.buyer ?? ""}:${value.productName ?? ""}`;
}

export function orderEntryKey(orderId: string) {
  return `entry:${orderId}`;
}

export function orphanRowKey(options: {
  productionRequestNo?: string | null;
  invNo?: string | null;
  piNo?: string | null;
  exportCountry?: string | null;
  buyer?: string | null;
  productName?: string | null;
  amount?: number;
}) {
  const key = orderKey({
    productionRequestNo: options.productionRequestNo,
    piNo: options.piNo,
    invNo: options.invNo,
    exportCountry: options.exportCountry,
    buyer: options.buyer,
    productName: options.productName
  });
  if (key.startsWith("misc:") && options.amount !== undefined) {
    return `${key}@${roundLedgerAmount(options.amount)}`;
  }
  return key;
}

export function isBlankOrderEntry(order: {
  piNo?: string | null;
  productionRequestNo?: string | null;
  productName?: string | null;
  amount?: unknown;
}) {
  return (
    !order.piNo?.trim() &&
    !order.productionRequestNo?.trim() &&
    !order.productName?.trim() &&
    Number(order.amount) === 0
  );
}

export function isModulePaymentSource(source?: string | null) {
  const trimmed = source?.trim();
  if (!trimmed) return false;
  return !LEDGER_SOURCES.has(trimmed);
}

export function ledgerPaymentLinesOnly<T extends { source?: unknown }>(lines: T[]) {
  return lines.filter((line) => !isModulePaymentSource(String(line.source ?? "")));
}

export function fallbackPaymentAllocations(payment: {
  productionRequestNo?: string | null;
  invNo?: string | null;
  amount: unknown;
}) {
  const productionRefs = splitOrderRefs(payment.productionRequestNo);
  const invRefs = splitOrderRefs(payment.invNo);
  const totalAmount = Number(payment.amount) || 0;

  if (productionRefs.length <= 1 && invRefs.length <= 1) {
    return [
      {
        productionRequestNo: productionRefs[0] ?? payment.productionRequestNo ?? "",
        invNo: invRefs[0] ?? payment.invNo ?? "",
        amount: totalAmount
      }
    ];
  }

  const count = Math.max(productionRefs.length, invRefs.length);
  return Array.from({ length: count }, (_, index) => ({
    productionRequestNo: productionRefs[index] ?? productionRefs[0] ?? "",
    invNo: invRefs[index] ?? invRefs[0] ?? "",
    amount: count === 1 ? totalAmount : 0
  }));
}

function rowsShareOrderIdentity(a: BoardOrderRow, b: BoardOrderRow) {
  const piA = normalizeOrderRef(a.piNo);
  const piB = normalizeOrderRef(b.piNo);
  if (piA && piB && piA === piB) return true;
  const prodA = normalizeOrderRef(a.productionRequestNo);
  const prodB = normalizeOrderRef(b.productionRequestNo);
  if (prodA && prodB && prodA === prodB) return true;
  return false;
}

function pickOrphanMergeTarget(
  candidates: BoardOrderRow[] | undefined,
  options: { productionNo?: string; amount?: number }
) {
  if (!candidates?.length) return undefined;
  if (candidates.length === 1) return candidates[0];
  if (options.productionNo) {
    const byProd = candidates.find((row) => normalizeOrderRef(row.productionRequestNo) === options.productionNo);
    if (byProd) return byProd;
  }
  if (options.amount !== undefined) {
    const byAmount = candidates.find((row) => Math.abs(Number(row.orderAmount) - options.amount!) < 0.01);
    if (byAmount) return byAmount;
  }
  return candidates[0];
}

export function mergeModuleOrphanRows(rows: Map<string, BoardOrderRow>) {
  const list = [...rows.values()];
  const targetByProd = new Map<string, BoardOrderRow>();
  const targetByPi = new Map<string, BoardOrderRow[]>();
  const targetByInv = new Map<string, BoardOrderRow[]>();

  for (const row of list) {
    if (!row.key.startsWith("entry:")) continue;
    for (const prod of splitOrderRefs(row.productionRequestNo)) {
      const normalized = normalizeOrderRef(prod);
      if (normalized) targetByProd.set(normalized, row);
    }
    for (const pi of splitOrderRefs(row.piNo)) {
      const normalized = normalizeOrderRef(pi);
      if (!normalized || normalized.includes(",")) continue;
      targetByPi.set(normalized, [...(targetByPi.get(normalized) ?? []), row]);
    }
    for (const shipment of row.shipments) {
      const inv = normalizeOrderRef(shipment.invNo);
      if (!inv || inv.includes(",")) continue;
      targetByInv.set(inv, [...(targetByInv.get(inv) ?? []), row]);
    }
  }

  const removeKeys = new Set<string>();
  for (const row of list) {
    const isOrphan =
      row.key.startsWith("prod:") ||
      row.key.startsWith("pi:") ||
      row.key.startsWith("inv:") ||
      row.key.startsWith("misc:");
    if (!isOrphan) continue;

    const prodFromKey = row.key.startsWith("prod:") ? normalizeOrderRef(row.key.slice(5)) : "";
    const piFromKey = row.key.startsWith("pi:") ? normalizeOrderRef(row.key.slice(3)) : "";
    const invFromKey = row.key.startsWith("inv:") ? normalizeOrderRef(row.key.slice(4)) : "";
    const prodRef = normalizeOrderRef(row.productionRequestNo) || prodFromKey;
    const orphanAmount =
      row.payments.reduce((sum, item) => sum + item.amount, 0) ||
      row.shipments.reduce((sum, item) => sum + item.amount, 0) ||
      Number(row.orderAmount) ||
      0;

    const target =
      (prodRef ? targetByProd.get(prodRef) : undefined) ??
      pickOrphanMergeTarget(targetByPi.get(piFromKey || normalizeOrderRef(row.piNo)), {
        productionNo: prodRef,
        amount: orphanAmount
      }) ??
      pickOrphanMergeTarget(targetByInv.get(invFromKey), { productionNo: prodRef, amount: orphanAmount }) ??
      pickOrphanMergeTarget(targetByInv.get(normalizeOrderRef(row.shipments[0]?.invNo)), {
        productionNo: prodRef,
        amount: orphanAmount
      });
    if (!target || target.key === row.key) continue;

    for (const payment of row.payments) {
      const duplicate = target.payments.some(
        (existing) =>
          (existing.paymentId && payment.paymentId && existing.paymentId === payment.paymentId && Math.abs(existing.amount - payment.amount) < 0.01) ||
          (!existing.paymentId &&
            !payment.paymentId &&
            existing.type === payment.type &&
            normalizeLedgerDate(existing.date) === normalizeLedgerDate(payment.date) &&
            Math.abs(existing.amount - payment.amount) < 0.01)
      );
      if (!duplicate) target.payments.push(payment);
    }
    for (const shipment of row.shipments) {
      const duplicate = target.shipments.some(
        (existing) =>
          (existing.shipmentId && shipment.shipmentId && existing.shipmentId === shipment.shipmentId) ||
          (normalizeLedgerDate(existing.etd) === normalizeLedgerDate(shipment.etd) &&
            Math.abs(existing.amount - shipment.amount) < 0.01 &&
            existing.quantity === shipment.quantity)
      );
      if (!duplicate) target.shipments.push(shipment);
    }
    target.shipments = reconcileBoardShipments(target.shipments);
    target.payments = dedupeBoardPayments(target.payments);
    target.exportCountry = target.exportCountry || row.exportCountry;
    target.buyer = target.buyer || row.buyer;
    target.productionRequestNo = target.productionRequestNo || row.productionRequestNo;
    target.piNo = target.piNo || row.piNo;
    target.productName = target.productName || row.productName;
    if (!target.shipmentId && row.shipmentId) target.shipmentId = row.shipmentId;
    removeKeys.add(row.key);
  }

  for (const key of removeKeys) rows.delete(key);
}

function stripSameRowLedgerDuplicates(rows: Map<string, BoardOrderRow>) {
  for (const row of rows.values()) {
    const modulePayments = row.payments.filter((payment) => payment.paymentId);
    if (!modulePayments.length) continue;
    row.payments = row.payments.filter((payment) => {
      if (payment.paymentId) return true;
      return !modulePayments.some(
        (module) =>
          module.type === payment.type &&
          normalizeLedgerDate(module.date) === normalizeLedgerDate(payment.date) &&
          Math.abs(module.amount - payment.amount) < 0.01
      );
    });
  }
}

export function enrichPaymentsWithModuleRefs(
  rows: Map<string, BoardOrderRow>,
  ttPayments: Array<{ id: string; refNo: string | null }>,
  lcPayments: Array<{ id: string; lcNo: string | null }>
) {
  const refToModule = new Map<string, { paymentId: string; tab: "tt" | "lc" }>();
  for (const payment of ttPayments) {
    const refNo = payment.refNo?.trim();
    if (refNo) refToModule.set(refNo, { paymentId: payment.id, tab: "tt" });
  }
  for (const payment of lcPayments) {
    const lcNo = payment.lcNo?.trim();
    if (lcNo) refToModule.set(lcNo, { paymentId: payment.id, tab: "lc" });
  }

  for (const row of rows.values()) {
    for (const payment of row.payments) {
      if (payment.paymentId) continue;
      const source = payment.source?.trim();
      if (!source || !isModulePaymentSource(source)) continue;
      const match = refToModule.get(source);
      if (match) {
        payment.paymentId = match.paymentId;
        payment.paymentTab = match.tab;
      }
    }
  }
}

function stripMisplacedModulePayments(
  rows: Map<string, BoardOrderRow>,
  moduleSlots: ModulePaymentSlot[],
  ttPayments: Array<{ id: string; refNo: string | null }>
) {
  const refByPaymentId = new Map(ttPayments.map((payment) => [payment.id, payment.refNo?.trim() || ""]));
  const prodBySlot = new Map(
    moduleSlots.map((slot) => [`${slot.paymentId}|${roundLedgerAmount(slot.amount)}`, normalizeOrderRef(slot.productionRequestNo)])
  );

  for (const row of rows.values()) {
    row.payments = row.payments.filter((payment) => {
      if (payment.paymentId) {
        const slot = moduleSlots.find(
          (item) => item.paymentId === payment.paymentId && Math.abs(item.amount - payment.amount) < 0.01
        );
        return !slot || slot.rowKey === row.key;
      }

      const source = payment.source?.trim();
      if (source && isModulePaymentSource(source)) {
        for (const slot of moduleSlots) {
          if (slot.rowKey === row.key) continue;
          if (refByPaymentId.get(slot.paymentId) !== source) continue;
          if (Math.abs(payment.amount - slot.amount) < 0.01) return false;
        }
      }

      for (const slot of moduleSlots) {
        if (slot.rowKey === row.key) continue;
        const canonical = rows.get(slot.rowKey);
        if (!canonical) continue;
        if (payment.type !== "T/T" && payment.type !== "L/C") continue;
        if (normalizeLedgerDate(payment.date) !== normalizeLedgerDate(slot.date)) continue;
        if (Math.abs(payment.amount - slot.amount) >= 0.01) continue;

        const slotProd = prodBySlot.get(`${slot.paymentId}|${roundLedgerAmount(slot.amount)}`);
        const rowProd = normalizeOrderRef(row.productionRequestNo);
        if (slotProd && rowProd && slotProd !== rowProd) return false;

        if (rowsShareOrderIdentity(row, canonical)) return false;
      }
      return true;
    });
  }
}

function stripDuplicatePaymentCopies(rows: Map<string, BoardOrderRow>, moduleSlots: ModulePaymentSlot[]) {
  for (const row of rows.values()) {
    row.payments = row.payments.filter((payment) => {
      if (payment.paymentId) {
        const slot = moduleSlots.find(
          (item) => item.paymentId === payment.paymentId && Math.abs(item.amount - payment.amount) < 0.01
        );
        return !slot || slot.rowKey === row.key;
      }

      for (const slot of moduleSlots) {
        if (slot.rowKey === row.key) continue;
        const canonical = rows.get(slot.rowKey);
        if (!canonical) continue;
        if (payment.type !== "T/T" && payment.type !== "L/C") continue;
        if (normalizeLedgerDate(payment.date) !== normalizeLedgerDate(slot.date)) continue;
        if (Math.abs(payment.amount - slot.amount) >= 0.01) continue;
        if (rowsShareOrderIdentity(row, canonical)) return false;
      }
      return true;
    });
  }
}

export function reconcileModulePayments(
  rows: Map<string, BoardOrderRow>,
  moduleSlots: ModulePaymentSlot[],
  ttPayments: Array<{ id: string; refNo: string | null }>,
  lcPayments: Array<{ id: string; lcNo: string | null }>
) {
  enrichPaymentsWithModuleRefs(rows, ttPayments, lcPayments);
  stripMisplacedModulePayments(rows, moduleSlots, ttPayments);
  stripDuplicatePaymentCopies(rows, moduleSlots);
  stripSameRowLedgerDuplicates(rows);
  mergeModuleOrphanRows(rows);
}

export function dedupeBoardPayments<T extends BoardPaymentLine>(payments: T[]): T[] {
  const byModule = new Map<string, BoardPaymentLine>();
  const byLedger = new Map<string, BoardPaymentLine>();

  for (const payment of payments) {
    if (payment.paymentId) {
      const moduleKey = `${payment.paymentId}|${roundLedgerAmount(payment.amount)}`;
      if (!byModule.has(moduleKey)) byModule.set(moduleKey, payment);
      continue;
    }
    const ledgerKey = `${normalizeLedgerDate(payment.date)}|${roundLedgerAmount(payment.amount)}`;
    if (!byLedger.has(ledgerKey)) byLedger.set(ledgerKey, payment);
  }

  const result = [...byModule.values()];
  for (const [ledgerKey, payment] of byLedger) {
    const overshadowed = result.some(
      (item) => `${normalizeLedgerDate(item.date)}|${roundLedgerAmount(item.amount)}` === ledgerKey
    );
    if (!overshadowed) result.push(payment);
  }
  return result as T[];
}

function shipmentIdentityKey(shipment: BoardShipmentLine) {
  const inv = normalizeOrderRef(shipment.invNo);
  if (inv) return `inv:${inv}`;
  return `amt:${roundLedgerAmount(shipment.amount)}|qty:${shipment.quantity}|foc:${shipment.focQuantity}`;
}

function isSameShipmentIdentity(a: BoardShipmentLine, b: BoardShipmentLine) {
  const invA = normalizeOrderRef(a.invNo);
  const invB = normalizeOrderRef(b.invNo);
  if (invA && invB) return invA === invB;
  if (invA || invB) {
    return (
      Math.abs(a.amount - b.amount) < 0.01 &&
      a.quantity === b.quantity &&
      a.focQuantity === b.focQuantity
    );
  }
  return (
    Math.abs(a.amount - b.amount) < 0.01 &&
    a.quantity === b.quantity &&
    a.focQuantity === b.focQuantity
  );
}

export function reconcileBoardShipments<T extends BoardShipmentLine>(shipments: T[]): T[] {
  const moduleShipments = shipments.filter((shipment) => shipment.shipmentId);
  let ledgerShipments = shipments.filter((shipment) => !shipment.shipmentId);

  if (moduleShipments.length) {
    ledgerShipments = ledgerShipments.filter(
      (ledger) => !moduleShipments.some((module) => isSameShipmentIdentity(ledger, module))
    );
  }

  const ledgerByIdentity = new Map<string, T>();
  for (const shipment of ledgerShipments) {
    const key = shipmentIdentityKey(shipment);
    const existing = ledgerByIdentity.get(key);
    if (!existing || normalizeLedgerDate(shipment.etd) >= normalizeLedgerDate(existing.etd)) {
      ledgerByIdentity.set(key, shipment);
    }
  }

  return dedupeBoardShipments([...moduleShipments, ...ledgerByIdentity.values()]);
}

export function dedupeBoardShipments<T extends BoardShipmentLine>(shipments: T[]): T[] {
  const map = new Map<string, BoardShipmentLine>();
  for (const shipment of shipments) {
    const key = `${normalizeLedgerDate(shipment.etd)}|${roundLedgerAmount(shipment.amount)}|${shipment.quantity}`;
    const existing = map.get(key);
    if (!existing || (shipment.shipmentId && !existing.shipmentId)) map.set(key, shipment);
  }
  return [...map.values()] as T[];
}
