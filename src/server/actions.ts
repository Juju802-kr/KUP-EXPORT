"use server";

import { DropdownCategory, Factory, NoticeType, OrderAlertDismissType, PaymentLcKind, ShipmentStatus, Team } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { destroySession, createSession, hashPassword, requireUser, verifyPassword } from "@/lib/auth";
import { resolveRecipientEmails, sendProgramEmail } from "@/lib/email-program";
import { fmtDate } from "@/lib/constants";
import { sendOrLogEmail } from "@/lib/mail";
import {
  attachmentNameWithOriginalExtension,
  paymentLcAttachmentBaseName,
  paymentTtAttachmentBaseName
} from "@/lib/payment-attachment-name";
import { orderMatchesAlert } from "@/lib/order-alert-matching";
import {
  cancelOrderAlertRecord,
  createOrderAlertDismissalRecord,
  createOrderAlertRecord,
  findActiveOrderAlert,
  listOrderAlertsForMatching,
  orderAlertNotReadyMessage,
  updateOrderAlertRecord
} from "@/lib/order-alert-db";
import {
  buildOrderAlertTargets,
  canonicalProductName,
  ownerCountriesFromBuyers
} from "@/lib/order-alert-owner";
import { ledgerPaymentLinesOnly, isBlankOrderEntry } from "@/lib/order-board-linking";
import { reassignOrderManagementOwner } from "@/lib/order-ownership-reassign";
import { findRegisteredBuyer } from "@/lib/order-pi-import";
import { prisma } from "@/lib/prisma";
import { lcDepositStatusAfterLcSd } from "@/lib/shipment-lc-deposit";
import { saveAttachments, deleteAttachment } from "@/lib/upload";
import { emailSchema, formDate, formNumber, formString, formUploadFiles } from "@/lib/validators";

function fail(path: string, message: string): never {
  redirect(withMessage(path, "error", message));
}

function assertOrderBoardOwner(userName: string, owner: string, path = "/orders") {
  if (owner.trim() !== userName.trim()) {
    fail(path, "담당자 본인만 수정할 수 있습니다.");
  }
}

async function assertCanEditOrderBoard(userName: string, owner: string, path = "/orders") {
  if (owner.trim() === userName.trim()) return;
  const {
    OVERSEAS_SALES_ALL_OWNER,
    isOverseasSalesAllOwner,
    isOverseasSalesLeader,
    overseasSalesMemberNames
  } = await import("@/lib/overseas-sales-roster");
  const roster = await prisma.dropdownOption.findMany({
    where: { category: DropdownCategory.OVERSEAS_SALES_TEAM },
    select: { label: true, partNo: true, rankNo: true, sortOrder: true }
  });
  if (!isOverseasSalesLeader(userName, roster)) {
    fail(path, "담당자 본인만 수정할 수 있습니다.");
  }
  if (isOverseasSalesAllOwner(owner) || owner.trim() === OVERSEAS_SALES_ALL_OWNER) return;
  if (overseasSalesMemberNames(roster).includes(owner.trim())) return;
  fail(path, "담당자 본인만 수정할 수 있습니다.");
}

function succeed(path: string, message: string): never {
  redirect(withMessage(path, "success", message));
}

