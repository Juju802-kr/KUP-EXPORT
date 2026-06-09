import path from "path";

type PaymentAllocation = {
  productionRequestNo?: string | null;
  invNo?: string | null;
  amount: number | string | { toString(): string };
  note?: string | null;
};

type PaymentAttachmentNameSource = {
  date?: Date | string | null;
  buyer?: string | null;
  currency?: string | null;
  amount: number | string | { toString(): string };
  productionRequestNo?: string | null;
  invNo?: string | null;
  note?: string | null;
  allocations: PaymentAllocation[];
};

function compact(value?: string | null) {
  return value?.trim() ?? "";
}

function yymmdd(value?: Date | string | null) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    String(date.getFullYear()).slice(-2),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0")
  ].join("");
}

function currencySymbol(currency?: string | null) {
  if (currency === "USD") return "$";
  if (currency === "EUR") return "￡";
  if (currency === "KRW") return "￦";
  return compact(currency);
}

function money(value: PaymentAllocation["amount"], currency?: string | null) {
  const amount = Number(value);
  const formatted = Number.isFinite(amount)
    ? amount.toLocaleString("en-US", { maximumFractionDigits: 2 })
    : "0";
  return `${currencySymbol(currency)}${formatted}`;
}

function safeFileBase(parts: string[]) {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/[\\/:*?"<>|]+/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function effectiveAllocations(source: PaymentAttachmentNameSource) {
  const allocations = source.allocations.filter((row) =>
    compact(row.productionRequestNo) || compact(row.invNo) || Number(row.amount) || compact(row.note)
  );
  if (allocations.length) return allocations;
  return [{
    productionRequestNo: source.productionRequestNo,
    invNo: source.invNo,
    amount: source.amount,
    note: source.note
  }];
}

export function paymentTtAttachmentBaseName(source: PaymentAttachmentNameSource) {
  const allocations = effectiveAllocations(source);
  const details = allocations.flatMap((row) => [
    compact(row.productionRequestNo) || compact(row.invNo),
    money(row.amount, source.currency),
    compact(row.note)
  ]);
  return safeFileBase([
    yymmdd(source.date),
    compact(source.buyer),
    ...details,
    allocations.length > 1 ? "총" : "",
    allocations.length > 1 ? money(source.amount, source.currency) : ""
  ]);
}

export function paymentLcAttachmentBaseName(source: PaymentAttachmentNameSource) {
  const allocations = effectiveAllocations(source);
  const details = allocations.flatMap((row) => [
    compact(row.productionRequestNo),
    money(row.amount, source.currency)
  ]);
  return safeFileBase([
    yymmdd(source.date),
    compact(source.buyer),
    ...details,
    allocations.length > 1 ? "총" : "",
    allocations.length > 1 ? money(source.amount, source.currency) : ""
  ]);
}

export function attachmentNameWithOriginalExtension(baseName: string, originalName: string) {
  const extension = path.extname(originalName);
  return `${baseName || path.basename(originalName, extension)}${extension}`;
}
