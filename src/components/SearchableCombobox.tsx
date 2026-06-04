"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

type ComboboxOption = {
  id?: string;
  value: string;
  label: string;
};

const initialConsonants = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

function chosung(value: string) {
  return [...value]
    .map((char) => {
      const code = char.charCodeAt(0) - 0xac00;
      if (code < 0 || code > 11171) return char;
      return initialConsonants[Math.floor(code / 588)];
    })
    .join("");
}

function matches(option: ComboboxOption, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return true;
  const label = option.label.toLowerCase();
  const value = option.value.toLowerCase();
  return label.includes(normalizedQuery) || value.includes(normalizedQuery) || chosung(option.label).includes(normalizedQuery);
}

export function SearchableCombobox({
  name,
  options,
  value,
  defaultValue = "",
  placeholder = "선택",
  required = false,
  onChange,
  onCommit,
  displayValue
}: {
  name: string;
  options: ComboboxOption[];
  value?: string;
  defaultValue?: string | null;
  placeholder?: string;
  required?: boolean;
  onChange?: (value: string) => void;
  onCommit?: (value: string) => void;
  displayValue?: (value: string) => string;
}) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue ?? "");
  const currentValue = controlled ? value : internalValue;
  const [inputValue, setInputValue] = useState(displayValue?.(currentValue) ?? currentValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const uniqueOptions = useMemo(() => {
    const seen = new Set<string>();
    return options.filter((option) => {
      const key = `${option.value}\u0000${option.label}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return option.value || option.label;
    });
  }, [options]);
  const filtered = uniqueOptions.filter((option) => matches(option, inputValue)).slice(0, 30);

  useEffect(() => {
    setActiveIndex(0);
  }, [inputValue, filtered.length]);

  useEffect(() => {
    const next = displayValue?.(currentValue) ?? currentValue;
    setInputValue(next);
  }, [currentValue, displayValue]);

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
    onCommit?.(nextValue);
    setInputValue(displayValue?.(nextValue) ?? nextValue);
    setOpen(false);
  }

  function handleInput(nextValue: string) {
    if (!controlled) setInternalValue(nextValue);
    onChange?.(nextValue);
    setInputValue(nextValue);
    setOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      if (filtered.length > 0) setActiveIndex((index) => (index + 1) % filtered.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      if (filtered.length > 0) setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length);
    }
    if (event.key === "Enter") {
      event.preventDefault();
      if (open && filtered.length > 0) {
        commit(filtered[activeIndex]?.value ?? filtered[0].value);
      }
    }
    if (event.key === "Escape") setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        name={name}
        value={inputValue}
        onChange={(event) => handleInput(event.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className="h-11 w-full pr-10"
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-slate-500 hover:text-slate-900"
        onClick={() => setOpen((current) => !current)}
        aria-label={`${placeholder} 목록 열기`}
      >
        ▾
      </button>
      {open ? (
        <div className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-300 bg-white shadow-lg">
          <button
            type="button"
            className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-blue-50"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => commit("")}
          >
            선택
          </button>
          {filtered.map((option, index) => (
            <button
              key={`${option.value}-${option.label}`}
              type="button"
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                option.value === currentValue || index === activeIndex ? "bg-blue-600 font-semibold text-white hover:bg-blue-600" : "text-slate-900"
              }`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => commit(option.value)}
            >
              {option.label}
            </button>
          ))}
          {filtered.length === 0 ? <div className="px-3 py-2 text-sm text-slate-500">검색 결과 없음</div> : null}
        </div>
      ) : null}
    </div>
  );
}