function withMessage(path: string, key: "success" | "error", message: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${encodeURIComponent(message)}`;
}

function emailQueueRedirect(path: string, task: () => Promise<unknown>): never {
  after(async () => {
    try {
      await task();
    } catch (error) {
      await prisma.emailLog.create({
        data: {
          to: "",
          subject: "Background email failed",
          body: "",
          status: "FAILED_BACKGROUND",
          error: error instanceof Error ? error.message : "Unknown background email error"
        }
      });
    }
  });
  redirect(withMessage(path, "success", "이메일이 발송되었습니다."));
}

function noticeTypeText(type: NoticeType) {
  const labels: Record<NoticeType, string> = {
    GENERAL: "일반",
    URGENT: "긴급",
    MEETING: "회의",
    SHARE: "업무 공유",
    ETC: "기타"
  };
  return labels[type] ?? "일반";
}

function lcKindText(kind?: PaymentLcKind | string | null) {
  const labels: Record<string, string> = {
    OPEN: "OPEN",
    AMEND: "1st AMEND",
    AMEND_1ST: "1st AMEND",
    AMEND_2ND: "2nd AMEND",
    AMEND_3RD: "3rd AMEND",
    AMEND_4TH: "4th AMEND",
    AMEND_5TH: "5th AMEND"
  };
  return labels[String(kind ?? "OPEN")] ?? "OPEN";
}

function lcKindPriority(kind?: PaymentLcKind | string | null) {
  const priorities: Record<string, number> = {
    OPEN: 0,
    AMEND: 1,
    AMEND_1ST: 1,
    AMEND_2ND: 2,
    AMEND_3RD: 3,
    AMEND_4TH: 4,
    AMEND_5TH: 5
  };
  return priorities[String(kind ?? "OPEN")] ?? 0;
}

export async function registerAction(formData: FormData) {
  const team = formString(formData, "team") as Team;
  const name = formString(formData, "name");
  const emailPrefix = formString(formData, "emailPrefix").replace(/@.*/, "");
  const email = (formString(formData, "email") || `${emailPrefix}@kup.co.kr`).toLowerCase();
  const password = formString(formData, "password");
  const passwordConfirm = formString(formData, "passwordConfirm");
  const parsedEmail = emailSchema.safeParse(email);
  if (!parsedEmail.success) fail("/register", parsedEmail.error.issues[0].message);
  if (!emailPrefix && !formString(formData, "email")) fail("/register", "이메일 앞부분을 입력해주세요.");
  if (!Object.values(Team).includes(team)) fail("/register", "팀명을 선택해주세요.");
  if (!name) fail("/register", "이름을 입력해주세요.");
  if (password.length < 8) fail("/register", "비밀번호는 8자 이상이어야 합니다.");
  if (password !== passwordConfirm) fail("/register", "비밀번호와 비밀번호 확인이 일치하지 않습니다.");
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) fail("/register", "이미 가입된 이메일입니다.");
  const user = await prisma.user.create({ data: { team, name, email, passwordHash: await hashPassword(password) } });

  if (team === Team.OVERSEAS_SALES) {
    const { OVERSEAS_SALES_PROBATION_PART, overseasSalesSortOrder } = await import("@/lib/overseas-sales-roster");
    const probationCount = await prisma.dropdownOption.count({
      where: { category: DropdownCategory.OVERSEAS_SALES_TEAM, partNo: OVERSEAS_SALES_PROBATION_PART }
    });
    const rankNo = probationCount + 1;
    await prisma.dropdownOption.upsert({
      where: { category_label: { category: DropdownCategory.OVERSEAS_SALES_TEAM, label: name } },
      update: {
        partNo: OVERSEAS_SALES_PROBATION_PART,
        rankNo,
        sortOrder: overseasSalesSortOrder(OVERSEAS_SALES_PROBATION_PART, rankNo),
        value: name
      },
      create: {
        category: DropdownCategory.OVERSEAS_SALES_TEAM,
        label: name,
        value: name,
        partNo: OVERSEAS_SALES_PROBATION_PART,
        rankNo,
        sortOrder: overseasSalesSortOrder(OVERSEAS_SALES_PROBATION_PART, rankNo)
      }
    });
  }

  await createSession(user);
  redirect("/shipments");
}

export async function loginAction(formData: FormData) {
  const emailPrefix = formString(formData, "emailPrefix").replace(/@.*/, "");
  const email = (formString(formData, "email") || `${emailPrefix}@kup.co.kr`).toLowerCase();
  const password = formString(formData, "password");
  const autoLogin = formData.get("autoLogin") === "on";
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) fail("/login", "이메일 또는 비밀번호가 올바르지 않습니다.");
  await createSession(user, autoLogin);
  redirect("/shipments");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function changePasswordAction(formData: FormData) {
  const sessionUser = await requireUser();
  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) redirect("/login");
  const currentPassword = formString(formData, "currentPassword");
  const newPassword = formString(formData, "newPassword");
  const newPasswordConfirm = formString(formData, "newPasswordConfirm");

  if (!currentPassword) fail("/admin", "현재 비밀번호를 입력해주세요.");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) fail("/admin", "현재 비밀번호가 올바르지 않습니다.");
  if (newPassword.length < 8) fail("/admin", "변경 비밀번호는 8자 이상이어야 합니다.");
  if (newPassword !== newPasswordConfirm) fail("/admin", "변경 비밀번호와 확인값이 일치하지 않습니다.");
  if (await verifyPassword(newPassword, user.passwordHash)) fail("/admin", "현재 비밀번호와 다른 비밀번호를 입력해주세요.");

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(newPassword) }
  });
  succeed("/admin", "비밀번호가 변경되었습니다.");
}

export async function deleteAccountAction(formData: FormData) {
  const sessionUser = await requireUser();
  const user = await prisma.user.findUnique({ where: { id: sessionUser.id } });
  if (!user) redirect("/login");
  const currentPassword = formString(formData, "currentPassword");

  if (!currentPassword) fail("/admin", "현재 비밀번호를 입력해주세요.");
  if (!(await verifyPassword(currentPassword, user.passwordHash))) fail("/admin", "현재 비밀번호가 올바르지 않습니다.");

  await prisma.user.delete({ where: { id: user.id } });
  await destroySession();
  succeed("/login", "회원탈퇴가 완료되었습니다.");
}

async function nextShipNo() {
  const latest = await prisma.shipmentRequest.findFirst({ orderBy: { createdAt: "desc" }, select: { shipNo: true } });
  const n = latest ? Number(latest.shipNo.replace("Ship", "")) + 1 : 1;
  return `Ship${String(n).padStart(5, "0")}`;
}

async function nextShipmentSortOrder(salesOwner: string) {
  const latest = await prisma.shipmentRequest.findFirst({
    where: { salesOwner },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true }
  });
  return (latest?.sortOrder ?? -1) + 1;
}

export async function createShipmentAction(formData: FormData) {
  const user = await requireUser();
  const buyer = formString(formData, "buyer");
  const draftKey = formString(formData, "draftKey");
  const failPath = draftKey ? `/shipments/new?draft=${encodeURIComponent(draftKey)}` : "/shipments/new";
  if (!buyer) fail(failPath, "바이어는 필수입니다.");

  const buyers = await prisma.buyerMaster.findMany({
    select: {
      buyerName: true,
      exportCountry: true,
      defaultCurrency: true,
      salesOwner: true,
      exportOwner: true,
      salesEmailRecipients: true
    }
  });
  const exportCountryHint = formString(formData, "exportCountry");
  const buyerMaster =
    (exportCountryHint
      ? buyers.find((item) => item.buyerName === buyer && item.exportCountry === exportCountryHint)
      : undefined) ?? findRegisteredBuyer(buyer, buyers);
  const resolvedBuyer = buyerMaster?.buyerName || buyer;

  const salesOwner = formString(formData, "salesOwner") || buyerMaster?.salesOwner || user.name;
  if (!salesOwner) {
    fail(failPath, "영업담당자를 선택해주세요. 바이어 마스터에 영업담당자를 등록했는지 확인해 주세요.");
  }

  const form = readShipmentForm(formData);
  const shipment = await prisma.shipmentRequest.create({
    data: {
      ...form,
      buyer: resolvedBuyer,
      salesOwner,
      exportCountry: form.exportCountry || buyerMaster?.exportCountry || "",
      currency: form.currency || buyerMaster?.defaultCurrency || "USD",
      exportOwner: form.exportOwner || buyerMaster?.exportOwner || "",
      salesEmailRecipients: form.salesEmailRecipients || buyerMaster?.salesEmailRecipients || "",
      exportEmailRecipients: form.exportOwner || buyerMaster?.exportOwner || "",
      contactPerson: form.exportOwner || buyerMaster?.exportOwner || "",
      reporter: user.name,
      shipNo: await nextShipNo(),
      sortOrder: await nextShipmentSortOrder(salesOwner),
      createdById: user.id,
      updatedById: user.id
    }
  });
  await createProductsFromDraftJson(shipment.id, formString(formData, "draftProductsJson"), user.id);
  await saveAttachments(formData.getAll("files").filter((f): f is File => f instanceof File), "SHIPMENT", shipment.id, user.id);
  revalidatePath("/shipments");
  redirect(`/shipments/${shipment.id}`);
}

export async function createShipmentFromOrderAction(formData: FormData) {
  const user = await requireUser();
  const buyer = formString(formData, "buyer");
  const exportCountry = formString(formData, "exportCountry");
  if (!buyer) fail("/orders", "바이어 정보가 없어 선적의뢰를 만들 수 없습니다.");

  const buyers = await prisma.buyerMaster.findMany({
    select: {
      buyerName: true,
      exportCountry: true,
      defaultCurrency: true,
      salesOwner: true,
      exportOwner: true,
      salesEmailRecipients: true
    }
  });
  const buyerMaster = findRegisteredBuyer(buyer, buyers);
  const salesOwner = buyerMaster?.salesOwner || user.name;
  const shipment = await prisma.shipmentRequest.create({
    data: {
      status: ShipmentStatus.REQUEST_WAITING,
      exportCountry: exportCountry || buyerMaster?.exportCountry || "",
      buyer: buyerMaster?.buyerName || buyer,
      currency: buyerMaster?.defaultCurrency || "USD",
      salesOwner,
      exportOwner: buyerMaster?.exportOwner || "",
      salesEmailRecipients: buyerMaster?.salesEmailRecipients || "",
      exportEmailRecipients: buyerMaster?.exportOwner || "",
      contactPerson: buyerMaster?.exportOwner || "",
      reporter: user.name,
      shipNo: await nextShipNo(),
      sortOrder: await nextShipmentSortOrder(salesOwner),
      createdById: user.id,
      updatedById: user.id
    }
  });

  const productName = formString(formData, "productName");
  const englishName = formString(formData, "englishName");
  const productionRequestNo = formString(formData, "productionRequestNo");
  const piNo = formString(formData, "piNo");
  if (productName || englishName || productionRequestNo || piNo) {
    await prisma.shipmentProduct.create({
      data: {
        shipmentId: shipment.id,
        productName: productName || englishName || "제품명 미입력",
        englishName,
        productionRequestNo,
        piNo,
        createdById: user.id,
        updatedById: user.id
      }
    });
  }

  revalidatePath("/orders");
  revalidatePath("/shipments");
  redirect(`/shipments/${shipment.id}`);
}

function piDateFromPiNo(piNo: string) {
  const match = piNo.match(/KUP-(\d{2})(\d{2})(\d{2})/i);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(`20${match[1]}`), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseJsonArray(raw: string) {
  if (!raw) return [] as unknown[];
  try {
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

type OrderBoardRowFields = Record<string, string>;

function buildOrderEntryDataFromFields(fields: OrderBoardRowFields, userId: string) {
  const unitPrice = Number(fields.unitPrice) || 0;
  const quantity = Math.round(Number(fields.quantity) || 0);
  const orderAmount = Number(fields.orderAmount) || unitPrice * quantity;

  let shipmentLines = parseJsonArray(fields.shipmentLinesJson ?? "");
  let paymentLines = parseJsonArray(fields.paymentLinesJson ?? "");

  if (!shipmentLines.length) {
    const invNo = fields.invNo ?? "";
    const etd = fields.etd ?? "";
    const lotNo = fields.lotNo ?? "";
    const shipQty = Math.round(Number(fields.shipmentQuantity) || 0);
    const shipFocQty = Math.round(Number(fields.shipmentFocQuantity) || 0);
    const shipAmount = Number(fields.shipmentAmount) || 0;
    if (invNo || etd || lotNo || shipQty || shipFocQty || shipAmount) {
      shipmentLines = [{ invNo, etd, lotNo, quantity: shipQty, focQuantity: shipFocQty, amount: shipAmount }];
    }
  } else if (shipmentLines.length === 1) {
    const line = shipmentLines[0] as Record<string, unknown>;
    shipmentLines = [{
      invNo: "invNo" in fields ? (fields.invNo ?? "") : String(line.invNo ?? ""),
      etd: "etd" in fields ? (fields.etd ?? "") : String(line.etd ?? ""),
      lotNo: "lotNo" in fields ? (fields.lotNo ?? "") : String(line.lotNo ?? ""),
      quantity: "shipmentQuantity" in fields ? Math.round(Number(fields.shipmentQuantity) || 0) : Number(line.quantity) || 0,
      focQuantity: "shipmentFocQuantity" in fields ? Math.round(Number(fields.shipmentFocQuantity) || 0) : Number(line.focQuantity) || 0,
      amount: "shipmentAmount" in fields ? Number(fields.shipmentAmount) || 0 : Number(line.amount) || 0
    }];
  }

  if (!paymentLines.length) {
    const type = fields.paymentType ?? "";
    const date = fields.paymentDate ?? "";
    const amount = Number(fields.paymentAmount) || 0;
    if (type || date || amount) {
      paymentLines = [{ type: type || "T/T", date, amount, source: "수동" }];
    }
  } else if (paymentLines.length === 1) {
    const line = paymentLines[0] as Record<string, unknown>;
    paymentLines = [{
      type: "paymentType" in fields ? (fields.paymentType || "T/T") : String(line.type ?? "T/T"),
      date: "paymentDate" in fields ? (fields.paymentDate ?? "") : String(line.date ?? ""),
      amount: "paymentAmount" in fields ? Number(fields.paymentAmount) || 0 : Number(line.amount) || 0,
      source: String(line.source ?? "수동")
    }];
  }

  return {
    exportCountry: fields.exportCountry ?? "",
    buyer: fields.buyer ?? "",
    piDate: fields.piDate ? new Date(`${fields.piDate}T00:00:00.000Z`) : piDateFromPiNo(fields.piNo ?? ""),
    piNo: fields.piNo ?? "",
    productionRequestNo: fields.productionRequestNo ?? "",
    productName: fields.productName ?? "",
    unitPrice,
    quantity,
    focQuantity: Math.round(Number(fields.orderFocQuantity) || 0),
    amount: orderAmount,
    note: fields.note ?? "",
    leaderNote: fields.leaderNote ?? "",
    leaderPrivateNote: fields.leaderPrivateNote ?? "",
    shipmentLines,
    paymentLines: ledgerPaymentLinesOnly(paymentLines),
    updatedById: userId
  };
}

function formDataToFields(formData: FormData): OrderBoardRowFields {
  const fields: OrderBoardRowFields = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") fields[key] = value;
  }
  return fields;
}

export async function saveOrderBoardRowAction(formData: FormData) {
  const user = await requireUser();
  const owner = formString(formData, "owner") || user.name;
  await assertCanEditOrderBoard(user.name, owner);
  const sheet = formString(formData, "sheet");
  const rowKey = formString(formData, "rowKey");
  const fields = formDataToFields(formData);
  const data = buildOrderEntryDataFromFields(fields, user.id);
  const { isOverseasSalesAllOwner } = await import("@/lib/overseas-sales-roster");

  if (!rowKey.startsWith("entry:") && isBlankOrderEntry(data)) {
    throw new Error("PI 번호, 생산의뢰번호, 제품명 중 하나 이상과 오더 금액이 필요합니다.");
  }

  let salesOwner = owner;
  if (isOverseasSalesAllOwner(owner)) {
    const buyerName = (data.buyer || "").trim();
    const buyer = buyerName
      ? await prisma.buyerMaster.findFirst({ where: { buyerName }, select: { salesOwner: true } })
      : null;
    salesOwner = buyer?.salesOwner?.trim() || user.name;
  }

  if (rowKey.startsWith("entry:")) {
    const existing = await prisma.orderEntry.findUnique({ where: { id: rowKey.slice(6) } });
    if (!existing) throw new Error("오더를 찾을 수 없습니다.");
    const isLeaderViewer = isOverseasSalesAllOwner(owner) || (await isCurrentUserOverseasLeader(user.name));
    await prisma.orderEntry.update({
      where: { id: existing.id },
      data: {
        ...data,
        // Preserve the other party's note fields depending on viewer role.
        note: isLeaderViewer ? existing.note : data.note,
        leaderPrivateNote: isLeaderViewer ? data.leaderPrivateNote : existing.leaderPrivateNote,
        leaderNote: isLeaderViewer ? data.leaderNote : existing.leaderNote,
        salesOwner: existing.salesOwner
      }
    });
  } else {
    await prisma.orderEntry.create({
      data: { ...data, salesOwner, createdById: user.id }
    });
  }

  revalidatePath("/orders");
  redirect(`/orders?owner=${encodeURIComponent(owner)}&sheet=${encodeURIComponent(sheet)}`);
}

async function isCurrentUserOverseasLeader(userName: string) {
  const { isOverseasSalesLeader } = await import("@/lib/overseas-sales-roster");
  const leaders = await prisma.dropdownOption.findMany({
    where: { category: DropdownCategory.OVERSEAS_SALES_TEAM },
    select: { label: true, partNo: true, rankNo: true, sortOrder: true }
  });
  return isOverseasSalesLeader(userName, leaders);
}

export async function saveAllOrderBoardRowsAction(formData: FormData) {
  const user = await requireUser();
  const owner = formString(formData, "owner") || user.name;
  await assertCanEditOrderBoard(user.name, owner);
  const { isOverseasSalesAllOwner } = await import("@/lib/overseas-sales-roster");
  const isLeaderViewer = isOverseasSalesAllOwner(owner) || (await isCurrentUserOverseasLeader(user.name));
  const rows = parseJsonArray(formString(formData, "rowsPayload")) as OrderBoardRowFields[];

  const writes = [];
  for (const fields of rows) {
    const rowKey = fields.rowKey ?? "";
    const data = buildOrderEntryDataFromFields(fields, user.id);
    if (!rowKey.startsWith("entry:") && isBlankOrderEntry(data)) continue;
    if (rowKey.startsWith("entry:")) {
      const existing = await prisma.orderEntry.findUnique({ where: { id: rowKey.slice(6) } });
      if (!existing) continue;
      writes.push(
        prisma.orderEntry.update({
          where: { id: existing.id },
          data: {
            ...data,
            note: isLeaderViewer ? existing.note : data.note,
            leaderPrivateNote: isLeaderViewer ? data.leaderPrivateNote : existing.leaderPrivateNote,
            leaderNote: isLeaderViewer ? data.leaderNote : existing.leaderNote,
            salesOwner: existing.salesOwner
          }
        })
      );
      continue;
    }
    let salesOwner = owner;
    if (isOverseasSalesAllOwner(owner)) {
      const buyerName = (data.buyer || "").trim();
      const buyer = buyerName
        ? await prisma.buyerMaster.findFirst({ where: { buyerName }, select: { salesOwner: true } })
        : null;
      salesOwner = buyer?.salesOwner?.trim() || user.name;
    }
    writes.push(
      prisma.orderEntry.create({
        data: { ...data, salesOwner, createdById: user.id }
      })
    );
  }

  if (writes.length) await prisma.$transaction(writes);

  revalidatePath("/orders");
  return { ok: true as const, count: writes.length };
}

export async function ackOrderLeaderNoteAction(input: {
  orderEntryId: string;
  noteSnapshot: string;
  showAgain: boolean;
  owner?: string;
}) {
  const user = await requireUser();
  const orderEntryId = input.orderEntryId?.trim();
  if (!orderEntryId) return { ok: false as const, message: "오더를 찾을 수 없습니다." };

  await prisma.orderLeaderNoteAck.upsert({
    where: { orderEntryId_userId: { orderEntryId, userId: user.id } },
    update: {
      noteSnapshot: input.noteSnapshot ?? "",
      showAgain: Boolean(input.showAgain)
    },
    create: {
      orderEntryId,
      userId: user.id,
      noteSnapshot: input.noteSnapshot ?? "",
      showAgain: Boolean(input.showAgain)
    }
  });
  revalidatePath("/orders");
  return { ok: true as const };
}

export async function saveOrderEntriesAction(formData: FormData) {
  const user = await requireUser();
  const owner = formString(formData, "owner") || user.name;
  assertOrderBoardOwner(user.name, owner);
  const rowCount = formData.getAll("rowKey").length;
  const buyerNames = Array.from({ length: rowCount }, (_, index) => formString(formData, `buyer-${index}`)).filter(Boolean);
  const buyers = buyerNames.length
    ? await prisma.buyerMaster.findMany({ where: { buyerName: { in: buyerNames } }, select: { buyerName: true, exportCountry: true } })
    : [];
  const countryByBuyer = new Map(buyers.map((buyer) => [buyer.buyerName, buyer.exportCountry]));
  const exportProducts = await prisma.exportProductName.findMany({
    select: { exportCountry: true, productName: true, englishName: true }
  });

  const creates = [];
  for (let index = 0; index < rowCount; index += 1) {
    const buyer = formString(formData, `buyer-${index}`);
    const piNo = formString(formData, `piNo-${index}`);
    const productionRequestNo = formString(formData, `productionRequestNo-${index}`);
    const productName = formString(formData, `productName-${index}`);
    const unitPrice = formNumber(formData, `unitPrice-${index}`);
    const quantity = formNumber(formData, `quantity-${index}`);
    const focQuantity = formNumber(formData, `focQuantity-${index}`);
    const hasValue = buyer || piNo || productionRequestNo || productName || unitPrice || quantity || focQuantity;
    if (!hasValue) continue;
    creates.push(
      prisma.orderEntry.create({
        data: {
          salesOwner: owner,
          exportCountry: formString(formData, `exportCountry-${index}`) || countryByBuyer.get(buyer) || "",
          buyer,
          piDate: formDate(formData, `piDate-${index}`) || piDateFromPiNo(piNo),
          piNo,
          productionRequestNo,
          productName,
          incoterms: formString(formData, `incoterms-${index}`),
          transport: formString(formData, `transport-${index}`),
          destinationPort: formString(formData, `destinationPort-${index}`),
          unitPrice,
          quantity,
          focQuantity,
          amount: unitPrice * quantity,
          createdById: user.id,
          updatedById: user.id
        }
      })
    );
  }

  const createdEntries = creates.length ? await prisma.$transaction(creates) : [];
  const ownerCountries = await ownerCountriesForSalesOwner(owner);
  const triggeredAlerts = createdEntries.length
    ? await findTriggeredOrderAlerts(ownerCountries, user.id, createdEntries, exportProducts)
    : [];

  revalidatePath("/orders");
  return {
    ok: true as const,
    count: createdEntries.length,
    alerts: triggeredAlerts
  };
}

export type TriggeredOrderAlert = {
  alertId: string;
  orderEntryId: string;
  exportCountry: string;
  productName: string;
  content: string;
};

async function ownerCountriesForSalesOwner(owner: string) {
  const buyers = await prisma.buyerMaster.findMany({
    where: { salesOwner: owner },
    select: { exportCountry: true, salesOwner: true }
  });
  return ownerCountriesFromBuyers(buyers, owner);
}

async function findTriggeredOrderAlerts(
  ownerCountries: string[],
  userId: string,
  entries: Array<{ id: string; exportCountry: string | null; productName: string | null }>,
  exportProducts: Array<{ exportCountry: string; productName: string; englishName: string }>
): Promise<TriggeredOrderAlert[]> {
  if (!ownerCountries.length) return [];
  const alerts = await listOrderAlertsForMatching(ownerCountries, userId);

  const triggered: TriggeredOrderAlert[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const exportCountry = entry.exportCountry?.trim() || "";
    const productName = entry.productName?.trim() || "";
    if (!exportCountry || !productName || !ownerCountries.includes(exportCountry)) continue;

    for (const alert of alerts) {
      if (
        !orderMatchesAlert(
          { exportCountry, productName },
          { exportCountry: alert.exportCountry, productName: alert.productName },
          exportProducts
        )
      ) {
        continue;
      }

      const dismissals = alert.dismissals ?? [];
      const hasPermanent = dismissals.some((item) => item.dismissType === OrderAlertDismissType.PERMANENT);
      if (hasPermanent) continue;

      const snoozedForEntry = dismissals.some(
        (item) => item.dismissType === OrderAlertDismissType.LATER && item.orderEntryId === entry.id
      );
      if (snoozedForEntry) continue;

      const key = `${alert.id}:${entry.id}`;
      if (seen.has(key)) continue;
      seen.add(key);

      triggered.push({
        alertId: alert.id,
        orderEntryId: entry.id,
        exportCountry: alert.exportCountry,
        productName: alert.productName,
        content: alert.content
      });
    }
  }

  return triggered;
}

export async function saveOrderAlertAction(formData: FormData) {
  const user = await requireUser();
  const owner = formString(formData, "owner") || user.name;
  const exportCountry = formString(formData, "exportCountry");
  const productName = formString(formData, "productName");
  const content = formString(formData, "content");
  if (!exportCountry && !productName) {
    return { ok: false as const, message: "국가 또는 품목을 선택해주세요." };
  }
  if (!content.trim()) return { ok: false as const, message: "알림 내용을 입력해주세요." };

  const [ownerCountries, exportProducts] = await Promise.all([
    ownerCountriesForSalesOwner(owner),
    prisma.exportProductName.findMany({
      select: { exportCountry: true, productName: true, englishName: true }
    })
  ]);

  if (!ownerCountries.length) {
    return { ok: false as const, message: "담당 국가가 없어 알림을 만들 수 없습니다." };
  }

  if (exportCountry && !ownerCountries.includes(exportCountry)) {
    return { ok: false as const, message: "선택한 국가는 현재 담당 국가가 아닙니다." };
  }

  const targets = buildOrderAlertTargets(exportCountry, productName, ownerCountries, exportProducts);
  if (!targets.length) {
    return { ok: false as const, message: "생성할 알림 대상이 없습니다." };
  }

  let createdCount = 0;
  try {
    for (const target of targets) {
      const existing = await findActiveOrderAlert(target.exportCountry, target.productName);
      if (existing) continue;
      await createOrderAlertRecord({
        salesOwner: owner,
        exportCountry: target.exportCountry,
        productName: target.productName,
        content: content.trim(),
        createdById: user.id,
        updatedById: user.id
      });
      createdCount += 1;
    }
    if (!createdCount) {
      return { ok: false as const, message: "이미 등록된 알림이 있거나 생성할 알림이 없습니다." };
    }
  } catch {
    return { ok: false as const, message: orderAlertNotReadyMessage() };
  }

  revalidatePath("/orders");
  return { ok: true as const, createdCount };
}

export async function updateOrderAlertAction(formData: FormData) {
  const user = await requireUser();
  const owner = formString(formData, "owner") || user.name;
  const id = formString(formData, "id");
  const exportCountry = formString(formData, "exportCountry");
  const productName = formString(formData, "productName");
  const content = formString(formData, "content");
  if (!id) return { ok: false as const, message: "수정할 알림을 찾을 수 없습니다." };
  if (!exportCountry || !productName || !content.trim()) {
    return { ok: false as const, message: "국가, 품목, 내용을 모두 입력해주세요." };
  }

  const ownerCountries = await ownerCountriesForSalesOwner(owner);
  if (!ownerCountries.includes(exportCountry)) {
    return { ok: false as const, message: "선택한 국가는 현재 담당 국가가 아닙니다." };
  }

  const exportProducts = await prisma.exportProductName.findMany({
    select: { exportCountry: true, productName: true, englishName: true }
  });
  const canonicalName = canonicalProductName(exportCountry, productName, exportProducts);

  try {
    await updateOrderAlertRecord(id, {
      exportCountry,
      productName: canonicalName,
      content: content.trim(),
      updatedById: user.id
    });
  } catch {
    return { ok: false as const, message: orderAlertNotReadyMessage() };
  }

  revalidatePath("/orders");
  return { ok: true as const };
}

export async function cancelOrderAlertAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  if (!id) return { ok: false as const, message: "취소할 알림을 찾을 수 없습니다." };

  try {
    await cancelOrderAlertRecord(id, user.id);
  } catch {
    return { ok: false as const, message: orderAlertNotReadyMessage() };
  }

  revalidatePath("/orders");
  return { ok: true as const };
}

export async function dismissOrderAlertAction(formData: FormData) {
  const user = await requireUser();
  const alertId = formString(formData, "alertId");
  const orderEntryId = formString(formData, "orderEntryId");
  const dismissType = formString(formData, "dismissType") as OrderAlertDismissType;
  if (!alertId || !orderEntryId) return { ok: false as const, message: "알림 정보가 없습니다." };
  if (dismissType !== OrderAlertDismissType.PERMANENT && dismissType !== OrderAlertDismissType.LATER) {
    return { ok: false as const, message: "잘못된 알림 처리 유형입니다." };
  }

  try {
    await createOrderAlertDismissalRecord({
      orderAlertId: alertId,
      userId: user.id,
      dismissType,
      orderEntryId: dismissType === OrderAlertDismissType.LATER ? orderEntryId : null
    });
  } catch {
    return { ok: false as const, message: orderAlertNotReadyMessage() };
  }

  return { ok: true as const };
}

export async function registerSalesOrderAction(formData: FormData) {
  const user = await requireUser();
  const owner = formString(formData, "owner") || user.name;
  assertOrderBoardOwner(user.name, owner);
  const orderKey = formString(formData, "orderKey");
  if (!orderKey) fail(`/orders?owner=${encodeURIComponent(owner)}`, "등록할 오더를 찾을 수 없습니다.");
  await prisma.salesRegistration.upsert({
    where: { orderKey_salesOwner: { orderKey, salesOwner: owner } },
    update: {
      exportCountry: formString(formData, "exportCountry"),
      buyer: formString(formData, "buyer"),
      piNo: formString(formData, "piNo"),
      productionRequestNo: formString(formData, "productionRequestNo"),
      amount: formNumber(formData, "amount"),
      registeredAt: formDate(formData, "registeredAt") || new Date(),
      status: "REGISTERED",
      note: formString(formData, "note"),
      updatedById: user.id
    },
    create: {
      orderKey,
      salesOwner: owner,
      exportCountry: formString(formData, "exportCountry"),
      buyer: formString(formData, "buyer"),
      piNo: formString(formData, "piNo"),
      productionRequestNo: formString(formData, "productionRequestNo"),
      amount: formNumber(formData, "amount"),
      registeredAt: formDate(formData, "registeredAt") || new Date(),
      status: "REGISTERED",
      note: formString(formData, "note"),
      createdById: user.id,
      updatedById: user.id
    }
  });
  revalidatePath("/orders");
  redirect(`/orders?owner=${encodeURIComponent(owner)}&sheet=${encodeURIComponent(formString(formData, "sheet"))}`);
}

export async function cancelSalesOrderRegistrationAction(formData: FormData) {
  const user = await requireUser();
  const owner = formString(formData, "owner") || user.name;
  assertOrderBoardOwner(user.name, owner);
  const orderKey = formString(formData, "orderKey");
  if (orderKey) {
    await prisma.salesRegistration.updateMany({
      where: { orderKey, salesOwner: owner },
      data: { status: "CANCELED", updatedById: user.id }
    });
  }
  revalidatePath("/orders");
  redirect(`/orders?owner=${encodeURIComponent(owner)}&sheet=${encodeURIComponent(formString(formData, "sheet"))}`);
}

export async function updateShipmentAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  await prisma.shipmentRequest.update({ where: { id }, data: { ...readShipmentForm(formData), updatedById: user.id } });
  await saveAttachments(formData.getAll("files").filter((f): f is File => f instanceof File), "SHIPMENT", id, user.id);
  revalidatePath(`/shipments/${id}`);
  redirect(`/shipments/${id}`);
}

function readShipmentForm(formData: FormData) {
  return {
    status: (formString(formData, "status") || "REQUEST_WAITING") as ShipmentStatus,
    exportCountry: formString(formData, "exportCountry"),
    buyer: formString(formData, "buyer"),
    transport: formString(formData, "transport"),
    destinationPort: formString(formData, "destinationPort"),
    storageCondition: formString(formData, "storageCondition"),
    incoterms: formString(formData, "incoterms"),
    paymentTerm: formString(formData, "paymentTerm"),
    forwarder: formString(formData, "forwarder"),
    departurePort: formString(formData, "departurePort"),
    transitFlight: formString(formData, "transitFlight"),
    currency: formString(formData, "currency") || "USD",
    depositStatus: formString(formData, "depositStatus"),
    salesRequest: formString(formData, "salesRequest"),
    emailSent: formString(formData, "emailSent"),
    note: formString(formData, "note"),
    suitabilityDate: formString(formData, "suitabilityDate"),
    shippingApprovalDate: formString(formData, "shippingApprovalDate"),
    desiredShipDate: formString(formData, "desiredShipDate"),
    releaseDate: formDate(formData, "releaseDate"),
    etd: formDate(formData, "etd"),
    eta: formDate(formData, "eta"),
    invNo: formString(formData, "invNo"),
    lcSd: formString(formData, "lcSd"),
    freightTotal: formNumber(formData, "freightTotal"),
    dispatchNote: formString(formData, "dispatchNote"),
    usePt: formString(formData, "usePt") === "1",
    ptQty: Math.round(formNumber(formData, "ptQty")),
    ptSpec: formString(formData, "ptSpec"),
    salesOwner: formString(formData, "salesOwner"),
    exportOwner: formString(formData, "exportOwner"),
    salesEmailRecipients: formData.getAll("salesEmailRecipients").map(String).filter(Boolean).join(", "),
    exportEmailRecipients: formString(formData, "exportOwner"),
    contactPerson: formString(formData, "exportOwner")
  };
}

export async function deleteShipmentAction(formData: FormData) {
  await requireUser();
  await prisma.shipmentRequest.delete({ where: { id: formString(formData, "id") } });
  revalidatePath("/shipments");
  redirect("/shipments");
}

export async function deleteSelectedShipmentsAction(formData: FormData) {
  await requireUser();
  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length) {
    await prisma.shipmentRequest.deleteMany({ where: { id: { in: ids } } });
  }
  revalidatePath("/shipments");
  redirect("/shipments");
}

export async function reorderShipmentsAction(formData: FormData) {
  await requireUser();
  const ids = formString(formData, "ids").split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.length) {
    await prisma.$transaction(ids.map((id, index) => prisma.shipmentRequest.update({ where: { id }, data: { sortOrder: index } })));
  }
  revalidatePath("/shipments");
}

export async function updateShipmentKanbanStatusAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const status = formString(formData, "status") as ShipmentStatus;
  if (!id || !Object.values(ShipmentStatus).includes(status)) return;
  await prisma.shipmentRequest.update({
    where: { id },
    data: { status, updatedById: user.id }
  });
  revalidatePath("/shipments");
  revalidatePath(`/shipments/${id}`);
}

export async function copyShipmentAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const source = await prisma.shipmentRequest.findUnique({ where: { id }, include: { products: true } });
  if (!source) redirect("/shipments");

  const copied = await prisma.shipmentRequest.create({
    data: {
      shipNo: await nextShipNo(),
      status: source.status,
      exportCountry: source.exportCountry,
      buyer: source.buyer,
      transport: source.transport,
      destinationPort: source.destinationPort,
      storageCondition: source.storageCondition,
      incoterms: source.incoterms,
      paymentTerm: source.paymentTerm,
      forwarder: source.forwarder,
      departurePort: source.departurePort,
      transitFlight: source.transitFlight,
      currency: source.currency,
      depositStatus: source.depositStatus,
      salesRequest: source.salesRequest,
      emailSent: source.emailSent,
      note: source.note,
      releaseDate: source.releaseDate,
      etd: source.etd,
      eta: source.eta,
      invNo: source.invNo,
      productionRequestNo: source.productionRequestNo,
      lcSd: source.lcSd,
      salesOwner: source.salesOwner,
      exportOwner: source.exportOwner,
      salesEmailRecipients: source.salesEmailRecipients,
      exportEmailRecipients: source.exportEmailRecipients,
      branchEmailRecipients: source.branchEmailRecipients,
      contactPerson: source.contactPerson,
      reporter: user.name,
      invoiceValue: source.invoiceValue,
      freightTotal: source.freightTotal,
      dispatchNote: source.dispatchNote,
      sortOrder: await nextShipmentSortOrder(source.salesOwner ?? ""),
      createdById: user.id,
      updatedById: user.id,
      products: {
        create: source.products.map((product) => ({
          productMasterId: product.productMasterId,
          productName: product.productName,
          costGroupCode: product.costGroupCode,
          factory: product.factory,
          englishName: product.englishName,
          productionRequestNo: product.productionRequestNo,
          piNo: product.piNo,
          lotNo: product.lotNo,
          exportUnitPrice: product.exportUnitPrice,
          bxQtyPaid: product.bxQtyPaid,
          bxQtyFoc: product.bxQtyFoc,
          bxQtyTotal: product.bxQtyTotal,
          changeNote: product.changeNote,
          normalBoxQty: product.normalBoxQty,
          iceBoxQty: product.iceBoxQty,
          injectionBoxQty: product.injectionBoxQty,
          commonBoxQty: product.commonBoxQty,
          grossWeight: product.grossWeight,
          exportEmailRecipients: product.exportEmailRecipients,
          amount: product.amount,
          createdById: user.id,
          updatedById: user.id
        }))
      }
    }
  });

  revalidatePath("/shipments");
  redirect(`/shipments/${copied.id}`);
}

export async function createDataLoggerAction(formData: FormData) {
  const user = await requireUser();
  await prisma.dataLogger.create({
    data: {
      loggerNo: formString(formData, "loggerNo"),
      quantity: formString(formData, "quantity"),
      receivedDate: formString(formData, "receivedDate"),
      releaseStatus: formString(formData, "releaseStatus"),
      createdById: user.id,
      updatedById: user.id
    }
  });
  revalidatePath("/shipments");
  redirect("/shipments?view=datalogger");
}

export async function updateDataLoggerAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  if (!id) redirect("/shipments?view=datalogger");
  await prisma.dataLogger.update({
    where: { id },
    data: {
      loggerNo: formString(formData, "loggerNo"),
      quantity: formString(formData, "quantity"),
      receivedDate: formString(formData, "receivedDate"),
      releaseStatus: formString(formData, "releaseStatus"),
      updatedById: user.id
    }
  });
  revalidatePath("/shipments");
  redirect("/shipments?view=datalogger");
}

export async function saveDataLoggersAction(formData: FormData) {
  const user = await requireUser();
  const deletedIds = formData.getAll("deletedId").map((id) => String(id)).filter(Boolean);
  const rowCount = formData.getAll("rowKey").length;
  const operations = [];
  if (deletedIds.length) {
    operations.push(prisma.dataLogger.deleteMany({ where: { id: { in: deletedIds } } }));
  }
  for (let index = 0; index < rowCount; index += 1) {
    const id = formString(formData, `id-${index}`);
    if (deletedIds.includes(id)) continue;
    const loggerNo = formString(formData, `loggerNo-${index}`);
    const quantity = formString(formData, `quantity-${index}`);
    const receivedDate = formString(formData, `receivedDate-${index}`);
    const releaseStatus = formString(formData, `releaseStatus-${index}`);
    const hasValue = loggerNo || quantity || receivedDate || releaseStatus;
    if (!id && !hasValue) continue;
    if (id) {
      operations.push(
        prisma.dataLogger.update({
          where: { id },
          data: { loggerNo, quantity, receivedDate, releaseStatus, updatedById: user.id }
        })
      );
    } else {
      operations.push(
        prisma.dataLogger.create({
          data: { loggerNo, quantity, receivedDate, releaseStatus, createdById: user.id, updatedById: user.id }
        })
      );
    }
  }
  if (operations.length) await prisma.$transaction(operations);
  revalidatePath("/shipments");
  redirect("/shipments?view=datalogger");
}

export async function createProductAction(formData: FormData) {
  const user = await requireUser();
  const shipmentId = formString(formData, "shipmentId");
  const data = readProductForm(formData, user.id);
  const product = await prisma.shipmentProduct.create({ data: { ...data, shipmentId } });
  await Promise.all([
    saveAttachments(formData.getAll("files").filter((f): f is File => f instanceof File), "SHIPMENT_PRODUCT", product.id, user.id),
    recalcShipmentInvoice(shipmentId),
    autoLinkShipmentLc(shipmentId, user.id)
  ]);
  revalidatePath(`/shipments/${shipmentId}`);
  redirect(`/shipments/${shipmentId}`);
}

export async function updateProductAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const shipmentId = formString(formData, "shipmentId");
  const data = readProductForm(formData, user.id);
  await prisma.shipmentProduct.update({ where: { id }, data: { ...omitCreatedBy(data), updatedById: user.id } });
  await Promise.all([
    saveAttachments(formData.getAll("files").filter((f): f is File => f instanceof File), "SHIPMENT_PRODUCT", id, user.id),
    recalcShipmentInvoice(shipmentId),
    autoLinkShipmentLc(shipmentId, user.id)
  ]);
  revalidatePath(`/shipments/${shipmentId}`);
  redirect(`/shipments/${shipmentId}`);
}

export async function deleteProductAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const shipmentId = formString(formData, "shipmentId");
  await prisma.shipmentProduct.delete({ where: { id } });
  await Promise.all([recalcShipmentInvoice(shipmentId), autoLinkShipmentLc(shipmentId, user.id)]);
  revalidatePath(`/shipments/${shipmentId}`);
  redirect(`/shipments/${shipmentId}`);
}

type DraftProductInput = {
  productName?: string;
  englishName?: string;
  productionRequestNo?: string;
  piNo?: string;
  exportUnitPrice?: number;
  bxQtyPaid?: number;
  bxQtyFoc?: number;
};

type ProductMasterLookup = {
  id: string;
  name: string;
  costGroupCode: string;
  factory: Factory;
};

function resolveDraftProductMaster(
  productName: string,
  englishName: string,
  mastersByName: Map<string, ProductMasterLookup>,
  aliasesByEnglish: Map<string, string>
) {
  const koreanName = productName.trim();
  if (koreanName) {
    const direct = mastersByName.get(koreanName);
    if (direct) return direct;
  }

  const englishKey = englishName.trim().toLowerCase();
  if (englishKey) {
    const aliasKorean = aliasesByEnglish.get(englishKey);
    if (aliasKorean) return mastersByName.get(aliasKorean) ?? null;
  }

  if (koreanName) {
    const aliasKorean = aliasesByEnglish.get(koreanName.toLowerCase());
    if (aliasKorean) return mastersByName.get(aliasKorean) ?? null;
  }

  return null;
}

function parseDraftProductsJson(raw: string): DraftProductInput[] {
  if (!raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DraftProductInput[]) : [];
  } catch {
    return [];
  }
}

async function createProductsFromDraftJson(shipmentId: string, raw: string, userId: string) {
  const products = parseDraftProductsJson(raw);
  if (!products.length) return;

  const shipment = await prisma.shipmentRequest.findUnique({
    where: { id: shipmentId },
    select: { exportCountry: true }
  });
  const exportCountry = shipment?.exportCountry?.trim() || "";

  const [masters, exportNames] = await Promise.all([
    prisma.productMaster.findMany({ select: { id: true, name: true, costGroupCode: true, factory: true } }),
    exportCountry
      ? prisma.exportProductName.findMany({
          where: { exportCountry },
          select: { productName: true, englishName: true }
        })
      : Promise.resolve([])
  ]);

  const mastersByName = new Map(masters.map((master) => [master.name.trim(), master]));
  const aliasesByEnglish = new Map<string, string>();
  for (const alias of exportNames) {
    const korean = alias.productName.trim();
    if (!korean) continue;
    const english = alias.englishName.trim().toLowerCase();
    if (english) aliasesByEnglish.set(english, korean);
    aliasesByEnglish.set(korean.toLowerCase(), korean);
  }

  for (const product of products) {
    const productName = product.productName?.trim() || product.englishName?.trim() || "";
    const englishName = product.englishName?.trim() || "";
    const productionRequestNo = product.productionRequestNo?.trim() || "";
    const piNo = product.piNo?.trim() || "";
    if (!productName && !englishName && !productionRequestNo && !piNo) continue;

    const bxQtyPaid = Math.round(Number(product.bxQtyPaid) || 0);
    const bxQtyFoc = Math.round(Number(product.bxQtyFoc) || 0);
    const exportUnitPrice = Number(product.exportUnitPrice) || 0;
    const master = resolveDraftProductMaster(productName, englishName, mastersByName, aliasesByEnglish);

    await prisma.shipmentProduct.create({
      data: {
        shipmentId,
        productMasterId: master?.id ?? null,
        productName: productName || englishName || "제품명 미입력",
        costGroupCode: master?.costGroupCode ?? null,
        factory: master?.factory ?? null,
        englishName,
        productionRequestNo,
        piNo,
        exportUnitPrice,
        bxQtyPaid,
        bxQtyFoc,
        bxQtyTotal: bxQtyPaid + bxQtyFoc,
        amount: exportUnitPrice * bxQtyPaid,
        createdById: userId,
        updatedById: userId
      }
    });
  }

  await Promise.all([recalcShipmentInvoice(shipmentId), autoLinkShipmentLc(shipmentId, userId)]);
}

function readProductForm(formData: FormData, userId: string) {
  const bxQtyPaid = formNumber(formData, "bxQtyPaid");
  const bxQtyFoc = formNumber(formData, "bxQtyFoc");
  const exportUnitPrice = formNumber(formData, "exportUnitPrice");
  return {
    productMasterId: formString(formData, "productMasterId") || null,
    productName: formString(formData, "productName"),
    costGroupCode: formString(formData, "costGroupCode"),
    factory: (formString(formData, "factory") || null) as Factory | null,
    englishName: formString(formData, "englishName"),
    productionRequestNo: formString(formData, "productionRequestNo"),
    piNo: formString(formData, "piNo"),
    lotNo: formString(formData, "lotNo"),
    exportUnitPrice,
    bxQtyPaid,
    bxQtyFoc,
    bxQtyTotal: bxQtyPaid + bxQtyFoc,
    amount: exportUnitPrice * bxQtyPaid,
    changeNote: formString(formData, "changeNote"),
    coaUploadRequestDate: formDate(formData, "coaUploadRequestDate"),
    normalBoxQty: formNumber(formData, "normalBoxQty"),
    iceBoxQty: formNumber(formData, "iceBoxQty"),
    injectionBoxQty: formNumber(formData, "injectionBoxQty"),
    commonBoxQty: formNumber(formData, "commonBoxQty"),
    grossWeight: formNumber(formData, "grossWeight"),
    exportEmailRecipients: formString(formData, "exportEmailRecipients"),
    createdById: userId,
    updatedById: userId
  };
}

async function recalcShipmentInvoice(shipmentId: string) {
  const products = await prisma.shipmentProduct.findMany({ where: { shipmentId }, select: { amount: true } });
  const invoiceValue = products.reduce((sum, product) => sum + Number(product.amount), 0);
  await prisma.shipmentRequest.update({ where: { id: shipmentId }, data: { invoiceValue } });
}

async function autoLinkShipmentLc(shipmentId: string, userId: string) {
  const products = await prisma.shipmentProduct.findMany({
    where: { shipmentId, productionRequestNo: { not: null } },
    select: { productionRequestNo: true }
  });
  const productionNos = [...new Set(products.map((product) => product.productionRequestNo).filter(Boolean) as string[])];
  const lcs = productionNos.length
    ? await prisma.paymentLC.findMany({
        where: {
          OR: [
            { productionRequestNo: { in: productionNos } },
            { allocations: { some: { productionRequestNo: { in: productionNos } } } }
          ]
        }
      })
    : [];
  const sortedLcs = lcs.sort((a, b) => lcKindPriority(b.kind) - lcKindPriority(a.kind) || b.createdAt.getTime() - a.createdAt.getTime());
  const lc = sortedLcs.find((row) => row.lcSd) ?? sortedLcs[0];
  const lcSd = lc?.lcSd ?? "";
  const shipment = await prisma.shipmentRequest.findUnique({
    where: { id: shipmentId },
    select: { depositStatus: true }
  });
  const depositStatus = lcDepositStatusAfterLcSd(shipment?.depositStatus, lcSd);
  await prisma.$transaction([
    prisma.lcShipmentLink.deleteMany({ where: { shipmentId } }),
    ...(lc ? [prisma.lcShipmentLink.create({ data: { shipmentId, lcId: lc.id, createdById: userId } })] : []),
    prisma.shipmentRequest.update({
      where: { id: shipmentId },
      data: {
        linkedLcId: lc?.id ?? null,
        lcSd,
        updatedById: userId,
        ...(depositStatus ? { depositStatus } : {})
      }
    })
  ]);
}

async function autoLinkLcToShipments(paymentLcId: string, userId: string) {
  const lc = await prisma.paymentLC.findUnique({ where: { id: paymentLcId } });
  if (!lc?.productionRequestNo) return;
  const products = await prisma.shipmentProduct.findMany({
    where: { productionRequestNo: lc.productionRequestNo },
    select: { shipmentId: true }
  });
  const shipmentIds = [...new Set(products.map((product) => product.shipmentId))];
  for (const shipmentId of shipmentIds) {
    await autoLinkShipmentLc(shipmentId, userId);
  }
}

export async function createPaymentTTAction(formData: FormData) {
  return savePaymentTT(formData, formString(formData, "intent") || "save");
}

export async function notifyPaymentTTAction(formData: FormData) {
  return savePaymentTT(formData, "notify");
}

export async function confirmPaymentTTAction(formData: FormData) {
  return savePaymentTT(formData, "confirm");
}

export async function uploadPaymentTTConfirmAttachmentsAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  if (!id) return { ok: false as const, message: "저장할 T/T 입금을 선택해주세요." };

  const files = formUploadFiles(formData, "confirmFiles");
  if (!files.length) return { ok: false as const, message: "첨부파일을 선택해주세요." };

  try {
    await saveAttachments(files, "PAYMENT_TT", paymentTtConfirmOwnerId(id), user.id);
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "첨부파일 저장에 실패했습니다."
    };
  }

  revalidatePath("/payments");
  return { ok: true as const };
}

export async function savePaymentTTConfirmSectionAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const redirectPath = `/payments?tab=tt${id ? `&edit=${id}` : ""}`;
  if (!id) fail("/payments?tab=tt", "저장할 T/T 입금을 선택해주세요.");

  const payment = await prisma.paymentTT.findUnique({ where: { id } });
  if (!payment) fail("/payments?tab=tt", "T/T 입금을 찾을 수 없습니다.");

  const allocations = readPaymentTTAllocations(formData, Number(payment.amount), id);
  if (allocations !== null) {
    await savePaymentTTAllocations(id, allocations);
  }
  await renamePaymentTtAttachments(id);

  revalidatePath("/payments");
  succeed(redirectPath, "저장했습니다.");
}

export async function confirmPaymentTTConfirmSectionAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const redirectPath = `/payments?tab=tt${id ? `&edit=${id}` : ""}`;
  if (!id) fail("/payments?tab=tt", "등록할 T/T 입금을 선택해주세요.");

  const payment = await prisma.paymentTT.findUnique({ where: { id } });
  if (!payment) fail("/payments?tab=tt", "T/T 입금을 찾을 수 없습니다.");

  const allocations = readPaymentTTAllocations(formData, Number(payment.amount), id);
  if (allocations !== null) {
    await savePaymentTTAllocations(id, allocations);
  }
  await renamePaymentTtAttachments(id);

  revalidatePath("/payments");
  emailQueueRedirect(redirectPath, () => sendPaymentTtConfirmMail(id, user.id));
}

function paymentTtConfirmOwnerId(paymentId: string) {
  return `${paymentId}:confirm`;
}

function paymentLcConfirmOwnerId(paymentId: string) {
  return `${paymentId}:confirm`;
}

async function savePaymentTT(formData: FormData, intent: string) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const data = readPaymentTTForm(formData, user.id);
  const allocations = readPaymentTTAllocations(formData, Number(data.amount), id);
  const payment = id ? await prisma.paymentTT.update({ where: { id }, data: omitCreatedBy(data) }) : await prisma.paymentTT.create({ data });
  await Promise.all([
    savePaymentTTAllocations(payment.id, allocations),
    saveAttachments(formUploadFiles(formData, "files"), "PAYMENT_TT", payment.id, user.id)
  ]).catch((error) => {
    fail(`/payments?tab=tt${payment.id ? `&edit=${payment.id}` : ""}`, error instanceof Error ? error.message : "저장에 실패했습니다.");
  });
  await renamePaymentTtAttachments(payment.id);
  if (intent === "notify") emailQueueRedirect("/payments?tab=tt", () => sendPaymentTtNotifyMail(payment.id, user.id));
  if (intent === "confirm") emailQueueRedirect("/payments?tab=tt", () => sendPaymentTtConfirmMail(payment.id, user.id));
  revalidatePath("/payments");
  redirect("/payments?tab=tt");
}

export async function createPaymentLCAction(formData: FormData) {
  return savePaymentLC(formData, formString(formData, "intent") || "save");
}

export async function notifyPaymentLCAction(formData: FormData) {
  return savePaymentLC(formData, "notify");
}

export async function confirmPaymentLCAction(formData: FormData) {
  return savePaymentLC(formData, "confirm");
}

export async function uploadPaymentLCConfirmAttachmentsAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  if (!id) return { ok: false as const, message: "저장할 L/C 통지를 선택해주세요." };

  const files = formUploadFiles(formData, "confirmFiles");
  if (!files.length) return { ok: false as const, message: "첨부파일을 선택해주세요." };

  try {
    await saveAttachments(files, "PAYMENT_LC", paymentLcConfirmOwnerId(id), user.id);
    await renamePaymentLcAttachments(id);
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "첨부파일 저장에 실패했습니다."
    };
  }

  revalidatePath("/payments");
  return { ok: true as const };
}

async function savePaymentLC(formData: FormData, intent: string) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const data = readPaymentLCForm(formData, user.id);
  const allocations = readPaymentLCAllocations(formData, Number(data.amount), id);
  const payment = id ? await prisma.paymentLC.update({ where: { id }, data: omitCreatedBy(data) }) : await prisma.paymentLC.create({ data });
  await Promise.all([
    savePaymentLCAllocations(payment.id, allocations),
    saveAttachments(formData.getAll("files").filter((f): f is File => f instanceof File), "PAYMENT_LC", payment.id, user.id)
  ]);
  await renamePaymentLcAttachments(payment.id);
  await autoLinkLcToShipments(payment.id, user.id);
  if (intent === "notify") emailQueueRedirect("/payments?tab=lc", () => sendPaymentLcNotifyMail(payment.id, user.id));
  if (intent === "confirm") emailQueueRedirect("/payments?tab=lc", () => sendPaymentLcConfirmMail(payment.id, user.id));
  revalidatePath("/payments");
  redirect("/payments?tab=lc");
}

function omitCreatedBy<T extends { createdById: string }>(data: T) {
  const { createdById: _createdById, ...rest } = data;
  void _createdById;
  return rest;
}

type TTAllocationInput = {
  productionRequestNo: string;
  invNo: string;
  amount: number;
  note: string;
};

type LCAllocationInput = {
  productionRequestNo: string;
  amount: number;
  note: string;
};

function parseMoneyInput(value: FormDataEntryValue | string | null | undefined) {
  const raw = String(value ?? "").replaceAll(",", "").replace(/[^\d.-]/g, "").trim();
  if (!raw) return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function sumMoney(values: { amount: number }[]) {
  return Math.round(values.reduce((sum, row) => sum + row.amount, 0) * 100) / 100;
}

function sameMoney(left: number, right: number) {
  return Math.abs(left - right) < 0.01;
}

function joinNonEmpty(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].join(", ");
}

function readPaymentTTAllocations(formData: FormData, paymentAmount: number, paymentId?: string): TTAllocationInput[] | null {
  const productionNos = formData.getAll("ttAllocationProductionRequestNo").map(String);
  const invNos = formData.getAll("ttAllocationInvNo").map(String);
  const amounts = formData.getAll("ttAllocationAmount");
  const notes = formData.getAll("ttAllocationNote").map(String);
  if (!productionNos.length && !invNos.length && !amounts.length && !notes.length) return null;
  const rows = Array.from({ length: Math.max(productionNos.length, invNos.length, amounts.length, notes.length) }, (_, index) => ({
    productionRequestNo: productionNos[index]?.trim() ?? "",
    invNo: invNos[index]?.trim() ?? "",
    amount: parseMoneyInput(amounts[index]),
    note: notes[index]?.trim() ?? ""
  })).filter((row) => row.productionRequestNo || row.invNo || row.amount || row.note);
  if (rows.length && !sameMoney(sumMoney(rows), paymentAmount)) {
    fail(`/payments?tab=tt${paymentId ? `&edit=${paymentId}` : ""}`, "입력한 금액 합이 입금된 금액과 맞지 않습니다.");
  }
  return rows.length ? rows : null;
}

function readPaymentLCAllocations(formData: FormData, paymentAmount: number, paymentId?: string): LCAllocationInput[] | null {
  const productionNos = formData.getAll("lcAllocationProductionRequestNo").map(String);
  const amounts = formData.getAll("lcAllocationAmount");
  const notes = formData.getAll("lcAllocationNote").map(String);
  if (!productionNos.length && !amounts.length && !notes.length) return null;
  const rows = Array.from({ length: Math.max(productionNos.length, amounts.length, notes.length) }, (_, index) => ({
    productionRequestNo: productionNos[index]?.trim() ?? "",
    amount: parseMoneyInput(amounts[index]),
    note: notes[index]?.trim() ?? ""
  })).filter((row) => row.productionRequestNo || row.amount || row.note);
  if (rows.length && !sameMoney(sumMoney(rows), paymentAmount)) {
    fail(`/payments?tab=lc${paymentId ? `&edit=${paymentId}` : ""}`, "입력한 금액 합이 통지된 금액과 맞지 않습니다.");
  }
  return rows;
}

async function savePaymentTTAllocations(paymentId: string, allocations: TTAllocationInput[] | null) {
  if (!allocations?.length) return;
  await prisma.$transaction([
    prisma.paymentTTAllocation.deleteMany({ where: { paymentId } }),
    ...allocations.map((row, index) =>
      prisma.paymentTTAllocation.create({
        data: {
          paymentId,
          productionRequestNo: row.productionRequestNo,
          invNo: row.invNo,
          amount: row.amount,
          note: row.note,
          sortOrder: index
        }
      })
    ),
    prisma.paymentTT.update({
      where: { id: paymentId },
      data: {
        productionRequestNo: joinNonEmpty(allocations.map((row) => row.productionRequestNo)),
        invNo: joinNonEmpty(allocations.map((row) => row.invNo)),
        note: joinNonEmpty(allocations.map((row) => row.note))
      }
    })
  ]);
}

async function savePaymentLCAllocations(paymentId: string, allocations: LCAllocationInput[] | null) {
  if (!allocations) return;
  await prisma.$transaction([
    prisma.paymentLCAllocation.deleteMany({ where: { paymentId } }),
    ...allocations.map((row, index) =>
      prisma.paymentLCAllocation.create({
        data: {
          paymentId,
          productionRequestNo: row.productionRequestNo,
          amount: row.amount,
          note: row.note,
          sortOrder: index
        }
      })
    ),
    prisma.paymentLC.update({
      where: { id: paymentId },
      data: {
        productionRequestNo: joinNonEmpty(allocations.map((row) => row.productionRequestNo)),
        note: joinNonEmpty(allocations.map((row) => row.note))
      }
    })
  ]);
}

async function renamePaymentTtAttachments(paymentId: string) {
  const [payment, attachments] = await Promise.all([
    prisma.paymentTT.findUnique({
      where: { id: paymentId },
      include: { allocations: { orderBy: { sortOrder: "asc" } } }
    }),
    prisma.attachment.findMany({ where: { ownerType: "PAYMENT_TT", ownerId: paymentId } })
  ]);
  if (!payment || !attachments.length) return;
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
  await prisma.$transaction(attachments.map((attachment) =>
    prisma.attachment.update({
      where: { id: attachment.id },
      data: { originalName: attachmentNameWithOriginalExtension(baseName, attachment.originalName) }
    })
  ));
}

async function renamePaymentLcAttachments(paymentId: string) {
  const confirmOwnerId = paymentLcConfirmOwnerId(paymentId);
  const [payment, attachments] = await Promise.all([
    prisma.paymentLC.findUnique({
      where: { id: paymentId },
      include: { allocations: { orderBy: { sortOrder: "asc" } } }
    }),
    prisma.attachment.findMany({
      where: {
        ownerType: "PAYMENT_LC",
        ownerId: { in: [paymentId, confirmOwnerId] }
      }
    })
  ]);
  if (!payment || !attachments.length) return;
  const baseName = paymentLcAttachmentBaseName({
    date: payment.noticeDate,
    buyer: payment.buyer,
    currency: payment.currency,
    amount: payment.amount,
    productionRequestNo: payment.productionRequestNo,
    note: payment.note,
    allocations: payment.allocations
  });
  if (!baseName) return;
  await prisma.$transaction(
    attachments.map((attachment) =>
      prisma.attachment.update({
        where: { id: attachment.id },
        data: { originalName: attachmentNameWithOriginalExtension(baseName, attachment.originalName) }
      })
    )
  );
}

export async function deletePaymentAction(formData: FormData) {
  await requireUser();
  const type = formString(formData, "type");
  const id = formString(formData, "id");
  if (type === "tt") await prisma.paymentTT.delete({ where: { id } });
  if (type === "lc") await prisma.paymentLC.delete({ where: { id } });
  revalidatePath("/payments");
  redirect(`/payments?tab=${type}`);
}

export async function togglePaymentTTCompletedAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  if (!id) return;

  await prisma.paymentTT.update({
    where: { id },
    data: {
      completed: formString(formData, "completed") === "1",
      updatedById: user.id
    }
  });
  revalidatePath("/payments");
}

export async function deletePaymentAttachmentAction(formData: FormData) {
  await requireUser();
  const attachmentId = formString(formData, "attachmentId");
  const paymentId = formString(formData, "paymentId") || formString(formData, "id");
  const tab = formString(formData, "tab") || (formString(formData, "paymentTab") === "lc" ? "lc" : "tt");
  const redirectPath = `/payments?tab=${tab}${paymentId ? `&edit=${paymentId}` : ""}`;

  if (!attachmentId) fail(redirectPath, "삭제할 첨부파일을 선택해주세요.");
  if (!paymentId) fail(`/payments?tab=${tab}`, "입금 건을 선택해주세요.");

  const attachment = await prisma.attachment.findUnique({ where: { id: attachmentId } });
  if (!attachment) fail(redirectPath, "첨부파일을 찾을 수 없습니다.");

  const allowedOwnerIds = new Set([paymentId, paymentTtConfirmOwnerId(paymentId), paymentLcConfirmOwnerId(paymentId)]);
  if (!allowedOwnerIds.has(attachment.ownerId)) fail(redirectPath, "삭제할 수 없는 첨부파일입니다.");
  if (attachment.ownerType !== "PAYMENT_TT" && attachment.ownerType !== "PAYMENT_LC") {
    fail(redirectPath, "삭제할 수 없는 첨부파일입니다.");
  }

  try {
    await deleteAttachment(attachmentId);
  } catch (error) {
    fail(redirectPath, error instanceof Error ? error.message : "첨부파일 삭제에 실패했습니다.");
  }

  revalidatePath("/payments");
  succeed(redirectPath, "첨부파일을 삭제했습니다.");
}

function readPaymentTTForm(formData: FormData, userId: string) {
  return {
    exportCountry: formString(formData, "exportCountry"),
    buyer: formString(formData, "buyer"),
    amount: formNumber(formData, "amount"),
    currency: formString(formData, "currency") || "USD",
    date: formDate(formData, "date"),
    refNo: formString(formData, "refNo"),
    description: formString(formData, "description"),
    productionRequestNo: formString(formData, "productionRequestNo"),
    invNo: formString(formData, "invNo"),
    note: formString(formData, "note"),
    exportOwner: formString(formData, "exportOwner"),
    depositOwner: formString(formData, "depositOwner") || "\uC774\uD574\uC6D0",
    salesOwner: formString(formData, "salesOwner"),
    salesEmailRecipients: formData.getAll("salesEmailRecipients").map(String).filter(Boolean).join(", "),
    exportEmailRecipients: formString(formData, "exportEmailRecipients"),
    xporterUrl: formString(formData, "xporterUrl"),
    createdById: userId,
    updatedById: userId
  };
}

function readPaymentLCForm(formData: FormData, userId: string) {
  return {
    kind: (formString(formData, "kind") || "OPEN") as PaymentLcKind,
    bank: formString(formData, "bank"),
    exportCountry: formString(formData, "exportCountry"),
    buyer: formString(formData, "buyer"),
    amount: formNumber(formData, "amount"),
    currency: formString(formData, "currency") || "USD",
    lcSd: formString(formData, "lcSd"),
    note: formString(formData, "note"),
    noticeDate: formDate(formData, "noticeDate"),
    lcNo: formString(formData, "lcNo"),
    productionRequestNo: formString(formData, "productionRequestNo"),
    exportOwner: formString(formData, "exportOwner"),
    depositOwner: null,
    salesOwner: formString(formData, "salesOwner"),
    salesEmailRecipients: formString(formData, "salesEmailRecipients"),
    exportEmailRecipients: formString(formData, "exportEmailRecipients"),
    form: formString(formData, "form"),
    xporterUrl: formString(formData, "xporterUrl"),
    createdById: userId,
    updatedById: userId
  };
}

async function sendPaymentTtNotifyMail(id: string, userId: string) {
  const payment = await prisma.paymentTT.findUnique({ where: { id } });
  if (!payment) return { sent: 0, failed: 1, total: 0 };
  const recipients = await resolveRecipientEmails([payment.salesEmailRecipients], salesMailTeams);
  return sendProgramEmail({
    to: recipients,
    subject: `[${payment.exportCountry || ""}/${payment.buyer || ""}] ${moneyText(payment.currency, payment.amount)} ${fmtDate(payment.date)}`,
    body: [
      "아래 링크로 접속하여 생산의뢰번호 또는 INV No.를 등록해주세요.",
      "",
      "선수금인 경우: 생산의뢰번호를 입력해주세요.",
      "잔금인 경우: Commercial Invoice No.를 입력해주세요. (예: KU-XXXXXX)",
      "",
      `${appUrl()}/payments?tab=tt&edit=${payment.id}`,
      "",
      `수출담당자: ${payment.exportOwner || ""}`,
      `수출국: ${payment.exportCountry || ""}`,
      `바이어: ${payment.buyer || ""}`,
      `입금액: ${moneyText(payment.currency, payment.amount)}`
    ].join("\n"),
    createdById: userId
  });
}

async function sendPaymentTtConfirmMail(id: string, userId: string) {
  const payment = await prisma.paymentTT.findUnique({ where: { id } });
  if (!payment) return { sent: 0, failed: 1, total: 0 };
  const recipients = await resolveRecipientEmails([payment.exportOwner, payment.depositOwner], exportOwnerTeams);
  const ref = payment.productionRequestNo || payment.invNo || "";
  return sendProgramEmail({
    to: recipients,
    subject: `[${payment.exportCountry || ""}/${payment.buyer || ""}] ${moneyText(payment.currency, payment.amount)} ${fmtDate(payment.date)} ${ref}`,
    body: [
      `영업담당자: ${payment.salesOwner || ""}`,
      `입금담당자: ${payment.depositOwner || ""}`,
      `수출국: ${payment.exportCountry || ""}`,
      `바이어: ${payment.buyer || ""}`,
      `링크: ${appUrl()}/payments?tab=tt&edit=${payment.id}`,
      `입금액: ${moneyText(payment.currency, payment.amount)}`,
      `생산의뢰번호: ${payment.productionRequestNo || ""}`,
      `INV No.: ${payment.invNo || ""}`,
      `설명: ${payment.description || ""}`,
      `비고: ${payment.note || ""}`
    ].join("\n"),
    createdById: userId
  });
}

async function sendPaymentLcNotifyMail(id: string, userId: string) {
  const payment = await prisma.paymentLC.findUnique({ where: { id } });
  if (!payment) return { sent: 0, failed: 1, total: 0 };
  const recipients = await resolveRecipientEmails([payment.salesEmailRecipients], salesMailTeams);
  const kindText = lcKindText(payment.kind);
  return sendProgramEmail({
    to: recipients,
    subject: `[LC ${kindText}] ${payment.exportCountry || ""}/${payment.buyer || ""} LC No.: ${payment.lcNo || ""} 금액: ${moneyText(payment.currency, payment.amount)} S/D: ${payment.lcSd || ""}`,
    body: [
      "L/C가 통지되었습니다.",
      "아래 링크로 접속하여 생산의뢰번호를 등록해주세요.",
      "",
      `${appUrl()}/payments?tab=lc&edit=${payment.id}`,
      "",
      `수출담당자: ${payment.exportOwner || ""}`,
      `L/C 상태: ${kindText}`,
      `수출국: ${payment.exportCountry || ""}`,
      `바이어: ${payment.buyer || ""}`,
      `LC No.: ${payment.lcNo || ""}`,
      `금액: ${moneyText(payment.currency, payment.amount)}`,
      `S/D: ${payment.lcSd || ""}`
    ].join("\n"),
    createdById: userId
  });
}

async function sendPaymentLcConfirmMail(id: string, userId: string) {
  const payment = await prisma.paymentLC.findUnique({ where: { id } });
  if (!payment) return { sent: 0, failed: 1, total: 0 };
  const recipients = await resolveRecipientEmails([payment.exportOwner], exportOwnerTeams);
  return sendProgramEmail({
    to: recipients,
    subject: `[${payment.exportCountry || ""}/${payment.buyer || ""}] LC No.: ${payment.lcNo || ""} 금액: ${moneyText(payment.currency, payment.amount)} S/D: ${payment.lcSd || ""}`,
    body: [
      "L/C가 확인되었습니다.",
      `수출담당자: ${payment.exportOwner || ""}`,
      `링크: ${appUrl()}/payments?tab=lc&edit=${payment.id}`,
      `L/C 상태: ${lcKindText(payment.kind)}`,
      `수출국: ${payment.exportCountry || ""}`,
      `바이어: ${payment.buyer || ""}`,
      `LC No.: ${payment.lcNo || ""}`,
      `생산의뢰번호: ${payment.productionRequestNo || ""}`,
      `금액: ${moneyText(payment.currency, payment.amount)}`,
      `S/D: ${payment.lcSd || ""}`
    ].join("\n"),
    createdById: userId
  });
}

export async function linkLcAction(formData: FormData) {
  const user = await requireUser();
  const shipmentId = formString(formData, "shipmentId");
  const lcId = formString(formData, "lcId");
  const lc = await prisma.paymentLC.findUnique({ where: { id: lcId } });
  if (!lc) redirect(`/shipments/${shipmentId}`);
  const shipment = await prisma.shipmentRequest.findUnique({
    where: { id: shipmentId },
    select: { depositStatus: true }
  });
  const depositStatus = lcDepositStatusAfterLcSd(shipment?.depositStatus, lc.lcSd);
  await prisma.lcShipmentLink.upsert({
    where: { lcId_shipmentId: { lcId, shipmentId } },
    update: {},
    create: { lcId, shipmentId, createdById: user.id }
  });
  await prisma.shipmentRequest.update({
    where: { id: shipmentId },
    data: {
      linkedLcId: lcId,
      lcSd: lc.lcSd,
      updatedById: user.id,
      ...(depositStatus ? { depositStatus } : {})
    }
  });
  revalidatePath(`/shipments/${shipmentId}`);
  redirect(`/shipments/${shipmentId}`);
}

export async function unlinkLcAction(formData: FormData) {
  const user = await requireUser();
  const shipmentId = formString(formData, "shipmentId");
  await prisma.lcShipmentLink.deleteMany({ where: { shipmentId } });
  await prisma.shipmentRequest.update({ where: { id: shipmentId }, data: { linkedLcId: null, lcSd: "", updatedById: user.id } });
  revalidatePath(`/shipments/${shipmentId}`);
  redirect(`/shipments/${shipmentId}`);
}

const appUrl = () => {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL || "http://127.0.0.1:3000";
  const withProtocol = configured.startsWith("http") ? configured : `https://${configured}`;
  return withProtocol.replace(/\/$/, "");
};
const moneyText = (currency?: string | null, amount?: unknown) => `${currency || "USD"}${Number(amount ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`;
const firstProductName = (products: Array<{ productName: string | null }>) => products[0]?.productName || "제품";

