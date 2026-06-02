import { DropdownCategory, NoticeType, ShipmentStatus, Team } from "@prisma/client";

export const teamLabels: Record<Team, string> = {
  OVERSEAS_MARKETING: "해외마케팅팀",
  OVERSEAS_SALES_SUPPORT: "해외영업지원팀",
  OVERSEAS_SALES: "해외영업팀",
  SEOMYEON_QA: "서면공장",
  JEONDONG_QA: "전동공장",
  OVERSEAS_BRANCH: "해외지사"
};

export const statusLabels: Record<ShipmentStatus, string> = {
  REQUEST_WAITING: "의뢰대기",
  QUOTE: "★견적",
  SCHEDULE: "1. 스케줄",
  SHIPPING_DOCS: "2. 출고 및 선적/서류",
  NEGO_COLLECTION: "3. 네고 및 수금처리",
  AFTERCARE: "4. 사후관리"
};

export const noticeTypeLabels: Record<NoticeType, string> = {
  GENERAL: "일반 공지",
  URGENT: "긴급 공지",
  MEETING: "회의 공지",
  SHARE: "업무 공유",
  ETC: "기타"
};

export const dropdownCategoryLabels: Record<DropdownCategory, string> = {
  EXPORT_COUNTRY: "수출국",
  TRANSPORT: "운송",
  DESTINATION_PORT: "목적항",
  STORAGE_CONDITION: "보관조건",
  INCOTERMS: "인코텀즈",
  PAYMENT_TERM: "결제조건",
  DEPOSIT_STATUS: "입금상황",
  CURRENCY: "통화",
  FORWARDER: "포워딩",
  DEPARTURE_PORT: "출발항"
};

export const fmtDate = (value?: Date | string | null) => {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
};

export const fmtDateTimeLocal = (value?: Date | string | null) => {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const fmtMoney = (value?: unknown) => {
  const n = Number(value ?? 0);
  return n.toLocaleString("ko-KR", { maximumFractionDigits: 2 });
};
