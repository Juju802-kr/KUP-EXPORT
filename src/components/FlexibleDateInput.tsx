"use client";

import { useRef, useState } from "react";

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      className="text-slate-700"
    >
      <rect x="1.5" y="2.5" width="13" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1.5 5.5h13" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="5" cy="8.5" r="0.85" fill="currentColor" />
      <circle cx="8" cy="8.5" r="0.85" fill="currentColor" />
      <circle cx="11" cy="8.5" r="0.85" fill="currentColor" />
      <circle cx="5" cy="11.5" r="0.85" fill="currentColor" />
      <circle cx="8" cy="11.5" r="0.85" fill="currentColor" />
      <circle cx="11" cy="11.5" r="0.85" fill="currentColor" />
    </svg>
  );
}

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
          className="h-11 w-full pr-10"
          placeholder="직접 입력 또는 달력 선택"
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center hover:opacity-70"
          aria-label={`${label} 달력 선택`}
          title="달력에서 선택"
          onClick={openCalendar}
        >
          <CalendarIcon />
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
