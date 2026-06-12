"use client";

import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, Columns3, GripVertical, Plus, Search, SlidersHorizontal } from "lucide-react";
import {
  cancelSalesOrderRegistrationAction,
  registerSalesOrderAction,
  saveAllOrderBoardRowsAction
} from "@/server/actions";
import { fmtYearMonth, yearMonthToFormDate } from "@/lib/constants";
import { openCombinedShipmentFromOrders, openIndividualShipmentsFromOrders } from "@/lib/shipment-order-draft";

export type OrderBoardRow = {
  key: string;
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
  shipments: Array<{ invNo: string; etd: string; lotNo: string; quantity: number; focQuantity: number; amount: number; shipmentId?: string }>;
  payments: Array<{ type: string; date: string; amount: number; source: string; paymentId?: string; paymentTab?: "tt" | "lc" }>;
  registration?: { amount: number; registeredAt: string; status: string };
  note: string;
};

type Column = {
  key: string;
  label: string;
  width: string;
  value: (row: OrderBoardRow) => string | number;
};

const columns: Column[] = [
  { key: "piDate", label: "PI Date", width: "130px", value: (row) => row.piDate },
  { key: "piNo", label: "PI No.", width: "180px", value: (row) => row.piNo },
  { key: "productionRequestNo", label: "생산의뢰번호", width: "170px", value: (row) => row.productionRequestNo },
  { key: "productName", label: "제품명", width: "230px", value: (row) => row.productName },
  { key: "unitPrice", label: "오더 단가", width: "120px", value: (row) => row.unitPrice },
  { key: "quantity", label: "오더 수량", width: "120px", value: (row) => row.quantity },
  { key: "orderFocQuantity", label: "오더 FOC수량", width: "120px", value: (row) => row.orderFocQuantity },
  { key: "orderAmount", label: "오더 금액", width: "140px", value: (row) => row.orderAmount },
  { key: "invNo", label: "INV No.", width: "180px", value: (row) => row.shipments.map((item) => item.invNo).filter(Boolean).join(", ") },
  { key: "etd", label: "선적일", width: "100px", value: (row) => shipmentDateSummary(row) },
  { key: "lotNo", label: "배치번호", width: "170px", value: (row) => row.shipments.map((item) => item.lotNo).filter(Boolean).join(", ") },
  { key: "shipmentQuantity", label: "선적 수량", width: "120px", value: (row) => row.shipments.reduce((sum, item) => sum + item.quantity, 0) },
  { key: "shipmentFocQuantity", label: "선적 FOC수량", width: "120px", value: (row) => row.shipments.reduce((sum, item) => sum + item.focQuantity, 0) },
  { key: "shipmentAmount", label: "선적 금액", width: "140px", value: (row) => row.shipments.reduce((sum, item) => sum + item.amount, 0) },
  { key: "paymentType", label: "입금 구분", width: "120px", value: (row) => [...new Set(row.payments.map((item) => item.type))].join(", ") },
  { key: "paymentDate", label: "입금/통지일", width: "100px", value: (row) => paymentDateSummary(row) },
  { key: "paymentAmount", label: "입금 금액", width: "140px", value: (row) => paymentTotal(row) },
  { key: "orderPaymentRate", label: "오더액 입금률", width: "130px", value: (row) => orderPaymentRate(row) },
  { key: "shipmentPaymentRate", label: "선적액 입금률", width: "130px", value: (row) => shipmentPaymentRate(row) },
  { key: "registeredAt", label: "수주일자", width: "80px", value: (row) => fmtYearMonth(row.registration?.registeredAt ?? "") },
  { key: "registeredAmount", label: "수주금액", width: "140px", value: (row) => row.registration?.amount ?? 0 },
  { key: "note", label: "비고", width: "240px", value: (row) => row.note }
];

const defaultHidden = new Set(["lotNo", "shipmentQuantity", "shipmentAmount", "paymentDate", "orderPaymentRate", "shipmentPaymentRate", "registeredAt", "registeredAmount"]);
const defaultColumnOrder = columns.map((column) => column.key);

const moneyColumns = new Set(["unitPrice", "orderAmount", "shipmentAmount", "paymentAmount", "registeredAmount"]);
const quantityColumns = new Set(["quantity", "orderFocQuantity", "shipmentQuantity", "shipmentFocQuantity"]);
const rateColumns = new Set(["orderPaymentRate", "shipmentPaymentRate"]);
const centerColumns = new Set(["piDate", "piNo", "productionRequestNo", "productName", "invNo", "etd", "lotNo", "paymentType", "paymentDate", "registeredAt"]);
const linkedCellClass = "text-slate-900 underline decoration-blue-500 underline-offset-2 hover:text-slate-700";

function isMetricColumn(columnKey: string) {
  return moneyColumns.has(columnKey) || quantityColumns.has(columnKey);
}

function isRateColumn(columnKey: string) {
  return rateColumns.has(columnKey);
}

function isCenterColumn(columnKey: string) {
  return centerColumns.has(columnKey);
}

function columnAlignClass(columnKey: string) {
  if (isMetricColumn(columnKey)) return "text-right";
  if (isRateColumn(columnKey) || isCenterColumn(columnKey)) return "text-center";
  return "";
}

function columnFlexClass(columnKey: string) {
  if (isMetricColumn(columnKey)) return "justify-end";
  if (isRateColumn(columnKey) || isCenterColumn(columnKey)) return "justify-center";
  return "";
}

function multiSummaryAlignClass(columnKey: string) {
  if (isMetricColumn(columnKey)) return "text-right tabular-nums";
  return "text-center";
}

function metricCellPaddingClass(columnKey: string) {
  if (isMetricColumn(columnKey)) return "px-2 text-right tabular-nums";
  if (isCenterColumn(columnKey)) return "px-2 text-center";
  return "px-2";
}

function cellContentClass(columnKey: string) {
  if (isMetricColumn(columnKey)) return "justify-end text-right tabular-nums";
  if (isRateColumn(columnKey) || isCenterColumn(columnKey)) return "justify-center text-center";
  return "";
}

function paymentDateSummary(row: OrderBoardRow) {
  return row.payments[0]?.date ?? "";
}

function shipmentDateSummary(row: OrderBoardRow) {
  return row.shipments[0]?.etd ?? "";
}

function hasMultiPaymentDetail(row: OrderBoardRow) {
  return row.payments.length > 1;
}

function hasMultiShipmentDetail(row: OrderBoardRow) {
  return row.shipments.length > 1;
}