function dateTimeText(value?: Date | string | null) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function noticeScheduleRangeText(start?: Date | string | null, end?: Date | string | null) {
  const startText = dateTimeText(start);
  const endText = dateTimeText(end);
  if (startText && endText) return `${startText} ~ ${endText}`;
  return startText || endText;
}

function noticeScheduleBodyLines(start?: Date | string | null, end?: Date | string | null) {
  const lines: string[] = [];
  const startText = dateTimeText(start);
  const endText = dateTimeText(end);
  if (startText) lines.push(`시작일시: ${startText}`);
  if (endText) lines.push(`종료일시: ${endText}`);
  return lines;
}

function shipmentProductLine(product: {
  productName: string | null;
  normalBoxQty?: number | null;
  iceBoxQty?: number | null;
  injectionBoxQty?: number | null;
  commonBoxQty?: number | null;
  bxQtyPaid: number;
  bxQtyFoc: number;
  lotNo: string | null;
  productionRequestNo: string | null;
  exportUnitPrice: unknown;
}) {
  const ct = Number(product.normalBoxQty ?? 0) + Number(product.iceBoxQty ?? 0) + Number(product.injectionBoxQty ?? 0) + Number(product.commonBoxQty ?? 0);
  return `제품: [${product.productName || ""}] ${ct}CT / ${product.bxQtyPaid.toLocaleString("ko-KR")}(${product.bxQtyFoc.toLocaleString("ko-KR")})BOX / ${product.lotNo || ""} / ${product.productionRequestNo || ""} / 단가: ${Number(product.exportUnitPrice ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 })}`;
}

