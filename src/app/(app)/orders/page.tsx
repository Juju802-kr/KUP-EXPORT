import { DropdownCategory, PaymentLcKind } from "@prisma/client";
import { OrderEntryForm } from "@/components/OrderEntryForm";
import { OrderCountryBoard } from "@/components/OrderCountryBoard";
import { OrderAlertProvider } from "@/components/OrderAlertManager";
import { OrdersSheetTabs, OrdersSidebar } from "@/components/OrdersPageNav";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney, fmtYearMonth } from "@/lib/constants";
import {
  compareOrdersByPiSequence,
  dedupeBoardPayments,
  reconcileBoardShipments,
  fallbackPaymentAllocations,
  isBlankOrderEntry,
  isModulePaymentSource,
  normalizeLedgerDate,
  normalizeOrderRef,
  orderEntryKey,
  orphanRowKey,
  reconcileModulePayments,
  splitOrderRefs,
  type ModulePaymentSlot
} from "@/lib/order-board-linking";
import { boardProductName } from "@/lib/order-pi-import";
import { ownerCountriesFromBuyers, orderManagementLinkedRecordScope, orderManagementLinkedTeamScope, orderManagementOwnerScope, orderManagementTeamScope } from "@/lib/order-alert-owner";
import { listActiveOrderAlertsForCountries, listCompletedOrderAlertsForCountries } from "@/lib/order-alert-db";
import {
  OVERSEAS_SALES_ALL_OWNER,
  buildOverseasSalesPartGroups,
  isOverseasSalesAllOwner,
  isOverseasSalesLeader,
  overseasSalesMemberNames
} from "@/lib/overseas-sales-roster";
import { prisma } from "@/lib/prisma";
import { OrderLeaderNoteAlerts } from "@/components/OrderLeaderNoteAlerts";

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
  incoterms: string;
  transport: string;
  destinationPort: string;
  shipments: ShipmentDetail[];
  payments: PaymentDetail[];
  registration?: Registration;
  note: string;
  leaderNote: string;
  leaderPrivateNote: string;
  shipmentId: string;
};

type SnapshotShipmentLine = { invNo?: string; etd?: string; lotNo?: string; quantity?: number; focQuantity?: number; amount?: number };
type SnapshotPaymentLine = { type?: string; date?: string; amount?: number; source?: string };

function parseSnapshotLines<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
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
    incoterms: "",
    transport: "",
    destinationPort: "",
    shipments: [],
    payments: [],
    note: "",
    leaderNote: "",
    leaderPrivateNote: "",
    shipmentId: ""
  };
}

