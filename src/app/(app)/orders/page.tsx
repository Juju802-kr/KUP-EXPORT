import Link from "next/link";
import { PaymentLcKind } from "@prisma/client";
import { OrderEntryForm } from "@/components/OrderEntryForm";
import { OrderCountryBoard } from "@/components/OrderCountryBoard";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtYearMonth } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const ownerTree = [
  { label: "해외영업", children: [
    { label: "1파트", children: ["김상훈", "도준현", "변재형"] },
    { label: "2파트", children: ["최유라", "박사라", "음정현"] },
    { label: "3파트", children: ["심상완", "권정현"] }
  ] },
  { label: "해외마케팅", children: ["최재혁", "이주연"] }
] as const;

type PaymentDetail = { type: "T/T" | "L/C" | "D/A" | "D/P"; date: string; amount: number; source: string; paymentId?: string; paymentTab?: "tt" | "lc" };
type ShipmentDetail = { invNo: string; etd: string; lotNo: string; quantity: number; focQuantity: number; amount: number; shipmentId?: string };
type Registration = { amount: number; registeredAt: string; status: string };
type OrderRow = {
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
  shipments: ShipmentDetail[];
  payments: PaymentDetail[];
  registration?: Registration;
  note: string;
  shipmentId: string;
};

function orderKey(value: { productionRequestNo?: string | null; piNo?: string | null; exportCountry?: string | null; buyer?: string | null; productName?: string | null }) {
  const productionNo = value.productionRequestNo?.trim();
  if (productionNo) return `prod:${productionNo}`;
  const piNo = value.piNo?.trim();
  if (piNo) return `pi:${piNo}`;
  return `misc:${value.exportCountry ?? ""}:${value.buyer ?? ""}:${value.productName ?? ""}`;
}

function orderEntryKey(orderId: string) {
  return `entry:${orderId}`;
}

type SnapshotShipmentLine = { invNo?: string; etd?: string; lotNo?: string; quantity?: number; focQuantity?: number; amount?: number };
type SnapshotPaymentLine = { type?: string; date?: string; amount?: number; source?: string };