function todayDotText() {
  const date = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}.${pad(date.getMonth() + 1)}.${pad(date.getDate())}`;
}

function exportOwnerTel(name?: string | null) {
  if (name === "\uBC15\uD718\uC6D0") return "82-2-6188-7856";
  if (name === "\uAE40\uC601\uBBFC") return "82-2-6188-7860";
  return "82-2-6188-7856";
}

function shipmentQuoteVolumeLines(
  products: Array<{
    normalBoxQty?: number | null;
    iceBoxQty?: number | null;
    injectionBoxQty?: number | null;
    commonBoxQty?: number | null;
  }>,
  options?: { usePt?: boolean; ptQty?: number; ptSpec?: string | null }
) {
  if (options?.usePt) {
    const qty = Number(options.ptQty ?? 0);
    const spec = options.ptSpec?.trim() ?? "";
    return [`물량: 총 ${qty.toLocaleString("ko-KR")} P/T`, `P/T사이즈: ${spec}`];
  }
  const boxRows = [
    { qty: products.reduce((sum, product) => sum + Number(product.normalBoxQty ?? 0), 0), size: "58*44*47" },
    { qty: products.reduce((sum, product) => sum + Number(product.iceBoxQty ?? 0), 0), size: "57*51*49" },
    { qty: products.reduce((sum, product) => sum + Number(product.injectionBoxQty ?? 0), 0), size: "57*38*33" },
    { qty: products.reduce((sum, product) => sum + Number(product.commonBoxQty ?? 0), 0), size: "44*33*27" }
  ].filter((row) => row.qty > 0);
  const totalCt = boxRows.reduce((sum, row) => sum + row.qty, 0);
  return [`총카톤: 총 ${totalCt.toLocaleString("ko-KR")}CT`, ...boxRows.map((row) => `${row.qty.toLocaleString("ko-KR")}CT(${row.size})`)];
}

function shipmentGrossWeightText(products: Array<{ grossWeight?: unknown }>) {
  const total = products.reduce((sum, product) => sum + Number(product.grossWeight ?? 0), 0);
  return total.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}

async function shipmentWithProducts(id: string) {
  return prisma.shipmentRequest.findUnique({ where: { id }, include: { products: { orderBy: { createdAt: "asc" } } } });
}

function appendEmailSentToken(current: string | null | undefined, token: string) {
  const tokens = new Set((current ?? "").split(",").map((value) => value.trim()).filter(Boolean));
  tokens.add(token);
  return [...tokens].join(", ");
}

async function saveShipmentFromForm(formData: FormData, userId: string, extras: Record<string, unknown> = {}) {
  const id = formString(formData, "id");
  await prisma.shipmentRequest.update({
    where: { id },
    data: { ...readShipmentForm(formData), ...extras, updatedById: userId }
  });
  return shipmentWithProducts(id);
}

async function saveProductFromForm(formData: FormData, userId: string) {
  const shipmentId = formString(formData, "shipmentId");
  const id = formString(formData, "id");
  const data = readProductForm(formData, userId);
  const product = id
    ? await prisma.shipmentProduct.update({ where: { id }, data: { ...omitCreatedBy(data), updatedById: userId } })
    : await prisma.shipmentProduct.create({ data: { ...data, shipmentId } });
  await Promise.all([recalcShipmentInvoice(shipmentId), autoLinkShipmentLc(shipmentId, userId)]);
  return product;
}

export async function sendShipmentRequestMailAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const type = formString(formData, "shipmentRequestType") || "new";
  const existing = await shipmentWithProducts(id);
  if (!existing) redirect(`/shipments/${id}`);

  const extras =
    type === "new"
      ? { status: ShipmentStatus.SCHEDULE, emailSent: appendEmailSentToken(existing.emailSent, "SHIPMENT_REQUEST_SENT") }
      : {};
  const shipment = await saveShipmentFromForm(formData, user.id, extras);
  if (!shipment) redirect(`/shipments/${id}`);

  const recipients = [
    ...(await resolveRecipientEmails([shipment.salesEmailRecipients], salesMailTeams)),
    ...(await resolveRecipientEmails([shipment.exportOwner], exportOwnerTeams))
  ];
  const changePrefix = type === "update" ? "★변경★" : "선적 요청";
  const subject = `${changePrefix}[${shipment.exportCountry || ""}/${shipment.buyer || ""}]${firstProductName(shipment.products)} ${shipment.storageCondition || ""} ${shipment.transport || ""}`;
  const body = [
    `${shipment.exportCountry || ""}/${shipment.buyer || ""}`,
    `운송: ${shipment.transport || ""} / ${shipment.destinationPort || ""}`,
    `보관조건: ${shipment.storageCondition || ""}`,
    "",
    `계약조건: ${shipment.incoterms || ""}/${shipment.paymentTerm || ""}`,
    `입금상황: ${shipment.depositStatus || ""}`,
    `적합일: ${shipment.suitabilityDate || ""}`,
    `출하승인일: ${shipment.shippingApprovalDate || ""}`,
    `선적희망일: ${shipment.desiredShipDate || ""}`,
    `해외영업팀 요청사항: ${shipment.salesRequest || ""}`,
    "",
    ...shipment.products.map(shipmentProductLine),
    "",
    `${appUrl()}/shipments/${shipment.id}`
  ].join("\n");
  emailQueueRedirect(`/shipments/${id}`, () => sendProgramEmail({ to: recipients, subject, body, createdById: user.id }));
}

export async function sendShipmentScheduleMailAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const type = formString(formData, "scheduleMailType") || "new";
  const existing = await shipmentWithProducts(id);
  if (!existing) redirect(`/shipments/${id}`);

  const extras = type === "new" ? { emailSent: appendEmailSentToken(existing.emailSent, "SCHEDULE_MAIL_SENT") } : {};
  const shipment = await saveShipmentFromForm(formData, user.id, extras);
  if (!shipment) redirect(`/shipments/${id}`);

  const recipients = await resolveRecipientEmails([shipment.salesEmailRecipients], salesMailTeams);
  const prefix = type === "change" ? "★변경★" : "";
  const subject = `${prefix}출고: ${fmtDate(shipment.releaseDate)} ETD&ETA: ${dateTimeText(shipment.etd)} - ${dateTimeText(shipment.eta)} / ${shipment.transitFlight || ""} / 제품: ${firstProductName(shipment.products)}`;
  const body = [
    `출고: ${fmtDate(shipment.releaseDate)}`,
    `ETD&ETA: ${dateTimeText(shipment.etd)} - ${dateTimeText(shipment.eta)} / ${shipment.transitFlight || ""}`,
    "",
    ...shipment.products.map(shipmentProductLine),
    "",
    `${appUrl()}/shipments/${shipment.id}`
  ].join("\n");
  emailQueueRedirect(`/shipments/${id}`, () => sendProgramEmail({ to: recipients, subject, body, createdById: user.id }));
}

export async function sendShipmentQuoteMailAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const existing = await shipmentWithProducts(id);
  if (!existing) redirect(`/shipments/${id}`);

  const forwarder = formString(formData, "forwarder") || existing.forwarder || "";
  const forwarderOption = await prisma.dropdownOption.findFirst({
    where: { category: DropdownCategory.FORWARDER, label: forwarder },
    select: { value: true }
  });
  const forwarderValue = forwarderOption?.value ?? "";
  const normalizedForwarderValue = forwarderValue.replace(/\s+/g, "").toUpperCase();
  if (normalizedForwarderValue.includes("견적") && normalizedForwarderValue.includes("X")) fail(`/shipments/${id}`, "해당 포워딩사는 견적X로 설정되어 견적 요청 메일을 보낼 수 없습니다.");
  if (!forwarderValue.includes("@")) fail(`/shipments/${id}`, "포워딩사 이메일을 먼저 관리 페이지에 입력해주세요.");

  const shipment = await saveShipmentFromForm(formData, user.id, { status: ShipmentStatus.QUOTE });
  if (!shipment) redirect(`/shipments/${id}`);

  const exportOwner = shipment.exportOwner || "";
  const exportOwnerEmails = await resolveRecipientEmails([exportOwner], exportOwnerTeams);
  const recipients = [forwarderValue, ...exportOwnerEmails];
  const exportCountry = shipment.exportCountry || "";
  const transport = shipment.transport || "";
  const storageCondition = shipment.storageCondition || "";
  const destinationPort = shipment.destinationPort || "";
  const releaseDate = shipment.releaseDate;
  const usePt = shipment.usePt;
  const ptQty = shipment.ptQty;
  const ptSpec = shipment.ptSpec || "";
  const subject = `[한국유나이티드제약]${exportCountry} 견적 요청의 건_${todayDotText()}`;
  const body = [
    '※ "전체답장"으로 메일 회신 부탁드립니다.',
    "",
    "",
    `안녕하세요, 한국유나이티드제약 ${exportOwner}입니다.`,
    "하기 선적건의 수출 운임 견적 문의드립니다.",
    "",
    "-----------------------------------------------------------",
    `- ${exportCountry} ${transport} ${storageCondition}`,
    `목적항: ${destinationPort}`,
    `입고예정일: ${fmtDate(releaseDate)}`,
    "",
    ...shipmentQuoteVolumeLines(shipment.products, { usePt, ptQty, ptSpec }),
    "",
    `GW: ${shipmentGrossWeightText(shipment.products)}KGS`,
    "",
    "-----------------------------------------------------------",
    "",
    "감사합니다.",
    `${exportOwner} 드림`,
    "",
    `${exportOwner} / 해외영업지원팀`,
    "",
    "한국유나이티드제약(주) KOREA UNITED PHARM. INC.",
    "서울특별시 강남구 논현로 121길 22",
    "Nonhyeon-ro 121-gil 22, Gangnam-gu, Seoul, Korea",
    "",
    `TEL : ${exportOwnerTel(exportOwner)}`,
    "FAX : 02-516-3724"
  ].join("\n");
  emailQueueRedirect(`/shipments/${id}`, () => sendProgramEmail({ to: recipients, subject, body, createdById: user.id }));
}
export async function sendProductCoaMailAction(formData: FormData) {
  const user = await requireUser();
  const shipmentId = formString(formData, "shipmentId");
  const product = await saveProductFromForm(formData, user.id);
  const shipment = await shipmentWithProducts(shipmentId);
  if (!shipment) redirect(`/shipments/${shipmentId}`);
  const factory = product.factory || "";
  const productName = product.productName || "";
  const factoryTeam = factory === "JEONDONG" ? Team.JEONDONG_QA : Team.SEOMYEON_QA;
  const factoryUsers = await prisma.user.findMany({ where: { team: factoryTeam }, select: { email: true } });
  const exportOwnerEmails = await resolveRecipientEmails([shipment.exportOwner], exportOwnerTeams);
  const recipients = [...factoryUsers.map((item) => item.email), ...exportOwnerEmails];
  const today = fmtDate(new Date());
  const uploadRequestDate = fmtDate(product.coaUploadRequestDate);
  const factoryLabel = factory === "JEONDONG" ? "전동" : "서면";
  const cellStyle = "border:1px solid #222;padding:8px 10px;text-align:center;vertical-align:middle;";
  const body = `
    <div style="font-family:Arial,'Malgun Gothic',sans-serif;font-size:14px;color:#111;">
      <p>안녕하십니까,<br/>해외영업관리팀 ${shipment.exportOwner || ""}입니다.</p>
      <p>하기 제품의 COA 요청드립니다.<br/>특이사항이 있을 경우 ${exportOwnerEmails[0] || ""}로 회신 부탁드립니다.</p>
      <table style="border-collapse:collapse;min-width:760px;">
        <thead>
          <tr>
            <th style="${cellStyle}">업로드 요청일</th>
            <th style="${cellStyle}">수출국</th>
            <th style="${cellStyle}">제품명</th>
            <th style="${cellStyle}">제조번호</th>
            <th style="${cellStyle}">출고 요청일</th>
            <th style="${cellStyle}">COA 요청사항</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="${cellStyle}">${uploadRequestDate}</td>
            <td style="${cellStyle}">${shipment.exportCountry || ""}</td>
            <td style="${cellStyle}">${productName}</td>
            <td style="${cellStyle}">${product.lotNo || ""}</td>
            <td style="${cellStyle}">${fmtDate(shipment.releaseDate)}</td>
            <td style="${cellStyle}">${product.changeNote || ""}</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
  emailQueueRedirect(`/shipments/${shipmentId}`, () =>
    sendProgramEmail({
      to: recipients,
      subject: `${factoryLabel} 수출제품 COA 요청의 건_${productName}_${uploadRequestDate || today}`,
      body,
      html: true,
      createdById: user.id
    })
  );
}

