"use client";

import { useRef, useState } from "react";

export function FlexibleDateInput({
  label,
  name,
  defaultValue = ""
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const dateRef = useRef<HTMLInputElement>(null);
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : "";

  function openCalendar() {
    const input = dateRef.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      try {
        input.showPicker();
        return;
      } catch {
        // Fall through to click when showPicker is blocked.
      }
    }
    input.click();
  }

  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <div className="relative">
        <input
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 w-full pr-11"
          placeholder="직접 입력 또는 달력 선택"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-lg leading-none text-slate-600 hover:text-slate-900"
          aria-label={`${label} 달력 선택`}
          title="달력에서 선택"
          onClick={openCalendar}
        >
          📅
        </button>
        <input
          ref={dateRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          value={isoDate}
          onChange={(event) => {
            if (event.target.value) setValue(event.target.value);
          }}
          className="pointer-events-none absolute h-0 w-0 opacity-0"
        />
      </div>
    </label>
  );
}
