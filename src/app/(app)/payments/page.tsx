import { AttachmentOwnerType, DropdownCategory, Team } from "@prisma/client";
import { FloatingExportButton } from "@/components/FloatingExportButton";
import { PaymentClient } from "@/components/PaymentClient";
import { fmtDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

const initialListLimit = 5;
const listLimitStep = 10;

function parseListLimit(value?: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < initialListLimit) return initialListLimit;
  return Math.min(Math.floor(parsed), 500);
}

function paymentMoreHref(params: Record<string, string | undefined>, nextLimit: number) {
  const next = new URLSearchParams();
  next.set("tab", params.tab === "lc" ? "lc" : "tt");
  if (params.q) next.set("q", params.q);
  if (params.pending === "1") next.set("pending", "1");
  next.set("limit", String(nextLimit));
  return `/payments?${next.toString()}`;
}

const ttPaymentSelect = {
  id: true,
  exportCountry: true,
  buyer: true,
  amount: true,
  currency: true,
  date: true,
  refNo: true,
  salesOwner: true,
  exportOwner: true,
  depositOwner: true,
  salesEmailRecipients: true,
  productionRequestNo: true,
  invNo: true,
  description: true,
  note: true,
  allocations: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      productionRequestNo: true,
      invNo: true,
      amount: true,
      note: true
    }
  }
} as const;

