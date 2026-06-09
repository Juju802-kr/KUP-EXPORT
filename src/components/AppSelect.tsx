"use client";

import { KeyboardEvent, useEffect, useRef, useState } from "react";

export type AppSelectOption = { value: string; label: string };

export function AppSelect({
  name,
  options,
  value,
  defaultValue = "",
  placeholder = "선택",
  required = false,
  className = "",
  onChange
}: {
  name?: string;
  options: AppSelectOption[];
  value?: string;
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
  className?: string;
  onChange?: (value: string) => void;
}) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const selectedValue = controlled ? value : internalValue;
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.value === selectedValue);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function commit(nextValue: string) {
    if (!controlled) setInternalValue(nextValue);
    onChange?.(nextValue);
    setOpen(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (!options.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => (current + direction + options.length) % options.length);
    }
    if (event.key === "Enter" && open && options[activeIndex]) {
      event.preventDefault();
      commit(options[activeIndex].value);
    }
    if (event.key === "Escape") setOpen(false);
  }

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {name ? <input type="hidden" name={name} value={selectedValue} required={required} /> : null}
      <button
        type="button"
        className="flex h-11 w-full items-center justify-between rounded-md border border-slate-300 bg-white px-3 text-left text-sm text-slate-900 outline-none hover:border-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={handleKeyDown}
      >
        <span className={selected ? "" : "text-slate-400"}>{selected?.label ?? placeholder}</span>
        <span className="text-xs text-slate-600">▼</span>
      </button>
      {open ? (
        <div className="absolute z-[70] mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-300 bg-white py-1 shadow-lg">
          {options.map((option, index) => {
            const highlighted = option.value === selectedValue || index === activeIndex;
            return (
              <button
                key={`${option.value}-${option.label}`}
                type="button"
                className={`block w-full px-4 py-2.5 text-left text-sm ${
                  highlighted ? "bg-blue-600 font-semibold text-white" : "text-slate-900 hover:bg-blue-50"
                }`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(option.value)}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
