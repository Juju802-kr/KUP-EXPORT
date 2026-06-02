import { Factory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { dateText, excelResponse, numberText, printableResponse, tableHtml } from "@/lib/export-table";
import { prisma } from "@/lib/prisma";

const headers = [
  "영업담당자",
  "수출담당자",
  "수출국",
  "바이어",
  "INV No.",
  "PI No.",
  "생산의뢰번호",
  "제품명(국문)",
  "제품명(영문)",
  "출고일자",
  "ETD",
  "ETA",
  "배치번호",
  "통화",
  "수출단가",
  "INV Value",
  "BOX(FOC X)",
  "BOX(FOC O)",
  "박스수량 합계",
  "공장",
  "총CT",
  "일반박스",
  "아이스박스",
  "주사제박스",
  "공용박스",
  "GW",
  "포워딩",
  "출발항",
  "목적항",
  "경유항/편명",
  "운송",
  "인코텀즈",
  "보관조건",
  "결제조건",
  "입금상황",
  "LC S/D"
];

export async function GET(request: Request) {
  await requireUser();
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "excel";
  const etdFrom = url.searchParams.get("etdFrom");
  const etdTo = url.searchParams.get("etdTo");
  const salesOwners = url.searchParams.getAll("salesOwner").filter(Boolean);
  const exportOwners = url.searchParams.getAll("exportOwner").filter(Boolean);
  const countries = url.searchParams.getAll("country").filter(Boolean);
  const buyers = url.searchParams.getAll("buyer").filter(Boolean);
  const products = url.searchParams.getAll("product").filter(Boolean);

  const shipments = await prisma.shipmentRequest.findMany({
    where: {
      ...(etdFrom || etdTo
        ? {
            etd: {
              ...(etdFrom ? { gte: new Date(`${etdFrom}T00:00:00`) } : {}),
              ...(etdTo ? { lte: new Date(`${etdTo}T23:59:59`) } : {})
            }
          }
        : {}),
      ...(salesOwners.length ? { salesOwner: { in: salesOwners } } : {}),
      ...(exportOwners.length ? { exportOwner: { in: exportOwners } } : {}),
      ...(countries.length ? { exportCountry: { in: countries } } : {}),
      ...(buyers.length ? { buyer: { in: buyers } } : {}),
      ...(products.length
        ? {
            products: {
              some: {
                OR: [
                  { productName: { in: products } },
                  { englishName: { in: products } }
                ]
              }
            }
          }
        : {})
    },
    include: { products: { orderBy: { createdAt: "asc" } } },
    orderBy: [{ etd: "asc" }, { updatedAt: "desc" }]
  });

  const rows = shipments.flatMap((shipment) => {
    const products = shipment.products.length
      ? shipment.products
      : [{
          piNo: "",
          productionRequestNo: "",
          productName: "",
          englishName: "",
          lotNo: "",
          exportUnitPrice: 0,
          amount: shipment.invoiceValue,
          bxQtyPaid: 0,
          bxQtyFoc: 0,
          bxQtyTotal: 0,
          factory: null,
          normalBoxQty: 0,
          iceBoxQty: 0,
          injectionBoxQty: 0,
          commonBoxQty: 0,
          grossWeight: 0
        }];

    return products.map((product) => {
      const totalCt =
        Number(product.normalBoxQty ?? 0) +
        Number(product.iceBoxQty ?? 0) +
        Number(product.injectionBoxQty ?? 0) +
        Number(product.commonBoxQty ?? 0);

      return {
        sortEtc: dateText(shipment.etd),
        sortSalesOwner: shipment.salesOwner ?? "",
        sortExportOwner: shipment.exportOwner ?? "",
        sortCountry: shipment.exportCountry ?? "",
        sortBuyer: shipment.buyer ?? "",
        sortProduct: product.englishName || product.productName || "",
        cells: [
          shipment.salesOwner,
          shipment.exportOwner,
          shipment.exportCountry,
          shipment.buyer,
          shipment.invNo,
          product.piNo,
          product.productionRequestNo,
          product.productName,
          product.englishName,
          dateText(shipment.releaseDate),
          dateText(shipment.etd),
          dateText(shipment.eta),
          product.lotNo,
          shipment.currency,
          numberText(product.exportUnitPrice),
          numberText(product.amount),
          product.bxQtyPaid,
          product.bxQtyFoc,
          product.bxQtyTotal,
          product.factory === Factory.SEOMYEON ? "서면" : product.factory === Factory.JEONDONG ? "전동" : "",
          totalCt,
          product.normalBoxQty,
          product.iceBoxQty,
          product.injectionBoxQty,
          product.commonBoxQty,
          numberText(product.grossWeight),
          shipment.forwarder,
          shipment.departurePort,
          shipment.destinationPort,
          shipment.transitFlight,
          shipment.transport,
          shipment.incoterms,
          shipment.storageCondition,
          shipment.paymentTerm,
          shipment.depositStatus,
          shipment.lcSd
        ]
      };
    });
  });

  rows.sort((a, b) =>
    String(a.sortEtc).localeCompare(String(b.sortEtc), "ko") ||
    String(a.sortSalesOwner).localeCompare(String(b.sortSalesOwner), "ko") ||
    String(a.sortExportOwner).localeCompare(String(b.sortExportOwner), "ko") ||
    String(a.sortCountry).localeCompare(String(b.sortCountry), "ko") ||
    String(a.sortBuyer).localeCompare(String(b.sortBuyer), "ko") ||
    String(a.sortProduct).localeCompare(String(b.sortProduct), "ko")
  );

  const title = "선적의뢰 데이터";
  const html = tableHtml(title, headers, rows.map((row) => row.cells));
  if (format === "pdf") return printableResponse(html);
  return excelResponse(`shipment-export-${new Date().toISOString().slice(0, 10)}`, html);
}