function parseSnapshotLines<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function normalizeLedgerDate(value?: string | null) {
  if (!value) return "";
  const trimmed = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
  const date = new Date(trimmed.includes("T") ? trimmed : `${trimmed}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? trimmed : date.toISOString().slice(0, 10);
}

function roundLedgerAmount(value: number) {
  return Math.round(value * 100) / 100;
}

function dedupePayments(payments: PaymentDetail[]) {
  const byModule = new Map<string, PaymentDetail>();
  const byLedger = new Map<string, PaymentDetail>();

  for (const payment of payments) {
    if (payment.paymentId) {
      const moduleKey = `${payment.paymentId}|${roundLedgerAmount(payment.amount)}`;
      if (!byModule.has(moduleKey)) byModule.set(moduleKey, payment);
      continue;
    }
    const ledgerKey = `${normalizeLedgerDate(payment.date)}|${roundLedgerAmount(payment.amount)}`;
    const existing = byLedger.get(ledgerKey);
    if (!existing) byLedger.set(ledgerKey, payment);
  }

  const result = [...byModule.values()];
  for (const [ledgerKey, payment] of byLedger) {
    const overshadowed = result.some(
      (item) => `${normalizeLedgerDate(item.date)}|${roundLedgerAmount(item.amount)}` === ledgerKey
    );
    if (!overshadowed) result.push(payment);
  }
  return result;
}

type ModulePaymentSlot = { rowKey: string; paymentId: string; date: string; amount: number };

function rowsShareOrderIdentity(a: OrderRow, b: OrderRow) {
  const piA = normalizeOrderRef(a.piNo);
  const piB = normalizeOrderRef(b.piNo);
  if (piA && piB && piA === piB) return true;
  const prodA = a.productionRequestNo?.trim();
  const prodB = b.productionRequestNo?.trim();
  if (prodA && prodB && prodA === prodB) return true;
  return false;
}

function stripDuplicatePaymentCopies(rows: Map<string, OrderRow>, moduleSlots: ModulePaymentSlot[]) {
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

function normalizeOrderRef(value?: string | null) {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function dedupeShipments(shipments: ShipmentDetail[]) {
  const map = new Map<string, ShipmentDetail>();
  for (const shipment of shipments) {
    const key = `${normalizeLedgerDate(shipment.etd)}|${roundLedgerAmount(shipment.amount)}|${shipment.quantity}`;
    const existing = map.get(key);
    if (!existing || (shipment.shipmentId && !existing.shipmentId)) map.set(key, shipment);
  }
  return [...map.values()];
}

function blankRow(key: string, owner: string): OrderRow {
  return {
    key,
    salesOwner: owner,
    exportCountry: "",
    buyer: "",
    currency: "",
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
    note: "",
    shipmentId: ""
  };
}

function fillText(current: string, next?: string | null) {
  return current || next || "";
}

function ownerHref(owner: string, sheet = "관리") {
  return `/orders?owner=${encodeURIComponent(owner)}&sheet=${encodeURIComponent(sheet)}`;
}

function monthSeries(rows: Array<{ date: string; amount: number }>, year: number) {
  const values = Array(12).fill(0) as number[];
  for (const row of rows) {
    const date = row.date ? new Date(row.date) : null;
    if (!date || Number.isNaN(date.getTime()) || date.getFullYear() !== year) continue;
    values[date.getMonth()] += row.amount;
  }
  return values;
}

function cumulativeUntilMonth(values: number[], monthIndex: number) {
  return values.slice(0, monthIndex + 1).reduce((sum, value) => sum + value, 0);
}

function MiniLineChart({ previous, current }: { previous: number[]; current: number[] }) {
  const max = Math.max(1, ...previous, ...current);
  const points = (values: number[]) =>
    values.map((value, index) => `${20 + index * 36},${130 - (value / max) * 100}`).join(" ");
  return (
    <svg viewBox="0 0 430 150" className="h-44 w-full rounded-md border border-slate-200 bg-white">
      {[0, 1, 2, 3].map((line) => <line key={line} x1="20" x2="416" y1={30 + line * 30} y2={30 + line * 30} stroke="#e2e8f0" />)}
      <polyline fill="none" stroke="#94a3b8" strokeWidth="3" points={points(previous)} />
      <polyline fill="none" stroke="#2563eb" strokeWidth="3" points={points(current)} />
      <text x="24" y="144" fontSize="10" fill="#64748b">1월</text>
      <text x="374" y="144" fontSize="10" fill="#64748b">12월</text>
    </svg>
  );
}

function Sidebar({ owner, currentUser }: { owner: string; currentUser: string }) {
  const ownerLinkClass = (name: string) =>
    `block rounded px-2 py-1.5 text-sm ${name === owner ? "bg-blue-50 font-semibold text-blue-700" : "hover:bg-slate-50"}`;
  return (
    <aside className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
      <h2 className="mb-3 text-sm font-semibold text-slate-900">담당자</h2>
      <Link href={ownerHref(currentUser)} className="mb-3 block rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white">{currentUser}</Link>
      <div className="space-y-2">
        {ownerTree.map((group) => (
          <details key={group.label} className="rounded-md border border-slate-100" open={false}>
            <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-700">{group.label}</summary>
            <div className="space-y-1 border-t border-slate-100 p-2">
              {group.children.map((child) =>
                typeof child === "string" ? (
                  child === currentUser ? null : <Link key={child} href={ownerHref(child)} className={ownerLinkClass(child)}>{child}</Link>
                ) : (
                  <details key={child.label} className="rounded bg-slate-50" open={false}>
                    <summary className="cursor-pointer px-2 py-1.5 text-sm text-slate-600">{child.label}</summary>
                    <div className="p-1">
                      {child.children.map((name) =>
                        name === currentUser ? null : <Link key={name} href={ownerHref(name)} className={ownerLinkClass(name)}>{name}</Link>
                      )}
                    </div>
                  </details>
                )
              )}
            </div>
          </details>
        ))}
      </div>
    </aside>
  );
}

function SheetTabs({ owner, sheet, countries }: { owner: string; sheet: string; countries: string[] }) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200">
      {["관리", ...countries].map((name) => (
        <Link
          key={name}
          href={ownerHref(owner, name)}
          className={`rounded-t-md border border-b-0 px-4 py-2 text-sm font-medium ${sheet === name ? "bg-white text-blue-700" : "bg-slate-100 text-slate-500 hover:bg-white"}`}
        >
          {name}
        </Link>
      ))}
    </div>
  );
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const owner = params.owner?.trim() || user.name;
  const sheet = params.sheet?.trim() || "관리";
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  const currentMonth = new Date().getMonth();

  const [manualOrders, shipmentProducts, ttPayments, lcPayments, registrations, buyers] = await Promise.all([
    prisma.orderEntry.findMany({ where: { salesOwner: owner }, orderBy: { createdAt: "desc" } }),
    prisma.shipmentProduct.findMany({
      where: { shipment: { salesOwner: owner } },
      orderBy: { updatedAt: "desc" },
      include: {
        shipment: {
          select: {
            id: true,
            exportCountry: true,
            buyer: true,
            invNo: true,
            etd: true,
            currency: true,
            paymentTerm: true
          }
        }
      }
    }),
    prisma.paymentTT.findMany({ where: { salesOwner: owner }, include: { allocations: { orderBy: { sortOrder: "asc" } } } }),
    prisma.paymentLC.findMany({ where: { salesOwner: owner }, include: { allocations: { orderBy: { sortOrder: "asc" } } } }),
    prisma.salesRegistration.findMany({ where: { salesOwner: owner } }),
    prisma.buyerMaster.findMany({ orderBy: [{ exportCountry: "asc" }, { buyerName: "asc" }], select: { buyerName: true, exportCountry: true, defaultCurrency: true } })
  ]);

  const currencyByBuyer = new Map(buyers.map((buyer) => [buyer.buyerName, buyer.defaultCurrency || "USD"]));

  const rows = new Map<string, OrderRow>();
  const prodToEntryKeys = new Map<string, string[]>();
  const piToEntryKeys = new Map<string, string[]>();
  const invToEntryKeys = new Map<string, string[]>();

  const ensureRow = (key: string) => {
    const existing = rows.get(key);
    if (existing) return existing;
    const created = blankRow(key, owner);
    rows.set(key, created);
    return created;
  };

  function indexEntryKey(map: Map<string, string[]>, ref: string | null | undefined, key: string) {
    const normalized = normalizeOrderRef(ref);
    if (!normalized) return;
    map.set(normalized, [...(map.get(normalized) ?? []), key]);
  }

  function pickEntryKey(entryKeys: string[], amount?: number) {
    if (entryKeys.length === 1) return entryKeys[0];
    if (entryKeys.length > 1 && amount !== undefined) {
      for (const entryKey of entryKeys) {
        const row = rows.get(entryKey);
        if (row && Math.abs(Number(row.orderAmount) - amount) < 0.01) return entryKey;
      }
    }
    return entryKeys[0] ?? null;
  }

  function resolveOrderKey(options: { productionRequestNo?: string | null; invNo?: string | null; piNo?: string | null; amount?: number }) {
    const invRef = normalizeOrderRef(options.invNo);
    const piRef = normalizeOrderRef(options.piNo);

    if (invRef && !invRef.includes(",")) {
      const fromPi = pickEntryKey(piToEntryKeys.get(invRef) ?? [], options.amount);
      if (fromPi) return fromPi;
      const fromInv = pickEntryKey(invToEntryKeys.get(invRef) ?? [], options.amount);
      if (fromInv) return fromInv;
      return null;
    }

    if (piRef && !piRef.includes(",")) {
      const fromPi = pickEntryKey(piToEntryKeys.get(piRef) ?? [], options.amount);
      if (fromPi) return fromPi;
      const fromInv = pickEntryKey(invToEntryKeys.get(piRef) ?? [], options.amount);
      if (fromInv) return fromInv;
    }

    const productionNo = options.productionRequestNo?.trim();
    if (productionNo) {
      const resolved = pickEntryKey(prodToEntryKeys.get(productionNo) ?? [], options.amount);
      if (resolved) return resolved;
    }

    return null;
  }

  function resolveProductionKey(productionRequestNo?: string | null, amount?: number) {
    return resolveOrderKey({ productionRequestNo, amount });
  }

  function orphanRowKey(options: { productionRequestNo?: string | null; invNo?: string | null; piNo?: string | null; exportCountry?: string | null; buyer?: string | null; productName?: string | null }) {
    const invRef = options.invNo?.trim();
    if (invRef && !invRef.includes(",")) {
      return orderKey({ piNo: invRef, exportCountry: options.exportCountry, buyer: options.buyer });
    }
    return orderKey(options);
  }

  for (const order of manualOrders) {
    const key = orderEntryKey(order.id);
    const row = ensureRow(key);
    row.exportCountry = fillText(row.exportCountry, order.exportCountry);
    row.buyer = fillText(row.buyer, order.buyer);
    row.piDate = fillText(row.piDate, fmtDate(order.piDate));
    row.piNo = fillText(row.piNo, order.piNo);
    row.productionRequestNo = fillText(row.productionRequestNo, order.productionRequestNo);
    row.productName = fillText(row.productName, order.productName);
    row.unitPrice = Number(order.unitPrice);
    row.quantity = order.quantity;
    row.orderFocQuantity = order.focQuantity;
    row.orderAmount = Number(order.amount);
    row.note = fillText(row.note, order.note);
    for (const line of parseSnapshotLines<SnapshotShipmentLine>(order.shipmentLines)) {
      row.shipments.push({
        invNo: line.invNo || "",
        etd: line.etd || "",
        lotNo: line.lotNo || "",
        quantity: Number(line.quantity) || 0,
        focQuantity: Number(line.focQuantity) || 0,
        amount: Number(line.amount) || 0
      });
    }
    for (const line of parseSnapshotLines<SnapshotPaymentLine>(order.paymentLines)) {
      row.payments.push({
        type: (line.type || "T/T") as PaymentDetail["type"],
        date: line.date || "",
        amount: Number(line.amount) || 0,
        source: line.source || "엑셀"
      });
    }
    const productionNo = order.productionRequestNo?.trim();
    if (productionNo) {
      indexEntryKey(prodToEntryKeys, productionNo, key);
    }
    indexEntryKey(piToEntryKeys, order.piNo, key);
    for (const line of parseSnapshotLines<SnapshotShipmentLine>(order.shipmentLines)) {
      indexEntryKey(invToEntryKeys, line.invNo, key);
    }
  }

  for (const product of shipmentProducts) {
    const key = resolveOrderKey({
      productionRequestNo: product.productionRequestNo,
      invNo: product.shipment.invNo,
      piNo: product.piNo,
      amount: Number(product.amount)
    }) ?? orphanRowKey(product);
    const row = ensureRow(key);
    row.exportCountry = fillText(row.exportCountry, product.shipment.exportCountry);
    row.buyer = fillText(row.buyer, product.shipment.buyer);
    row.productName = fillText(row.productName, product.englishName || product.productName);
    row.piNo = fillText(row.piNo, product.piNo);
    row.productionRequestNo = fillText(row.productionRequestNo, product.productionRequestNo);
    row.shipmentId = fillText(row.shipmentId, product.shipment.id);
    row.currency = fillText(row.currency, product.shipment.currency);
    row.shipments.push({
      invNo: product.shipment.invNo || "",
      etd: fmtDate(product.shipment.etd),
      lotNo: product.lotNo || "",
      quantity: product.bxQtyPaid,
      focQuantity: product.bxQtyFoc,
      amount: Number(product.amount),
      shipmentId: product.shipment.id
    });
    if (!row.orderAmount) row.orderAmount = Number(product.amount);
    if (!row.quantity) row.quantity = product.bxQtyPaid;

    const term = (product.shipment.paymentTerm || "").toUpperCase();
    if (term.includes("D/A") || term === "DA") row.payments.push({ type: "D/A", date: "D/A", amount: Number(product.amount), source: "선적액" });
    if (term.includes("D/P") || term === "DP") row.payments.push({ type: "D/P", date: "D/P", amount: Number(product.amount), source: "선적액" });
  }

  const modulePaymentSlots: ModulePaymentSlot[] = [];
  const assignedModuleSlotKeys = new Set<string>();

  for (const payment of ttPayments) {
    const allocationRows = payment.allocations.length
      ? payment.allocations
      : [{ productionRequestNo: payment.productionRequestNo, invNo: payment.invNo, amount: payment.amount }];
    for (const [index, allocation] of allocationRows.entries()) {
      const slotKey = `${payment.id}|${index}`;
      if (assignedModuleSlotKeys.has(slotKey)) continue;
      const amount = Number(allocation.amount ?? 0);
      const key = resolveOrderKey({
        productionRequestNo: allocation.productionRequestNo,
        invNo: allocation.invNo,
        amount
      }) ?? orphanRowKey({
        productionRequestNo: allocation.productionRequestNo,
        invNo: allocation.invNo,
        exportCountry: payment.exportCountry,
        buyer: payment.buyer
      });
      assignedModuleSlotKeys.add(slotKey);
      const row = ensureRow(key);
      row.exportCountry = fillText(row.exportCountry, payment.exportCountry);
      row.buyer = fillText(row.buyer, payment.buyer);
      row.productionRequestNo = fillText(row.productionRequestNo, allocation.productionRequestNo);
      row.piNo = fillText(row.piNo, allocation.invNo);
      row.currency = fillText(row.currency, payment.currency);
      row.payments.push({ type: "T/T", date: fmtDate(payment.date), amount, source: payment.refNo || "T/T", paymentId: payment.id, paymentTab: "tt" });
      modulePaymentSlots.push({ rowKey: key, paymentId: payment.id, date: fmtDate(payment.date), amount });
    }
  }

  for (const payment of lcPayments) {
    const allocationRows = payment.allocations.length ? payment.allocations : [{ productionRequestNo: payment.productionRequestNo, amount: payment.amount }];
    for (const [index, allocation] of allocationRows.entries()) {
      if (payment.kind !== PaymentLcKind.OPEN) continue;
      const slotKey = `${payment.id}|${index}`;
      if (assignedModuleSlotKeys.has(slotKey)) continue;
      const amount = Number(allocation.amount ?? 0);
      const key = resolveOrderKey({
        productionRequestNo: allocation.productionRequestNo,
        invNo: (allocation as { invNo?: string | null }).invNo,
        amount
      }) ?? orphanRowKey({
        productionRequestNo: allocation.productionRequestNo,
        invNo: (allocation as { invNo?: string | null }).invNo,
        exportCountry: payment.exportCountry,
        buyer: payment.buyer
      });
      assignedModuleSlotKeys.add(slotKey);
      const row = ensureRow(key);
      row.exportCountry = fillText(row.exportCountry, payment.exportCountry);
      row.buyer = fillText(row.buyer, payment.buyer);
      row.productionRequestNo = fillText(row.productionRequestNo, allocation.productionRequestNo);
      row.currency = fillText(row.currency, payment.currency);
      row.payments.push({
        type: "L/C",
        date: fmtDate(payment.noticeDate),
        amount,
        source: payment.lcNo || "L/C OPEN",
        paymentId: payment.id,
        paymentTab: "lc"
      });
      modulePaymentSlots.push({ rowKey: key, paymentId: payment.id, date: fmtDate(payment.noticeDate), amount });
    }
  }

  for (const registration of registrations) {
    let key = registration.orderKey;
    const productionNo = registration.productionRequestNo?.trim();
    if (productionNo) {
      const resolved = resolveProductionKey(productionNo, Number(registration.amount));
      if (resolved) key = resolved;
    }
    const row = ensureRow(key);
    row.registration = {
      amount: Number(registration.amount),
      registeredAt: fmtYearMonth(registration.registeredAt),
      status: registration.status
    };
  }

  stripDuplicatePaymentCopies(rows, modulePaymentSlots);

  for (const row of rows.values()) {
    row.payments = dedupePayments(row.payments);
    row.shipments = dedupeShipments(row.shipments);
    if (row.shipmentId) {
      for (const shipment of row.shipments) {
        if (!shipment.shipmentId) shipment.shipmentId = row.shipmentId;
      }
    }
    if (!row.currency && row.buyer) row.currency = currencyByBuyer.get(row.buyer) || "USD";
    if (!row.currency) row.currency = "USD";
  }

  const orderRows = [...rows.values()].sort((a, b) => a.buyer.localeCompare(b.buyer, "ko") || a.piNo.localeCompare(b.piNo));
  const countries = [...new Set(orderRows.map((row) => row.exportCountry).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko"));
  const normalizedSheet = sheet === "관리" || countries.includes(sheet) ? sheet : "관리";
  const sheetRows = normalizedSheet === "관리" ? orderRows : orderRows.filter((row) => row.exportCountry === normalizedSheet);

  const chartSource = {
    order: manualOrders.map((order) => ({ date: fmtDate(order.piDate || order.createdAt), amount: Number(order.amount) })),
    shipment: shipmentProducts.map((product) => ({ date: fmtDate(product.shipment.etd), amount: Number(product.amount) })),
    registration: registrations.filter((item) => item.status === "REGISTERED").map((item) => ({ date: fmtDate(item.registeredAt), amount: Number(item.amount) }))
  };
  const metrics = [
    ["오더기준", chartSource.order],
    ["선적기준", chartSource.shipment],
    ["수주기준", chartSource.registration]
  ] as const;

  return (
    <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-5">
      <Sidebar owner={owner} currentUser={user.name} />
      <main className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">오더 관리</h1>
          <p className="mt-1 text-sm text-slate-500">{owner} 담당 오더를 수금, 선적, 수주 기준으로 연결해 봅니다.</p>
        </div>
        <SheetTabs owner={owner} sheet={normalizedSheet} countries={countries} />
        {normalizedSheet === "관리" ? (
          <>
            <section className="panel p-4">
              <OrderEntryForm owner={owner} buyers={buyers} />
            </section>
            <section className="panel p-4">
              <h2 className="mb-4 text-base font-semibold text-slate-950">누계 비교</h2>
              <div className="grid grid-cols-3 gap-3">
                {metrics.map(([label, source]) => {
                  const previous = monthSeries(source, previousYear);
                  const current = monthSeries(source, currentYear);
                  return (
                    <div key={label} className="rounded-lg border border-slate-200 p-3">
                      <h3 className="font-semibold text-slate-900">{label}</h3>
                      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <div><dt className="text-slate-500">전년도 동기</dt><dd className="font-semibold">{fmtMoney(cumulativeUntilMonth(previous, currentMonth))}</dd></div>
                        <div><dt className="text-slate-500">금년 현재</dt><dd className="font-semibold text-blue-700">{fmtMoney(cumulativeUntilMonth(current, currentMonth))}</dd></div>
                      </dl>
                      <div className="mt-3"><MiniLineChart previous={previous} current={current} /></div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        ) : (
          <CountrySheet owner={owner} sheet={normalizedSheet} rows={sheetRows} viewerId={user.id} />
        )}
      </main>
    </div>
  );
}

function CountrySheet({ owner, sheet, rows, viewerId }: { owner: string; sheet: string; rows: OrderRow[]; viewerId: string }) {
  return <OrderCountryBoard owner={owner} country={sheet} rows={rows} viewerId={viewerId} />;
}
