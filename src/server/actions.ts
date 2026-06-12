"use server";

import { DropdownCategory, Factory, NoticeType, PaymentLcKind, ShipmentStatus, Team } from "@prisma/client";
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
import { prisma } from "@/lib/prisma";
import { saveAttachments } from "@/lib/upload";
import { emailSchema, formDate, formNumber, formString } from "@/lib/validators";

function fail(path: string, message: string): never {
  redirect(withMessage(path, "error", message));
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
  const salesOwner = formString(formData, "salesOwner");
  if (!salesOwner) fail("/shipments/new", "영업담당자를 선택해주세요.");
  if (!buyer) fail("/shipments/new", "바이어는 필수입니다.");
  const shipment = await prisma.shipmentRequest.create({
    data: { ...readShipmentForm(formData), reporter: user.name, shipNo: await nextShipNo(), sortOrder: await nextShipmentSortOrder(salesOwner), createdById: user.id, updatedById: user.id }
  });
  await saveAttachments(formData.getAll("files").filter((f): f is File => f instanceof File), "SHIPMENT", shipment.id, user.id);

  const orderProducts = parseOrderProductDrafts(formString(formData, "orderProductsJson"));
  if (orderProducts.length) {
    for (const product of orderProducts) {
      const bxQtyPaid = Math.round(Number(product.bxQtyPaid) || 0);
      const bxQtyFoc = Math.round(Number(product.bxQtyFoc) || 0);
      const exportUnitPrice = Number(product.exportUnitPrice) || 0;
      await prisma.shipmentProduct.create({
        data: {
          shipmentId: shipment.id,
          productName: product.productName || product.englishName || "제품명 미입력",
          englishName: product.englishName || "",
          productionRequestNo: product.productionRequestNo || "",
          piNo: product.piNo || "",
          exportUnitPrice,
          bxQtyPaid,
          bxQtyFoc,
          bxQtyTotal: bxQtyPaid + bxQtyFoc,
          amount: exportUnitPrice * bxQtyPaid,
          createdById: user.id,
          updatedById: user.id
        }
      });
    }
    await Promise.all([recalcShipmentInvoice(shipment.id), autoLinkShipmentLc(shipment.id, user.id)]);
  }

  revalidatePath("/shipments");
  redirect(`/shipments/${shipment.id}`);
}

export async function createShipmentFromOrderAction(formData: FormData) {
  const user = await requireUser();
  const buyer = formString(formData, "buyer");
  const exportCountry = formString(formData, "exportCountry");
  if (!buyer) fail("/orders", "바이어 정보가 없어 선적의뢰를 만들 수 없습니다.");

  const buyerMaster = await prisma.buyerMaster.findFirst({ where: { buyerName: buyer }, orderBy: { updatedAt: "desc" } });
  const salesOwner = buyerMaster?.salesOwner || user.name;
  const shipment = await prisma.shipmentRequest.create({
    data: {
      status: ShipmentStatus.REQUEST_WAITING,
      exportCountry: exportCountry || buyerMaster?.exportCountry || "",
      buyer,
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

type OrderProductDraftInput = {
  productName?: string;
  englishName?: string;
  productionRequestNo?: string;
  piNo?: string;
  exportUnitPrice?: number;
  bxQtyPaid?: number;
  bxQtyFoc?: number;
};

function parseOrderProductDrafts(raw: string): OrderProductDraftInput[] {
  return parseJsonArray(raw) as OrderProductDraftInput[];
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
    shipmentLines,
    paymentLines,
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
  const sheet = formString(formData, "sheet");
  const rowKey = formString(formData, "rowKey");
  const data = buildOrderEntryDataFromFields(formDataToFields(formData), user.id);

  if (rowKey.startsWith("entry:")) {
    await prisma.orderEntry.update({ where: { id: rowKey.slice(6) }, data });
  } else {
    await prisma.orderEntry.create({
      data: { ...data, salesOwner: owner, createdById: user.id }
    });
  }

  revalidatePath("/orders");
  redirect(`/orders?owner=${encodeURIComponent(owner)}&sheet=${encodeURIComponent(sheet)}`);
}

export async function saveAllOrderBoardRowsAction(formData: FormData) {
  const user = await requireUser();
  const owner = formString(formData, "owner") || user.name;
  const sheet = formString(formData, "sheet");
  const rows = parseJsonArray(formString(formData, "rowsPayload")) as OrderBoardRowFields[];

  const writes = rows.map((fields) => {
    const rowKey = fields.rowKey ?? "";
    const data = buildOrderEntryDataFromFields(fields, user.id);
    if (rowKey.startsWith("entry:")) {
      return prisma.orderEntry.update({ where: { id: rowKey.slice(6) }, data });
    }
    return prisma.orderEntry.create({
      data: { ...data, salesOwner: owner, createdById: user.id }
    });
  });

  if (writes.length) await prisma.$transaction(writes);

  revalidatePath("/orders");
  return { ok: true as const, count: writes.length };
}

export async function saveOrderEntriesAction(formData: FormData) {
  const user = await requireUser();
  const owner = formString(formData, "owner") || user.name;
  const rowCount = formData.getAll("rowKey").length;
  const buyerNames = Array.from({ length: rowCount }, (_, index) => formString(formData, `buyer-${index}`)).filter(Boolean);
  const buyers = buyerNames.length
    ? await prisma.buyerMaster.findMany({ where: { buyerName: { in: buyerNames } }, select: { buyerName: true, exportCountry: true } })
    : [];
  const countryByBuyer = new Map(buyers.map((buyer) => [buyer.buyerName, buyer.exportCountry]));

  const creates = [];
  for (let index = 0; index < rowCount; index += 1) {
    const buyer = formString(formData, `buyer-${index}`);
    const piNo = formString(formData, `piNo-${index}`);
    const productionRequestNo = formString(formData, `productionRequestNo-${index}`);
    const productName = formString(formData, `productName-${index}`);
    const unitPrice = formNumber(formData, `unitPrice-${index}`);
    const quantity = formNumber(formData, `quantity-${index}`);
    const hasValue = buyer || piNo || productionRequestNo || productName || unitPrice || quantity;
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
          unitPrice,
          quantity,
          amount: unitPrice * quantity,
          createdById: user.id,
          updatedById: user.id
        }
      })
    );
  }
  if (creates.length) await prisma.$transaction(creates);
  revalidatePath("/orders");
  redirect(`/orders?owner=${encodeURIComponent(owner)}`);
}

