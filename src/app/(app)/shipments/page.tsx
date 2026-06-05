import Link from "next/link";
import { Factory, ShipmentStatus, Team } from "@prisma/client";
import { DataLoggerTable } from "@/components/DataLoggerTable";
import { FloatingExportButton } from "@/components/FloatingExportButton";
import { ExportShipmentsKanbanClient, ShipmentsListClient } from "@/components/ShipmentsListClient";
import { requireUser } from "@/lib/auth";
import { fmtDate, fmtMoney } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { shipmentDisplayTitle } from "@/lib/shipment-title";

const shipmentListLimit = 500;
const dataLoggerListLimit = 300;

const salesOwnerOrder = ["김상훈", "도준현", "변재형", "최유라", "박사라", "음정현", "심상완", "권정현"];
const exportOwnerOrder = ["김영민", "박휘원", "이해원"];

export default async function ShipmentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const params = await searchParams;
  const q = params.q?.trim();
  const status = params.status as ShipmentStatus | undefined;
  const defaultView = user.team === Team.OVERSEAS_SALES_SUPPORT ? "export" : "sales";
  const view = params.view === "export" || params.view === "sales" || params.view === "datalogger" ? params.view : defaultView;

  const [shipments, dataLoggers, users] = await Promise.all([
    prisma.shipmentRequest.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(q
          ? {
              OR: [
                { shipNo: { contains: q } },
                { exportCountry: { contains: q } },
                { buyer: { contains: q } },
                { salesOwner: { contains: q } },
                { contactPerson: { contains: q } },
                { invNo: { contains: q } },
                { productionRequestNo: { contains: q } },
                { products: { some: { productName: { contains: q } } } },
                { products: { some: { englishName: { contains: q } } } },
                { products: { some: { piNo: { contains: q } } } },
                { products: { some: { productionRequestNo: { contains: q } } } }
              ]
            }
          : {})
      },
      select: {
        id: true,
        exportCountry: true,
        buyer: true,
        currency: true,
        invNo: true,
        invoiceValue: true,
        salesOwner: true,
        exportOwner: true,
        status: true,
        etd: true,
        updatedAt: true,
        products: {
          select: {
            productName: true,
            englishName: true,
            piNo: true,
            factory: true
          }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
      take: shipmentListLimit
    }),
    view === "datalogger" ? prisma.dataLogger.findMany({ orderBy: { createdAt: "desc" }, take: dataLoggerListLimit }) : Promise.resolve([]),
    prisma.user.findMany({ select: { name: true, team: true }, orderBy: { name: "asc" } })
  ]);

  const grouped = shipments.reduce((map, shipment) => {
    const key = shipment.salesOwner || "담당자 미지정";
    map.set(key, [...(map.get(key) ?? []), shipment]);
    return map;
  }, new Map<string, typeof shipments>());

  const orderedOwners = [
    ...(grouped.has(user.name) ? [user.name] : []),
    ...salesOwnerOrder.filter((owner) => owner !== user.name && grouped.has(owner)),
    ...[...grouped.keys()].filter((owner) => owner !== user.name && !salesOwnerOrder.includes(owner)).sort((a, b) => a.localeCompare(b, "ko"))
  ];

  const groups = orderedOwners.map((owner) => [
    owner,
    (grouped.get(owner) ?? []).map((shipment) => ({
      id: shipment.id,
      owner,
      title: shipmentDisplayTitle(shipment) || "선적의뢰",
      extra: "",
      factories: shipmentFactories(shipment.products),
      currency: shipment.currency ?? "USD",
      amount: fmtMoney(shipment.invoiceValue),
      updatedAt: fmtDate(shipment.updatedAt),
      status: shipment.status
    }))
  ]) as Parameters<typeof ShipmentsListClient>[0]["groups"];

  const exportGrouped = shipments.reduce((map, shipment) => {
    const key = shipment.exportOwner || "선적담당자 미지정";
    map.set(key, [...(map.get(key) ?? []), shipment]);
    return map;
  }, new Map<string, typeof shipments>());

  const orderedExportOwners = [
    ...(exportOwnerOrder.includes(user.name) || exportGrouped.has(user.name) ? [user.name] : []),
    ...exportOwnerOrder.filter((owner) => owner !== user.name),
    ...[...exportGrouped.keys()].filter((owner) => owner !== user.name && !exportOwnerOrder.includes(owner)).sort((a, b) => a.localeCompare(b, "ko"))
  ];

  const exportGroups = orderedExportOwners.map((owner) => [
    owner,
    (exportGrouped.get(owner) ?? []).map((shipment) => ({
      id: shipment.id,
      owner,
      title: shipmentDisplayTitle(shipment) || "선적의뢰",
      extra: "",
      factories: shipmentFactories(shipment.products),
      currency: shipment.currency ?? "USD",
      amount: fmtMoney(shipment.invoiceValue),
      updatedAt: fmtDate(shipment.updatedAt),
      status: shipment.status
    }))
  ]) as Parameters<typeof ExportShipmentsKanbanClient>[0]["groups"];

  const shipmentExportOptions = {
    rows: shipments.flatMap((shipment) => {
      const products = shipment.products.length ? shipment.products : [{ productName: "", englishName: "" }];
      return products.map((product) => ({
        date: fmtDate(shipment.etd),
        salesOwner: shipment.salesOwner,
        exportOwner: shipment.exportOwner,
        country: shipment.exportCountry,
        buyer: shipment.buyer,
        product: product.englishName || product.productName
      }));
    }),
    salesOwners: uniqueValues([
      ...users.filter((item) => item.team === Team.OVERSEAS_MARKETING || item.team === Team.OVERSEAS_SALES).map((item) => item.name),
      ...shipments.map((shipment) => shipment.salesOwner)
    ]),
    exportOwners: uniqueValues([
      ...users.filter((item) => item.team === Team.OVERSEAS_SALES_SUPPORT).map((item) => item.name),
      ...shipments.map((shipment) => shipment.exportOwner)
    ]),
    countries: uniqueValues(shipments.map((shipment) => shipment.exportCountry)),
    buyers: uniqueValues(shipments.map((shipment) => shipment.buyer)),
    products: uniqueValues(shipments.flatMap((shipment) => shipment.products.map((product) => product.englishName || product.productName)))
  };

  const tabHref = (nextView: "sales" | "export" | "datalogger") => {
    const nextParams = new URLSearchParams();
    nextParams.set("view", nextView);
    if (q) nextParams.set("q", q);
    if (status) nextParams.set("status", status);
    return `/shipments?${nextParams.toString()}`;
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">선적의뢰</h1>
          <p className="mt-1 text-sm text-slate-500">영업담당자별 목록, 수출담당자별 칸반보드, 데이터로거를 관리합니다.</p>
        </div>
        <Link href="/shipments/new" className="btn-primary">
          선적의뢰 등록
        </Link>
      </div>

      <div className="flex gap-2">
        <Link href={tabHref("sales")} className={view === "sales" ? "btn-primary" : "btn"}>
          영업담당자별
        </Link>
        <Link href={tabHref("export")} className={view === "export" ? "btn-primary" : "btn"}>
          수출담당자별
        </Link>
        <Link href={tabHref("datalogger")} className={view === "datalogger" ? "btn-primary" : "btn"}>
          데이터로거 관리
        </Link>
      </div>

      {view === "datalogger" ? null : (
        <form className="panel flex items-end gap-3 p-4">
          <input type="hidden" name="view" value={view} />
          <div className="field min-w-96">
            <label>검색</label>
            <input name="q" defaultValue={q ?? ""} placeholder="수출국, 바이어, 제품명, PI No., INV No., 생산의뢰번호" />
          </div>
          <div className="field">
            <label>상태</label>
            <select name="status" defaultValue={status ?? ""}>
              <option value="">전체</option>
              <option value="REQUEST_WAITING">의뢰대기</option>
              <option value="SCHEDULE">1. 스케줄</option>
              <option value="QUOTE">★견적</option>
              <option value="SHIPPING_DOCS">2. 출고 및 선적/서류</option>
              <option value="NEGO_COLLECTION">3. 네고 및 수금처리</option>
              <option value="AFTERCARE">4. 사후관리</option>
            </select>
          </div>
          <button className="btn">검색</button>
        </form>
      )}

      {view === "datalogger" ? (
        <DataLoggerTable
          rows={dataLoggers.map((row) => ({
            id: row.id,
            loggerNo: row.loggerNo,
            quantity: row.quantity,
            receivedDate: row.receivedDate,
            releaseStatus: row.releaseStatus
          }))}
        />
      ) : view === "sales" ? (
        <ShipmentsListClient groups={groups} currentUserName={user.name} />
      ) : (
        <ExportShipmentsKanbanClient groups={exportGroups} currentUserName={user.name} />
      )}
      {view === "sales" || view === "export" ? <FloatingExportButton kind="shipments" shipmentOptions={shipmentExportOptions} /> : null}
    </div>
  );
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ko"));
}

function shipmentFactories(products: Array<{ factory: Factory | null }>) {
  return [
    ...new Set(
      products
        .map((product) => (product.factory === Factory.SEOMYEON ? "서면" : product.factory === Factory.JEONDONG ? "전동" : ""))
        .filter(Boolean)
    )
  ];
}