export async function updateBuyerSpecialNoteAction(formData: FormData) {
  const user = await requireUser();
  const buyerId = formString(formData, "buyerId");
  const shipmentId = formString(formData, "shipmentId");
  if (!buyerId) fail(`/shipments/${shipmentId}`, "바이어 정보를 찾을 수 없습니다.");
  await prisma.buyerMaster.update({
    where: { id: buyerId },
    data: {
      specialNote: formString(formData, "specialNote"),
      specialNoteUpdatedAt: new Date(),
      vatNo: formString(formData, "vatNo"),
      eoriNo: formString(formData, "eoriNo"),
      updatedById: user.id
    }
  });
  await saveAttachments(formData.getAll("files").filter((file): file is File => file instanceof File), "BUYER_MASTER", buyerId, user.id);
  revalidatePath(`/shipments/${shipmentId}`);
  redirect(`/shipments/${shipmentId}?success=${encodeURIComponent("바이어 특이사항이 저장되었습니다.")}`);
}

export async function saveShipmentSummaryAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  if (!id) return { ok: false as const, message: "선적의뢰를 찾을 수 없습니다." };

  await prisma.shipmentRequest.update({
    where: { id },
    data: {
      summaryDataLogger: formString(formData, "summaryDataLogger"),
      summaryDataLoggerDetail: formString(formData, "summaryDataLoggerDetail"),
      summaryShippingLabelMethod: formString(formData, "summaryShippingLabelMethod"),
      summarySpecialNotes: formString(formData, "summarySpecialNotes"),
      updatedById: user.id
    }
  });
  revalidatePath(`/shipment-summary/${id}`);
  revalidatePath(`/shipments/${id}`);
  return { ok: true as const };
}