function isMultiSummaryColumn(columnKey: string, row: OrderBoardRow) {
  if (columnKey === "paymentDate" || columnKey === "paymentAmount") return hasMultiPaymentDetail(row);
  if (columnKey === "etd" || columnKey === "invNo" || columnKey === "shipmentQuantity" || columnKey === "shipmentFocQuantity" || columnKey === "shipmentAmount") {
    return hasMultiShipmentDetail(row);
  }
  return false;
}

function multiSummaryFocus(columnKey: string): "payment" | "shipment" | null {
  if (columnKey === "paymentDate" || columnKey === "paymentAmount") return "payment";
  if (columnKey === "etd" || columnKey === "invNo" || columnKey === "shipmentQuantity" || columnKey === "shipmentFocQuantity" || columnKey === "shipmentAmount") return "shipment";
  return null;
}

function getMultiCollapsedSummary(row: OrderBoardRow, columnKey: string, currency: string) {
  if (columnKey === "paymentDate") return { count: `${row.payments.length}건`, total: "" };
  if (columnKey === "paymentAmount") return { count: "", total: formatMoneyDisplay(paymentTotal(row), currency) };
  if (columnKey === "etd" || columnKey === "invNo") return { count: `${row.shipments.length}건`, total: "" };
  if (columnKey === "shipmentQuantity") {
    const total = row.shipments.reduce((sum, item) => sum + item.quantity, 0);
    return { count: "", total: formatQuantityDisplay(total) };
  }
  if (columnKey === "shipmentFocQuantity") {
    const total = row.shipments.reduce((sum, item) => sum + item.focQuantity, 0);
    return { count: "", total: formatQuantityDisplay(total) };
  }
  if (columnKey === "shipmentAmount") return { count: "", total: formatMoneyDisplay(shipmentTotal(row), currency) };
  return { count: "", total: "" };
}

function getMultiDetailLines(row: OrderBoardRow, columnKey: string, currency: string): Array<{ text: string; href: string }> {
  if (columnKey === "paymentDate") return row.payments.map((item) => ({ text: item.date || "-", href: paymentHref(item) }));
  if (columnKey === "paymentAmount") return row.payments.map((item) => ({ text: formatMoneyDisplay(item.amount, currency) || "-", href: paymentHref(item) }));
  if (columnKey === "invNo") return row.shipments.map((item) => ({ text: item.invNo || "-", href: shipmentHref(item) }));
  if (columnKey === "etd") return row.shipments.map((item) => ({ text: item.etd || "-", href: shipmentHref(item) }));
  if (columnKey === "shipmentQuantity") return row.shipments.map((item) => ({ text: formatQuantityDisplay(item.quantity) || "-", href: shipmentHref(item) }));
  if (columnKey === "shipmentFocQuantity") return row.shipments.map((item) => ({ text: formatQuantityDisplay(item.focQuantity) || "-", href: shipmentHref(item) }));
  if (columnKey === "shipmentAmount") return row.shipments.map((item) => ({ text: formatMoneyDisplay(item.amount, currency) || "-", href: shipmentHref(item) }));
  return [];
}

function paymentHref(payment: OrderBoardRow["payments"][number]) {
  if (!payment.paymentId) return "";
  const tab = payment.paymentTab || (payment.type === "L/C" ? "lc" : "tt");
  return `/payments?tab=${tab}&edit=${payment.paymentId}`;
}

function shipmentHref(shipment: OrderBoardRow["shipments"][number]) {
  return shipment.shipmentId ? `/shipments/${shipment.shipmentId}` : "";
}

function detailExpandKey(rowKey: string, group: "payment" | "shipment") {
  return `${rowKey}:${group}`;
}

function isDetailExpanded(expandedDetails: Set<string>, rowKey: string, group: "payment" | "shipment") {
  return expandedDetails.has(detailExpandKey(rowKey, group));
}

function getSingleLinkedCell(row: OrderBoardRow, columnKey: string, currency: string): { text: string; href: string } | null {
  if (row.payments.length === 1) {
    const payment = row.payments[0];
    const href = paymentHref(payment);
    if (href) {
      if (columnKey === "paymentDate") return { text: payment.date || "-", href };
      if (columnKey === "paymentAmount") return { text: formatMoneyDisplay(payment.amount, currency) || "-", href };
    }
  }
  if (row.shipments.length === 1) {
    const shipment = row.shipments[0];
    const href = shipmentHref(shipment);
    if (href) {
      if (columnKey === "invNo") return { text: shipment.invNo || "-", href };
      if (columnKey === "etd") return { text: shipment.etd || "-", href };
      if (columnKey === "shipmentQuantity") return { text: formatQuantityDisplay(shipment.quantity) || "-", href };
      if (columnKey === "shipmentFocQuantity") return { text: formatQuantityDisplay(shipment.focQuantity) || "-", href };
      if (columnKey === "shipmentAmount") return { text: formatMoneyDisplay(shipment.amount, currency) || "-", href };
    }
  }
  return null;
}

function paymentTotal(row: OrderBoardRow) {
  return row.payments.reduce((sum, item) => sum + item.amount, 0);
}

function shipmentTotal(row: OrderBoardRow) {
  return row.shipments.reduce((sum, item) => sum + item.amount, 0);
}

function orderAmountTotal(row: OrderBoardRow) {
  const unitPrice = Number(row.unitPrice) || 0;
  const quantity = Number(row.quantity) || 0;
  if (unitPrice && quantity) return unitPrice * quantity;
  return Number(row.orderAmount) || 0;
}

function orderPaymentRate(row: OrderBoardRow) {
  return rate(paymentTotal(row), orderAmountTotal(row));
}

function shipmentPaymentRate(row: OrderBoardRow) {
  return rate(paymentTotal(row), shipmentTotal(row));
}