function fillText(current: string, next?: string | null) {
  return current || next || "";
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

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const overseasSalesOptions = await prisma.dropdownOption.findMany({
    where: { category: DropdownCategory.OVERSEAS_SALES_TEAM },
    orderBy: [{ partNo: "asc" }, { rankNo: "asc" }, { sortOrder: "asc" }],
    select: { label: true, partNo: true, rankNo: true, sortOrder: true }
  });
  const salesParts = buildOverseasSalesPartGroups(overseasSalesOptions);
  const teamNames = overseasSalesMemberNames(overseasSalesOptions);
  const viewerIsLeader = isOverseasSalesLeader(user.name, overseasSalesOptions);
  const requestedOwner = params.owner?.trim() || "";
  const requestedAllOverseas = isOverseasSalesAllOwner(requestedOwner);
  const owner =
    requestedAllOverseas && !viewerIsLeader
      ? user.name
      : requestedOwner || (viewerIsLeader ? OVERSEAS_SALES_ALL_OWNER : user.name);
  const viewingAllOverseas = isOverseasSalesAllOwner(owner);
  const viewingTeamMemberBoard =
    viewerIsLeader && teamNames.includes(owner) && owner !== user.name && !viewingAllOverseas;
  const canEdit =
    owner === user.name ||
    (viewerIsLeader && (viewingAllOverseas || teamNames.includes(owner)));
  const leaderNotesOnly = viewingTeamMemberBoard;
  const sheet = params.sheet?.trim() || "관리";
  const currentYear = new Date().getFullYear();
  const previousYear = currentYear - 1;
  const currentMonth = new Date().getMonth();

  const buyers = await prisma.buyerMaster.findMany({
    orderBy: [{ exportCountry: "asc" }, { buyerName: "asc" }],
    select: { buyerName: true, exportCountry: true, defaultCurrency: true, salesOwner: true }
  });
  const ownerScope = viewingAllOverseas
    ? orderManagementTeamScope(teamNames, buyers)
    : orderManagementOwnerScope(owner, buyers);
  const linkedScope = viewingAllOverseas
    ? orderManagementLinkedTeamScope(teamNames, buyers)
    : orderManagementLinkedRecordScope(owner, buyers);

  const [manualOrders, shipmentProducts, ttPayments, lcPayments, registrations, exportProductNames, destinationOptions] = await Promise.all([
    prisma.orderEntry.findMany({ where: ownerScope, orderBy: { createdAt: "desc" } }),
    prisma.shipmentProduct.findMany({
      where: { shipment: linkedScope },
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
            paymentTerm: true,
            productionRequestNo: true
          }
        }
      }
    }),
    prisma.paymentTT.findMany({ where: linkedScope, include: { allocations: { orderBy: { sortOrder: "asc" } } } }),
    prisma.paymentLC.findMany({ where: linkedScope, include: { allocations: { orderBy: { sortOrder: "asc" } } } }),
    prisma.salesRegistration.findMany({ where: ownerScope }),
    prisma.exportProductName.findMany({
      orderBy: [{ exportCountry: "asc" }, { productName: "asc" }],
      select: { exportCountry: true, productName: true, englishName: true }
    }),
    prisma.dropdownOption.findMany({
      where: { category: DropdownCategory.DESTINATION_PORT },
      orderBy: { sortOrder: "asc" },
      select: { label: true, destinationCountry: true, destinationKind: true }
    })
  ]);

  const ownerCountries = viewingAllOverseas
    ? [
        ...new Set(
          buyers
            .filter((buyer) => teamNames.includes(buyer.salesOwner ?? ""))
            .map((buyer) => buyer.exportCountry.trim())
            .filter(Boolean)
        )
      ].sort((a, b) => a.localeCompare(b, "ko"))
    : ownerCountriesFromBuyers(buyers, owner);
  const [orderAlerts, completedOrderAlerts] = await Promise.all([
    listActiveOrderAlertsForCountries(ownerCountries, user.id),
    listCompletedOrderAlertsForCountries(ownerCountries, user.id)
  ]);
  const alertItems = orderAlerts.map((alert) => ({
    id: alert.id,
    exportCountry: alert.exportCountry,
    productName: alert.productName,
    content: alert.content,
    createdAt: alert.createdAt.toISOString()
  }));
  const completedAlertItems = completedOrderAlerts.map((alert) => ({
    id: alert.id,
    exportCountry: alert.exportCountry,
    productName: alert.productName,
    content: alert.content,
    createdAt: alert.createdAt.toISOString(),
    completedAt: (alert.cancelledAt ?? alert.dismissals?.[0]?.createdAt ?? alert.updatedAt ?? alert.createdAt).toISOString(),
    completedReason: alert.cancelledAt ? ("cancelled" as const) : ("dismissed" as const)
  }));
  const destinationPorts = destinationOptions.map((option) => ({
    label: option.label,
    country: option.destinationCountry,
    kind: (option.destinationKind === "air" || option.destinationKind === "sea" ? option.destinationKind : null) as "air" | "sea" | null
  }));

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

  function indexEntryKeys(map: Map<string, string[]>, ref: string | null | undefined, key: string) {
    const parts = splitOrderRefs(ref);
    if (!parts.length) {
      indexEntryKey(map, ref, key);
      return;
    }
    for (const part of parts) indexEntryKey(map, part, key);
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

  function resolveOrderKey(options: {
    productionRequestNo?: string | null;
    invNo?: string | null;
    piNo?: string | null;
    amount?: number;
  }) {
    for (const productionNo of splitOrderRefs(options.productionRequestNo)) {
      const normalized = normalizeOrderRef(productionNo);
      if (!normalized) continue;
      const resolved = pickEntryKey(prodToEntryKeys.get(normalized) ?? [], options.amount);
      if (resolved) return resolved;
    }

    for (const piPart of splitOrderRefs(options.piNo)) {
      const piRef = normalizeOrderRef(piPart);
      if (!piRef || piRef.includes(",")) continue;
      const fromPi = pickEntryKey(piToEntryKeys.get(piRef) ?? [], options.amount);
      if (fromPi) return fromPi;
    }

    for (const invPart of splitOrderRefs(options.invNo)) {
      const invRef = normalizeOrderRef(invPart);
      if (!invRef || invRef.includes(",")) continue;
      const fromInv = pickEntryKey(invToEntryKeys.get(invRef) ?? [], options.amount);
      if (fromInv) return fromInv;
    }

    return null;
  }

  function resolveProductionKey(productionRequestNo?: string | null, amount?: number) {
    return resolveOrderKey({ productionRequestNo, amount });
  }

  for (const order of manualOrders) {
    if (isBlankOrderEntry(order)) {
      continue;
    }
    const key = orderEntryKey(order.id);
    const row = ensureRow(key);
    row.exportCountry = fillText(row.exportCountry, order.exportCountry);
    row.buyer = fillText(row.buyer, order.buyer);
    row.piDate = fillText(row.piDate, fmtDate(order.piDate));
    row.piNo = fillText(row.piNo, order.piNo);
    row.productionRequestNo = fillText(row.productionRequestNo, order.productionRequestNo);
    row.productName = fillText(
      row.productName,
      boardProductName(order.exportCountry, order.productName, exportProductNames)
    );
    row.unitPrice = Number(order.unitPrice);
    row.quantity = order.quantity;
    row.orderFocQuantity = order.focQuantity;
    row.orderAmount = Number(order.amount);
    row.incoterms = fillText(row.incoterms, order.incoterms);
    row.transport = fillText(row.transport, order.transport);
    row.destinationPort = fillText(row.destinationPort, order.destinationPort);
    row.note = fillText(row.note, order.note);
    row.leaderNote = fillText(row.leaderNote, order.leaderNote);
    row.leaderPrivateNote = fillText(row.leaderPrivateNote, order.leaderPrivateNote);
    row.salesOwner = fillText(row.salesOwner, order.salesOwner);
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
      if (isModulePaymentSource(line.source)) continue;
      row.payments.push({
        type: (line.type || "T/T") as PaymentDetail["type"],
        date: line.date || "",
        amount: Number(line.amount) || 0,
        source: line.source || "엑셀"
      });
    }
    const productionNo = order.productionRequestNo?.trim();
    if (productionNo) {
      indexEntryKeys(prodToEntryKeys, productionNo, key);
    }
    indexEntryKeys(piToEntryKeys, order.piNo, key);
    for (const line of parseSnapshotLines<SnapshotShipmentLine>(order.shipmentLines)) {
      indexEntryKeys(invToEntryKeys, line.invNo, key);
    }
  }

  for (const product of shipmentProducts) {
    const productionRequestNo = product.productionRequestNo || product.shipment.productionRequestNo;
    const key = resolveOrderKey({
      productionRequestNo,
      invNo: product.shipment.invNo,
      piNo: product.piNo,
      amount: Number(product.amount)
    }) ?? orphanRowKey({
      productionRequestNo,
      piNo: product.piNo,
      invNo: product.shipment.invNo,
      exportCountry: product.shipment.exportCountry,
      buyer: product.shipment.buyer,
      productName: product.englishName || product.productName,
      amount: Number(product.amount)
    });
    const row = ensureRow(key);
    row.exportCountry = fillText(row.exportCountry, product.shipment.exportCountry);
    row.buyer = fillText(row.buyer, product.shipment.buyer);
    row.productName = fillText(row.productName, product.englishName || product.productName);
    row.piNo = fillText(row.piNo, product.piNo);
    row.productionRequestNo = fillText(row.productionRequestNo, productionRequestNo);
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

  for (const row of rows.values()) {
    for (const shipment of row.shipments) {
      indexEntryKeys(invToEntryKeys, shipment.invNo, row.key);
    }
  }

  const modulePaymentSlots: ModulePaymentSlot[] = [];
  const assignedModuleSlotKeys = new Set<string>();

  for (const payment of ttPayments) {
    const allocationRows = payment.allocations.length
      ? payment.allocations
      : fallbackPaymentAllocations(payment);
    for (const [index, allocation] of allocationRows.entries()) {
      const slotKey = `${payment.id}|${index}`;
      if (assignedModuleSlotKeys.has(slotKey)) continue;
      const amount = Number(allocation.amount ?? 0);
      const key = resolveOrderKey({
        productionRequestNo: allocation.productionRequestNo || payment.productionRequestNo,
        invNo: allocation.invNo || payment.invNo,
        amount
      }) ?? orphanRowKey({
        productionRequestNo: allocation.productionRequestNo || payment.productionRequestNo,
        invNo: allocation.invNo || payment.invNo,
        exportCountry: payment.exportCountry,
        buyer: payment.buyer,
        amount
      });
      assignedModuleSlotKeys.add(slotKey);
      const row = ensureRow(key);
      row.exportCountry = fillText(row.exportCountry, payment.exportCountry);
      row.buyer = fillText(row.buyer, payment.buyer);
      row.productionRequestNo = fillText(
        row.productionRequestNo,
        allocation.productionRequestNo || payment.productionRequestNo
      );
      row.currency = fillText(row.currency, payment.currency);
      row.payments.push({ type: "T/T", date: fmtDate(payment.date), amount, source: payment.refNo || "T/T", paymentId: payment.id, paymentTab: "tt" });
      modulePaymentSlots.push({
        rowKey: key,
        paymentId: payment.id,
        date: fmtDate(payment.date),
        amount,
        productionRequestNo: allocation.productionRequestNo ?? ""
      });
    }
  }

  for (const payment of lcPayments) {
    const allocationRows = payment.allocations.length
      ? payment.allocations
      : fallbackPaymentAllocations({ productionRequestNo: payment.productionRequestNo, invNo: null, amount: payment.amount });
    for (const [index, allocation] of allocationRows.entries()) {
      if (payment.kind !== PaymentLcKind.OPEN) continue;
      const slotKey = `${payment.id}|${index}`;
      if (assignedModuleSlotKeys.has(slotKey)) continue;
      const amount = Number(allocation.amount ?? 0);
      const key = resolveOrderKey({
        productionRequestNo: allocation.productionRequestNo || payment.productionRequestNo,
        invNo: (allocation as { invNo?: string | null }).invNo,
        amount
      }) ?? orphanRowKey({
        productionRequestNo: allocation.productionRequestNo || payment.productionRequestNo,
        invNo: (allocation as { invNo?: string | null }).invNo,
        exportCountry: payment.exportCountry,
        buyer: payment.buyer,
        amount
      });
      assignedModuleSlotKeys.add(slotKey);
      const row = ensureRow(key);
      row.exportCountry = fillText(row.exportCountry, payment.exportCountry);
      row.buyer = fillText(row.buyer, payment.buyer);
      row.productionRequestNo = fillText(
        row.productionRequestNo,
        allocation.productionRequestNo || payment.productionRequestNo
      );
      row.currency = fillText(row.currency, payment.currency);
      row.payments.push({
        type: "L/C",
        date: fmtDate(payment.noticeDate),
        amount,
        source: payment.lcNo || "L/C OPEN",
        paymentId: payment.id,
        paymentTab: "lc"
      });
      modulePaymentSlots.push({
        rowKey: key,
        paymentId: payment.id,
        date: fmtDate(payment.noticeDate),
        amount,
        productionRequestNo: allocation.productionRequestNo ?? ""
      });
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

  reconcileModulePayments(rows, modulePaymentSlots, ttPayments, lcPayments);

  for (const row of rows.values()) {
    row.payments = dedupeBoardPayments(row.payments);
    row.shipments = reconcileBoardShipments(row.shipments);
    if (row.shipmentId) {
      for (const shipment of row.shipments) {
        if (!shipment.shipmentId) shipment.shipmentId = row.shipmentId;
      }
    }
    if (!row.currency && row.buyer) row.currency = currencyByBuyer.get(row.buyer) || "USD";
    if (!row.currency) row.currency = "USD";
  }

  const orderRows = [...rows.values()].sort(
    (a, b) => a.buyer.localeCompare(b.buyer, "ko") || compareOrdersByPiSequence(a, b)
  );
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

  const leaderNoteAlerts =
    !viewerIsLeader && owner === user.name
      ? await (async () => {
          const entries = manualOrders.filter((order) => (order.leaderNote ?? "").trim());
          if (!entries.length) return [];
          const acks = await prisma.orderLeaderNoteAck.findMany({
            where: {
              userId: user.id,
              orderEntryId: { in: entries.map((entry) => entry.id) }
            }
          });
          const ackByEntry = new Map(acks.map((ack) => [ack.orderEntryId, ack]));
          return entries
            .filter((entry) => {
              const note = (entry.leaderNote ?? "").trim();
              const ack = ackByEntry.get(entry.id);
              if (!ack) return true;
              if (ack.showAgain) return true;
              return ack.noteSnapshot.trim() !== note;
            })
            .map((entry) => ({
              orderEntryId: entry.id,
              exportCountry: entry.exportCountry || "",
              buyer: entry.buyer || "",
              piNo: entry.piNo || "",
              productName: entry.productName || "",
              leaderNote: (entry.leaderNote || "").trim()
            }));
        })()
      : [];

  const entryBuyers = viewingAllOverseas
    ? buyers.filter((buyer) => teamNames.includes(buyer.salesOwner ?? ""))
    : buyers.filter((buyer) => buyer.salesOwner === owner);

  return (
    <OrderAlertProvider
      owner={owner}
      countries={ownerCountries}
      products={exportProductNames}
      initialAlerts={alertItems}
      initialCompletedAlerts={completedAlertItems}
    >
      {leaderNoteAlerts.length ? <OrderLeaderNoteAlerts owner={owner} alerts={leaderNoteAlerts} /> : null}
      <div className="grid grid-cols-[220px_minmax(0,1fr)] gap-5">
        <OrdersSidebar
          owner={owner}
          currentUser={user.name}
          salesParts={salesParts}
          isOverseasLeader={viewerIsLeader}
        />
        <main className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">오더 관리</h1>
          <p className="mt-1 text-sm text-slate-500">{owner} 담당 오더를 수금, 선적, 수주 기준으로 연결해 봅니다.</p>
          {!canEdit ? (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              조회 전용입니다. 수정은 담당자({owner})만 할 수 있습니다.
            </p>
          ) : leaderNotesOnly ? (
            <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
              팀장 모드: 비고(팀장 전용)와 팀장의견만 수정할 수 있습니다.
            </p>
          ) : null}
        </div>
        <OrdersSheetTabs owner={owner} sheet={normalizedSheet} countries={countries} />
        {normalizedSheet === "관리" ? (
          <>
            {canEdit && !viewingAllOverseas ? (
              <section className="panel min-w-0 p-4">
                <OrderEntryForm
                  owner={owner}
                  buyers={entryBuyers}
                  products={exportProductNames}
                  destinationPorts={destinationPorts}
                />
              </section>
            ) : canEdit && viewingAllOverseas ? (
              <section className="panel min-w-0 p-4 text-sm text-slate-600">
                해외영업 전체 보기에서는 팀장의견·팀장 비고를 국가 시트에서 수정할 수 있습니다.
              </section>
            ) : (
              <section className="panel min-w-0 p-4 text-sm text-slate-600">
                오더 추가는 담당자({owner})만 할 수 있습니다.
              </section>
            )}
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
          <CountrySheet
            owner={owner}
            sheet={normalizedSheet}
            rows={sheetRows}
            viewerId={user.id}
            canEdit={canEdit}
            isLeaderViewer={viewerIsLeader}
            leaderNotesOnly={leaderNotesOnly}
            destinationPorts={destinationPorts}
            exportProducts={exportProductNames}
          />
        )}
      </main>
    </div>
    </OrderAlertProvider>
  );
}

function CountrySheet({
  owner,
  sheet,
  rows,
  viewerId,
  canEdit,
  isLeaderViewer,
  leaderNotesOnly,
  destinationPorts,
  exportProducts
}: {
  owner: string;
  sheet: string;
  rows: OrderRow[];
  viewerId: string;
  canEdit: boolean;
  isLeaderViewer: boolean;
  leaderNotesOnly: boolean;
  destinationPorts: Array<{ label: string; country: string | null; kind: "air" | "sea" | null }>;
  exportProducts: Array<{ exportCountry: string; productName: string; englishName: string }>;
}) {
  return (
    <OrderCountryBoard
      owner={owner}
      country={sheet}
      rows={rows}
      viewerId={viewerId}
      canEdit={canEdit}
      isLeaderViewer={isLeaderViewer}
      leaderNotesOnly={leaderNotesOnly}
      destinationPorts={destinationPorts}
      exportProducts={exportProducts}
    />
  );
}
