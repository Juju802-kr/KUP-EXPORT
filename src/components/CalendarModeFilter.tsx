"use client";

import { useRef } from "react";
import { AppSelect } from "@/components/AppSelect";

export function CalendarModeFilter({ mode, month, name }: { mode: string; month: string; name?: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} className="panel flex flex-wrap items-end gap-3 p-4">
      <div className="field">
        <label>기준</label>
        <AppSelect name="mode" defaultValue={mode} onChange={() => setTimeout(() => formRef.current?.requestSubmit(), 0)} options={[{ value: "release", label: "출고" }, { value: "shipping", label: "선적" }, { value: "owner", label: "담당자" }, { value: "notice", label: "공지" }]} />
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
