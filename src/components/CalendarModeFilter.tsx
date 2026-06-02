"use client";

import { useRef } from "react";

export function CalendarModeFilter({ mode, month, name }: { mode: string; month: string; name?: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} className="panel flex flex-wrap items-end gap-3 p-4">
      <div className="field">
        <label>기준</label>
        <select name="mode" defaultValue={mode} onChange={() => formRef.current?.requestSubmit()}>
          <option value="release">출고</option>
          <option value="shipping">선적</option>
          <option value="owner">담당자</option>
          <option value="notice">공지</option>
        </select>
      </div>
      <input type="hidden" name="month" value={month} />
      {mode === "owner" ? (
        <div className="field">
          <label>담당자 검색</label>
          <input name="name" defaultValue={name ?? ""} placeholder="담당자 이름" />
        </div>
      ) : null}
    </form>
  );
}