export async function createShipmentSummaryDefaultNoteAction(formData: FormData) {
  const user = await requireUser();
  const content = formString(formData, "content").trim();
  const shipmentId = formString(formData, "shipmentId");
  if (!content) return { ok: false as const, message: "기본 특이사항 내용을 입력해주세요." };

  const last = await prisma.shipmentSummaryDefaultNote.findFirst({ orderBy: { sortOrder: "desc" } });
  const note = await prisma.shipmentSummaryDefaultNote.create({
    data: {
      content,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      createdById: user.id,
      updatedById: user.id
    }
  });
  if (shipmentId) revalidatePath(`/shipment-summary/${shipmentId}`);
  return {
    ok: true as const,
    note: { id: note.id, content: note.content, sortOrder: note.sortOrder }
  };
}

export async function deleteShipmentSummaryDefaultNoteAction(formData: FormData) {
  await requireUser();
  const id = formString(formData, "id");
  const shipmentId = formString(formData, "shipmentId");
  if (!id) return { ok: false as const, message: "삭제할 항목을 선택해주세요." };

  await prisma.shipmentSummaryDefaultNote.delete({ where: { id } });
  if (shipmentId) revalidatePath(`/shipment-summary/${shipmentId}`);
  return { ok: true as const };
}

const noticeMailTeams: Team[] = [Team.OVERSEAS_MARKETING, Team.OVERSEAS_SALES, Team.OVERSEAS_SALES_SUPPORT];
const salesMailTeams: Team[] = [Team.OVERSEAS_MARKETING, Team.OVERSEAS_SALES, Team.OVERSEAS_BRANCH, Team.OVERSEAS_SALES_SUPPORT];
const exportOwnerTeams: Team[] = [Team.OVERSEAS_SALES_SUPPORT];