export async function registerSalesOrderAction(formData: FormData) {
  const user = await requireUser();
  const owner = formString(formData, "owner") || user.name;
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
  await prisma.$transaction([
    prisma.lcShipmentLink.deleteMany({ where: { shipmentId } }),
    ...(lc ? [prisma.lcShipmentLink.create({ data: { shipmentId, lcId: lc.id, createdById: userId } })] : []),
    prisma.shipmentRequest.update({
      where: { id: shipmentId },
      data: { linkedLcId: lc?.id ?? null, lcSd: lc?.lcSd ?? "", updatedById: userId }
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

async function savePaymentTT(formData: FormData, intent: string) {
  const user = await requireUser();
  const id = formString(formData, "id");
  const data = readPaymentTTForm(formData, user.id);
  const allocations = readPaymentTTAllocations(formData, Number(data.amount), id);
  const payment = id ? await prisma.paymentTT.update({ where: { id }, data: omitCreatedBy(data) }) : await prisma.paymentTT.create({ data });
  await Promise.all([
    savePaymentTTAllocations(payment.id, allocations),
    saveAttachments(formData.getAll("files").filter((f): f is File => f instanceof File), "PAYMENT_TT", payment.id, user.id)
  ]);
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
  return rows;
}

function readPaymentLCAllocations(formData: FormData, paymentAmount: number, paymentId?: string): LCAllocationInput[] | null {
  const productionNos = formData.getAll("lcAllocationProductionRequestNo").map(String);
  const amounts = formData.getAll("lcAllocationAmount");
  if (!productionNos.length && !amounts.length) return null;
  const rows = Array.from({ length: Math.max(productionNos.length, amounts.length) }, (_, index) => ({
    productionRequestNo: productionNos[index]?.trim() ?? "",
    amount: parseMoneyInput(amounts[index])
  })).filter((row) => row.productionRequestNo || row.amount);
  if (rows.length && !sameMoney(sumMoney(rows), paymentAmount)) {
    fail(`/payments?tab=lc${paymentId ? `&edit=${paymentId}` : ""}`, "입력한 금액 합이 통지된 금액과 맞지 않습니다.");
  }
  return rows;
}

async function savePaymentTTAllocations(paymentId: string, allocations: TTAllocationInput[] | null) {
  if (!allocations) return;
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
          sortOrder: index
        }
      })
    ),
    prisma.paymentLC.update({
      where: { id: paymentId },
      data: {
        productionRequestNo: joinNonEmpty(allocations.map((row) => row.productionRequestNo))
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
  const [payment, attachments] = await Promise.all([
    prisma.paymentLC.findUnique({
      where: { id: paymentId },
      include: { allocations: { orderBy: { sortOrder: "asc" } } }
    }),
    prisma.attachment.findMany({ where: { ownerType: "PAYMENT_LC", ownerId: paymentId } })
  ]);
  if (!payment || !attachments.length) return;
  const baseName = paymentLcAttachmentBaseName({
    date: payment.noticeDate,
    buyer: payment.buyer,
    currency: payment.currency,
    amount: payment.amount,
    productionRequestNo: payment.productionRequestNo,
    allocations: payment.allocations
  });
  await prisma.$transaction(attachments.map((attachment) =>
    prisma.attachment.update({
      where: { id: attachment.id },
      data: { originalName: attachmentNameWithOriginalExtension(baseName, attachment.originalName) }
    })
  ));
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
  await prisma.lcShipmentLink.upsert({
    where: { lcId_shipmentId: { lcId, shipmentId } },
    update: {},
    create: { lcId, shipmentId, createdById: user.id }
  });
  await prisma.shipmentRequest.update({ where: { id: shipmentId }, data: { linkedLcId: lcId, lcSd: lc.lcSd, updatedById: user.id } });
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
      updatedById: user.id
    }
  });
  await saveAttachments(formData.getAll("files").filter((file): file is File => file instanceof File), "BUYER_MASTER", buyerId, user.id);
  revalidatePath(`/shipments/${shipmentId}`);
  redirect(`/shipments/${shipmentId}?success=${encodeURIComponent("바이어 특이사항이 저장되었습니다.")}`);
}

const noticeMailTeams: Team[] = [Team.OVERSEAS_MARKETING, Team.OVERSEAS_SALES, Team.OVERSEAS_SALES_SUPPORT];
const salesMailTeams: Team[] = [Team.OVERSEAS_MARKETING, Team.OVERSEAS_SALES, Team.OVERSEAS_BRANCH];
const exportOwnerTeams: Team[] = [Team.OVERSEAS_SALES_SUPPORT];
const noticeTeamLabels: Record<string, string> = {
  "전체": "전체",
  [Team.OVERSEAS_MARKETING]: "해외마케팅팀",
  [Team.OVERSEAS_SALES]: "해외영업팀",
  [Team.OVERSEAS_SALES_SUPPORT]: "해외영업지원팀"
};

function noticeMailTargetTeams(targetTeams: string[]) {
  return targetTeams.includes("전체")
    ? noticeMailTeams
    : targetTeams.filter((team): team is Team => noticeMailTeams.includes(team as Team));
}

function noticeTargetTeamText(targetTeams: string[]) {
  const teams = targetTeams.includes("전체") ? noticeMailTeams : targetTeams;
  return teams.map((team) => noticeTeamLabels[team] ?? team).join(", ");
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
  const teamText = noticeTargetTeamText(targetTeams);
  const bodyLines = [
    "\uc81c\ubaa9: " + notice.title,
    "\uacf5\uc9c0 \uc720\ud615: " + noticeTypeText(notice.type),
    "\uc7a5\uc18c: " + (notice.place ?? ""),
    "\uc2dc\uc791\uc77c\uc2dc: " + dateTimeText(notice.scheduleDate),
    "\uc885\ub8cc\uc77c\uc2dc: " + dateTimeText(notice.scheduleEndDate),
    "\ub300\uc0c1 \ud300: " + teamText,
    "",
    isCancel ? "\ucde8\uc18c \uc0ac\uc720:" : "\uacf5\uc9c0 \ub0b4\uc6a9:",
    notice.content
  ];
  revalidatePath("/notices");
  revalidatePath("/calendar");
  emailQueueRedirect("/notices", () =>
    sendProgramEmail({
      to: recipients.map((recipient) => recipient.email),
      subject: changePrefix + importantPrefix + "[" + noticeTypeText(notice.type) + "] " + notice.title + " " + (notice.place || "") + " " + dateTimeText(notice.scheduleDate) + " ~ " + dateTimeText(notice.scheduleEndDate),
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
  if (id) await prisma.buyerMaster.update({ where: { id }, data });
  else await prisma.buyerMaster.create({ data: { ...data, createdById: user.id } });
  revalidatePath("/admin");
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
  revalidatePath("/admin");
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
  const data = {
    category,
    label,
    value,
    sortOrder: formNumber(formData, "sortOrder"),
    updatedById: user.id
  };
  if (id) await prisma.dropdownOption.update({ where: { id }, data });
  else await prisma.dropdownOption.create({ data: { ...data, createdById: user.id } });
  revalidatePath("/admin");
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
    }
  } else if (model === "exportProductName") {
    await prisma.exportProductName.delete({ where: { id } });
  }
  if (model === "teamEmail") await prisma.teamEmail.delete({ where: { id } });
  revalidatePath("/admin");
}


