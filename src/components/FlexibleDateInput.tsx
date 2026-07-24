"use client";

import { useState } from "react";

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
  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(value.trim()) ? value.trim() : "";

  return (
    <label className="block space-y-1">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      <div className="flex gap-2">
        <input
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 min-w-0 flex-1"
          placeholder="YYYY-MM-DD 또는 직접 입력"
        />
        <input
          type="date"
          className="h-11 w-[9.75rem] shrink-0"
          value={isoDate}
          onChange={(event) => {
            if (event.target.value) setValue(event.target.value);
          }}
          aria-label={`${label} 달력 선택`}
          title="달력에서 선택"
        />
      </div>
    </label>
  );
}