const lcPaymentSelect = {
  id: true,
  kind: true,
  bank: true,
  exportCountry: true,
  buyer: true,
  amount: true,
  currency: true,
  lcSd: true,
  noticeDate: true,
  lcNo: true,
  productionRequestNo: true,
  salesOwner: true,
  exportOwner: true,
  depositOwner: true,
  salesEmailRecipients: true,
  form: true,
  note: true,
  allocations: {
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      productionRequestNo: true,
      amount: true
    }
  }
} as const;

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const tab = params.tab === "lc" ? "lc" : "tt";
  const q = params.q?.trim();
  const editId = params.edit?.trim();
  const pendingOnly = params.pending === "1";
  const listLimit = parseListLimit(params.limit);
  const qAmount = q ? Number(q.replaceAll(",", "")) : NaN;
  const amountFilter = Number.isFinite(qAmount) ? [{ amount: qAmount }] : [];
  const ttWhere = {
    AND: [
      q
        ? {
            OR: [
              { salesOwner: { contains: q } },
              { exportCountry: { contains: q } },
              { buyer: { contains: q } },
              ...amountFilter,
              { productionRequestNo: { contains: q } },
              { invNo: { contains: q } },
              { refNo: { contains: q } }
            ]
          }
        : {},
      pendingOnly
        ? {
            AND: [
              { OR: [{ productionRequestNo: null }, { productionRequestNo: "" }] },
              { OR: [{ invNo: null }, { invNo: "" }] }
            ]
          }
        : {}
    ]
  };
  const lcWhere = {
    AND: [
      q
        ? {
            OR: [
              { salesOwner: { contains: q } },
              { exportCountry: { contains: q } },
              { buyer: { contains: q } },
              ...amountFilter,
              { productionRequestNo: { contains: q } },
              { lcNo: { contains: q } },
              { lcSd: { contains: q } }
            ]
          }
        : {},
      pendingOnly ? { OR: [{ productionRequestNo: null }, { productionRequestNo: "" }] } : {}
    ]
  };
  const [ttPayments, lcPayments, buyers, users, countries, banks] = await Promise.all([
    tab === "tt"
      ? prisma.paymentTT.findMany({
          where: ttWhere,
          orderBy: { createdAt: "desc" },
          take: listLimit + 1,
          select: ttPaymentSelect
        })
      : Promise.resolve([]),
    tab === "lc"
      ? prisma.paymentLC.findMany({
          where: lcWhere,
          orderBy: { createdAt: "desc" },
          take: listLimit + 1,
          select: lcPaymentSelect
        })
      : Promise.resolve([]),
    prisma.buyerMaster.findMany({ orderBy: [{ exportCountry: "asc" }, { buyerName: "asc" }] }),
    prisma.user.findMany({
      where: { team: { in: [Team.OVERSEAS_MARKETING, Team.OVERSEAS_SALES, Team.OVERSEAS_SALES_SUPPORT] } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, team: true }
    }),
    prisma.dropdownOption.findMany({
      where: { category: DropdownCategory.EXPORT_COUNTRY },
      orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      select: { label: true }
    }),
    tab === "lc"
      ? prisma.dropdownOption.findMany({
          where: { category: DropdownCategory.BANK },
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          select: { label: true }
        })
      : Promise.resolve([])
  ]);
  const hasMore = tab === "tt" ? ttPayments.length > listLimit : lcPayments.length > listLimit;
  const selectedTtPayment =
    tab === "tt" && editId && !ttPayments.some((payment) => payment.id === editId)
      ? await prisma.paymentTT.findUnique({ where: { id: editId }, select: ttPaymentSelect })
      : null;
  const selectedLcPayment =
    tab === "lc" && editId && !lcPayments.some((payment) => payment.id === editId)
      ? await prisma.paymentLC.findUnique({ where: { id: editId }, select: lcPaymentSelect })
      : null;
  const visibleTtPayments = [
    ...(selectedTtPayment ? [selectedTtPayment] : []),
    ...ttPayments.slice(0, listLimit).filter((payment) => payment.id !== selectedTtPayment?.id)
  ];
  const visibleLcPayments = [
    ...(selectedLcPayment ? [selectedLcPayment] : []),
    ...lcPayments.slice(0, listLimit).filter((payment) => payment.id !== selectedLcPayment?.id)
  ];
  const paymentIds = [...visibleTtPayments.map((payment) => payment.id), ...visibleLcPayments.map((payment) => payment.id)];
  const attachments = paymentIds.length
    ? await prisma.attachment.findMany({
        where: {
          ownerId: { in: paymentIds },
          ownerType: { in: [AttachmentOwnerType.PAYMENT_TT, AttachmentOwnerType.PAYMENT_TT_CONFIRM, AttachmentOwnerType.PAYMENT_LC] }
        },
        orderBy: { createdAt: "desc" }
      })
    : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">입금내역</h1>
        <p className="mt-1 text-sm text-slate-500">T/T 입금과 L/C 통지를 각각 관리합니다.</p>
      </div>

      <div className="flex gap-2">
        <a className={tab === "tt" ? "btn-primary" : "btn"} href="/payments?tab=tt">
          T/T 입금
        </a>
        <a className={tab === "lc" ? "btn-primary" : "btn"} href="/payments?tab=lc">
          L/C 통지
        </a>
      </div>

      <PaymentClient
        mode={tab}
        searchQuery={q ?? ""}
        pendingOnly={pendingOnly}
        ttPayments={visibleTtPayments.map((payment) => ({
          id: payment.id,
          exportCountry: payment.exportCountry,
          buyer: payment.buyer,
          amount: Number(payment.amount),
          currency: payment.currency,
          date: fmtDate(payment.date),
          refNo: payment.refNo,
          salesOwner: payment.salesOwner,
          exportOwner: payment.exportOwner,
          depositOwner: payment.depositOwner,
          salesEmailRecipients: payment.salesEmailRecipients,
          productionRequestNo: payment.productionRequestNo,
          invNo: payment.invNo,
          description: payment.description,
          note: payment.note,
          allocations: payment.allocations.map((allocation) => ({
            id: allocation.id,
            productionRequestNo: allocation.productionRequestNo,
            invNo: allocation.invNo,
            amount: Number(allocation.amount),
            note: allocation.note
          }))
        }))}
        lcPayments={visibleLcPayments.map((payment) => ({
          id: payment.id,
          kind: payment.kind,
          bank: payment.bank,
          exportCountry: payment.exportCountry,
          buyer: payment.buyer,
          amount: Number(payment.amount),
          currency: payment.currency,
          lcSd: payment.lcSd,
          noticeDate: fmtDate(payment.noticeDate),
          lcNo: payment.lcNo,
          productionRequestNo: payment.productionRequestNo,
          salesOwner: payment.salesOwner,
          exportOwner: payment.exportOwner,
          depositOwner: payment.depositOwner,
          salesEmailRecipients: payment.salesEmailRecipients,
          form: payment.form,
          note: payment.note,
          allocations: payment.allocations.map((allocation) => ({
            id: allocation.id,
            productionRequestNo: allocation.productionRequestNo,
            amount: Number(allocation.amount)
          }))
        }))}
        buyers={buyers.map((buyer) => ({
          id: buyer.id,
          exportCountry: buyer.exportCountry,
          buyerName: buyer.buyerName,
          defaultCurrency: buyer.defaultCurrency,
          salesOwner: buyer.salesOwner,
          exportOwner: buyer.exportOwner,
          salesEmailRecipients: buyer.salesEmailRecipients
        }))}
        users={users}
        countries={countries.map((country) => country.label)}
        banks={banks.map((bank) => bank.label)}
        attachments={attachments.map((file) => ({
          id: file.id,
          ownerId: file.ownerId,
          ownerType: file.ownerType,
          originalName: file.originalName,
          path: file.path,
          mimeType: file.mimeType
        }))}
      />
      {hasMore ? (
        <div className="flex justify-center">
          <a className="btn h-11 px-6" href={paymentMoreHref(params, listLimit + listLimitStep)}>
            더보기
          </a>
        </div>
      ) : null}
      <FloatingExportButton
        kind={tab === "lc" ? "lc" : "tt"}
        paymentOptions={{
          rows: (tab === "lc" ? visibleLcPayments : visibleTtPayments).map((payment) => ({
            date: fmtDate(tab === "lc" ? "noticeDate" in payment ? payment.noticeDate : null : "date" in payment ? payment.date : null),
            country: payment.exportCountry,
            buyer: payment.buyer,
            salesOwner: payment.salesOwner,
            exportOwner: payment.exportOwner
          }))
        }}
      />
    </div>
  );
}
