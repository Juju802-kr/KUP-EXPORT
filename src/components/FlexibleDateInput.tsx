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
      <div className="relative">
        <input
          name={name}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          className="h-11 w-full pr-10"
          placeholder="직접 입력 또는 달력 선택"
        />
        {/* Native browser calendar indicator — same glyph as 출고일 / ETD / ETA */}
        <input
          type="date"
          aria-label={`${label} 달력 선택`}
          title="달력에서 선택"
          value={isoDate}
          onChange={(event) => {
            if (event.target.value) setValue(event.target.value);
          }}
          className="flexible-date-native"
        />
      </div>
    </label>
  );
}
