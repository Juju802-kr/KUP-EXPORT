import { AttachmentOwnerType, NoticeType, Team } from "@prisma/client";
import Link from "next/link";
import { DeleteButton } from "@/components/DeleteButton";
import { NoticeEditor } from "@/components/NoticeEditor";
import { fmtDate, fmtDateTimeLocal } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { deleteNoticeAction } from "@/server/actions";

const noticeTypeLabels: Record<NoticeType, string> = {
  GENERAL: "일반",
  URGENT: "긴급",
  MEETING: "회의",
  SHARE: "업무 공유",
  ETC: "기타"
};

const teamLabels: Record<string, string> = {
  "전체": "전체",
  [Team.OVERSEAS_MARKETING]: "해외마케팅팀",
  [Team.OVERSEAS_SALES]: "해외영업팀",
  [Team.OVERSEAS_SALES_SUPPORT]: "해외영업지원팀"
};

const fmtDateTime = (value?: Date | string | null) => fmtDateTimeLocal(value).replace("T", " ");
const fmtShortDate = (value?: Date | string | null) => {
  const dateText = fmtDate(value);
  return dateText ? dateText.slice(2).replaceAll("-", ".") : "";
};

function periodText(start?: Date | string | null, end?: Date | string | null) {
  const startText = fmtDateTime(start) || fmtDate(start);
  const endText = fmtDateTime(end) || fmtDate(end);
  if (startText && endText) return `${startText} ~ ${endText}`;
  return startText || endText;
}

function teamsText(teams: { team: string }[]) {
  return teams.map((team) => teamLabels[team.team] ?? team.team).join(", ");
}

function AttachmentLinkList({ files }: { files: { id: string; path: string; originalName: string; mimeType: string | null }[] }) {
  if (!files.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {files.map((file) => (
        <a key={file.id} href={file.path} className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50" download={file.originalName}>
          {file.mimeType?.startsWith("image/") ? "이미지 " : "파일 "} {file.originalName}
        </a>
      ))}
    </div>
  );
}

export default async function NoticesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const q = params.q?.trim();
  const editId = params.edit?.trim();
  const notices = await prisma.notice.findMany({
    where: q
      ? { OR: [{ title: { contains: q } }, { content: { contains: q } }, { recipientTeams: { some: { team: { contains: q } } } }] }
      : {},
    include: { recipientTeams: true },
    orderBy: [{ important: "desc" }, { createdAt: "desc" }]
  });
  const noticeAttachments = notices.length
    ? await prisma.attachment.findMany({
        where: { ownerType: AttachmentOwnerType.NOTICE, ownerId: { in: notices.map((notice) => notice.id) } },
        orderBy: { createdAt: "desc" }
      })
    : [];

  return (
      <div className="space-y-5">
      <h1 className="text-2xl font-semibold">공지</h1>

      <NoticeEditor
        editId={editId}
        notices={notices.map((notice) => ({
          id: notice.id,
          title: notice.title,
          content: notice.content,
          type: notice.type,
          important: notice.important,
          place: notice.place ?? "",
          scheduleDate: fmtDateTimeLocal(notice.scheduleDate),
          scheduleEndDate: fmtDateTimeLocal(notice.scheduleEndDate),
          teams: notice.recipientTeams.map((team) => team.team)
        }))}
      />

      <section className="space-y-3">
        <form className="panel flex items-end gap-3 p-4">
          <div className="field min-w-96">
            <label>검색</label>
            <input name="q" defaultValue={q ?? ""} placeholder="제목, 내용, 대상 팀" />
          </div>
          <button className="btn">검색</button>
        </form>
        {notices.map((notice) => (
          <article id={notice.id} key={notice.id} className="panel p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-blue-700">
                  {notice.important ? <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 font-bold text-rose-700">!</span> : null}
                  {noticeTypeLabels[notice.type]}
                </p>
                <h2 className="mt-1 text-lg font-semibold">{notice.title}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{notice.content}</p>
                <AttachmentLinkList files={noticeAttachments.filter((file) => file.ownerId === notice.id)} />
                <p className="mt-3 text-xs text-slate-500">
                  대상 {teamsText(notice.recipientTeams)} · {notice.place || "장소 없음"} · {periodText(notice.scheduleDate, notice.scheduleEndDate) || "일정 없음"}
                </p>
              </div>
              <div className="flex shrink-0 items-stretch gap-2">
                <Link className="btn-primary flex h-11 items-center px-5" href={`/notices?edit=${notice.id}#notice-form`}>
                  수정
                </Link>
                <form action={deleteNoticeAction} className="flex">
                  <input type="hidden" name="id" value={notice.id} />
                  <DeleteButton />
                </form>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">공지로그</h2>
        <div className="mt-3 divide-y divide-slate-100">
          {notices.map((notice) => (
            <div key={notice.id} className="py-2 text-sm">
              <span className="font-medium text-slate-700">{fmtShortDate(notice.scheduleDate) || "-"}</span>
              <span className="ml-3 text-slate-900">{notice.title}</span>
              <span className="mx-2 text-slate-400">-</span>
              <span className="text-slate-600">{teamsText(notice.recipientTeams)}</span>
            </div>
          ))}
          {!notices.length ? <p className="py-2 text-sm text-slate-500">등록된 공지가 없습니다.</p> : null}
        </div>
      </section>
    </div>
  );
}
