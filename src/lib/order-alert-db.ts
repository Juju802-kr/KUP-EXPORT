import { OrderAlertDismissType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type OrderAlertRow = {
  id: string;
  exportCountry: string;
  productName: string;
  content: string;
  createdAt: Date;
  cancelledAt?: Date | null;
  updatedAt?: Date;
  dismissals?: Array<{ dismissType: OrderAlertDismissType; orderEntryId: string | null; createdAt?: Date }>;
};

type OrderAlertDelegate = {
  findMany: (args: unknown) => Promise<OrderAlertRow[]>;
  findFirst: (args: unknown) => Promise<OrderAlertRow | null>;
  create: (args: unknown) => Promise<unknown>;
  update: (args: unknown) => Promise<unknown>;
};

type OrderAlertDismissalDelegate = {
  create: (args: unknown) => Promise<unknown>;
};

function orderAlertClient() {
  return (prisma as unknown as { orderAlert?: OrderAlertDelegate }).orderAlert ?? null;
}

function orderAlertDismissalClient() {
  return (prisma as unknown as { orderAlertDismissal?: OrderAlertDismissalDelegate }).orderAlertDismissal ?? null;
}

export function isOrderAlertReady() {
  return Boolean(orderAlertClient() && orderAlertDismissalClient());
}

export async function listActiveOrderAlertsForCountries(countries: string[], userId: string) {
  const client = orderAlertClient();
  if (!client || !countries.length) return [];
  return client.findMany({
    where: {
      exportCountry: { in: countries },
      cancelledAt: null,
      NOT: {
        dismissals: { some: { userId, dismissType: OrderAlertDismissType.PERMANENT } }
      }
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, exportCountry: true, productName: true, content: true, createdAt: true }
  });
}

/** @deprecated use listActiveOrderAlertsForCountries */
export async function listActiveOrderAlerts(salesOwner: string, userId = "") {
  const buyers = await prisma.buyerMaster.findMany({
    where: { salesOwner },
    select: { exportCountry: true, salesOwner: true }
  });
  const { ownerCountriesFromBuyers } = await import("@/lib/order-alert-owner");
  const countries = ownerCountriesFromBuyers(buyers, salesOwner);
  return listActiveOrderAlertsForCountries(countries, userId);
}

export async function listCompletedOrderAlertsForCountries(countries: string[], userId: string) {
  const client = orderAlertClient();
  if (!client || !countries.length) return [];
  return client.findMany({
    where: {
      exportCountry: { in: countries },
      OR: [
        { cancelledAt: { not: null } },
        { dismissals: { some: { userId, dismissType: OrderAlertDismissType.PERMANENT } } }
      ]
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      exportCountry: true,
      productName: true,
      content: true,
      createdAt: true,
      cancelledAt: true,
      updatedAt: true,
      dismissals: {
        where: { userId, dismissType: OrderAlertDismissType.PERMANENT },
        select: { createdAt: true }
      }
    }
  });
}

export async function listOrderAlertsForMatching(countries: string[], userId: string) {
  const client = orderAlertClient();
  if (!client || !countries.length) return [];
  return client.findMany({
    where: {
      exportCountry: { in: countries },
      cancelledAt: null
    },
    include: {
      dismissals: {
        where: { userId }
      }
    },
    orderBy: { createdAt: "asc" }
  });
}

export async function findActiveOrderAlert(exportCountry: string, productName: string) {
  const client = orderAlertClient();
  if (!client) return null;
  return client.findFirst({
    where: { exportCountry, productName, cancelledAt: null },
    select: { id: true }
  });
}

export async function createOrderAlertRecord(data: {
  salesOwner: string;
  exportCountry: string;
  productName: string;
  content: string;
  createdById: string;
  updatedById: string;
}) {
  const client = orderAlertClient();
  if (!client) throw new Error("ORDER_ALERT_NOT_READY");
  return client.create({ data });
}

export async function updateOrderAlertRecord(
  id: string,
  data: { exportCountry: string; productName: string; content: string; updatedById: string }
) {
  const client = orderAlertClient();
  if (!client) throw new Error("ORDER_ALERT_NOT_READY");
  return client.update({ where: { id }, data });
}

export async function cancelOrderAlertRecord(id: string, updatedById: string) {
  const client = orderAlertClient();
  if (!client) throw new Error("ORDER_ALERT_NOT_READY");
  return client.update({
    where: { id },
    data: { cancelledAt: new Date(), updatedById }
  });
}

export async function createOrderAlertDismissalRecord(data: {
  orderAlertId: string;
  userId: string;
  dismissType: OrderAlertDismissType;
  orderEntryId: string | null;
}) {
  const client = orderAlertDismissalClient();
  if (!client) throw new Error("ORDER_ALERT_NOT_READY");
  return client.create({ data });
}

export function orderAlertNotReadyMessage() {
  return "오더 알림 DB가 아직 준비되지 않았습니다. dev 서버를 중지한 뒤 npx prisma generate && npx prisma migrate deploy 를 실행해주세요.";
}
