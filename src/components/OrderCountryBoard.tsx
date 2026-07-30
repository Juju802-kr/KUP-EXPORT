"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Check, ChevronDown, ChevronRight, Columns3, GripVertical, Plus, Search, SlidersHorizontal } from "lucide-react";
import { registerSalesOrderAction, saveAllOrderBoardRowsAction } from "@/server/actions";
import { fmtYearMonth, yearMonthToFormDate } from "@/lib/constants";
import { registerOrderUnsavedGuard } from "@/lib/order-unsaved-guard";
import { dedupeBoardPayments, reconcileBoardShipments, normalizeLedgerDate, normalizeOrderRef, compareOrdersByPiSequence } from "@/lib/order-board-linking";
import { type RegisteredDestination } from "@/lib/destination-registry";
import { type ExportProductOption } from "@/lib/order-pi-import";
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
  incoterms: string;
  transport: string;
  destinationPort: string;
  shipments: Array<{ invNo: string; etd: string; lotNo: string; quantity: number; focQuantity: number; amount: number; shipmentId?: string }>;
  payments: Array<{ type: string; date: string; amount: number; source: string; paymentId?: string; paymentTab?: "tt" | "lc" }>;
  registration?: { amount: number; registeredAt: string; status: string };
  registeredAt?: string;
  note: string;
  leaderNote?: string;
  leaderPrivateNote?: string;
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
  { key: "etd", label: "선적일", width: "112px", value: (row) => shipmentDateSummary(row) },
  { key: "lotNo", label: "배치번호", width: "200px", value: (row) => row.shipments.map((item) => item.lotNo).filter(Boolean).join(", ") },
  { key: "shipmentQuantity", label: "선적 수량", width: "120px", value: (row) => row.shipments.reduce((sum, item) => sum + item.quantity, 0) },
  { key: "shipmentFocQuantity", label: "선적 FOC수량", width: "120px", value: (row) => row.shipments.reduce((sum, item) => sum + item.focQuantity, 0) },
  { key: "shipmentAmount", label: "선적 금액", width: "140px", value: (row) => row.shipments.reduce((sum, item) => sum + item.amount, 0) },
  { key: "paymentType", label: "입금 구분", width: "120px", value: (row) => [...new Set(row.payments.map((item) => item.type))].join(", ") },
  { key: "paymentDate", label: "입금/통지일", width: "112px", value: (row) => paymentDateSummary(row) },
  { key: "paymentAmount", label: "입금 금액", width: "140px", value: (row) => paymentTotal(row) },
  { key: "orderPaymentRate", label: "오더액 입금률", width: "130px", value: (row) => orderPaymentRate(row) },
  { key: "shipmentPaymentRate", label: "선적액 입금률", width: "130px", value: (row) => shipmentPaymentRate(row) },
  { key: "registeredAt", label: "수주일자", width: "130px", value: (row) => resolveRegisteredAtValue(row) },
  { key: "registeredAmount", label: "수주금액", width: "140px", value: (row) => row.registration?.amount ?? 0 },
  { key: "note", label: "비고", width: "240px", value: (row) => row.note },
  { key: "leaderNote", label: "팀장의견", width: "240px", value: (row) => row.leaderNote ?? "" }
];

const defaultHidden = new Set(["lotNo", "shipmentQuantity", "shipmentAmount", "paymentDate", "orderPaymentRate", "shipmentPaymentRate", "registeredAmount"]);
const defaultColumnOrder = columns.map((column) => column.key);
const BOARD_ZOOM_MAX = 1.4;
const BOARD_ZOOM_STEP = 0.05;
const BOARD_ZOOM_ABSOLUTE_MIN = 0.15;
const GRIP_COLUMN_WIDTH = 40;
const SELECT_COLUMN_WIDTH = 80;
const STICKY_COLUMN_SHADOW = "shadow-[4px_0_6px_-4px_rgba(15,23,42,0.12)]";

function computeFrozenTableWidth() {
  return GRIP_COLUMN_WIDTH + SELECT_COLUMN_WIDTH;
}

function computeDataTableWidth(visibleColumns: Column[]) {
  return visibleColumns.reduce((sum, column) => sum + Number.parseInt(column.width, 10), 0);
}

function computeTableWidth(visibleColumns: Column[]) {
  return computeFrozenTableWidth() + computeDataTableWidth(visibleColumns);
}

function mergeVisibleBuyerReorder(fullOrder: string[], reorderedVisible: string[]) {
  const visibleSet = new Set(reorderedVisible);
  const visibleQueue = [...reorderedVisible];
  return fullOrder.map((buyer) => (visibleSet.has(buyer) ? visibleQueue.shift() ?? buyer : buyer));
}

function ensureBuyerOrderList(current: string[], allBuyers: string[]) {
  const filtered = current.filter((buyer) => allBuyers.includes(buyer));
  const missing = allBuyers.filter((buyer) => !filtered.includes(buyer)).sort((a, b) => a.localeCompare(b, "ko"));
  return [...filtered, ...missing];
}

function rowSurfaceClass({
  dragging,
  dropTarget,
  rowExpanded,
  completed,
  selected
}: {
  dragging: boolean;
  dropTarget: boolean;
  rowExpanded: boolean;
  completed: boolean;
  selected: boolean;
}) {
  if (dragging) return "bg-white";
  if (dropTarget) return "bg-blue-100";
  if (rowExpanded) return "bg-blue-50";
  if (completed) return "bg-emerald-50 text-slate-500";
  if (selected) return "bg-blue-50";
  return "bg-white group-hover/row:bg-blue-50/40";
}

const moneyColumns = new Set(["unitPrice", "orderAmount", "shipmentAmount", "paymentAmount", "registeredAmount"]);
const quantityColumns = new Set(["quantity", "orderFocQuantity", "shipmentQuantity", "shipmentFocQuantity"]);
const rateColumns = new Set(["orderPaymentRate", "shipmentPaymentRate"]);
const centerColumns = new Set(["piDate", "piNo", "productionRequestNo", "productName", "invNo", "etd", "lotNo", "paymentType", "paymentDate", "registeredAt"]);
const linkedCellClass = "text-slate-900 underline decoration-blue-500 underline-offset-2 hover:text-slate-700";
const multiSummaryClass = "font-semibold text-blue-900";

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

function cellLineClass(columnKey: string) {
  const parts = ["flex h-full min-h-9 w-full min-w-0 items-center text-xs leading-5"];
  if (isMetricColumn(columnKey)) {
    parts.push("justify-end px-2 text-right tabular-nums");
  } else if (isCenterColumn(columnKey) || isRateColumn(columnKey)) {
    parts.push("justify-center px-1 text-center");
  } else {
    parts.push("px-1 text-left");
  }
  return parts.join(" ");
}

function inlineInputClass(columnKey: string) {
  const parts = ["ocb-cell-input w-full min-w-0 bg-transparent outline-none"];
  if (isMetricColumn(columnKey)) {
    parts.push("text-right tabular-nums");
  } else if (isCenterColumn(columnKey) || isRateColumn(columnKey)) {
    parts.push("text-center");
  }
  return parts.join(" ");
}

function paymentDateSummary(row: OrderBoardRow) {
  return row.payments[0]?.date ?? "";
}

function isInvalidEtdLabel(value: unknown) {
  const text = String(value ?? "").trim();
  if (!text) return true;
  if (text === "합계" || text === "소계" || text === "계") return true;
  return !normalizeLedgerDate(text);
}

function resolveEtdColumnValue(row: OrderBoardRow, override: unknown) {
  if (row.shipments.length > 1) return `${row.shipments.length}건`;
  const shipmentEtd = row.shipments.find((shipment) => shipment.etd && !isInvalidEtdLabel(shipment.etd))?.etd;
  if (shipmentEtd) return shipmentEtd;
  if (override !== undefined && !isInvalidEtdLabel(override)) return String(override);
  return "-";
}