function rate(amount: number, base: number) {
  return base ? `${Math.round((amount / base) * 1000) / 10}%` : "";
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function formatMoneyAmount(value: number) {
  return roundMoney(value).toLocaleString("ko-KR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatNumber(value: number) {
  if (!value) return "";
  return Number(value).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

function formatMoneyDisplay(value: number, currency = "USD") {
  if (!value) return "";
  const formatted = formatMoneyAmount(value);
  if (currency === "USD") return `$${formatted}`;
  return `${currency}${formatted}`;
}

function formatQuantityDisplay(value: number) {
  if (!value) return "";
  return `${Number(value).toLocaleString("ko-KR")} Box`;
}

function parseMoneyInput(raw: string) {
  return raw.replace(/[$,\s]/g, "").replace(/[^\d.-]/g, "");
}

function parseQuantityInput(raw: string) {
  return raw.replace(/box/gi, "").replace(/,/g, "").trim();
}

const editableOverrideKeys = new Set([
  "piDate", "piNo", "productionRequestNo", "productName", "unitPrice", "quantity", "orderFocQuantity",
  "invNo", "etd", "lotNo", "note", "paymentType", "shipmentQuantity", "shipmentFocQuantity", "shipmentAmount",
  "paymentDate", "paymentAmount"
]);

const shipmentDerivedKeys = new Set(["invNo", "etd", "lotNo", "shipmentQuantity", "shipmentFocQuantity", "shipmentAmount"]);
const paymentDerivedKeys = new Set(["paymentType", "paymentDate", "paymentAmount"]);

function hasOverrideValue(value: unknown) {
  return value !== undefined && String(value).trim() !== "";
}

function applyRowOverrides(row: OrderBoardRow, patch?: Record<string, string>) {
  if (!patch) return row;
  const merged = { ...row };
  for (const [key, value] of Object.entries(patch)) {
    if (!editableOverrideKeys.has(key)) continue;
    (merged as unknown as Record<string, unknown>)[key] = value;
  }
  return merged;
}

function formatCellDisplay(columnKey: string, value: string | number, currency: string) {
  if (value === "" || value === null || value === undefined) return "-";
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return String(value) || "-";
  if (moneyColumns.has(columnKey)) return formatMoneyDisplay(numeric, currency) || "-";
  if (quantityColumns.has(columnKey)) return formatQuantityDisplay(numeric) || "-";
  if (rateColumns.has(columnKey)) return String(value) || "-";
  if (columnKey === "registeredAt") return fmtYearMonth(String(value)) || "-";
  return typeof value === "number" ? formatNumber(value) : String(value) || "-";
}

function columnValue(row: OrderBoardRow, column: Column) {
  const override = (row as unknown as Record<string, unknown>)[column.key];
  if (column.key === "orderAmount") {
    const unitPrice = Number(row.unitPrice) || 0;
    const quantity = Number(row.quantity) || 0;
    if (unitPrice && quantity) return roundMoney(unitPrice * quantity);
    if (hasOverrideValue(override)) return Number(override) || 0;
    return column.value(row);
  }
  if (shipmentDerivedKeys.has(column.key) && row.shipments.length) {
    if (override !== undefined) return override as string | number;
    return column.value(row);
  }
  if (paymentDerivedKeys.has(column.key) && row.payments.length) {
    if (override !== undefined) return override as string | number;
    return column.value(row);
  }
  if (override !== undefined) return override as string | number;
  return column.value(row);
}

function patchWithOrderAmount(rowKey: string, patch: Record<string, string>, sourceRows: OrderBoardRow[], currentOverrides: Record<string, Record<string, string>>) {
  if (!("unitPrice" in patch) && !("quantity" in patch)) return patch;
  const base = sourceRows.find((row) => row.key === rowKey);
  const merged = { ...base, ...currentOverrides[rowKey], ...patch };
  const unitPrice = Number(merged.unitPrice) || 0;
  const quantity = Number(merged.quantity) || 0;
  return { ...patch, orderAmount: String(roundMoney(unitPrice * quantity)) };
}

function blankLocalRow(country: string, buyer: string): OrderBoardRow {
  return {
    key: `local:${crypto.randomUUID()}`,
    exportCountry: country,
    buyer: buyer === "바이어 미입력" ? "" : buyer,
    currency: "USD",
    piDate: "",
    piNo: "",
    productionRequestNo: "",
    productName: "",
    unitPrice: 0,
    quantity: 0,
    orderFocQuantity: 0,
    orderAmount: 0,
    shipments: [],
    payments: [],
    note: ""
  };
}

function reorderKeys(list: string[], sourceKey: string, targetKey: string) {
  if (sourceKey === targetKey) return list;
  const next = list.filter((key) => key !== sourceKey);
  const targetIndex = next.indexOf(targetKey);
  if (targetIndex < 0) return [...next, sourceKey];
  next.splice(targetIndex, 0, sourceKey);
  return next;
}

function normalizeOrderRef(value?: string | null) {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function mergeOrphanPaymentRows(allRows: OrderBoardRow[]): OrderBoardRow[] {
  const rows = allRows.map((row) => ({ ...row, payments: [...row.payments], shipments: [...row.shipments] }));
  const targetByRef = new Map<string, OrderBoardRow>();
  for (const row of rows) {
    if (row.key.startsWith("pi:") || row.key.startsWith("misc:")) continue;
    const pi = normalizeOrderRef(row.piNo);
    if (pi && !targetByRef.has(pi)) targetByRef.set(pi, row);
    for (const shipment of row.shipments) {
      const inv = normalizeOrderRef(shipment.invNo);
      if (inv && !targetByRef.has(inv)) targetByRef.set(inv, row);
    }
  }

  const removeKeys = new Set<string>();
  for (const row of rows) {
    if (!row.payments.length) continue;
    const piFromKey = row.key.startsWith("pi:") ? normalizeOrderRef(row.key.slice(3)) : "";
    const lookupRef = piFromKey || normalizeOrderRef(row.piNo);
    if (!lookupRef) continue;
    const isOrphan = row.key.startsWith("pi:") || (row.key.startsWith("misc:") && !row.orderAmount);
    if (!isOrphan) continue;
    const target = targetByRef.get(lookupRef);
    if (!target || target.key === row.key) continue;
    for (const payment of row.payments) {
      const duplicate = target.payments.some(
        (existing) =>
          existing.type === payment.type &&
          existing.date === payment.date &&
          Math.abs(existing.amount - payment.amount) < 0.01
      );
      if (!duplicate) target.payments.push(payment);
    }
    target.payments = dedupePaymentsClient(target.payments);
    removeKeys.add(row.key);
  }
  return rows.filter((row) => !removeKeys.has(row.key));
}

function normalizeLedgerDate(value?: string | null) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const date = new Date(trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString().slice(0, 10);
}

function dedupePaymentsClient(payments: OrderBoardRow["payments"]) {
  const byModule = new Map<string, OrderBoardRow["payments"][number]>();
  const byLedger = new Map<string, OrderBoardRow["payments"][number]>();

  for (const payment of payments) {
    if (payment.paymentId) {
      const moduleKey = `${payment.paymentId}|${Math.round(payment.amount * 100) / 100}`;
      if (!byModule.has(moduleKey)) byModule.set(moduleKey, payment);
      continue;
    }
    const ledgerKey = `${normalizeLedgerDate(payment.date)}|${Math.round(payment.amount * 100) / 100}`;
    if (!byLedger.has(ledgerKey)) byLedger.set(ledgerKey, payment);
  }

  const result = [...byModule.values()];
  for (const [ledgerKey, payment] of byLedger) {
    const overshadowed = result.some(
      (item) => `${normalizeLedgerDate(item.date)}|${Math.round(item.amount * 100) / 100}` === ledgerKey
    );
    if (!overshadowed) result.push(payment);
  }
  return result;
}

function dedupeShipmentsClient(shipments: OrderBoardRow["shipments"]) {
  const map = new Map<string, OrderBoardRow["shipments"][number]>();
  for (const shipment of shipments) {
    const key = `${normalizeLedgerDate(shipment.etd)}|${Math.round(shipment.amount * 100) / 100}|${shipment.quantity}`;
    const existing = map.get(key);
    if (!existing || (shipment.shipmentId && !existing.shipmentId)) map.set(key, shipment);
  }
  return [...map.values()];
}

function buildRowSavePayload(row: OrderBoardRow) {
  const patch = row as Record<string, unknown>;
  const shipmentAmount = row.shipments.reduce((sum, shipment) => sum + shipment.amount, 0);
  const paymentAmount = row.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const type = row.payments[0]?.type ?? "";
  return {
    rowKey: row.key,
    exportCountry: row.exportCountry,
    buyer: row.buyer,
    piDate: String(patch.piDate ?? row.piDate),
    piNo: String(patch.piNo ?? row.piNo),
    productionRequestNo: String(patch.productionRequestNo ?? row.productionRequestNo),
    productName: String(patch.productName ?? row.productName),
    unitPrice: String(patch.unitPrice ?? row.unitPrice),
    quantity: String(patch.quantity ?? row.quantity),
    orderFocQuantity: String(patch.orderFocQuantity ?? row.orderFocQuantity),
    orderAmount: String(orderAmountTotal(row)),
    note: String(patch.note ?? row.note),
    invNo: String(patch.invNo ?? row.shipments.map((item) => item.invNo).filter(Boolean).join(", ")),
    etd: String(patch.etd ?? (row.shipments.length > 1 ? "" : row.shipments[0]?.etd ?? "")),
    lotNo: String(patch.lotNo ?? row.shipments.map((item) => item.lotNo).filter(Boolean).join(", ")),
    shipmentQuantity: String(patch.shipmentQuantity ?? (row.shipments.reduce((sum, item) => sum + item.quantity, 0) || "")),
    shipmentFocQuantity: String(patch.shipmentFocQuantity ?? (row.shipments.reduce((sum, item) => sum + item.focQuantity, 0) || "")),
    shipmentAmount: String(patch.shipmentAmount ?? (shipmentAmount || "")),
    paymentType: String(patch.paymentType ?? type),
    paymentDate: String(patch.paymentDate ?? (row.payments.length > 1 ? "" : row.payments[0]?.date ?? "")),
    paymentAmount: String(patch.paymentAmount ?? (paymentAmount || "")),
    ...(row.shipments.length > 1 ? { shipmentLinesJson: JSON.stringify(row.shipments) } : {}),
    ...(row.payments.length > 1
      ? {
          paymentLinesJson: JSON.stringify(
            row.payments.map((item) => ({ type: item.type, date: item.date, amount: item.amount, source: item.source || "수동" }))
          )
        }
      : {})
  };
}

function useStoredState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null) return JSON.parse(stored) as T;
    } catch {
      // Keep the provided initial state when browser storage is unavailable.
    }
    return initial;
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // UI state can remain in memory when browser storage is unavailable.
    }
  }, [key, state]);
  return [state, setState] as const;
}

