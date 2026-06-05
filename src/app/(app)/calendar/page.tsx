import Link from "next/link";
import { Factory, NoticeType, Prisma, ShipmentStatus, Team } from "@prisma/client";
import { CalendarModeFilter } from "@/components/CalendarModeFilter";
import { CalendarSourceFilter } from "@/components/CalendarSourceFilter";
import { fmtDateTimeLocal, fmtMoney } from "@/lib/constants";
import { prisma } from "@/lib/prisma";

type Mode = "release" | "shipping" | "owner" | "notice";
type ShipmentWithProducts = Prisma.ShipmentRequestGetPayload<{ include: { products: true } }>;
type NoticeForCalendar = Prisma.NoticeGetPayload<{ include: { recipientTeams: true } }>;
type CalendarEvent = {
  date: string;
  source: string;
  title: string;
  color: string;
  kind: "shipment" | "notice";
  factory: string;
  port: string;
  country: string;
  buyer: string;
  product: string;
  qty: string;
  amount: string;
  ct: string;
  owner: string;
  href?: string;
  noticeType?: string;
  important?: boolean;
  startText?: string;
  endText?: string;
  content?: string;
  recipients?: string;
};

const releaseSources = ["서면출고", "서면출고예정", "전동출고", "전동출고예정"];
const shippingSources = ["서면 ETD", "전동 ETD", "서면 ETA", "전동 ETA"];
const noticeSources = ["일반", "회의", "중요"];
const sourceColorClasses: Record<string, string> = {
  "서면출고예정": "bg-lime-400",
  "서면출고": "bg-emerald-600",
  "전동출고예정": "bg-sky-400",
  "전동출고": "bg-blue-600",
  "서면 ETD": "bg-red-500",
  "서면 ETA": "bg-orange-500",
  "전동 ETD": "bg-purple-600",
  "전동 ETA": "bg-yellow-400",
  "일반": "bg-amber-400",
  "회의": "bg-blue-500",
  "중요": "bg-rose-500"
};
const eventColorClasses: Record<string, string> = {
  "서면출고예정": "bg-lime-100 text-lime-900",
  "서면출고": "bg-emerald-100 text-emerald-900",
  "전동출고예정": "bg-sky-100 text-sky-900",
  "전동출고": "bg-blue-100 text-blue-900",
  "서면 ETD": "bg-red-100 text-red-900",
  "서면 ETA": "bg-orange-100 text-orange-900",
  "전동 ETD": "bg-purple-100 text-purple-900",
  "전동 ETA": "bg-yellow-100 text-yellow-900",
  "일반": "bg-amber-50 text-amber-800",
  "회의": "bg-blue-50 text-blue-800",
  "중요": "bg-rose-50 text-rose-800"
};
const noticeTypeLabels: Record<NoticeType, string> = {
  GENERAL: "일반",
  URGENT: "일반",
  MEETING: "회의",
  SHARE: "일반",
  ETC: "일반"
};
const teamLabels: Record<string, string> = {
  "전체": "전체",
  [Team.OVERSEAS_MARKETING]: "해외마케팅팀",
  [Team.OVERSEAS_SALES]: "해외영업팀",
  [Team.OVERSEAS_SALES_SUPPORT]: "해외영업지원팀",
  [Team.SEOMYEON_QA]: "서면공장",
  [Team.JEONDONG_QA]: "전동공장",
  [Team.OVERSEAS_BRANCH]: "해외지사"
};

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const mode = parseMode(params.mode);
  const ym = stringParam(params.month) || new Date().toISOString().slice(0, 7);
  const filterName = stringParam(params.name)?.trim();
  const sources = selectedSources(params.source, mode, stringParam(params.sourceTouched) === "1");
  const [year, month] = ym.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const start = new Date(year, month - 1, 1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const end = new Date(days[days.length - 1].getFullYear(), days[days.length - 1].getMonth(), days[days.length - 1].getDate() + 1);

  const [shipments, notices] = await Promise.all([
    mode === "notice"
      ? Promise.resolve([])
      : prisma.shipmentRequest.findMany({
          where: {
            AND: [
              {
                OR: [
                  { releaseDate: { gte: start, lt: end } },
                  { etd: { gte: start, lt: end } },
                  { eta: { gte: start, lt: end } }
                ]
              },
              filterName && mode === "owner"
                ? {
                    OR: [
                      { salesOwner: { contains: filterName } },
                      { exportOwner: { contains: filterName } },
                      { contactPerson: { contains: filterName } }
                    ]
                  }
                : {}
            ]
          },
          include: { products: true }
        }),
    mode === "notice"
      ? prisma.notice.findMany({ where: { scheduleDate: { gte: start, lt: end } }, include: { recipientTeams: true }, orderBy: { scheduleDate: "asc" } })
      : Promise.resolve([])
  ]);

  const allEvents = mode === "notice" ? noticeEvents(notices) : shipmentEvents(shipments, mode);
  const events = allEvents.filter((event) => sources.includes(event.source));
  const byDate = events.reduce((map, event) => {
    map.set(event.date, [...(map.get(event.date) ?? []), event]);
    return map;
  }, new Map<string, CalendarEvent[]>());
  const prev = monthString(new Date(year, month - 2, 1));
  const next = monthString(new Date(year, month, 1));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">달력</h1>
          <p className="mt-1 text-sm text-slate-500">출고, 선적, 담당자, 공지 일정을 월간으로 확인합니다.</p>
        </div>
        <div className="flex gap-2">
          <Link className="btn" href={calendarUrl(mode, prev, sources, filterName)}>이전</Link>
          <span className="btn">{ym}</span>
          <Link className="btn" href={calendarUrl(mode, next, sources, filterName)}>다음</Link>
        </div>
      </div>

      <CalendarModeFilter mode={mode} month={ym} name={filterName} />

      <div className="grid grid-cols-[240px_1fr] gap-4">
        <aside className="panel p-4">
          <h2 className="text-sm font-semibold">Source</h2>
          <CalendarSourceFilter mode={mode} month={ym} name={mode === "owner" ? filterName : undefined} sources={sourceLabels(mode)} selectedSources={sources} colors={sourceColorClasses} />
        </aside>

        <section className="panel overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-center text-xs font-medium text-slate-500">
            {["일", "월", "화", "수", "목", "금", "토"].map((day) => <div key={day} className="py-2">{day}</div>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = dateKey(day);
              return (
                <div key={key} className={`min-h-32 border-b border-r border-slate-100 p-2 ${day.getMonth() + 1 === month ? "bg-white" : "bg-slate-50"}`}>
                  <div className="text-xs font-medium text-slate-500">{day.getDate()}</div>
                  <div className="mt-2 space-y-1">
                    {(byDate.get(key) ?? []).map((event, index) => (
                      <details key={`${event.source}-${event.title}-${index}`} className={`rounded px-2 py-1 text-xs ${event.color}`}>
                        <summary className="cursor-pointer whitespace-normal break-words">
                          {event.kind === "notice" ? <NoticeEventTitle event={event} /> : event.title}
                        </summary>
                        {event.kind === "notice" ? <NoticeEventDetail event={event} /> : <ShipmentEventDetail event={event} />}
                      </details>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function parseMode(value: string | string[] | undefined): Mode {
  const mode = stringParam(value);
  return mode === "shipping" || mode === "owner" || mode === "notice" ? mode : "release";
}

function stringParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function selectedSources(value: string | string[] | undefined, mode: Mode, touched = false) {
  const available = sourceLabels(mode);
  const raw = Array.isArray(value) ? value : value ? [value] : touched ? [] : available;
  const selected = raw.filter((source) => available.includes(source));
  return selected.length || touched ? selected : available;
}

function calendarUrl(mode: Mode, month: string, sources: string[], name?: string) {
  const params = new URLSearchParams({ mode, month });
  if (name) params.set("name", name);
  for (const source of sources) params.append("source", source);
  return `/calendar?${params.toString()}`;
}

function monthString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sourceLabels(mode: Mode) {
  if (mode === "notice") return noticeSources;
  if (mode === "shipping") return shippingSources;
  if (mode === "owner") return [...releaseSources, ...shippingSources];
  return releaseSources;
}

function shipmentEvents(shipments: ShipmentWithProducts[], mode: Mode): CalendarEvent[] {
  const events: CalendarEvent[] = [];
  const includeRelease = mode === "release" || mode === "owner";
  const includeShipping = mode === "shipping" || mode === "owner";
  for (const shipment of shipments) {
    for (const product of shipment.products) {
      const factory = factoryLabel(product.factory);
      if (!factory) continue;
      const base = {
        factory,
        port: shipment.destinationPort || shipment.departurePort || "-",
        country: shipment.exportCountry || "-",
        buyer: shipment.buyer || "-",
        product: product.englishName || product.productName,
        qty: `${product.bxQtyTotal.toLocaleString()}BX`,
        amount: fmtMoney(product.amount),
        ct: cartonTotal(product),
        owner: shipment.salesOwner || shipment.exportOwner || "-",
        href: `/shipments/${shipment.id}`,
        kind: "shipment" as const
      };
      if (includeRelease && shipment.releaseDate) {
        const plannedStatuses: ShipmentStatus[] = [ShipmentStatus.REQUEST_WAITING, ShipmentStatus.QUOTE, ShipmentStatus.SCHEDULE];
        const planned = plannedStatuses.includes(shipment.status);
        const source = `${factory}${planned ? "출고예정" : "출고"}`;
        events.push({
          ...base,
          source,
          date: shipment.releaseDate.toISOString().slice(0, 10),
          title: `${factory}: [${shipment.destinationPort || "-"}] ${shipment.exportCountry || "-"} ${product.productName} ${product.bxQtyTotal.toLocaleString()}BX`,
          color: eventColor(source)
        });
      }
      if (includeShipping && shipment.etd) {
        const source = `${factory} ETD`;
        events.push({ ...base, source, date: shipment.etd.toISOString().slice(0, 10), title: `${source}: ${shipment.exportCountry || "-"} ${product.productName}`, color: eventColor(source) });
      }
      if (includeShipping && shipment.eta) {
        const source = `${factory} ETA`;
        events.push({ ...base, source, date: shipment.eta.toISOString().slice(0, 10), title: `${source}: ${shipment.exportCountry || "-"} ${product.productName}`, color: eventColor(source) });
      }
    }
  }
  return events;
}

function noticeEvents(notices: NoticeForCalendar[]): CalendarEvent[] {
  return notices.flatMap((notice) => {
    if (!notice.scheduleDate) return [];
    const source = notice.important ? "중요" : notice.type === NoticeType.MEETING ? "회의" : "일반";
    const noticeType = noticeTypeLabels[notice.type] ?? "일반";
    return [{
      date: notice.scheduleDate.toISOString().slice(0, 10),
      source,
      title: `${noticeType}: ${notice.title}`,
      color: eventColor(source),
      kind: "notice" as const,
      factory: "-",
      port: notice.place || "-",
      country: "-",
      buyer: "-",
      product: notice.title,
      qty: "-",
      amount: "-",
      ct: "-",
      owner: "-",
      href: `/notices#${notice.id}`,
      noticeType,
      important: notice.important,
      startText: fmtCalendarDateTime(notice.scheduleDate),
      endText: fmtCalendarDateTime(notice.scheduleEndDate),
      content: notice.content,
      recipients: teamsText(notice.recipientTeams)
    }];
  });
}

function ShipmentEventDetail({ event }: { event: CalendarEvent }) {
  return (
    <div className="mt-2 space-y-1 text-slate-700">
      <p>Source: {event.source}</p>
      <p>공장: {event.factory}</p>
      <p>항구: {event.port}</p>
      <p>수출국/바이어: {event.country} {event.buyer}</p>
      <p>제품: {event.product}</p>
      <p>수량/금액/카톤: {event.qty} / {event.amount} / {event.ct}</p>
      <p>담당자: {event.owner}</p>
      {event.href ? <Link className="btn mt-1 w-full" href={event.href}>선적의뢰 보기</Link> : null}
    </div>
  );
}

function NoticeEventDetail({ event }: { event: CalendarEvent }) {
  return (
    <div className="mt-2 space-y-1 text-slate-700">
      <p className="font-semibold">{event.important ? "! " : ""}{event.noticeType}: {event.product}</p>
      <p>시작일시: {event.startText || "-"}</p>
      <p>종료일시: {event.endText || "-"}</p>
      <p>장소: {event.port}</p>
      <p className="whitespace-pre-line">내용: {event.content || "-"}</p>
      <p>대상자: {event.recipients || "-"}</p>
      {event.href ? <Link className="btn mt-1 w-full" href={event.href}>공지 보기</Link> : null}
    </div>
  );
}

function NoticeEventTitle({ event }: { event: CalendarEvent }) {
  return (
    <span className="whitespace-normal break-words">{event.title}</span>
  );
}

function fmtCalendarDateTime(value?: Date | string | null) {
  return fmtDateTimeLocal(value).replace("T", " ");
}

function teamsText(teams: { team: string }[]) {
  return teams.map((team) => teamLabels[team.team] ?? team.team).join(", ");
}

function factoryLabel(factory: Factory | null) {
  if (factory === Factory.SEOMYEON) return "서면";
  if (factory === Factory.JEONDONG) return "전동";
  return "";
}

function cartonTotal(product: ShipmentWithProducts["products"][number]) {
  const total = Number(product.normalBoxQty || 0) + Number(product.iceBoxQty || 0) + Number(product.injectionBoxQty || 0) + Number(product.commonBoxQty || 0);
  return total ? `${total.toLocaleString()}CT` : "-";
}

function eventColor(source: string) {
  return eventColorClasses[source] ?? "bg-slate-100 text-slate-800";
}