function noticeMailTargetTeams(targetTeams: string[]) {
  return targetTeams.includes("전체")
    ? noticeMailTeams
    : targetTeams.filter((team): team is Team => noticeMailTeams.includes(team as Team));
}

export async function saveNoticeAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const intent = formString(formData, "intent") || (id ? "edit" : "new");
  const isCancel = intent === "cancel";
  const title = formString(formData, "title");
  const content = formString(formData, "content");
  if (!title || !content) fail("/notices", isCancel ? "\ucde8\uc18c \uc0ac\uc720\ub97c \uc785\ub825\ud574\uc8fc\uc138\uc694." : "\uacf5\uc9c0 \uc81c\ubaa9\uacfc \ub0b4\uc6a9\uc744 \uc785\ub825\ud574\uc8fc\uc138\uc694.");
  if (isCancel && !id) fail("/notices", "\ucde8\uc18c\ud560 \uacf5\uc9c0\ub97c \uc120\ud0dd\ud574\uc8fc\uc138\uc694.");
  const scheduleDate = formDate(formData, "scheduleDate");
  const scheduleEndDate = formDate(formData, "scheduleEndDate");
  if (scheduleDate && scheduleEndDate && scheduleEndDate < scheduleDate) {
    fail("/notices", "\uc885\ub8cc\uc77c\uc2dc\uac00 \uc2dc\uc791\uc77c\uc2dc\ubcf4\ub2e4 \uc55e\uc124 \uc218 \uc5c6\uc2b5\ub2c8\ub2e4");
  }

  const teams = formData.getAll("teams").map(String).filter(Boolean);
  const targetTeams = teams.length ? teams : ["\uc804\uccb4"];
  const isEditNotice = Boolean(id);
  const data = {
    title,
    content,
    type: (formString(formData, "type") || "GENERAL") as NoticeType,
    important: formData.get("important") === "on",
    canceled: isCancel,
    cancelReason: isCancel ? content : null,
    canceledAt: isCancel ? new Date() : null,
    place: formString(formData, "place"),
    scheduleDate,
    scheduleEndDate,
    sendEmail: true,
    updatedById: user.id
  };

  const notice = id
    ? await prisma.notice.update({
        where: { id },
        data: {
          ...data,
          recipientTeams: {
            deleteMany: {},
            create: targetTeams.map((team) => ({ team }))
          }
        }
      })
    : await prisma.notice.create({
        data: {
          ...data,
          createdById: user.id,
          recipientTeams: { create: targetTeams.map((team) => ({ team })) }
        }
      });

  await saveAttachments(formData.getAll("files").filter((file): file is File => file instanceof File), "NOTICE", notice.id, user.id);

  const mailTeams = noticeMailTargetTeams(targetTeams);
  const recipients = await prisma.user.findMany({ where: { team: { in: mailTeams } }, select: { email: true } });
  const importantPrefix = notice.important ? "[\uc911\uc694!] " : "";
  const changePrefix = isCancel ? "\u203b\ucde8\uc18c\u203b" : isEditNotice ? "\u2605\uc218\uc815\u2605" : "";
  const bodyLines = [
    "제목: " + notice.title,
    "공지 유형: " + noticeTypeText(notice.type),
    ...(notice.place ? ["장소: " + notice.place] : []),
    ...noticeScheduleBodyLines(notice.scheduleDate, notice.scheduleEndDate),
    "",
    isCancel ? "취소 사유:" : "공지 내용:",
    notice.content
  ];
  const subjectParts = [
    changePrefix + importantPrefix + "[" + noticeTypeText(notice.type) + "]",
    notice.title,
    notice.place || "",
    noticeScheduleRangeText(notice.scheduleDate, notice.scheduleEndDate)
  ].filter(Boolean);
  revalidatePath("/notices");
  revalidatePath("/calendar");
  emailQueueRedirect("/notices", () =>
    sendProgramEmail({
      to: recipients.map((recipient) => recipient.email),
      subject: subjectParts.join(" "),
      body: bodyLines.join("\n"),
      createdById: user.id
    })
  );
}

