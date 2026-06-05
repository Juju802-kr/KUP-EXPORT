"use client";

import { NoticeType, Team } from "@prisma/client";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { saveNoticeAction } from "@/server/actions";

type NoticeRow = {
  id: string;
  title: string;
  content: string;
  type: NoticeType;
  important: boolean;
  canceled: boolean;
  cancelReason: string;
  place: string;
  scheduleDate: string;
  scheduleEndDate: string;
  teams: string[];
};

const allTeamValue = "전체";
const teamOptions = [
  { value: allTeamValue, label: "전체" },
  { value: Team.OVERSEAS_MARKETING, label: "해외마케팅팀" },
  { value: Team.OVERSEAS_SALES, label: "해외영업팀" },
  { value: Team.OVERSEAS_SALES_SUPPORT, label: "해외영업지원팀" }
];

const emptyNotice: NoticeRow = {
  id: "",
  title: "",
  content: "",
  type: NoticeType.GENERAL,
  important: false,
  canceled: false,
  cancelReason: "",
  place: "",
  scheduleDate: "",
  scheduleEndDate: "",
  teams: [allTeamValue]
};

export function NoticeEditor({ notices, editId, cancelId }: { notices: NoticeRow[]; editId?: string; cancelId?: string }) {
  const hasEditNotice = Boolean(editId && notices.some((notice) => notice.id === editId));
  const hasCancelNotice = Boolean(cancelId && notices.some((notice) => notice.id === cancelId));
  const initialMode = hasCancelNotice ? "cancel" : hasEditNotice ? "edit" : "new";
  const [mode, setMode] = useState<"new" | "edit" | "cancel">(initialMode);
  const [selectedId, setSelectedId] = useState(cancelId ?? editId ?? "");
  const [error, setError] = useState("");

  const selectedNotice = useMemo(() => notices.find((notice) => notice.id === selectedId) ?? emptyNotice, [notices, selectedId]);
  const formNotice = mode === "edit" ? selectedNotice : mode === "cancel" ? { ...selectedNotice, content: selectedNotice.cancelReason || "" } : emptyNotice;

  useEffect(() => {
    if (hasCancelNotice && cancelId) {
      setMode("cancel");
      setSelectedId(cancelId);
      return;
    }
    if (hasEditNotice && editId) {
      setMode("edit");
      setSelectedId(editId);
      return;
    }
    if (!editId && !cancelId) {
      setMode("new");
      setSelectedId("");
    }
  }, [cancelId, editId, hasCancelNotice, hasEditNotice]);

  function validatePeriod(event: FormEvent<HTMLFormElement>) {
    const formData = new FormData(event.currentTarget);
    const start = String(formData.get("scheduleDate") ?? "");
    const end = String(formData.get("scheduleEndDate") ?? "");
    if (start && end && new Date(end) < new Date(start)) {
      event.preventDefault();
      const message = "종료일시가 시작일시보다 앞설 수 없습니다";
      setError(message);
      alert(message);
      return;
    }
    setError("");
  }

  return (
    <form id="notice-form" key={`${mode}-${formNotice.id}`} action={saveNoticeAction} onSubmit={validatePeriod} className="panel p-5">
      <h2 className="text-base font-semibold">{mode === "cancel" ? "공지 취소" : mode === "edit" ? "공지 수정" : "공지 등록"}</h2>
      <input type="hidden" name="id" value={mode === "edit" || mode === "cancel" ? formNotice.id : ""} />
      <input type="hidden" name="intent" value={mode} />
      {error ? (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
          {error}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-4 gap-4">
        <div className="field col-span-2">
          <label>제목</label>
          <input name="title" defaultValue={formNotice.title} required />
        </div>
        <div className="field">
          <label>시작일시</label>
          <input name="scheduleDate" type="datetime-local" defaultValue={formNotice.scheduleDate} />
        </div>
        <div className="field">
          <label>종료일시</label>
          <input name="scheduleEndDate" type="datetime-local" defaultValue={formNotice.scheduleEndDate} />
        </div>

        <div className="field">
          <label>중요</label>
          <label className="flex h-11 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-700">
            <input name="important" type="checkbox" defaultChecked={formNotice.important} className="h-4 w-4" />
            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-sm font-bold text-rose-700">!</span>
            <span>중요</span>
          </label>
        </div>

        <div className="field">
          <label>공지 유형</label>
          <div className="flex h-11 items-center gap-4 rounded-md border border-slate-200 px-3">
            <label className="flex h-full items-center gap-2 text-sm">
              <input name="type" type="radio" value={NoticeType.GENERAL} defaultChecked={formNotice.type !== NoticeType.MEETING} />
              일반
            </label>
            <label className="flex h-full items-center gap-2 text-sm">
              <input name="type" type="radio" value={NoticeType.MEETING} defaultChecked={formNotice.type === NoticeType.MEETING} />
              회의
            </label>
          </div>
        </div>

        <div className="field col-span-2">
          <label>장소</label>
          <input name="place" defaultValue={formNotice.place} placeholder="3층 회의실 / 온라인" />
        </div>

        <TeamCheckboxGroup key={`${mode}-${formNotice.id}-teams`} initialTeams={formNotice.teams} />

        <div className="field col-span-4">
          <label>{mode === "cancel" ? "취소 사유" : "공지 내용"}</label>
          <textarea name="content" defaultValue={formNotice.content} required rows={6} />
        </div>

        <div className="field col-span-2">
          <label>첨부파일</label>
          <input name="files" type="file" multiple />
        </div>

        <div className="col-span-2 flex items-end justify-end gap-2">
          {mode !== "new" ? (
            <a className="btn h-11" href="/notices#notice-form">
              신규로 돌아가기
            </a>
          ) : null}
          <button className="btn-primary h-11" type="submit">
            발송
          </button>
        </div>
      </div>
    </form>
  );
}

function TeamCheckboxGroup({ initialTeams }: { initialTeams: string[] }) {
  const [selectedTeams, setSelectedTeams] = useState(() => (initialTeams.length ? initialTeams : [allTeamValue]));

  function toggleTeam(value: string) {
    setSelectedTeams((current) => {
      if (value === allTeamValue) return [allTeamValue];
      const withoutAll = current.filter((team) => team !== allTeamValue);
      const next = withoutAll.includes(value) ? withoutAll.filter((team) => team !== value) : [...withoutAll, value];
      return next.length ? next : [allTeamValue];
    });
  }

  return (
    <div className="field col-span-4">
      <label>공개 대상 팀</label>
      <div className="flex flex-wrap gap-3 rounded-md border border-slate-200 p-3 text-sm">
        {teamOptions.map((team) => (
          <label key={team.value} className="flex items-center gap-2">
            <input
              name="teams"
              type="checkbox"
              value={team.value}
              checked={selectedTeams.includes(team.value)}
              onChange={() => toggleTeam(team.value)}
            />
            {team.label}
          </label>
        ))}
      </div>
    </div>
  );
}
