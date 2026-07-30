import { prisma } from "@/lib/prisma";

type ReassignTarget = {
  toOwner: string;
  buyerNames?: string[];
  exportCountry?: string;
  updatedById: string;
};

function ownershipWhere(target: ReassignTarget) {
  const country = target.exportCountry?.trim() || "";
  const buyers = (target.buyerNames ?? []).map((name) => name.trim()).filter(Boolean);
  if (country) return { exportCountry: country };
  if (buyers.length) return { buyer: { in: buyers } };
  return null;
}

async function reassignSalesRegistrations(
  where: { exportCountry: string } | { buyer: { in: string[] } },
  toOwner: string,
  updatedById: string
) {
  const rows = await prisma.salesRegistration.findMany({ where });
  for (const row of rows) {
    if (row.salesOwner === toOwner) continue;
    const existing = await prisma.salesRegistration.findUnique({
      where: { orderKey_salesOwner: { orderKey: row.orderKey, salesOwner: toOwner } }
    });
    if (existing) {
      await prisma.salesRegistration.delete({ where: { id: row.id } });
      continue;
    }
    await prisma.salesRegistration.update({
      where: { id: row.id },
      data: { salesOwner: toOwner, updatedById }
    });
  }
}

/**
 * When buyer-master sales owner changes, move order-management rows to the new owner.
 * Does NOT touch ShipmentRequest / PaymentTT / PaymentLC (those keep historical owners).
 */
export async function reassignOrderManagementOwner(target: ReassignTarget) {
  const toOwner = target.toOwner.trim();
  if (!toOwner) return;

  const where = ownershipWhere(target);
  if (!where) return;

  await prisma.orderEntry.updateMany({
    where,
    data: { salesOwner: toOwner, updatedById: target.updatedById }
  });

  await reassignSalesRegistrations(where, toOwner, target.updatedById);

  // Alerts are country-scoped; only move them on country-wide ownership changes.
  if (!("exportCountry" in where)) return;

  const alertClient = (prisma as unknown as { orderAlert?: { updateMany: (args: unknown) => Promise<unknown> } }).orderAlert;
  if (alertClient) {
    await alertClient.updateMany({
      where: { exportCountry: where.exportCountry },
      data: { salesOwner: toOwner, updatedById: target.updatedById }
    });
  }
}