function shipmentDateSummary(row: OrderBoardRow) {
  if (row.shipments.length > 1) return `${row.shipments.length}건`;
  const etd = row.shipments[0]?.etd;
  return etd && !isInvalidEtdLabel(etd) ? etd : "";
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

function isShipmentTotalColumn(columnKey: string) {
  return columnKey === "shipmentQuantity" || columnKey === "shipmentFocQuantity" || columnKey === "shipmentAmount" || columnKey === "paymentAmount";
}

function isDateColumn(columnKey: string) {
  return columnKey === "piDate" || columnKey === "etd" || columnKey === "paymentDate" || columnKey === "registeredAt";
}

function isDetailOnlyMultiColumn(columnKey: string) {
  return (
    columnKey === "etd" ||
    columnKey === "invNo" ||
    columnKey === "paymentDate" ||
    columnKey === "shipmentQuantity" ||
    columnKey === "shipmentFocQuantity" ||
    columnKey === "shipmentAmount"
  );
}

function latestShipmentEtd(row: OrderBoardRow) {
  const dated = row.shipments.filter((shipment) => shipment.etd);
  if (!dated.length) return "";
  return [...dated].sort((left, right) => normalizeLedgerDate(right.etd).localeCompare(normalizeLedgerDate(left.etd)))[0]?.etd ?? "";
}

function getMultiCollapsedSummary(row: OrderBoardRow, columnKey: string, currency: string) {
  if (columnKey === "paymentDate") return { count: `${row.payments.length}건`, total: "" };
  if (columnKey === "paymentAmount") return { count: "", total: formatMoneyDisplay(paymentTotal(row), currency) };
  if (columnKey === "etd") {
    if (row.shipments.length === 1) {
      const etd = row.shipments[0]?.etd;
      return { count: etd && !isInvalidEtdLabel(etd) ? etd : "-", total: "" };
    }
    return { count: `${row.shipments.length}건`, total: "" };
  }
  if (columnKey === "invNo") {
    if (row.shipments.length === 1) return { count: row.shipments[0]?.invNo || "-", total: "" };
    return { count: `${row.shipments.length}건`, total: "" };
  }
  if (columnKey === "shipmentQuantity") {
    const total = row.shipments.reduce((sum, item) => sum + item.quantity, 0);
    return { count: "", total: formatQuantityDisplay(total) };
  }
  if (columnKey === "shipmentFocQuantity") {
    const total = row.shipments.reduce((sum, item) => sum + item.focQuantity, 0);
    return { count: "", total: formatQuantityDisplay(total) };
  }
  if (columnKey === "shipmentAmount") {
    return { count: "", total: formatMoneyDisplay(shipmentTotal(row), currency) };
  }
  return { count: "", total: "" };
}

function renderMultiDetailLine(line: { text: string; href: string }, columnKey: string, key: string) {
  const nowrap = isDateColumn(columnKey);
  if (line.href) {
    return (
      <Link
        key={key}
        href={line.href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${cellLineClass(columnKey)} ${nowrap ? "whitespace-nowrap" : "whitespace-normal break-words"} ${linkedCellClass}`}
      >
        {line.text}
      </Link>
    );
  }
  return (
    <div
      key={key}
      className={`${cellLineClass(columnKey)} font-medium text-slate-900 ${nowrap ? "whitespace-nowrap" : "whitespace-normal break-words"}`}
    >
      {line.text}
    </div>
  );
}

function getMultiDetailLines(row: OrderBoardRow, columnKey: string, currency: string): Array<{ text: string; href: string }> {
  if (columnKey === "paymentDate") return row.payments.map((item) => ({ text: item.date || "-", href: paymentHref(item) }));
  if (columnKey === "paymentAmount") return row.payments.map((item) => ({ text: formatMoneyDisplay(item.amount, currency) || "-", href: paymentHref(item) }));
  if (columnKey === "invNo") return row.shipments.map((item) => ({ text: item.invNo || "-", href: shipmentHref(item) }));
  if (columnKey === "etd") return row.shipments.map((item) => ({ text: item.etd && !isInvalidEtdLabel(item.etd) ? item.etd : "-", href: shipmentHref(item) }));
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
      if (columnKey === "etd") {
        const etd = shipment.etd;
        return { text: etd && !isInvalidEtdLabel(etd) ? etd : "-", href };
      }
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
  "invNo", "etd", "lotNo", "note", "leaderNote", "leaderPrivateNote", "registeredAt", "paymentType", "shipmentQuantity", "shipmentFocQuantity", "shipmentAmount",
  "paymentDate", "paymentAmount"
]);

const shipmentDerivedKeys = new Set(["invNo", "etd", "lotNo", "shipmentQuantity", "shipmentFocQuantity", "shipmentAmount"]);
const paymentDerivedKeys = new Set(["paymentType", "paymentDate", "paymentAmount"]);

function hasOverrideValue(value: unknown) {
  return value !== undefined && String(value).trim() !== "";
}

function suggestedRegistrationMonth(row: OrderBoardRow) {
  const dated = row.payments
    .filter((item) => item.date && item.date !== "D/A" && item.date !== "D/P")
    .map((item) => ({ date: item.date, parsed: normalizeLedgerDate(item.date) }))
    .filter((item) => item.parsed)
    .sort((left, right) => left.parsed.localeCompare(right.parsed));
  if (!dated.length) return "";
  return fmtYearMonth(dated[0].date);
}

function resolveRegisteredAtValue(row: OrderBoardRow) {
  if (row.registeredAt !== undefined) return row.registeredAt;
  if (row.registration?.status === "REGISTERED") return row.registration.registeredAt ?? "";
  if (row.registration?.registeredAt?.trim()) return row.registration.registeredAt;
  return "";
}

function isRegistrationPending(row: OrderBoardRow) {
  return row.registration?.status !== "REGISTERED";
}

function hasLcOpened(row: OrderBoardRow) {
  return row.payments.some((payment) => payment.type === "L/C");
}

function isPaymentOverHalf(row: OrderBoardRow) {
  const paymentAmount = row.payments.reduce((sum, payment) => sum + payment.amount, 0);
  return row.orderAmount > 0 && paymentAmount / row.orderAmount >= 0.5;
}

function isRegistrationEligible(row: OrderBoardRow) {
  return hasLcOpened(row) || isPaymentOverHalf(row);
}

function computeRegistrationSuggestions(sourceRows: OrderBoardRow[]) {
  const suggestions: Record<string, string> = {};
  for (const row of sourceRows) {
    if (row.registration?.status === "REGISTERED") continue;
    if (!isRegistrationEligible(row)) continue;
    if (row.registration?.registeredAt?.trim()) continue;
    const suggested = suggestedRegistrationMonth(row);
    if (suggested) suggestions[row.key] = suggested;
  }
  return suggestions;
}

function rowSavePayloadMatches(left: OrderBoardRow, right: OrderBoardRow) {
  return JSON.stringify(buildRowSavePayload(left)) === JSON.stringify(buildRowSavePayload(right));
}

function effectiveSavableOverrides(
  row: OrderBoardRow,
  patch: Record<string, string> | undefined,
  autoSuggestedRegistration: Record<string, string>
) {
  const meaningful = meaningfulOverrides(row, patch, autoSuggestedRegistration);
  if (!meaningful) return undefined;
  const withPatch = applyRowOverrides(row, meaningful);
  return rowSavePayloadMatches(row, withPatch) ? undefined : meaningful;
}

function pruneNoOpOverrides(
  serverRows: OrderBoardRow[],
  overrides: Record<string, Record<string, string>>,
  autoSuggestedRegistration: Record<string, string>
) {
  const pruned: Record<string, Record<string, string>> = {};
  for (const row of serverRows) {
    const effective = effectiveSavableOverrides(row, overrides[row.key], autoSuggestedRegistration);
    if (effective) pruned[row.key] = effective;
  }
  return pruned;
}

function applyDisplayOverrides(
  row: OrderBoardRow,
  patch: Record<string, string> | undefined,
  autoSuggestedRegistration: Record<string, string>
) {
  const merged = applyRowOverrides(row, patch);
  const suggested = autoSuggestedRegistration[row.key];
  if (
    suggested &&
    !patch?.registeredAt &&
    isRegistrationPending(row) &&
    isRegistrationEligible(row) &&
    !row.registration?.registeredAt?.trim()
  ) {
    return { ...merged, registeredAt: suggested };
  }
  return merged;
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

function columnValue(row: OrderBoardRow, column: Column, isLeaderViewer = false) {
  if (column.key === "note" && isLeaderViewer) {
    const privateNote = (row as unknown as Record<string, unknown>).leaderPrivateNote;
    if (privateNote !== undefined) return String(privateNote);
    return row.leaderPrivateNote ?? "";
  }
  const override = (row as unknown as Record<string, unknown>)[column.key];
  if (column.key === "orderAmount") {
    const unitPrice = Number(row.unitPrice) || 0;
    const quantity = Number(row.quantity) || 0;
    if (unitPrice && quantity) return roundMoney(unitPrice * quantity);
    if (hasOverrideValue(override)) return Number(override) || 0;
    return column.value(row);
  }
  if (shipmentDerivedKeys.has(column.key) && row.shipments.length) {
    if (column.key === "etd") return resolveEtdColumnValue(row, override);
    if (override !== undefined) return override as string | number;
    return column.value(row);
  }
  if (paymentDerivedKeys.has(column.key) && row.payments.length) {
    if (override !== undefined) return override as string | number;
    return column.value(row);
  }
  if (column.key === "registeredAt") return resolveRegisteredAtValue(row);
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
    incoterms: "",
    transport: "",
    destinationPort: "",
    shipments: [],
    payments: [],
    note: "",
    leaderNote: "",
    leaderPrivateNote: ""
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

function pickMergeTarget(
  candidates: OrderBoardRow[] | undefined,
  options: { productionNo?: string; amount?: number }
) {
  if (!candidates?.length) return null;
  if (options.productionNo) {
    const targetProd = normalizeOrderRef(options.productionNo);
    const byProd = candidates.find((row) => normalizeOrderRef(row.productionRequestNo) === targetProd);
    if (byProd) return byProd;
  }
  if (candidates.length === 1) return candidates[0];
  if (options.amount !== undefined) {
    for (const row of candidates) {
      if (Math.abs(orderAmountTotal(row) - options.amount) < 0.01) return row;
    }
    for (const row of candidates) {
      const shipped = row.shipments.reduce((sum, item) => sum + item.amount, 0);
      if (Math.abs(shipped - options.amount) < 0.01) return row;
    }
  }
  return null;
}

function mergeOrphanPaymentRows(allRows: OrderBoardRow[]): OrderBoardRow[] {
  const rows = allRows.map((row) => ({ ...row, payments: [...row.payments], shipments: [...row.shipments] }));
  const targetByPi = new Map<string, OrderBoardRow[]>();
  const targetByProd = new Map<string, OrderBoardRow>();
  const targetByInv = new Map<string, OrderBoardRow[]>();
  for (const row of rows) {
    if (!row.key.startsWith("entry:")) continue;
    const pi = normalizeOrderRef(row.piNo);
    if (pi) targetByPi.set(pi, [...(targetByPi.get(pi) ?? []), row]);
    const productionNo = normalizeOrderRef(row.productionRequestNo);
    if (productionNo) targetByProd.set(productionNo, row);
    for (const shipment of row.shipments) {
      const inv = normalizeOrderRef(shipment.invNo);
      if (inv) targetByInv.set(inv, [...(targetByInv.get(inv) ?? []), row]);
    }
  }

  const removeKeys = new Set<string>();
  for (const row of rows) {
    const isOrphan =
      row.key.startsWith("pi:") ||
      row.key.startsWith("prod:") ||
      row.key.startsWith("inv:") ||
      row.key.startsWith("misc:");
    if (!isOrphan) continue;

    const prodFromKey = row.key.startsWith("prod:") ? normalizeOrderRef(row.key.slice(5)) : "";
    const piFromKey = row.key.startsWith("pi:") ? normalizeOrderRef(row.key.slice(3)) : "";
    const invFromKey = row.key.startsWith("inv:") ? normalizeOrderRef(row.key.slice(4)) : "";
    const productionNo = normalizeOrderRef(row.productionRequestNo) || prodFromKey;
    const orphanAmount =
      row.payments.reduce((sum, item) => sum + item.amount, 0) ||
      row.shipments.reduce((sum, item) => sum + item.amount, 0) ||
      orderAmountTotal(row);

    const target =
      (productionNo ? targetByProd.get(productionNo) : undefined) ??
      pickMergeTarget(targetByPi.get(piFromKey || normalizeOrderRef(row.piNo)), { productionNo, amount: orphanAmount }) ??
      pickMergeTarget(targetByInv.get(invFromKey), { productionNo, amount: orphanAmount }) ??
      pickMergeTarget(
        targetByInv.get(normalizeOrderRef(row.shipments[0]?.invNo)),
        { productionNo, amount: orphanAmount }
      );
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
    target.payments = dedupeBoardPayments(target.payments);

    for (const shipment of row.shipments) {
      const duplicate = target.shipments.some(
        (existing) =>
          normalizeLedgerDate(existing.etd) === normalizeLedgerDate(shipment.etd) &&
          Math.abs(existing.amount - shipment.amount) < 0.01 &&
          existing.quantity === shipment.quantity
      );
      if (!duplicate) target.shipments.push(shipment);
    }
    target.shipments = reconcileBoardShipments(target.shipments);

    removeKeys.add(row.key);
  }
  return rows.filter((row) => !removeKeys.has(row.key));
}

function buildRowSavePayload(row: OrderBoardRow) {
  const patch = row as Record<string, unknown>;
  const ledgerPayments = row.payments.filter((payment) => !payment.paymentId);
  const reconciledShipments = reconcileBoardShipments(row.shipments);
  let ledgerShipments = reconciledShipments.filter((shipment) => !shipment.shipmentId);
  const hasShipmentPatch = [...shipmentDerivedKeys].some((key) => patch[key] !== undefined);
  if (hasShipmentPatch && ledgerShipments.length) {
    const base = ledgerShipments[0];
    ledgerShipments = [
      {
        ...base,
        invNo: patch.invNo !== undefined ? String(patch.invNo) : base.invNo,
        etd: patch.etd !== undefined ? String(patch.etd) : base.etd,
        lotNo: patch.lotNo !== undefined ? String(patch.lotNo) : base.lotNo,
        quantity: patch.shipmentQuantity !== undefined ? Number(patch.shipmentQuantity) || 0 : base.quantity,
        focQuantity: patch.shipmentFocQuantity !== undefined ? Number(patch.shipmentFocQuantity) || 0 : base.focQuantity,
        amount: patch.shipmentAmount !== undefined ? Number(patch.shipmentAmount) || 0 : base.amount
      }
    ];
  }
  const shipmentAmount = ledgerShipments.reduce((sum, shipment) => sum + shipment.amount, 0);
  const paymentAmount = ledgerPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const type = ledgerPayments[0]?.type ?? "";
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
    leaderNote: String(patch.leaderNote ?? row.leaderNote ?? ""),
    leaderPrivateNote: String(patch.leaderPrivateNote ?? row.leaderPrivateNote ?? ""),
    invNo: String(patch.invNo ?? ledgerShipments.map((item) => item.invNo).filter(Boolean).join(", ")),
    etd: String(patch.etd ?? (ledgerShipments.length > 1 ? "" : ledgerShipments[0]?.etd ?? "")),
    lotNo: String(patch.lotNo ?? ledgerShipments.map((item) => item.lotNo).filter(Boolean).join(", ")),
    shipmentQuantity: String(patch.shipmentQuantity ?? (ledgerShipments.reduce((sum, item) => sum + item.quantity, 0) || "")),
    shipmentFocQuantity: String(patch.shipmentFocQuantity ?? (ledgerShipments.reduce((sum, item) => sum + item.focQuantity, 0) || "")),
    shipmentAmount: String(patch.shipmentAmount ?? (shipmentAmount || "")),
    paymentType: String(patch.paymentType ?? type),
    paymentDate: String(patch.paymentDate ?? (ledgerPayments.length > 1 ? "" : ledgerPayments[0]?.date ?? "")),
    paymentAmount: String(patch.paymentAmount ?? (paymentAmount || "")),
    ...(ledgerShipments.length > 1 ? { shipmentLinesJson: JSON.stringify(ledgerShipments) } : {}),
    ...(ledgerPayments.length > 1
      ? {
          paymentLinesJson: JSON.stringify(
            ledgerPayments.map((item) => ({ type: item.type, date: item.date, amount: item.amount, source: item.source || "수동" }))
          )
        }
      : {})
  };
}

function meaningfulOverrides(
  row: OrderBoardRow,
  patch: Record<string, string> | undefined,
  autoSuggestedRegistration: Record<string, string>
) {
  if (!patch) return undefined;
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (key === "registeredAt" && autoSuggestedRegistration[row.key] === value.trim()) continue;
    filtered[key] = value;
  }
  return Object.keys(filtered).length ? filtered : undefined;
}

function hasSavableBoardChanges(
  serverRows: OrderBoardRow[],
  overrides: Record<string, Record<string, string>>,
  deletedKeys: string[],
  localRows: OrderBoardRow[],
  autoSuggestedRegistration: Record<string, string>
) {
  if (deletedKeys.some((key) => serverRows.some((row) => row.key === key))) return true;
  return collectChangedSaveRows(serverRows, overrides, deletedKeys, localRows, autoSuggestedRegistration).length > 0;
}

function collectChangedSaveRows(
  serverRows: OrderBoardRow[],
  overrides: Record<string, Record<string, string>>,
  deletedKeys: string[],
  localRows: OrderBoardRow[],
  autoSuggestedRegistration: Record<string, string>
) {
  const serverPayloads = new Map(serverRows.map((row) => [row.key, JSON.stringify(buildRowSavePayload(row))]));
  const changed: OrderBoardRow[] = [];

  for (const row of localRows) {
    if (deletedKeys.includes(row.key)) continue;
    changed.push(row);
  }

  for (const serverRow of serverRows) {
    if (deletedKeys.includes(serverRow.key)) continue;
    const effective = effectiveSavableOverrides(serverRow, overrides[serverRow.key], autoSuggestedRegistration);
    const merged = applyRowOverrides(serverRow, effective);
    const payload = JSON.stringify(buildRowSavePayload(merged));
    if (payload !== serverPayloads.get(serverRow.key)) changed.push(merged);
  }

  return changed.filter((row) => !row.key.startsWith("pi:") && !row.key.startsWith("prod:") && !row.key.startsWith("inv:") && !row.key.startsWith("misc:"));
}

function SyncedHorizontalScrollbar({ targetRef }: { targetRef: RefObject<HTMLDivElement | null> }) {
  const barRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false);
  const [metrics, setMetrics] = useState({ scrollWidth: 0, clientWidth: 0 });

  useEffect(() => {
    const target = targetRef.current;
    const bar = barRef.current;
    if (!target || !bar) return;

    const updateMetrics = () => {
      setMetrics({
        scrollWidth: target.scrollWidth,
        clientWidth: target.clientWidth
      });
      bar.scrollLeft = target.scrollLeft;
    };

    const onTargetScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      bar.scrollLeft = target.scrollLeft;
      syncingRef.current = false;
    };

    const onBarScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      target.scrollLeft = bar.scrollLeft;
      syncingRef.current = false;
    };

    updateMetrics();
    const resizeObserver = new ResizeObserver(updateMetrics);
    resizeObserver.observe(target);
    const table = target.querySelector("table");
    if (table) resizeObserver.observe(table);

    target.addEventListener("scroll", onTargetScroll, { passive: true });
    bar.addEventListener("scroll", onBarScroll, { passive: true });
    window.addEventListener("resize", updateMetrics);

    return () => {
      resizeObserver.disconnect();
      target.removeEventListener("scroll", onTargetScroll);
      bar.removeEventListener("scroll", onBarScroll);
      window.removeEventListener("resize", updateMetrics);
    };
  }, [targetRef]);

  const scrollable = metrics.scrollWidth > metrics.clientWidth + 1;

  return (
    <div
      ref={barRef}
      className={`ocb-h-scrollbar shrink-0 border-t border-slate-200 bg-slate-50 ${scrollable ? "" : "pointer-events-none opacity-50"}`}
      aria-hidden={!scrollable}
    >
      <div style={{ width: Math.max(metrics.scrollWidth, metrics.clientWidth), height: 1 }} />
    </div>
  );
}

function BuyerOrderScrollPane({
  frozenHeader,
  scrollableHeader,
  frozenBody,
  scrollableBody,
  zoom,
  onZoomChange,
  tableWidth,
  layoutKey
}: {
  frozenHeader: ReactNode;
  scrollableHeader: ReactNode;
  frozenBody: ReactNode;
  scrollableBody: ReactNode;
  zoom: number;
  onZoomChange: (zoom: number) => void;
  tableWidth: number;
  layoutKey?: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const verticalScrollRef = useRef<HTMLDivElement>(null);
  const headerHorizontalScrollRef = useRef<HTMLDivElement>(null);
  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const zoomRef = useRef(zoom);
  const minZoomRef = useRef(1);
  zoomRef.current = zoom;

  const syncRowSpanWidth = () => {
    const frozenTable = shellRef.current?.querySelector("[data-frozen-body]") as HTMLElement | null;
    const scrollTable = horizontalScrollRef.current?.querySelector("table");
    if (!frozenTable || !scrollTable) return;
    const spanWidth = frozenTable.offsetWidth + scrollTable.scrollWidth;
    frozenTable.style.setProperty("--order-row-span", `${spanWidth}px`);
    horizontalScrollRef.current?.style.setProperty("--order-row-span", `${spanWidth}px`);
  };

  const syncRowHeights = useCallback(() => {
    const frozenBody = shellRef.current?.querySelector("[data-frozen-body] tbody");
    const scrollBody = horizontalScrollRef.current?.querySelector("tbody");
    if (!frozenBody || !scrollBody) return;

    const frozenRows = frozenBody.querySelectorAll<HTMLTableRowElement>("tr");
    const scrollRows = scrollBody.querySelectorAll<HTMLTableRowElement>("tr");

    scrollRows.forEach((scrollRow, index) => {
      const frozenRow = frozenRows[index];
      if (!frozenRow) return;
      frozenRow.style.height = "auto";
      frozenRow.querySelectorAll<HTMLTableCellElement>("td").forEach((cell) => {
        cell.style.height = "auto";
      });
      const height = scrollRow.getBoundingClientRect().height;
      if (height < 1) return;
      frozenRow.style.height = `${height}px`;
      frozenRow.querySelectorAll<HTMLTableCellElement>("td").forEach((cell) => {
        cell.style.height = `${height}px`;
      });
    });
  }, []);

  const scheduleRowHeightSync = useCallback(() => {
    syncRowHeights();
    requestAnimationFrame(syncRowHeights);
  }, [syncRowHeights]);

  const updateFitZoom = useCallback(() => {
    const host = shellRef.current;
    if (!host || !tableWidth) return;
    const fitZoom = Math.min(1, host.clientWidth / tableWidth);
    const nextMinZoom = Math.max(BOARD_ZOOM_ABSOLUTE_MIN, fitZoom);
    minZoomRef.current = nextMinZoom;
    if (zoomRef.current < nextMinZoom) {
      onZoomChange(nextMinZoom);
    }
  }, [onZoomChange, tableWidth]);

  useEffect(() => {
    syncRowSpanWidth();
    scheduleRowHeightSync();
    updateFitZoom();
    const resizeObserver = new ResizeObserver(() => {
      syncRowSpanWidth();
      scheduleRowHeightSync();
      updateFitZoom();
    });
    if (shellRef.current) resizeObserver.observe(shellRef.current);
    const horizontalHost = horizontalScrollRef.current;
    const scrollTable = horizontalHost?.querySelector("table");
    const scrollBody = horizontalHost?.querySelector("tbody");
    const frozenTable = shellRef.current?.querySelector("[data-frozen-body]");
    if (horizontalHost) resizeObserver.observe(horizontalHost);
    if (scrollTable) resizeObserver.observe(scrollTable);
    if (scrollBody) {
      resizeObserver.observe(scrollBody);
      scrollBody.querySelectorAll("tr").forEach((row) => resizeObserver.observe(row));
    }
    if (frozenTable) resizeObserver.observe(frozenTable);
    return () => resizeObserver.disconnect();
  }, [frozenBody, frozenHeader, scheduleRowHeightSync, scrollableBody, scrollableHeader, tableWidth, updateFitZoom, zoom]);

  useLayoutEffect(() => {
    scheduleRowHeightSync();
  }, [layoutKey, scheduleRowHeightSync, scrollableBody]);

  useEffect(() => {
    const header = headerHorizontalScrollRef.current;
    const body = horizontalScrollRef.current;
    if (!header || !body) return;
    header.scrollLeft = body.scrollLeft;
  }, [frozenBody, scrollableBody, scrollableHeader, zoom]);

  useEffect(() => {
    const header = headerHorizontalScrollRef.current;
    const body = horizontalScrollRef.current;
    if (!header || !body) return;

    const syncingRef = { current: false };
    const onBodyScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      header.scrollLeft = body.scrollLeft;
      syncingRef.current = false;
    };
    const onHeaderScroll = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      body.scrollLeft = header.scrollLeft;
      syncingRef.current = false;
    };

    body.addEventListener("scroll", onBodyScroll, { passive: true });
    header.addEventListener("scroll", onHeaderScroll, { passive: true });
    return () => {
      body.removeEventListener("scroll", onBodyScroll);
      header.removeEventListener("scroll", onHeaderScroll);
    };
  }, [frozenBody, scrollableBody, scrollableHeader]);

  useEffect(() => {
    const element = shellRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const delta = event.deltaY > 0 ? -BOARD_ZOOM_STEP : BOARD_ZOOM_STEP;
      onZoomChange(Math.min(BOARD_ZOOM_MAX, Math.max(minZoomRef.current, zoomRef.current + delta)));
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [onZoomChange]);

  return (
    <div ref={shellRef} className="flex min-h-0 flex-col border-t border-slate-100">
      <div ref={verticalScrollRef} className="ocb-buyer-scroll min-h-0 max-h-[min(60vh,calc(100vh-18rem))]">
        <div className="relative min-w-0 pl-10" style={{ zoom }}>
          <div className="sticky top-0 z-20 flex shrink-0 bg-slate-50 shadow-[0_1px_0_#e2e8f0]">
            <div
              data-frozen-header
              className={`shrink-0 bg-slate-50 ${STICKY_COLUMN_SHADOW}`}
              style={{ width: computeFrozenTableWidth() }}
            >
              {frozenHeader}
            </div>
            <div
              ref={headerHorizontalScrollRef}
              className="min-w-0 flex-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {scrollableHeader}
            </div>
          </div>
          <div className="flex min-w-0">
            <div
              data-frozen-body
              className={`shrink-0 bg-white ${STICKY_COLUMN_SHADOW}`}
              style={{ width: computeFrozenTableWidth() }}
            >
              {frozenBody}
            </div>
            <div
              ref={horizontalScrollRef}
              className="min-w-0 flex-1 overflow-x-auto overflow-y-visible [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            >
              {scrollableBody}
            </div>
          </div>
        </div>
      </div>
      <SyncedHorizontalScrollbar targetRef={horizontalScrollRef} />
    </div>
  );
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

export function OrderCountryBoard({
  owner,
  country,
  rows,
  viewerId,
  canEdit = true,
  isLeaderViewer = false,
  leaderNotesOnly = false,
  destinationPorts,
  exportProducts
}: {
  owner: string;
  country: string;
  rows: OrderBoardRow[];
  viewerId: string;
  canEdit?: boolean;
  isLeaderViewer?: boolean;
  leaderNotesOnly?: boolean;
  destinationPorts: RegisteredDestination[];
  exportProducts: ExportProductOption[];
}) {
  const userPrefsKey = `kup-orders:user:${viewerId}`;
  const sheetKey = `kup-orders:v7:${owner}:${country}`;
  const router = useRouter();
  const [hidden, setHidden] = useStoredState<string[]>(`${userPrefsKey}:hidden`, [...defaultHidden]);
  const [boardZoom, setBoardZoom] = useStoredState<number>(`${userPrefsKey}:board-zoom`, 1);
  const [completed, setCompleted] = useStoredState<string[]>(`${sheetKey}:completed`, []);
  const [selected, setSelected] = useState<string[]>([]);
  const [deletedKeys, setDeletedKeys] = useStoredState<string[]>(`${sheetKey}:deleted`, []);
  const [localRows, setLocalRows] = useStoredState<OrderBoardRow[]>(`${sheetKey}:local`, []);
  const [rowOrder, setRowOrder] = useStoredState<string[]>(`${sheetKey}:order`, []);
  const [overrides, setOverrides] = useStoredState<Record<string, Record<string, string>>>(`${sheetKey}:overrides`, {});
  const [buyerOrder, setBuyerOrder] = useStoredState<string[]>(`${sheetKey}:buyer-order`, []);
  const [openBuyers, setOpenBuyers] = useStoredState<string[]>(`${sheetKey}:buyers`, []);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"active" | "completed" | "all">("active");
  const [sort, setSort] = useStoredState<{ key: string; direction: "asc" | "desc" }>(`${userPrefsKey}:sort`, { key: "piDate", direction: "asc" });
  const [showColumns, setShowColumns] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const [columnOrder, setColumnOrder] = useStoredState<string[]>(`${userPrefsKey}:column-order`, defaultColumnOrder);
  const [draggingColumn, setDraggingColumn] = useState("");
  const [dropColumnTarget, setDropColumnTarget] = useState("");
  const draggingColumnRef = useRef("");
  const dropColumnTargetRef = useRef("");
  const [draggingKey, setDraggingKey] = useState<string | null>(null);
  const [draggingBuyer, setDraggingBuyer] = useState<string | null>(null);
  const [dropTargetBuyer, setDropTargetBuyer] = useState<string | null>(null);
  const [pendingDeleteKeys, setPendingDeleteKeys] = useState<string[] | null>(null);
  const [expandedDetails, setExpandedDetails] = useState<Set<string>>(() => new Set());
  const [saveStatus, setSaveStatus] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null);
  const [autoSuggestedRegistration, setAutoSuggestedRegistration] = useState<Record<string, string>>({});
  const dropTargetRef = useRef<string | null>(null);
  const draggingKeyRef = useRef<string | null>(null);
  const draggingBuyerRef = useRef<string | null>(null);
  const dropTargetBuyerRef = useRef<string | null>(null);

  const sourceRows = useMemo(
    () =>
      mergeOrphanPaymentRows([...rows, ...localRows]).map((row) => ({
        ...row,
        payments: dedupeBoardPayments(row.payments),
        shipments: reconcileBoardShipments(row.shipments)
      })),
    [localRows, rows]
  );

  const serverSavableRows = useMemo(
    () =>
      mergeOrphanPaymentRows(rows).map((row) => ({
        ...row,
        payments: dedupeBoardPayments(row.payments),
        shipments: reconcileBoardShipments(row.shipments)
      })),
    [rows]
  );

  useEffect(() => {
    setAutoSuggestedRegistration(computeRegistrationSuggestions(sourceRows));
  }, [sourceRows]);

  useEffect(() => {
    setOverrides((current) => {
      const pruned = pruneNoOpOverrides(serverSavableRows, current, autoSuggestedRegistration);
      return JSON.stringify(pruned) === JSON.stringify(current) ? current : pruned;
    });
  }, [autoSuggestedRegistration, serverSavableRows, setOverrides]);

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

  const changedSaveRows = useMemo(
    () => collectChangedSaveRows(serverSavableRows, overrides, deletedKeys, localRows, autoSuggestedRegistration),
    [autoSuggestedRegistration, deletedKeys, localRows, overrides, serverSavableRows]
  );

  const isDirty = useMemo(
    () => hasSavableBoardChanges(serverSavableRows, overrides, deletedKeys, localRows, autoSuggestedRegistration),
    [autoSuggestedRegistration, deletedKeys, localRows, overrides, serverSavableRows]
  );

  const displayRows = useMemo(() => {
    const rank = new Map(rowOrder.map((key, index) => [key, index]));
    return sourceRows
      .filter((row) => !deletedKeys.includes(row.key))
      .map((row) => applyDisplayOverrides(row, overrides[row.key], autoSuggestedRegistration))
      .filter((row) => status === "all" || (status === "completed") === completed.includes(row.key))
      .filter((row) => !query || Object.values(row).some((value) => String(value ?? "").toLowerCase().includes(query.toLowerCase())))
      .sort((left, right) => {
        if (rowOrder.length) {
          const leftRank = rank.get(left.key) ?? Number.MAX_SAFE_INTEGER;
          const rightRank = rank.get(right.key) ?? Number.MAX_SAFE_INTEGER;
          if (leftRank !== rightRank) return leftRank - rightRank;
        }
        const buyerCompare = (left.buyer || "").localeCompare(right.buyer || "", "ko");
        if (buyerCompare) return buyerCompare;
        if (sort.key === "piDate") {
          const sequence = compareOrdersByPiSequence(left, right);
          return sort.direction === "asc" ? sequence : -sequence;
        }
        const column = columns.find((item) => item.key === sort.key);
        const a = column ? columnValue(left as OrderBoardRow, column) : "";
        const b = column ? columnValue(right as OrderBoardRow, column) : "";
        const result = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), "ko");
        if (result) return sort.direction === "asc" ? result : -result;
        return compareOrdersByPiSequence(left, right);
      });
  }, [autoSuggestedRegistration, completed, deletedKeys, overrides, query, rowOrder, sort, sourceRows, status]);

  const allBuyers = useMemo(() => {
    const buyers = new Set<string>();
    for (const row of sourceRows) {
      if (deletedKeys.includes(row.key)) continue;
      buyers.add(row.buyer || "바이어 미입력");
    }
    return [...buyers];
  }, [deletedKeys, sourceRows]);

  const byBuyer = useMemo(() => {
    const result = new Map<string, typeof displayRows>();
    for (const row of displayRows) {
      const buyer = row.buyer || "바이어 미입력";
      result.set(buyer, [...(result.get(buyer) ?? []), row]);
    }
    return result;
  }, [displayRows]);

  useEffect(() => {
    setBuyerOrder((current) => {
      const next = ensureBuyerOrderList(current, allBuyers);
      return next.length === current.length && next.every((buyer, index) => buyer === current[index]) ? current : next;
    });
  }, [allBuyers, setBuyerOrder]);

  const orderedBuyerEntries = useMemo(() => {
    const entries = [...byBuyer.entries()];
    const order = ensureBuyerOrderList(buyerOrder, allBuyers);
    const rank = new Map(order.map((buyer, index) => [buyer, index]));
    return entries.sort(([left], [right]) => {
      const leftRank = rank.get(left) ?? Number.MAX_SAFE_INTEGER;
      const rightRank = rank.get(right) ?? Number.MAX_SAFE_INTEGER;
      if (leftRank !== rightRank) return leftRank - rightRank;
      return left.localeCompare(right, "ko");
    });
  }, [allBuyers, byBuyer, buyerOrder]);

  const allBuyersRef = useRef(allBuyers);
  allBuyersRef.current = allBuyers;
  const orderedBuyersRef = useRef(orderedBuyerEntries.map(([buyer]) => buyer));
  orderedBuyersRef.current = orderedBuyerEntries.map(([buyer]) => buyer);

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

  useEffect(() => {
    draggingBuyerRef.current = draggingBuyer;
    if (!canEdit || !draggingBuyer) return;

    function updateDropTargetFromPoint(clientX: number, clientY: number) {
      const el = document.elementFromPoint(clientX, clientY);
      const section = el?.closest<HTMLElement>("[data-buyer-section]");
      const buyer = section?.dataset.buyerSection;
      if (!buyer || buyer === draggingBuyerRef.current) return;
      dropTargetBuyerRef.current = buyer;
      setDropTargetBuyer(buyer);
    }

    function onPointerMove(event: PointerEvent) {
      updateDropTargetFromPoint(event.clientX, event.clientY);
    }

    function finishBuyerDrag(event?: PointerEvent) {
      if (event) updateDropTargetFromPoint(event.clientX, event.clientY);
      const sourceBuyer = draggingBuyerRef.current;
      const targetBuyer = dropTargetBuyerRef.current;
      if (sourceBuyer && targetBuyer && sourceBuyer !== targetBuyer) {
        setBuyerOrder((current) => {
          const fullOrder = ensureBuyerOrderList(current, allBuyersRef.current);
          const visible = orderedBuyersRef.current;
          if (visible.includes(sourceBuyer) && visible.includes(targetBuyer)) {
            const reorderedVisible = reorderKeys(visible, sourceBuyer, targetBuyer);
            return mergeVisibleBuyerReorder(fullOrder, reorderedVisible);
          }
          return reorderKeys(fullOrder, sourceBuyer, targetBuyer);
        });
      }
      setDraggingBuyer(null);
      setDropTargetBuyer(null);
      dropTargetBuyerRef.current = null;
      draggingBuyerRef.current = null;
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishBuyerDrag);
    window.addEventListener("pointercancel", finishBuyerDrag);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishBuyerDrag);
      window.removeEventListener("pointercancel", finishBuyerDrag);
    };
  }, [canEdit, draggingBuyer, setBuyerOrder]);

  const orderedColumns = useMemo(() => {
    const map = new Map(columns.map((column) => [column.key, column]));
    const ordered = columnOrder.map((key) => map.get(key)).filter(Boolean) as Column[];
    for (const column of columns) {
      if (!columnOrder.includes(column.key)) ordered.push(column);
    }
    return ordered;
  }, [columnOrder]);

  const visibleColumns = orderedColumns.filter((column) => !hidden.includes(column.key));
  const frozenTableWidth = computeFrozenTableWidth();
  const dataTableWidth = useMemo(() => computeDataTableWidth(visibleColumns), [visibleColumns]);
  const tableWidth = frozenTableWidth + dataTableWidth;

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
    if (!canEdit) return;
    if (leaderNotesOnly && columnKey !== "note" && columnKey !== "leaderNote") return;
    const mappedKey =
      isLeaderViewer && columnKey === "note"
        ? "leaderPrivateNote"
        : columnKey;
    if (mappedKey === "registeredAt") {
      setAutoSuggestedRegistration((current) => {
        if (!value.trim() || current[rowKey] !== value.trim()) {
          if (!current[rowKey]) return current;
          const next = { ...current };
          delete next[rowKey];
          return next;
        }
        return current;
      });
    }
    setOverrides((current) => {
      const patch = { ...(current[rowKey] ?? {}), [mappedKey]: value };
      return { ...current, [rowKey]: patchWithOrderAmount(rowKey, patch, sourceRows, current) };
    });
  }

  function completeRows(keys: string[]) {
    if (!canEdit || leaderNotesOnly) return;
    setCompleted((current) => [...new Set([...current, ...keys])]);
    setSelected((current) => current.filter((key) => !keys.includes(key)));
  }

  function deleteRows(keys: string[]) {
    if (!canEdit || leaderNotesOnly) return;
    setDeletedKeys((current) => [...new Set([...current, ...keys])]);
    setLocalRows((current) => current.filter((row) => !keys.includes(row.key)));
    setSelected((current) => current.filter((key) => !keys.includes(key)));
    setCompleted((current) => current.filter((key) => !keys.includes(key)));
  }

  function requestDeleteRows(keys: string[]) {
    if (!keys.length) return;
    setPendingDeleteKeys(keys);
  }

  function confirmDeleteRows() {
    if (!pendingDeleteKeys?.length) return;
    deleteRows(pendingDeleteKeys);
    setPendingDeleteKeys(null);
  }

  function insertRowAt(buyer: string, afterKey?: string) {
    if (!canEdit || leaderNotesOnly) return;
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

  async function submitBulkSave(): Promise<boolean> {
    const rowsToSave = changedSaveRows;
    if (!rowsToSave.length) {
      return true;
    }
    setIsSaving(true);
    setSaveStatus("저장 중...");
    try {
      const formData = new FormData();
      formData.set("owner", owner);
      formData.set("sheet", country);
      formData.set("rowsPayload", JSON.stringify(rowsToSave.map((row) => buildRowSavePayload(row))));
      const result = await saveAllOrderBoardRowsAction(formData);
      if (result?.ok) {
        setOverrides((current) => {
          const savedKeys = new Set(rowsToSave.map((row) => row.key));
          const next: Record<string, Record<string, string>> = {};
          for (const [key, patch] of Object.entries(current)) {
            if (!savedKeys.has(key)) next[key] = patch;
          }
          return next;
        });
        setLocalRows((current) => current.filter((row) => !rowsToSave.some((saved) => saved.key === row.key)));
        setSaveStatus("저장됨");
        router.refresh();
        return true;
      }
      setSaveStatus("저장 실패");
      return false;
    } catch {
      setSaveStatus("저장 실패");
      return false;
    } finally {
      setIsSaving(false);
      window.setTimeout(() => setSaveStatus(""), 2000);
    }
  }

  const discardChanges = useCallback(() => {
    setOverrides({});
    setLocalRows([]);
    setDeletedKeys([]);
  }, [setDeletedKeys, setLocalRows, setOverrides]);

  const saveRef = useRef(submitBulkSave);
  const discardRef = useRef(discardChanges);
  saveRef.current = submitBulkSave;
  discardRef.current = discardChanges;

  useEffect(() => {
    if (!canEdit || !changedSaveRows.length || isSaving) return;
    const timer = window.setTimeout(() => {
      void saveRef.current();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [canEdit, changedSaveRows, isSaving]);

  useEffect(() => {
    registerOrderUnsavedGuard(
      canEdit && isDirty
        ? {
            isDirty: true,
            save: () => saveRef.current(),
            discard: () => discardRef.current()
          }
        : null
    );
    return () => registerOrderUnsavedGuard(null);
  }, [canEdit, isDirty]);

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
      <div className={`panel sticky top-14 z-40 flex flex-wrap items-center justify-between gap-3 p-3 shadow-sm ${showColumns ? "z-[200]" : ""}`}>
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
          {isSaving ? (
            <span className="text-xs font-medium text-slate-500">자동 저장 중...</span>
          ) : saveStatus ? (
            <span className={`text-xs font-medium ${saveStatus === "저장 실패" ? "text-red-600" : "text-emerald-600"}`}>{saveStatus}</span>
          ) : null}
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

      {orderedBuyerEntries.map(([buyer, buyerRows]) => {
        const open = openBuyers.includes(buyer);
        const buyerSelected = buyerRows.filter((row) => selected.includes(row.key));
        const shipmentEligible = buyerSelected.filter((row) => !row.shipments.length);
        const canCreateShipment = shipmentEligible.length > 0 && shipmentEligible.length === buyerSelected.length;
        return (
          <section
            key={buyer}
            data-buyer-section={buyer}
            className={`panel overflow-hidden ${draggingBuyer === buyer ? "opacity-50" : ""} ${
              dropTargetBuyer === buyer && draggingBuyer && draggingBuyer !== buyer ? "ring-2 ring-blue-300" : ""
            }`}
          >
            <div className="flex items-center justify-between gap-3 bg-white px-4 py-3 hover:bg-slate-50">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                {canEdit && !leaderNotesOnly ? (
                  <button
                    type="button"
                    data-buyer-drag-handle
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      try {
                        event.currentTarget.setPointerCapture(event.pointerId);
                      } catch {
                        // Some browsers may reject capture mid-gesture.
                      }
                      draggingBuyerRef.current = buyer;
                      dropTargetBuyerRef.current = buyer;
                      setDraggingBuyer(buyer);
                      setDropTargetBuyer(buyer);
                    }}
                    className="inline-flex shrink-0 cursor-grab touch-none select-none items-center justify-center text-slate-300 hover:text-slate-500 active:cursor-grabbing"
                    title="드래그하여 거래처 순서 변경"
                  >
                    <GripVertical className="pointer-events-none h-4 w-4" />
                  </button>
                ) : (
                  <span className="inline-flex h-4 w-4 shrink-0" />
                )}
                <button type="button" className="flex min-w-0 flex-1 items-center gap-2 text-left font-semibold text-slate-900" onClick={() => toggleBuyer(buyer)}>
                  {open ? <ChevronDown className="h-4 w-4 shrink-0 text-blue-600" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                  <span className="truncate">{buyer}</span>
                  <span className="text-xs font-normal text-slate-400">{buyerRows.length}건</span>
                </button>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canEdit && !leaderNotesOnly && buyerSelected.length ? (
                  <>
                    <span className="text-xs text-slate-500">{buyerSelected.length}건 선택</span>
                    <button type="button" className="btn px-2 py-1 text-xs" onClick={() => completeRows(buyerSelected.map((row) => row.key))}>완료</button>
                    {canCreateShipment ? (
                      <>
                        <button
                          type="button"
                          className="btn px-2 py-1 text-xs"
                          onClick={() => openCombinedShipmentFromOrders(shipmentEligible, country, destinationPorts, exportProducts)}
                        >
                          선적의뢰
                        </button>
                        {shipmentEligible.length > 1 ? (
                          <button
                            type="button"
                            className="btn px-2 py-1 text-xs"
                            onClick={() => openIndividualShipmentsFromOrders(shipmentEligible, country, destinationPorts, exportProducts)}
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
                    <button type="button" className="btn px-2 py-1 text-xs text-red-700" onClick={() => requestDeleteRows(buyerSelected.map((row) => row.key))}>삭제</button>
                  </>
                ) : null}
                <span className="text-xs text-slate-400">오더 {formatMoneyDisplay(buyerRows.reduce((sum, row) => sum + Number(row.orderAmount || 0), 0), buyerRows[0]?.currency || "USD")}</span>
              </div>
            </div>
            {open ? (
              <BuyerOrderScrollPane
                zoom={boardZoom}
                onZoomChange={setBoardZoom}
                tableWidth={tableWidth}
                layoutKey={[...expandedDetails].sort().join("|")}
                frozenHeader={
                  <table className="table-fixed border-separate border-spacing-0 text-left text-xs text-slate-500" style={{ width: frozenTableWidth }}>
                    <colgroup>
                      <col style={{ width: GRIP_COLUMN_WIDTH }} />
                      <col style={{ width: SELECT_COLUMN_WIDTH }} />
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50">
                        <th
                          className="bg-slate-50 align-middle px-2 py-2 text-center"
                          style={{ width: GRIP_COLUMN_WIDTH, minWidth: GRIP_COLUMN_WIDTH, maxWidth: GRIP_COLUMN_WIDTH }}
                        >
                          <GripVertical className="mx-auto h-4 w-4" />
                        </th>
                        <th
                          className="bg-slate-50 align-middle px-2 py-2 text-center"
                          style={{ width: SELECT_COLUMN_WIDTH, minWidth: SELECT_COLUMN_WIDTH, maxWidth: SELECT_COLUMN_WIDTH }}
                        >
                          선택
                        </th>
                      </tr>
                    </thead>
                  </table>
                }
                scrollableHeader={
                  <table className="table-fixed border-separate border-spacing-0 text-left text-xs text-slate-500" style={{ width: dataTableWidth }}>
                    <colgroup>
                      {visibleColumns.map((column) => (
                        <col key={column.key} style={{ width: column.width }} />
                      ))}
                    </colgroup>
                    <thead>
                      <tr className="bg-slate-50">
                        {visibleColumns.map((column) => (
                          <th
                            key={column.key}
                            style={{ width: column.width }}
                            className={`relative bg-slate-50 align-middle whitespace-nowrap px-3 py-2 text-center ${
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
                      </tr>
                    </thead>
                  </table>
                }
                frozenBody={
                  <table className="ocb-frozen-rows table-fixed border-separate border-spacing-0 text-left text-xs" style={{ width: frozenTableWidth }}>
                    <colgroup>
                      <col style={{ width: GRIP_COLUMN_WIDTH }} />
                      <col style={{ width: SELECT_COLUMN_WIDTH }} />
                    </colgroup>
                    <tbody onDragStartCapture={(event) => event.preventDefault()}>
                      {buyerRows.map((row) => (
                        <OrderEditableRow
                          key={row.key}
                          part="frozen"
                          row={row as OrderBoardRow}
                          columns={visibleColumns}
                          completed={completed.includes(row.key)}
                          selected={selected.includes(row.key)}
                          expandedDetails={expandedDetails}
                          dragging={draggingKey === row.key}
                          dropTarget={Boolean(draggingKey && dropTargetKey === row.key && draggingKey !== row.key)}
                          canEdit={canEdit}
                          isLeaderViewer={isLeaderViewer}
                          leaderNotesOnly={leaderNotesOnly}
                          onSelect={() => toggleSelect(row.key)}
                          onToggleDetail={toggleDetailGroup}
                          onChange={updateCell}
                          autoSuggestedRegistration={autoSuggestedRegistration}
                          onInsertAfter={() => insertRowAt(buyer, row.key)}
                          onGripPointerDown={() => {
                            if (!canEdit || leaderNotesOnly) return;
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
                      ))}
                    </tbody>
                  </table>
                }
                scrollableBody={
                  <table className="ocb-scroll-rows table-fixed border-separate border-spacing-0 text-left text-xs" style={{ width: dataTableWidth }}>
                    <colgroup>
                      {visibleColumns.map((column) => (
                        <col key={column.key} style={{ width: column.width }} />
                      ))}
                    </colgroup>
                    <tbody onDragStartCapture={(event) => event.preventDefault()}>
                      {buyerRows.map((row) => (
                        <OrderEditableRow
                          key={row.key}
                          part="scroll"
                          row={row as OrderBoardRow}
                          columns={visibleColumns}
                          completed={completed.includes(row.key)}
                          selected={selected.includes(row.key)}
                          expandedDetails={expandedDetails}
                          dragging={draggingKey === row.key}
                          dropTarget={Boolean(draggingKey && dropTargetKey === row.key && draggingKey !== row.key)}
                          canEdit={canEdit}
                          isLeaderViewer={isLeaderViewer}
                          leaderNotesOnly={leaderNotesOnly}
                          onSelect={() => toggleSelect(row.key)}
                          onToggleDetail={toggleDetailGroup}
                          onChange={updateCell}
                          autoSuggestedRegistration={autoSuggestedRegistration}
                          onInsertAfter={() => insertRowAt(buyer, row.key)}
                          onGripPointerDown={() => {
                            if (!canEdit || leaderNotesOnly) return;
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
                      ))}
                    </tbody>
                  </table>
                }
              />
            ) : null}
          </section>
        );
      })}
      {!displayRows.length ? <div className="panel p-10 text-center text-sm text-slate-500">{country}에서 표시할 오더가 없습니다.</div> : null}

      {pendingDeleteKeys ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div className="panel w-full max-w-sm p-5">
            <p className="text-base font-semibold text-slate-950">정말 삭제하시겠습니까?</p>
            <p className="mt-2 text-sm text-slate-600">선택한 오더 {pendingDeleteKeys.length}건이 목록에서 제거됩니다.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setPendingDeleteKeys(null)}>
                취소
              </button>
              <button type="button" className="btn-primary bg-red-600 hover:bg-red-700" onClick={confirmDeleteRows}>
                삭제
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function OrderEditableRow({
  part,
  row,
  columns,
  completed,
  selected,
  expandedDetails,
  dragging,
  dropTarget,
  canEdit,
  isLeaderViewer = false,
  leaderNotesOnly = false,
  onSelect,
  onToggleDetail,
  onChange,
  autoSuggestedRegistration,
  onInsertAfter,
  onGripPointerDown,
  onRowPointerEnter,
  owner,
  country
}: {
  part: "frozen" | "scroll";
  row: OrderBoardRow;
  columns: Column[];
  completed: boolean;
  selected: boolean;
  expandedDetails: Set<string>;
  dragging: boolean;
  dropTarget: boolean;
  canEdit: boolean;
  isLeaderViewer?: boolean;
  leaderNotesOnly?: boolean;
  onSelect: () => void;
  onToggleDetail: (rowKey: string, group: "payment" | "shipment") => void;
  onChange: (rowKey: string, columnKey: string, value: string) => void;
  autoSuggestedRegistration: Record<string, string>;
  onInsertAfter: () => void;
  onGripPointerDown: () => void;
  onRowPointerEnter: () => void;
  owner: string;
  country: string;
}) {
  const rowExpanded = [...expandedDetails].some((key) => key.startsWith(`${row.key}:`));
  const surfaceClass = rowSurfaceClass({ dragging, dropTarget, rowExpanded, completed, selected });

  if (part === "frozen") {
    return (
      <tr
        data-order-row={row.key}
        onPointerEnter={onRowPointerEnter}
        className={`group/row relative border-b border-slate-100 align-top ${dragging ? "opacity-50" : ""} ${surfaceClass}`}
      >
        <td
          className={`relative h-full align-top px-2 py-2 ${surfaceClass}`}
          style={{ width: GRIP_COLUMN_WIDTH, minWidth: GRIP_COLUMN_WIDTH, maxWidth: GRIP_COLUMN_WIDTH }}
        >
          <div className="flex min-h-9 h-full items-center justify-center">
            {canEdit && !leaderNotesOnly ? (
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
            ) : null}
          </div>
          {canEdit && !leaderNotesOnly ? (
            <div className="pointer-events-none absolute bottom-0 left-0 z-30 h-3 -translate-y-1/2" style={{ width: "var(--order-row-span, 100%)" }}>
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
          ) : null}
        </td>
        <td
          className={`h-full align-top px-2 py-2 ${surfaceClass}`}
          style={{ width: SELECT_COLUMN_WIDTH, minWidth: SELECT_COLUMN_WIDTH, maxWidth: SELECT_COLUMN_WIDTH }}
        >
          <div className="flex min-h-9 h-full items-center justify-center">
            {canEdit ? (
              <input type="checkbox" checked={selected} onChange={onSelect} onClick={(event) => event.stopPropagation()} className="h-4 w-4" />
            ) : null}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr
      data-order-row={row.key}
      onPointerEnter={onRowPointerEnter}
      className={`group/row relative border-b border-slate-100 align-top ${dragging ? "opacity-50" : ""} ${surfaceClass}`}
    >
      {columns.map((column) => (
        <td key={column.key} style={{ width: column.width }} className={`overflow-visible align-top px-3 py-2 ${surfaceClass} ${columnAlignClass(column.key)}`}>
          <div className={`flex h-full min-h-9 w-full items-center ${columnFlexClass(column.key)}`}>
            <Cell
              row={row}
              column={column}
              expandedDetails={expandedDetails}
              canEdit={canEdit}
              isLeaderViewer={isLeaderViewer}
              leaderNotesOnly={leaderNotesOnly}
              onChange={onChange}
              onToggleDetail={onToggleDetail}
              autoSuggestedRegistration={autoSuggestedRegistration}
              owner={owner}
              country={country}
            />
          </div>
        </td>
      ))}
    </tr>
  );
}

function RegistrationFormFields({
  row,
  owner,
  country,
  registeredAt,
  amount
}: {
  row: OrderBoardRow;
  owner: string;
  country: string;
  registeredAt: string;
  amount: number;
}) {
  return (
    <>
      <input type="hidden" name="owner" value={owner} />
      <input type="hidden" name="sheet" value={country} />
      <input type="hidden" name="orderKey" value={row.key} />
      <input type="hidden" name="exportCountry" value={row.exportCountry} />
      <input type="hidden" name="buyer" value={row.buyer} />
      <input type="hidden" name="piNo" value={row.piNo} />
      <input type="hidden" name="productionRequestNo" value={row.productionRequestNo} />
      <input type="hidden" name="registeredAt" value={yearMonthToFormDate(registeredAt)} />
      <input type="hidden" name="amount" value={amount} />
      <input type="hidden" name="note" value={row.note} />
    </>
  );
}

function RegistrationDateCell({
  row,
  value,
  owner,
  country,
  canEdit,
  autoSuggestedRegistration,
  onChange
}: {
  row: OrderBoardRow;
  value: string;
  owner: string;
  country: string;
  canEdit: boolean;
  autoSuggestedRegistration: Record<string, string>;
  onChange: (rowKey: string, columnKey: string, value: string) => void;
}) {
  const pending = isRegistrationPending(row);
  const eligible = isRegistrationEligible(row);
  const shipmentAmount = row.shipments.reduce((sum, shipment) => sum + shipment.amount, 0);
  const paymentAmount = row.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const type = row.payments[0]?.type ?? "";
  const suggestedAmount = type === "T/T" ? row.orderAmount : type === "L/C" ? paymentAmount : shipmentAmount;
  const displayValue = String(value ?? "");
  const autoSuggested = autoSuggestedRegistration[row.key] === displayValue.trim();
  const showCheck = canEdit && pending && eligible && autoSuggested && Boolean(displayValue.trim());

  return (
    <div className="flex h-full min-h-9 w-full min-w-[112px] items-center gap-1" data-no-row-expand>
      {canEdit ? (
        <input
          value={displayValue}
          onChange={(event) => onChange(row.key, "registeredAt", event.target.value)}
          draggable={false}
          data-no-row-expand
          onDragStart={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          style={{ WebkitUserDrag: "none" } as CSSProperties}
          className={`${inlineInputClass("registeredAt")} min-w-0 flex-1 select-text text-center ${
            showCheck ? "font-semibold text-red-600" : "text-slate-900"
          }`}
        />
      ) : (
        <span className={`${cellLineClass("registeredAt")} select-text`}>
          {displayValue || "-"}
        </span>
      )}
      {showCheck ? (
        <form action={registerSalesOrderAction} className="shrink-0" data-no-row-expand>
          <RegistrationFormFields row={row} owner={owner} country={country} registeredAt={displayValue} amount={row.registration?.amount ?? suggestedAmount} />
          <button
            type="submit"
            className="inline-flex h-7 w-7 items-center justify-center rounded border border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
            title="수주일자 등록"
          >
            <Check className="h-4 w-4" />
          </button>
        </form>
      ) : null}
    </div>
  );
}

function Cell({
  row,
  column,
  expandedDetails,
  canEdit,
  isLeaderViewer = false,
  leaderNotesOnly = false,
  onChange,
  onToggleDetail,
  autoSuggestedRegistration,
  owner,
  country
}: {
  row: OrderBoardRow;
  column: Column;
  expandedDetails: Set<string>;
  canEdit: boolean;
  isLeaderViewer?: boolean;
  leaderNotesOnly?: boolean;
  onChange: (rowKey: string, columnKey: string, value: string) => void;
  onToggleDetail: (rowKey: string, group: "payment" | "shipment") => void;
  autoSuggestedRegistration: Record<string, string>;
  owner: string;
  country: string;
}) {
  const value = columnValue(row, column, isLeaderViewer);
  const editable =
    canEdit &&
    (
      leaderNotesOnly
        ? column.key === "note" || column.key === "leaderNote"
        : (
          [
            "piDate", "piNo", "productionRequestNo", "productName", "unitPrice", "quantity", "orderFocQuantity",
            "invNo", "etd", "lotNo", "note", "shipmentQuantity", "shipmentFocQuantity", "shipmentAmount", "paymentDate", "paymentAmount"
          ].includes(column.key) ||
          (column.key === "leaderNote" && isLeaderViewer)
        )
    );
  const currency = row.currency || "USD";
  const multiSummary = isMultiSummaryColumn(column.key, row) || (column.key === "etd" && row.shipments.length > 1);
  const group = multiSummaryFocus(column.key) ?? (column.key === "etd" && row.shipments.length > 1 ? "shipment" : null);
  const linkedCell = column.key === "etd" && row.shipments.length > 1 ? null : getSingleLinkedCell(row, column.key, currency);

  if (multiSummary && group) {
    const summary = getMultiCollapsedSummary(row, column.key, currency);
    const expanded = isDetailExpanded(expandedDetails, row.key, group);
    const lines = expanded ? getMultiDetailLines(row, column.key, currency) : [];
    const showCountSummary = Boolean(summary.count) && (!expanded || summary.count.includes("건"));
    const showTotalSummary = Boolean(summary.total) && isShipmentTotalColumn(column.key);

    return (
      <div data-no-row-expand className={`flex h-full w-full min-h-9 flex-col justify-center gap-1 overflow-visible py-0.5 text-xs ${metricCellPaddingClass(column.key)} ${multiSummaryAlignClass(column.key)}`}>
        {showCountSummary || showTotalSummary ? (
          <button
            type="button"
            onClick={() => onToggleDetail(row.key, group)}
            title={
              column.key === "etd" && row.shipments.length > 1
                ? "클릭하여 선적일 전체 보기"
                : summary.count?.includes("건")
                  ? `${summary.count} - 클릭하여 펼치기`
                  : undefined
            }
            className={`w-full hover:opacity-80 ${multiSummaryAlignClass(column.key)}`}
          >
            {showCountSummary ? (
              <div
                className={`${cellLineClass(column.key)} ${
                  summary.count.includes("건")
                    ? multiSummaryClass
                    : `font-medium text-slate-900 ${isDateColumn(column.key) ? "whitespace-nowrap" : "whitespace-normal break-words"}`
                }`}
              >
                {summary.count}
              </div>
            ) : null}
            {showTotalSummary ? (
              <div className={`${cellLineClass(column.key)} ${multiSummaryClass} whitespace-nowrap`}>{summary.total}</div>
            ) : null}
          </button>
        ) : null}
        {expanded ? (
          <div className={`flex w-full flex-col gap-1 ${multiSummaryAlignClass(column.key)}`}>
            {lines.map((line, index) => renderMultiDetailLine(line, column.key, `${column.key}-${index}`))}
          </div>
        ) : null}
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
        className={`${cellLineClass(column.key)} ${isDateColumn(column.key) ? "whitespace-nowrap" : "whitespace-normal break-words"} ${linkedCellClass}`}
      >
        {linkedCell.text}
      </Link>
    );
  }

  if (column.key === "registeredAt") {
    return (
      <RegistrationDateCell
        row={row}
        value={String(value ?? "")}
        owner={owner}
        country={country}
        canEdit={canEdit && !leaderNotesOnly}
        autoSuggestedRegistration={autoSuggestedRegistration}
        onChange={onChange}
      />
    );
  }

  if (column.key === "paymentType") {
    if (!canEdit || leaderNotesOnly) {
      return (
        <span className={`${cellLineClass(column.key)} select-text`}>
          {String(value ?? "") || "-"}
        </span>
      );
    }
    return (
      <div className={cellLineClass(column.key)}>
        <select
          value={String(value ?? "")}
          onChange={(event) => onChange(row.key, column.key, event.target.value)}
          onDragStart={(event) => event.preventDefault()}
          data-no-row-expand
          className={`${inlineInputClass(column.key)} min-w-24 select-text`}
        >
          <option value="">-</option>
          {["T/T", "L/C", "D/A", "D/P"].map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </div>
    );
  }
  if (!editable) {
    return (
      <span
        className={`${cellLineClass(column.key)} select-text whitespace-pre-wrap`}
        style={{ WebkitUserDrag: "none" } as CSSProperties}
      >
        {formatCellDisplay(column.key, value, currency)}
      </span>
    );
  }
  if (moneyColumns.has(column.key) || quantityColumns.has(column.key)) {
    return (
      <div className={cellLineClass(column.key)}>
        <FormattedMetricInput
          columnKey={column.key}
          value={value}
          currency={currency}
          onChange={(next) => onChange(row.key, column.key, next)}
        />
      </div>
    );
  }
  return (
    <div className={cellLineClass(column.key)}>
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
        className={`${inlineInputClass(column.key)} select-text ${isDateColumn(column.key) ? "whitespace-nowrap" : ""}`}
      />
    </div>
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
      className={`${inlineInputClass(columnKey)} select-text tabular-nums`}
    />
  );
}
