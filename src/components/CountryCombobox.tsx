"use client";

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

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

export function CountryCombobox({ name, countries, defaultValue = "" }: { name: string; countries: string[]; defaultValue?: string | null }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const normalizedCountries = useMemo(() => [...new Set(countries.filter(Boolean))], [countries]);
  const filtered = normalizedCountries
    .filter((country) => {
      const query = value.trim();
      if (!query) return true;
      return country.includes(query) || chosung(country).startsWith(query);
    })
    .slice(0, 8);
  useEffect(() => {
    setActiveIndex(0);
  }, [value, filtered.length]);

  useEffect(() => {
    setValue(defaultValue ?? "");
    setOpen(false);
  }, [defaultValue]);

  useEffect(() => {
    function close(event: MouseEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

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
    if (event.key === "Enter" && filtered.length > 0) {
      event.preventDefault();
      setValue(filtered[activeIndex] ?? filtered[0]);
      setOpen(false);
    }
    if (event.key === "Escape") setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        className="h-11 w-full"
        name={name}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="수출국"
        required
        autoComplete="off"
      />
      {open && filtered.length > 0 ? (
        <div className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {filtered.map((country, index) => (
            <button
              key={country}
              type="button"
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${index === activeIndex ? "bg-blue-600 font-semibold text-white hover:bg-blue-600" : "text-slate-900"}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => {
                setValue(country);
                setOpen(false);
              }}
            >
              {country}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
