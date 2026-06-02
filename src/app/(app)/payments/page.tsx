import { AttachmentOwnerType, DropdownCategory, Team } from "@prisma/client";
import { FloatingExportButton } from "@/components/FloatingExportButton";
import { PaymentClient } from "@/components/PaymentClient";
import { fmtDate } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const tab = params.tab === "lc" ? "lc" : "tt";
  const q = params.q?.trim();
  const [ttPayments, lcPayments, buyers, users, countries] = await Promise.all([
    prisma.paymentTT.findMany({
      where: q
        ? { OR: [{ exportCountry: { contains: q } }, { buyer: { contains: q } }, { refNo: { contains: q } }, { productionRequestNo: { contains: q } }, { invNo: { contains: q } }] }
        : {},
      orderBy: { createdAt: "desc" }
    }),
    prisma.paymentLC.findMany({
      where: q
        ? { OR: [{ exportCountry: { contains: q } }, { buyer: { contains: q } }, { productionRequestNo: { contains: q } }, { lcNo: { contains: q } }] }
        : {},
      orderBy: { createdAt: "desc" }
    }),
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
    })
  ]);
  const paymentIds = [...ttPayments.map((payment) => payment.id), ...lcPayments.map((payment) => payment.id)];
  const attachments = paymentIds.length
    ? await prisma.attachment.findMany({
        where: {
          ownerId: { in: paymentIds },
          ownerType: { in: [AttachmentOwnerType.PAYMENT_TT, AttachmentOwnerType.PAYMENT_LC] }
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
        ttPayments={ttPayments.map((payment) => ({
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
          note: payment.note
        }))}
        lcPayments={lcPayments.map((payment) => ({
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
          note: payment.note
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
        attachments={attachments.map((file) => ({
          id: file.id,
          ownerId: file.ownerId,
          originalName: file.originalName,
          path: file.path,
          mimeType: file.mimeType
        }))}
      />
      <FloatingExportButton
        kind={tab === "lc" ? "lc" : "tt"}
        paymentOptions={{
          rows: (tab === "lc" ? lcPayments : ttPayments).map((payment) => ({
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