export async function createNoticeAction(formData: FormData) {
  const user = await requireUser();
  const title = formString(formData, "title");
  const content = formString(formData, "content");
  if (!title || !content) fail("/notices", "공지 제목과 내용을 입력해주세요.");
  const teams = formData.getAll("teams").map(String);
  const notice = await prisma.notice.create({
    data: {
      title,
      content,
      type: (formString(formData, "type") || "GENERAL") as NoticeType,
      important: formData.get("important") === "on",
      place: formString(formData, "place"),
      scheduleDate: formDate(formData, "scheduleDate"),
      sendEmail: formData.get("sendEmail") === "on",
      createdById: user.id,
      updatedById: user.id,
      recipientTeams: { create: (teams.length ? teams : ["전체"]).map((team) => ({ team })) }
    }
  });
  await saveAttachments(formData.getAll("files").filter((f): f is File => f instanceof File), "NOTICE", notice.id, user.id);
  if (notice.sendEmail) {
    const targetTeams = teams.includes("전체") || teams.length === 0 ? Object.values(Team) : teams.filter((team): team is Team => Object.values(Team).includes(team as Team));
    const recipients = await prisma.teamEmail.findMany({ where: { team: { in: targetTeams } }, select: { email: true } });
    await sendOrLogEmail({
      to: [...new Set(recipients.map((r) => r.email))],
      subject: `[공지] ${notice.title}`,
      body: [
        `공지 제목: ${notice.title}`,
        `공지 유형: ${noticeTypeText(notice.type)}`,
        `공지 내용: ${notice.content}`,
        `장소: ${notice.place ?? ""}`,
        `일정 날짜: ${fmtDate(notice.scheduleDate)}`,
        `작성자: ${user.name}`,
        `작성일: ${fmtDate(notice.createdAt)}`
      ].join("\n"),
      createdById: user.id
    });
  }
  revalidatePath("/notices");
  redirect("/notices");
}

export async function deleteNoticeAction(formData: FormData) {
  await requireUser();
  await prisma.notice.delete({ where: { id: formString(formData, "id") } });
  revalidatePath("/notices");
  redirect("/notices");
}

export async function upsertProductMasterAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const data = {
    name: formString(formData, "name"),
    costGroupCode: formString(formData, "costGroupCode"),
    factory: formString(formData, "factory") as Factory,
    updatedById: user.id
  };
  if (id) await prisma.productMaster.update({ where: { id }, data });
  else await prisma.productMaster.create({ data: { ...data, createdById: user.id } });
  revalidatePath("/admin");
}

export async function upsertExportProductNameAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const data = {
    exportCountry: formString(formData, "exportCountry"),
    productName: formString(formData, "productName"),
    englishName: formString(formData, "englishName"),
    productCode: formString(formData, "productCode"),
    updatedById: user.id
  };
  if (!data.exportCountry || !data.productName || !data.englishName || !data.productCode) {
    fail("/admin", "국가, 제품명, 영문제품명, 제품코드를 모두 입력해주세요.");
  }
  if (id) await prisma.exportProductName.update({ where: { id }, data });
  else await prisma.exportProductName.create({ data: { ...data, createdById: user.id } });
  revalidatePath("/admin");
}

export async function upsertBuyerMasterAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const salesEmailRecipients = formData
    .getAll("salesEmailRecipients")
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .join(", ");
  const data = {
    exportCountry: formString(formData, "exportCountry"),
    buyerName: formString(formData, "buyerName"),
    defaultCurrency: formString(formData, "defaultCurrency") || "USD",
    salesOwner: formString(formData, "salesOwner"),
    exportOwner: formString(formData, "exportOwner"),
    salesEmailRecipients,
    exportEmailRecipients: formString(formData, "exportOwner"),
    contactPerson: formString(formData, "exportOwner"),
    updatedById: user.id
  };

  const previous = id
    ? await prisma.buyerMaster.findUnique({
        where: { id },
        select: { buyerName: true, salesOwner: true, exportCountry: true }
      })
    : null;

  if (id) await prisma.buyerMaster.update({ where: { id }, data });
  else await prisma.buyerMaster.create({ data: { ...data, createdById: user.id } });

  const ownerChanged = Boolean(previous && previous.salesOwner !== data.salesOwner);
  if (ownerChanged && data.salesOwner) {
    const buyerNames = [...new Set([previous?.buyerName, data.buyerName].map((name) => (name ?? "").trim()).filter(Boolean))];
    if (buyerNames.length) {
      await reassignOrderManagementOwner({
        toOwner: data.salesOwner,
        buyerNames,
        updatedById: user.id
      });
    }
  }

  revalidatePath("/admin");
  revalidatePath("/orders");
}

export async function bulkUpdateBuyerMastersByCountryAction(formData: FormData) {
  const user = await requireUser();
  const exportCountry = formString(formData, "exportCountry");
  const salesOwner = formString(formData, "salesOwner");
  const exportOwner = formString(formData, "exportOwner");
  const salesEmailRecipients = formData
    .getAll("salesEmailRecipients")
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .join(", ");

  if (!exportCountry || !salesOwner || !exportOwner) {
    fail("/admin", "수출국, 영업담당자, 수출담당자를 모두 선택해주세요.");
  }

  await prisma.buyerMaster.updateMany({
    where: { exportCountry },
    data: {
      salesOwner,
      exportOwner,
      salesEmailRecipients,
      exportEmailRecipients: exportOwner,
      contactPerson: exportOwner,
      updatedById: user.id
    }
  });

  await reassignOrderManagementOwner({
    toOwner: salesOwner,
    exportCountry,
    updatedById: user.id
  });

  revalidatePath("/admin");
  revalidatePath("/orders");
}

export async function upsertDropdownAction(formData: FormData) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const label = formString(formData, "label");
  const category = formString(formData, "category") as DropdownCategory;
  const rawValue = formString(formData, "value");
  const value = category === DropdownCategory.FORWARDER ? rawValue : label;
  if (category === DropdownCategory.FORWARDER) {
    const normalizedValue = value.normalize("NFKC").replace(/\s+/g, "");
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
    const isNoQuote = normalizedValue === "견적X";
    if (!isEmail && !isNoQuote) {
      fail("/admin", "포워딩사 이메일은 이메일 형식 또는 견적X만 입력할 수 있습니다.");
    }
  }
  let destinationCountry: string | null = null;
  let destinationKind: string | null = null;
  if (category === DropdownCategory.DESTINATION_PORT) {
    const { inferDestinationFields } = await import("@/lib/destination-registry");
    const inferred = inferDestinationFields(label);
    destinationCountry = formString(formData, "destinationCountry") || inferred.country || null;
    destinationKind = formString(formData, "destinationKind");
    if (destinationKind !== "air" && destinationKind !== "sea") {
      fail("/admin", "구분(항구/공항)을 선택해주세요.");
    }
  }

  let partNo: number | null = null;
  let rankNo: number | null = null;
  let sortOrder = formNumber(formData, "sortOrder");
  if (category === DropdownCategory.OVERSEAS_SALES_TEAM) {
    partNo = Math.round(formNumber(formData, "partNo"));
    rankNo = Math.round(formNumber(formData, "rankNo"));
    if (!label) fail("/admin", "이름을 선택해주세요.");
    if (Number.isNaN(partNo) || partNo < -1) fail("/admin", "파트는 -1(팀장), 0(수습), 1 이상(N파트)으로 입력해주세요.");
    if (!rankNo || rankNo < 1) fail("/admin", "순위를 1 이상 숫자로 입력해주세요.");
    const { overseasSalesSortOrder } = await import("@/lib/overseas-sales-roster");
    sortOrder = overseasSalesSortOrder(partNo, rankNo);
  }

  const data = {
    category,
    label,
    value,
    sortOrder,
    destinationCountry,
    destinationKind,
    partNo,
    rankNo,
    updatedById: user.id
  };
  if (id) await prisma.dropdownOption.update({ where: { id }, data });
  else await prisma.dropdownOption.create({ data: { ...data, createdById: user.id } });
  revalidatePath("/admin");
  if (category === DropdownCategory.OVERSEAS_SALES_TEAM) revalidatePath("/orders");
}

export async function reorderDropdownAction(formData: FormData) {
  await requireUser();
  const ids = formString(formData, "ids").split(",").filter(Boolean);
  await Promise.all(
    ids.map((id, index) =>
      prisma.dropdownOption.update({
        where: { id },
        data: { sortOrder: index }
      })
    )
  );
  revalidatePath("/admin");
}

export async function saveOverseasSalesRosterAction(formData: FormData) {
  await requireUser();
  let rows: Array<{ id: string; label: string; partNo: number; rankNo: number; sortOrder: number }> = [];
  try {
    const parsed = JSON.parse(formString(formData, "rowsPayload") || "[]");
    rows = Array.isArray(parsed) ? parsed : [];
  } catch {
    return { ok: false as const, message: "저장 데이터가 올바르지 않습니다." };
  }
  if (!rows.length) return { ok: false as const, message: "저장할 구성원이 없습니다." };

  const { normalizeOverseasSalesPart, overseasSalesSortOrder } = await import("@/lib/overseas-sales-roster");
  await prisma.$transaction(
    rows.map((row) => {
      const partNo = normalizeOverseasSalesPart(row.partNo);
      const rankNo = Math.max(1, Math.round(Number(row.rankNo) || 1));
      return prisma.dropdownOption.update({
        where: { id: row.id },
        data: {
          partNo,
          rankNo,
          sortOrder: overseasSalesSortOrder(partNo, rankNo),
          value: row.label,
          label: row.label
        }
      });
    })
  );
  revalidatePath("/admin");
  revalidatePath("/orders");
  return { ok: true as const };
}

export async function upsertTeamEmailAction(formData: FormData) {
  const user = await requireUser();
  await prisma.teamEmail.create({
    data: { team: formString(formData, "team") as Team, email: formString(formData, "email"), createdById: user.id, updatedById: user.id }
  });
  revalidatePath("/admin");
}

export async function deleteGenericAction(formData: FormData) {
  await requireUser();
  const model = formString(formData, "model");
  const id = formString(formData, "id");
  if (model === "product") await prisma.productMaster.delete({ where: { id } });
  if (model === "buyer") await prisma.buyerMaster.delete({ where: { id } });
  if (model === "dropdown") {
    const target = await prisma.dropdownOption.findUnique({ where: { id }, select: { category: true } });
    if (target) {
      await prisma.dropdownOption.delete({ where: { id } });
      const rows = await prisma.dropdownOption.findMany({ where: { category: target.category }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }] });
      await Promise.all(rows.map((row, index) => prisma.dropdownOption.update({ where: { id: row.id }, data: { sortOrder: index } })));
      if (target.category === DropdownCategory.OVERSEAS_SALES_TEAM) revalidatePath("/orders");
    }
  } else if (model === "exportProductName") {
    await prisma.exportProductName.delete({ where: { id } });
  }
  if (model === "teamEmail") await prisma.teamEmail.delete({ where: { id } });
  revalidatePath("/admin");
}


