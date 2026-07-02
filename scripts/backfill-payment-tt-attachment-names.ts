import { PrismaClient } from "@prisma/client";
import {
  attachmentNameWithOriginalExtension,
  paymentTtAttachmentBaseName
} from "../src/lib/payment-attachment-name";

const prisma = new PrismaClient();

async function main() {
  const attachments = await prisma.attachment.findMany({
    where: {
      ownerType: "PAYMENT_TT",
      NOT: { ownerId: { contains: ":confirm" } }
    },
    select: { id: true, ownerId: true, originalName: true }
  });

  if (!attachments.length) {
    console.log("No T/T registration attachments found.");
    return;
  }

  const paymentIds = [...new Set(attachments.map((file) => file.ownerId))];
  const payments = await prisma.paymentTT.findMany({
    where: { id: { in: paymentIds } },
    include: { allocations: { orderBy: { sortOrder: "asc" } } }
  });
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));

  const updates = attachments.flatMap((attachment) => {
    const payment = paymentById.get(attachment.ownerId);
    if (!payment) return [];

    const baseName = paymentTtAttachmentBaseName({
      date: payment.date,
      buyer: payment.buyer,
      currency: payment.currency,
      amount: payment.amount,
      productionRequestNo: payment.productionRequestNo,
      invNo: payment.invNo,
      note: payment.note,
      allocations: payment.allocations
    });
    const originalName = attachmentNameWithOriginalExtension(baseName, attachment.originalName);
    if (originalName === attachment.originalName) return [];

    return [
      prisma.attachment.update({
        where: { id: attachment.id },
        data: { originalName }
      })
    ];
  });

  if (!updates.length) {
    console.log("All T/T registration attachment names are already up to date.");
    return;
  }

  await prisma.$transaction(updates);
  console.log(`Renamed ${updates.length} T/T registration attachment(s).`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