export function OrderCountryBoard({ owner, country, rows, viewerId }: { owner: string; country: string; rows: OrderBoardRow[]; viewerId: string }) {
  const userPrefsKey = `kup-orders:user:${viewerId}`;
  const sheetKey = `kup-orders:v4:${owner}:${country}`;
  const [hidden, setHidden] = useStoredState<string[]>(`${userPrefsKey}:hidden`, [...defaultHidden]);
  const [completed, setCompleted] = useStoredState<string[]>(`${sheetKey}:completed`, []);
  const [selected, setSelected] = useState<string[]>([]);
  const [deletedKeys, setDeletedKeys] = useStoredState<string[]>(`${sheetKey}:deleted`, []);
  const [localRows, setLocalRows] = useStoredState<OrderBoardRow[]>(`${sheetKey}:local`, []);
  const [rowOrder, setRowOrder] = useStoredState<string[]>(`${sheetKey}:order`, []);
  const [overrides, setOverrides] = useStoredState<Record<string, Record<string, string>>>(`${sheetKey}:overrides`, {});
  const [openBuyers, setOpenBuyers] = useStoredState<string[]>(`${sheetKey}:buyers`, []);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "completed" | "all">("active");
  const [sort, setSort] = useStoredState<{ key: string; direction: "asc" | "desc" }>(`${userPrefsKey}:sort`, { key: "piDate", direction: "desc" });
  const [showColumns, setShowColumns] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const [columnOrder, setColumnOrder] = useStoredState<string[]>(`${userPrefsKey}:column-order`, defaultColumnOrder);
  const [draggingColumn, setDraggingColumn] = useState("");
  const [dropColumnTarget, setDropColumnTarget] = useState("");
  const draggingColumnRef = useRef("");
  const dropColumnTargetRef = useRef("");
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(() => new Set());
  const [saveStatus, setSaveStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const dropTargetRef = useRef<string | null>(null);
  const draggingKeyRef = useRef<string | null>(null);

  const sourceRows = useMemo(
    () =>
      mergeOrphanPaymentRows([...rows, ...localRows]).map((row) => ({
        ...row,
        payments: dedupePaymentsClient(row.payments),
        shipments: dedupeShipmentsClient(row.shipments)
      })),
    [localRows, rows]
  );

  useEffect(() => {
    const valid = new Set(sourceRows.map((row) => row.key));
    setDeletedKeys((current) => current.filter((key) => valid.has(key)));
    setCompleted((current) => current.filter((key) => valid.has(key)));
    setRowOrder((current) => current.filter((key) => valid.has(key)));
    setOverrides((current) => {
      const next: Record<string, Record<string, string>> = {};
      for (const [key, patch] of Object.entries(current)) {
        if (valid.has(key)) next[key] = patch;
      }
      return next;
    });
  }, [sourceRows, setCompleted, setDeletedKeys, setOverrides, setRowOrder]);

  const displayRows = useMemo(() => {
    const rank = new Map(rowOrder.map((key, index) => [key, index]));
    return sourceRows
      .filter((row) => !deletedKeys.includes(row.key))
      .map((row) => applyRowOverrides(row, overrides[row.key]))
      .filter((row) => status === "all" || (status === "completed") === completed.includes(row.key))
      .filter((row) => !query || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase())))
      .sort((left, right) => {
        if (rowOrder.length) {
          const leftRank = rank.get(left.key) ?? Number.MAX_SAFE_INTEGER;
          const rightRank = rank.get(right.key) ?? Number.MAX_SAFE_INTEGER;
          if (leftRank !== rightRank) return leftRank - rightRank;
        }
        const column = columns.find((item) => item.key === sort.key);
        const a = column ? columnValue(left as OrderBoardRow, column) : "";
        const b = column ? columnValue(right as OrderBoardRow, column) : "";
        const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "ko");
        return sort.direction === "asc" ? result : -result;
      });
  }, [completed, deletedKeys, overrides, query, rowOrder, sort, sourceRows, status]);

  const byBuyer = useMemo(() => {
    const result = new Map<string, typeof displayRows>();
    for (const row of displayRows) {
      const buyer = row.buyer || "바이어 미입력";
      result.set(buyer, [...(result.get(buyer) ?? []), row]);
    }
    return result;
  }, [displayRows]);

  useEffect(() => {
    draggingKeyRef.current = draggingKey;
    if (!draggingKey) return;
    dropTargetRef.current = draggingKey;

    function finishDrag() {
      const sourceKey = draggingKey;
      const targetKey = dropTargetRef.current;
      if (sourceKey && targetKey && sourceKey !== targetKey) {
        const keys = displayRows.map((row) => row.key).filter((key) => key !== sourceKey);
        const targetIndex = keys.indexOf(targetKey);
        if (targetIndex >= 0) {
          keys.splice(targetIndex, 0, sourceKey);
          setRowOrder(keys);
        }
      }
      setDraggingKey(null);
      setDropTargetKey(null);
      dropTargetRef.current = null;
      draggingKeyRef.current = null;
    }

    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [draggingKey, displayRows, setRowOrder]);

  const orderedColumns = useMemo(() => {
    const map = new Map(columns.map((column) => [column.key, column]));
    const ordered = columnOrder.map((key) => map.get(key)).filter(Boolean) as Column[];
    for (const column of columns) {
      if (!columnOrder.includes(column.key)) ordered.push(column);
    }
    return ordered;
  }, [columnOrder]);

  const visibleColumns = orderedColumns.filter((column) => !hidden.includes(column.key));

  useEffect(() => {
    if (!showColumns) return;
    function handlePointerDown(event: PointerEvent) {
      if (columnMenuRef.current?.contains(event.target as Node)) return;
      setShowColumns(false);
    }
    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [showColumns]);

  function finishColumnDrag() {
    const sourceKey = draggingColumnRef.current;
    const targetKey = dropColumnTargetRef.current;
    if (sourceKey && targetKey && sourceKey !== targetKey) {
      setColumnOrder((current) => reorderKeys(current, sourceKey, targetKey));
    }
    draggingColumnRef.current = "";
    dropColumnTargetRef.current = "";
    setDraggingColumn("");
    setDropColumnTarget("");
  }

  function toggleSelect(key: string) {
    setSelected((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  function toggleBuyer(buyer: string) {
    setOpenBuyers((current) => (current.includes(buyer) ? current.filter((item) => item !== buyer) : [...current, buyer]));
  }

  function updateCell(rowKey: string, columnKey: string, value: string) {
    setOverrides((current) => {
      const patch = { ...(current[rowKey] ?? {}), [columnKey]: value };
      return { ...current, [rowKey]: patchWithOrderAmount(rowKey, patch, sourceRows, current) };
    });
  }

  function completeRows(keys: string[]) {
    setCompleted((current) => [...new Set([...current, ...keys])]);
    setSelected((current) => current.filter((key) => !keys.includes(key)));
  }

  function deleteRows(keys: string[]) {
    setDeletedKeys((current) => [...new Set([...current, ...keys])]);
    setLocalRows((current) => current.filter((row) => !keys.includes(row.key)));
    setSelected((current) => current.filter((key) => !keys.includes(key)));
    setCompleted((current) => current.filter((key) => !keys.includes(key)));
  }

  function insertRowAt(buyer: string, afterKey?: string) {
    const newRow = blankLocalRow(country, buyer);
    setLocalRows((current) => [...current, newRow]);
    setOpenBuyers((current) => (current.includes(buyer) ? current : [...current, buyer]));

    const keys = displayRows.map((row) => row.key);
    if (!afterKey) {
      setRowOrder([newRow.key, ...keys]);
      return;
    }
    const index = keys.indexOf(afterKey);
    if (index < 0) {
      setRowOrder([...keys, newRow.key]);
      return;
    }
    setRowOrder([...keys.slice(0, index + 1), newRow.key, ...keys.slice(index + 1)]);
  }

  async function submitBulkSave() {
    const payload = displayRows.map((row) => buildRowSavePayload(row as OrderBoardRow));
    setIsSaving(true);
    setSaveStatus("");
    try {
      const formData = new FormData();
      formData.set("owner", owner);
      formData.set("sheet", country);
      formData.set("rowsPayload", JSON.stringify(payload));
      const result = await saveAllOrderBoardRowsAction(formData);
      if (result?.ok) setSaveStatus("저장됨");
    } catch {
      setSaveStatus("저장 실패");
    } finally {
      setIsSaving(false);
      window.setTimeout(() => setSaveStatus(""), 2000);
    }
  }

  function toggleDetailGroup(rowKey: string, group: "payment" | "shipment") {
    const key = detailExpandKey(rowKey, group);
    setExpandedDetails((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <section className="space-y-3">
      <div className={`panel relative flex flex-wrap items-center justify-between gap-3 p-3 ${showColumns ? "z-[200]" : ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="현재 국가 오더 검색" className="h-10 w-64 pl-9" />
          </div>
          <div className="flex rounded-md border border-slate-200 bg-white p-1">
            {([["active", "진행"], ["completed", "완료"], ["all", "전체"]] as const).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setStatus(value)} className={`rounded px-3 py-1.5 text-sm ${status === value ? "bg-blue-600 font-semibold text-white" : "text-slate-600 hover:bg-slate-50"}`}>{label}</button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-primary h-10 gap-2 px-4" onClick={submitBulkSave} disabled={isSaving}>
            {isSaving ? "저장 중..." : "전체 저장"}
          </button>
          {saveStatus ? <span className="text-xs font-medium text-emerald-600">{saveStatus}</span> : null}
          <div className="relative" ref={columnMenuRef}>
            <button type="button" className="btn h-10 gap-2" onClick={() => setShowColumns((value) => !value)}><Columns3 className="h-4 w-4" />열 관리</button>
            {showColumns ? (
              <div className="absolute right-0 top-11 z-[210] w-72 rounded-md border border-slate-200 bg-white p-3 shadow-2xl">
                <div className="relative z-[210] max-h-72 space-y-1 overflow-y-auto bg-white">
                  {orderedColumns.map((column) => (
                    <div
                      key={column.key}
                      draggable
                      onDragStart={() => {
                        draggingColumnRef.current = column.key;
                        dropColumnTargetRef.current = column.key;
                        setDraggingColumn(column.key);
                        setDropColumnTarget(column.key);
                      }}
                      onDragEnter={() => {
                        dropColumnTargetRef.current = column.key;
                        setDropColumnTarget(column.key);
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDragEnd={finishColumnDrag}
                      className={`flex items-center gap-2 rounded px-2 py-1.5 text-xs hover:bg-slate-50 ${draggingColumn === column.key ? "opacity-50" : ""} ${dropColumnTarget === column.key && draggingColumn !== column.key ? "bg-blue-50" : ""}`}
                    >
                      <GripVertical className="h-3.5 w-3.5 shrink-0 cursor-grab text-slate-300" />
                      <label className="flex min-w-0 flex-1 items-center gap-2">
                        <input type="checkbox" checked={!hidden.includes(column.key)} onChange={() => setHidden((current) => current.includes(column.key) ? current.filter((key) => key !== column.key) : [...current, column.key])} />
                        {column.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {[...byBuyer.entries()].map(([buyer, buyerRows]) => {
        const open = openBuyers.includes(buyer);
        const buyerSelected = buyerRows.filter((row) => selected.includes(row.key));
        const shipmentEligible = buyerSelected.filter((row) => !row.shipments.length);
        const canCreateShipment = shipmentEligible.length > 0 && shipmentEligible.length === buyerSelected.length;
        return (
          <section key={buyer} className="panel overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
              <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left font-semibold text-slate-900" onClick={() => toggleBuyer(buyer)}>
                {open ? <ChevronDown className="h-4 w-4 shrink-0 text-blue-600" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                <span className="truncate">{buyer}</span>
                <span className="text-xs font-normal text-slate-400">{buyerRows.length}건</span>
              </button>
              <div className="flex shrink-0 items-center gap-2">
                {buyerSelected.length ? (
                  <>
                    <span className="text-xs text-slate-500">{buyerSelected.length}건 선택</span>
                    <button type="button" className="btn px-2 py-1 text-xs" onClick={() => completeRows(buyerSelected.map((row) => row.key))}>완료</button>
                    {canCreateShipment ? (
                      <>
                        <button
                          type="button"
                          className="btn px-2 py-1 text-xs"
                          onClick={() => openCombinedShipmentFromOrders(shipmentEligible)}
                        >
                          선적의뢰
                        </button>
                        {shipmentEligible.length > 1 ? (
                          <button
                            type="button"
                            className="btn px-2 py-1 text-xs"
                            onClick={() => openIndividualShipmentsFromOrders(shipmentEligible)}
                          >
                            개별의뢰
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <button
                        type="button"
                        className="btn px-2 py-1 text-xs"
                        disabled
                        title="선적이 없는 오더만 선택했을 때 사용할 수 있습니다"
                      >
                        선적의뢰
                      </button>
                    )}
                    <button type="button" className="btn px-2 py-1 text-xs text-red-700" onClick={() => deleteRows(buyerSelected.map((row) => row.key))}>삭제</button>
                  </>
                ) : null}
                <span className="text-xs text-slate-400">오더 {formatMoneyDisplay(buyerRows.reduce((sum, row) => sum + Number(row.orderAmount || 0), 0), buyerRows[0]?.currency || "USD")}</span>
              </div>
            </div>
            {open ? (
              <div className="relative overflow-x-auto overflow-y-visible border-t border-slate-100 pl-10">
                <table className="border-collapse overflow-visible text-left text-xs" style={{ minWidth: `calc(110px + ${visibleColumns.map((column) => column.width).join(" + ")})` }}>
                  <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500">
                    <tr>
                      <th className="w-10 align-middle px-2 py-2 text-center"><GripVertical className="mx-auto h-4 w-4" /></th>
                      <th className="w-20 align-middle px-2 py-2 text-center">선택</th>
                      {visibleColumns.map((column) => (
                        <th
                          key={column.key}
                          style={{ width: column.width }}
                          className={`relative align-middle whitespace-nowrap px-3 py-2 text-center ${
                            draggingColumn === column.key ? "opacity-50" : ""
                          } ${dropColumnTarget === column.key && draggingColumn && draggingColumn !== column.key ? "bg-blue-100" : ""}`}
                          onDragEnter={() => {
                            if (!draggingColumnRef.current) return;
                            dropColumnTargetRef.current = column.key;
                            setDropColumnTarget(column.key);
                          }}
                          onDragOver={(event) => event.preventDefault()}
                        >
                          <span
                            draggable
                            onDragStart={(event) => {
                              event.stopPropagation();
                              draggingColumnRef.current = column.key;
                              dropColumnTargetRef.current = column.key;
                              setDraggingColumn(column.key);
                              setDropColumnTarget(column.key);
                            }}
                            onDragEnd={finishColumnDrag}
                            className="absolute left-0 top-1/2 inline-flex -translate-y-1/2 cursor-grab touch-none select-none active:cursor-grabbing"
                            title="드래그하여 열 순서 변경"
                          >
                            <GripVertical className="h-3.5 w-3.5 text-slate-300" />
                          </span>
                          <button
                            type="button"
                            className="inline-flex w-full items-center justify-center gap-1 font-medium"
                            onClick={() => setSort((current) => ({ key: column.key, direction: current.key === column.key && current.direction === "asc" ? "desc" : "asc" }))}
                          >
                            {column.label}
                            <SlidersHorizontal className="h-3 w-3" />
                          </button>
                        </th>
                      ))}
                      <th className="w-28 align-middle whitespace-nowrap px-3 py-2 text-center">수주등록</th>
                    </tr>
                  </thead>
                  <tbody className="overflow-visible" onDragStartCapture={(event) => event.preventDefault()}>
                    {buyerRows.map((row) => (
                      <Fragment key={row.key}>
                        <OrderEditableRow
                          row={row as OrderBoardRow}
                          columns={visibleColumns}
                          completed={completed.includes(row.key)}
                          selected={selected.includes(row.key)}
                          expandedDetails={expandedDetails}
                          dragging={draggingKey === row.key}
                          dropTarget={Boolean(draggingKey && dropTargetKey === row.key && draggingKey !== row.key)}
                          onSelect={() => toggleSelect(row.key)}
                          onToggleDetail={toggleDetailGroup}
                          onChange={updateCell}
                          onInsertAfter={() => insertRowAt(buyer, row.key)}
                          onGripPointerDown={() => {
                            draggingKeyRef.current = row.key;
                            setDraggingKey(row.key);
                            setDropTargetKey(row.key);
                            dropTargetRef.current = row.key;
                          }}
                          onRowPointerEnter={() => {
                            if (!draggingKeyRef.current) return;
                            setDropTargetKey(row.key);
                            dropTargetRef.current = row.key;
                          }}
                          owner={owner}
                          country={country}
                        />
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        );
      })}
      {!displayRows.length ? <div className="panel p-10 text-center text-sm text-slate-500">{country}에서 표시할 오더가 없습니다.</div> : null}
    </section>
  );
}

function OrderEditableRow({
  row,
  columns,
  completed,
  selected,
  expandedDetails,
  dragging,
  dropTarget,
  onSelect,
  onToggleDetail,
  onChange,
  onInsertAfter,
  onGripPointerDown,
  onRowPointerEnter,
  owner,
  country
}: {
  row: OrderBoardRow;
  columns: Column[];
  completed: boolean;
  selected: boolean;
  expandedDetails: Set<string>;
  dragging: boolean;
  dropTarget: boolean;
  onSelect: () => void;
  onToggleDetail: (rowKey: string, group: "payment" | "shipment") => void;
  onChange: (rowKey: string, columnKey: string, value: string) => void;
  onInsertAfter: () => void;
  onGripPointerDown: () => void;
  onRowPointerEnter: () => void;
  owner: string;
  country: string;
}) {
  const rowExpanded = [...expandedDetails].some((key) => key.startsWith(`${row.key}:`));
  return (
    <tr
      onPointerEnter={onRowPointerEnter}
      className={`group/row relative border-b border-slate-100 ${
        dragging ? "opacity-50" : ""
      } ${dropTarget ? "bg-blue-100/70" : rowExpanded ? "bg-blue-50/50" : completed ? "bg-emerald-50/60 text-slate-500" : selected ? "bg-blue-50/70" : "hover:bg-blue-50/40"}`}
    >
      <td className="relative align-middle px-2 py-2">
        <div className="flex h-9 items-center justify-center">
          <button
            type="button"
            data-row-drag-handle
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onGripPointerDown();
            }}
            className="inline-flex cursor-grab select-none touch-none items-center justify-center text-slate-300 hover:text-slate-500 active:cursor-grabbing"
            title="드래그하여 순서 변경"
          >
            <GripVertical className="pointer-events-none h-4 w-4" />
          </button>
        </div>
        <div className="pointer-events-none absolute bottom-0 left-0 z-30 h-3 w-[5000px] -translate-y-1/2">
          <div className="group/insert pointer-events-auto relative h-3 w-full">
            <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-transparent transition-colors group-hover/insert:bg-blue-300" />
            <button
              type="button"
              onClick={onInsertAfter}
              className="absolute -left-9 top-1/2 z-40 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 opacity-0 shadow-sm transition-opacity hover:border-blue-400 hover:bg-blue-50 hover:text-blue-600 group-hover/insert:opacity-100 focus-visible:opacity-100"
              title="행 추가"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </td>
      <td className="align-middle px-2 py-2">
        <div className="flex h-9 items-center justify-center">
          <input type="checkbox" checked={selected} onChange={onSelect} onClick={(event) => event.stopPropagation()} className="h-4 w-4" />
        </div>
      </td>
      {columns.map((column) => (
        <td key={column.key} className={`align-middle px-2 py-2 ${columnAlignClass(column.key)}`}>
          <div className={`flex min-h-9 w-full items-center ${columnFlexClass(column.key)}`}>
            <Cell row={row} column={column} expandedDetails={expandedDetails} onChange={onChange} onToggleDetail={onToggleDetail} />
          </div>
        </td>
      ))}
      <td className="align-middle px-2 py-2">
        <div className="flex min-h-9 items-center" data-no-row-expand>
          <OrderActions row={row} owner={owner} country={country} />
        </div>
      </td>
    </tr>
  );
}

function Cell({
  row,
  column,
  expandedDetails,
  onChange,
  onToggleDetail
}: {
  row: OrderBoardRow;
  column: Column;
  expandedDetails: Set<string>;
  onChange: (rowKey: string, columnKey: string, value: string) => void;
  onToggleDetail: (rowKey: string, group: "payment" | "shipment") => void;
}) {
  const value = columnValue(row, column);
  const editable = [
    "piDate", "piNo", "productionRequestNo", "productName", "unitPrice", "quantity", "orderFocQuantity",
    "invNo", "etd", "lotNo", "note", "shipmentQuantity", "shipmentFocQuantity", "shipmentAmount", "paymentDate", "paymentAmount"
  ].includes(column.key);
  const currency = row.currency || "USD";
  const multiSummary = isMultiSummaryColumn(column.key, row);
  const group = multiSummaryFocus(column.key);
  const linkedCell = getSingleLinkedCell(row, column.key, currency);

  if (multiSummary && group) {
    const summary = getMultiCollapsedSummary(row, column.key, currency);
    const expanded = isDetailExpanded(expandedDetails, row.key, group);
    const details = expanded ? getMultiDetailLines(row, column.key, currency) : [];
    return (
      <div data-no-row-expand className={`flex w-full min-h-9 flex-col justify-center text-xs leading-5 ${metricCellPaddingClass(column.key)} ${multiSummaryAlignClass(column.key)}`}>
        <button
          type="button"
          onClick={() => onToggleDetail(row.key, group)}
          className={`w-full ${multiSummaryAlignClass(column.key)} ${expanded ? "text-blue-800" : "text-blue-700 hover:text-blue-800"}`}
        >
          {summary.count ? <div className={`font-semibold ${expanded ? "underline decoration-blue-300 underline-offset-2" : ""}`}>{summary.count}</div> : null}
          {summary.total ? <div className={`font-semibold ${expanded ? "underline decoration-blue-300 underline-offset-2" : ""}`}>{summary.total}</div> : null}
        </button>
        {details.map((line, index) =>
          line.href ? (
            <Link
              key={`${column.key}-${index}`}
              href={line.href}
              target="_blank"
              rel="noopener noreferrer"
              className={`block ${linkedCellClass} ${multiSummaryAlignClass(column.key)}`}
            >
              {line.text}
            </Link>
          ) : (
            <div key={`${column.key}-${index}`} className={`text-slate-900 ${multiSummaryAlignClass(column.key)}`}>
              {line.text}
            </div>
          )
        )}
      </div>
    );
  }

  if (linkedCell) {
    return (
      <Link
        href={linkedCell.href}
        target="_blank"
        rel="noopener noreferrer"
        data-no-row-expand
        className={`block h-9 w-full min-w-0 text-xs leading-9 ${linkedCellClass} ${metricCellPaddingClass(column.key)}`}
      >
        {linkedCell.text}
      </Link>
    );
  }

  if (column.key === "paymentType") {
    return (
      <select
        value={String(value ?? "")}
        onChange={(event) => onChange(row.key, column.key, event.target.value)}
        onDragStart={(event) => event.preventDefault()}
        data-no-row-expand
        className="mx-auto h-9 min-w-24 select-text text-center text-xs"
      >
        <option value="">-</option>
        {["T/T", "L/C", "D/A", "D/P"].map((type) => <option key={type} value={type}>{type}</option>)}
      </select>
    );
  }
  if (!editable) {
    return (
      <span
        className={`flex min-h-9 w-full items-center select-text whitespace-pre-wrap px-1 ${cellContentClass(column.key)}`}
        style={{ WebkitUserDrag: "none" } as CSSProperties}
      >
        {formatCellDisplay(column.key, value, currency)}
      </span>
    );
  }
  if (moneyColumns.has(column.key) || quantityColumns.has(column.key)) {
    return (
      <FormattedMetricInput
        columnKey={column.key}
        value={value}
        currency={currency}
        onChange={(next) => onChange(row.key, column.key, next)}
      />
    );
  }
  return (
    <input
      value={String(value ?? "")}
      onChange={(event) => onChange(row.key, column.key, event.target.value)}
      draggable={false}
      data-no-row-expand
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      style={{ WebkitUserDrag: "none" } as CSSProperties}
      className={`h-9 w-full min-w-0 select-text border-transparent bg-transparent px-2 text-xs hover:border-slate-200 focus:border-blue-400 focus:bg-white ${isCenterColumn(column.key) ? "text-center" : ""}`}
    />
  );
}

function FormattedMetricInput({
  columnKey,
  value,
  currency,
  onChange
}: {
  columnKey: string;
  value: string | number;
  currency: string;
  onChange: (value: string) => void;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState("");
  const numeric = Number(value) || 0;
  const isQuantity = quantityColumns.has(columnKey);
  const display = isQuantity ? formatQuantityDisplay(numeric) : formatMoneyDisplay(numeric, currency);

  return (
    <input
      value={focused ? draft : display}
      onFocus={() => {
        setDraft(numeric ? String(numeric) : "");
        setFocused(true);
      }}
      onBlur={() => {
        const parsed = isQuantity ? parseQuantityInput(draft) : parseMoneyInput(draft);
        const next = isQuantity ? parsed : parsed ? String(roundMoney(Number(parsed) || 0)) : parsed;
        onChange(next);
        setFocused(false);
      }}
      onChange={(event) => setDraft(event.target.value)}
      draggable={false}
      data-no-row-expand
      onDragStart={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
      style={{ WebkitUserDrag: "none" } as CSSProperties}
      className="h-9 w-full min-w-0 select-text border-transparent bg-transparent px-2 text-right tabular-nums text-xs hover:border-slate-200 focus:border-blue-400 focus:bg-white"
    />
  );
}

function OrderActions({ row, owner, country }: { row: OrderBoardRow; owner: string; country: string }) {
  const shipmentAmount = row.shipments.reduce((sum, shipment) => sum + shipment.amount, 0);
  const paymentAmount = row.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const type = row.payments[0]?.type ?? "";
  const registerable = row.orderAmount > 0 && paymentAmount / row.orderAmount >= 0.5;
  const suggestedAmount = type === "T/T" ? row.orderAmount : type === "L/C" ? paymentAmount : shipmentAmount;

  return (
    <form action={registerSalesOrderAction} className="w-full min-w-28" data-no-row-expand>
      <input type="hidden" name="owner" value={owner} />
      <input type="hidden" name="sheet" value={country} />
      <input type="hidden" name="orderKey" value={row.key} />
      <input type="hidden" name="exportCountry" value={row.exportCountry} />
      <input type="hidden" name="buyer" value={row.buyer} />
      <input type="hidden" name="piNo" value={row.piNo} />
      <input type="hidden" name="productionRequestNo" value={row.productionRequestNo} />
      <input type="hidden" name="registeredAt" value={yearMonthToFormDate(row.registration?.registeredAt)} />
      <input type="hidden" name="amount" value={row.registration?.amount ?? suggestedAmount} />
      <input type="hidden" name="note" value={row.note} />
      {row.registration?.status === "REGISTERED" ? (
        <div className="grid w-full grid-cols-2 gap-1">
          <button type="submit" className="btn-primary w-full whitespace-nowrap px-1 py-1 text-xs">수정</button>
          <button type="submit" formAction={cancelSalesOrderRegistrationAction} className="btn w-full whitespace-nowrap px-1 py-1 text-xs text-red-700">취소</button>
        </div>
      ) : (
        <button type="submit" className="btn-primary w-full whitespace-nowrap px-2 py-1 text-xs" disabled={!registerable}>수주등록</button>
      )}
    </form>
  );
}
