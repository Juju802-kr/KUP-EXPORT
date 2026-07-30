"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ComboboxOption = {
  id?: string;
  value: string;
  label: string;
  searchText?: string;
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
  const haystack = `${option.label} ${option.searchText ?? ""} ${option.value}`.toLowerCase();
  return (
    haystack.includes(normalizedQuery) ||
    chosung(option.label).includes(normalizedQuery) ||
    chosung(option.searchText ?? "").includes(normalizedQuery)
  );
}

export function SearchableCombobox({
  name,
  options,
  value,
  defaultValue = "",
  placeholder = "선택",
  required = false,
  disabled = false,
  registeredOnly = false,
  useHiddenName = false,
  allowClear = true,
  inputClassName = "h-11 w-full pr-10",
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
  disabled?: boolean;
  registeredOnly?: boolean;
  useHiddenName?: boolean;
  allowClear?: boolean;
  inputClassName?: string;
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
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
  const selectedOption = uniqueOptions.find((option) => option.value === currentValue);

  useEffect(() => {
    setActiveIndex(0);
  }, [inputValue, filtered.length]);

  useEffect(() => {
    const next = displayValue?.(currentValue) ?? selectedOption?.label ?? currentValue;
    setInputValue(next);
  }, [currentValue, displayValue, selectedOption?.label]);

  function updateMenuRect() {
    if (!inputRef.current) return;
    setMenuRect(inputRef.current.getBoundingClientRect());
  }

  useEffect(() => {
    if (!open) return;
    updateMenuRect();
    function handleLayout() {
      updateMenuRect();
    }
    window.addEventListener("scroll", handleLayout, true);
    window.addEventListener("resize", handleLayout);
    return () => {
      window.removeEventListener("scroll", handleLayout, true);
      window.removeEventListener("resize", handleLayout);
    };
  }, [open]);

  useEffect(() => {
    function close(event: MouseEvent) {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function commit(nextValue: string) {
    if (registeredOnly && nextValue && !uniqueOptions.some((option) => option.value === nextValue)) return;
    if (!controlled) setInternalValue(nextValue);
    onChange?.(nextValue);
    onCommit?.(nextValue);
    const option = uniqueOptions.find((item) => item.value === nextValue);
    setInputValue(displayValue?.(nextValue) ?? option?.label ?? nextValue);
    setOpen(false);
  }

  function handleInput(nextValue: string) {
    setInputValue(nextValue);
    setOpen(true);
    updateMenuRect();
    if (!registeredOnly) {
      if (!controlled) setInternalValue(nextValue);
      onChange?.(nextValue);
    }
    if (registeredOnly && !nextValue.trim()) commit("");
  }

  function revertInput() {
    const next = displayValue?.(currentValue) ?? selectedOption?.label ?? currentValue;
    setInputValue(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      if (open && filtered.length > 0) {
        commit(filtered[activeIndex]?.value ?? filtered[0].value);
      } else if (!registeredOnly) {
        commit(inputValue.trim());
      } else {
        revertInput();
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      updateMenuRect();
      if (filtered.length > 0) setActiveIndex((index) => (index + 1) % filtered.length);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      updateMenuRect();
      if (filtered.length > 0) setActiveIndex((index) => (index - 1 + filtered.length) % filtered.length);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      revertInput();
      setOpen(false);
    }
  }

  const menu =
    open && !disabled && menuRect && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuRect.bottom + 4,
              left: menuRect.left,
              width: Math.max(menuRect.width, 180),
              zIndex: 1000
            }}
            className="max-h-64 overflow-auto rounded-md border border-slate-300 bg-white shadow-lg"
          >
            {allowClear ? (
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-blue-50"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => commit("")}
              >
                선택
              </button>
            ) : null}
            {filtered.map((option, index) => (
              <button
                key={`${option.value}-${option.label}`}
                type="button"
                className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                  option.value === currentValue || index === activeIndex
                    ? "bg-blue-600 font-semibold text-white hover:bg-blue-600"
                    : "text-slate-900"
                }`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(option.value)}
              >
                {option.label}
              </button>
            ))}
            {filtered.length === 0 ? <div className="px-3 py-2 text-sm text-slate-500">검색 결과 없음</div> : null}
          </div>,
          document.body
        )
      : null;

  return (
    <div ref={containerRef} className="relative min-w-0 w-full">
      {useHiddenName ? <input type="hidden" name={name} value={currentValue} /> : null}
      <input
        ref={inputRef}
        name={useHiddenName ? undefined : name}
        value={inputValue}
        disabled={disabled}
        onChange={(event) => handleInput(event.target.value)}
        onFocus={() => {
          if (!disabled) {
            setOpen(true);
            updateMenuRect();
          }
        }}
        onBlur={() => {
          window.setTimeout(() => {
            if (registeredOnly) revertInput();
          }, 120);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={inputClassName}
      />
      <button
        type="button"
        disabled={disabled}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-slate-500 hover:text-slate-900 disabled:opacity-40"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setOpen((current) => {
            const next = !current;
            if (next) updateMenuRect();
            return next;
          });
        }}
        aria-label={`${placeholder} 목록 열기`}
      >
        ▾
      </button>
      {menu}
    </div>
  );
}
