"use client";

import { useRef } from "react";

export function CalendarSourceFilter({
  mode,
  month,
  name,
  sources,
  selectedSources,
  colors
}: {
  mode: string;
  month: string;
  name?: string;
  sources: string[];
  selectedSources: string[];
  colors: Record<string, string>;
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} className="mt-3">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="month" value={month} />
      <input type="hidden" name="sourceTouched" value="1" />
      {name ? <input type="hidden" name="name" value={name} /> : null}
      <div className="space-y-2 text-sm">
        {sources.map((source) => (
          <label key={source} className="flex items-center gap-2 text-sm">
            <input
              name="source"
              value={source}
              type="checkbox"
              defaultChecked={selectedSources.includes(source)}
              onChange={() => formRef.current?.requestSubmit()}
            />
            <span className="flex-1">{source}</span>
            {colors[source] ? <span className={`h-3 w-14 rounded-sm ${colors[source]}`} aria-hidden="true" /> : null}
          </label>
        ))}
      </div>
    </form>
  );
}
