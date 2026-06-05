import { requireUser } from "@/lib/auth";
import { dateText, excelResponse, numberText, printableResponse, tableHtml } from "@/lib/export-table";
import { prisma } from "@/lib/prisma";

const ttHeaders = ["입금일", "국가", "바이어", "영업담당자", "수출담당자", "통화", "금액", "생산의뢰번호", "INV No.", "REF No.", "설명"];
const lcHeaders = ["통지일", "LC 종류", "국가", "바이어", "영업담당자", "수출담당자", "통화", "금액", "생산의뢰번호", "LC No.", "LC S/D"];

export async function GET(request: Request) {
  await requireUser();
  const url = new URL(request.url);
  const kind = url.searchParams.get("kind") === "lc" ? "lc" : "tt";
  const format = url.searchParams.get("format") ?? "excel";
  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  const countries = url.searchParams.getAll("country").filter(Boolean);
  const buyers = url.searchParams.getAll("buyer").filter(Boolean);
  const salesOwners = url.searchParams.getAll("salesOwner").filter(Boolean);
  const exportOwners = url.searchParams.getAll("exportOwner").filter(Boolean);

  if (kind === "lc") {
    const payments = await prisma.paymentLC.findMany({
      where: {
        ...(dateFrom || dateTo
          ? {
              noticeDate: {
                ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00`) } : {}),
                ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59`) } : {})
              }
            }
          : {}),
        ...(countries.length ? { exportCountry: { in: countries } } : {}),
        ...(buyers.length ? { buyer: { in: buyers } } : {}),
        ...(salesOwners.length ? { salesOwner: { in: salesOwners } } : {}),
        ...(exportOwners.length ? { exportOwner: { in: exportOwners } } : {})
      },
      orderBy: [{ noticeDate: "asc" }, { createdAt: "asc" }]
    });
    const rows = payments.map((payment) => [
      dateText(payment.noticeDate),
      lcKindText(payment.kind),
      payment.exportCountry ?? "",
      payment.buyer ?? "",
      payment.salesOwner ?? "",
      payment.exportOwner ?? "",
      payment.currency ?? "",
      numberText(payment.amount),
      payment.productionRequestNo ?? "",
      payment.lcNo ?? "",
      payment.lcSd ?? ""
    ]);
    const html = tableHtml("L/C 통지 데이터", lcHeaders, rows, { textColumns: [9] });
    if (format === "pdf") return printableResponse(html);
    return excelResponse(`lc-export-${new Date().toISOString().slice(0, 10)}`, html);
  }

  const payments = await prisma.paymentTT.findMany({
    where: {
      ...(dateFrom || dateTo
        ? {
            date: {
              ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00`) } : {}),
              ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59`) } : {})
            }
          }
        : {}),
      ...(countries.length ? { exportCountry: { in: countries } } : {}),
      ...(buyers.length ? { buyer: { in: buyers } } : {}),
      ...(salesOwners.length ? { salesOwner: { in: salesOwners } } : {}),
      ...(exportOwners.length ? { exportOwner: { in: exportOwners } } : {})
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }]
  });
  const rows = payments.map((payment) => [
    dateText(payment.date),
    payment.exportCountry ?? "",
    payment.buyer ?? "",
    payment.salesOwner ?? "",
    payment.exportOwner ?? "",
    payment.currency ?? "",
    numberText(payment.amount),
    payment.productionRequestNo ?? "",
    payment.invNo ?? "",
    payment.refNo ?? "",
    payment.description ?? ""
  ]);
  const html = tableHtml("T/T 입금 데이터", ttHeaders, rows);
  if (format === "pdf") return printableResponse(html);
  return excelResponse(`tt-export-${new Date().toISOString().slice(0, 10)}`, html);
}

function lcKindText(kind: string) {
  const labels: Record<string, string> = {
    OPEN: "OPEN",
    AMEND: "1st AMEND",
    AMEND_1ST: "1st AMEND",
    AMEND_2ND: "2nd AMEND",
    AMEND_3RD: "3rd AMEND",
    AMEND_4TH: "4th AMEND",
    AMEND_5TH: "5th AMEND"
  };
  return labels[kind] ?? kind;
}
