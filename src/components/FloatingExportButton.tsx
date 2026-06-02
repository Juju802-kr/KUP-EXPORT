"use client";

import { useMemo, useState } from "react";
import { Download, X } from "lucide-react";

type ExportKind = "shipments" | "tt" | "lc";
type FilterKey = "salesOwner" | "exportOwner" | "country" | "buyer" | "product";
type ExportRow = {
  date: string;
  salesOwner?: string | null;
  exportOwner?: string | null;
  country?: string | null;
  buyer?: string | null;
  product?: string | null;
};
type ShipmentExportOptions = {
  rows?: ExportRow[];
  salesOwners?: string[];
  exportOwners?: string[];
  countries?: string[];
  buyers?: string[];
  products?: string[];
};
type PaymentExportOptions = {
  rows: ExportRow[];
};

const emptyFilters: Record<FilterKey, string[]> = {
  salesOwner: [],
  exportOwner: [],
  country: [],
  buyer: [],
  product: []
};

const labels: Record<FilterKey, string> = {
  salesOwner: "영업담당자",
  exportOwner: "수출담당자",
  country: "국가",
  buyer: "바이어",
  product: "품목"
};

export function FloatingExportButton({
  kind,
  shipmentOptions,
  paymentOptions
}: {
  kind: ExportKind;
  shipmentOptions?: ShipmentExportOptions;
  paymentOptions?: PaymentExportOptions;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<"excel" | "pdf">("excel");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>(emptyFilters);

  const title = kind === "shipments" ? "선적의뢰 데이터 추출" : kind === "tt" ? "T/T 입금 데이터 추출" : "L/C 통지 데이터 추출";
  const dateLabel = kind === "shipments" ? "ETD" : kind === "tt" ? "입금일" : "통지일";
  const filterKeys: FilterKey[] = kind === "shipments" ? ["salesOwner", "exportOwner", "country", "buyer", "product"] : ["country", "buyer", "salesOwner", "exportOwner"];

  const rows = useMemo(() => {
    if (kind === "shipments") {
      if (shipmentOptions?.rows?.length) return shipmentOptions.rows;
      return fallbackRowsFromShipmentOptions(shipmentOptions);
    }
    return paymentOptions?.rows ?? [];
  }, [kind, paymentOptions?.rows, shipmentOptions]);

  const rowsInDateRange = useMemo(() => rows.filter((row) => isDateInRange(row.date, dateFrom, dateTo)), [rows, dateFrom, dateTo]);
  const optionMap = useMemo(() => {
    return {
      salesOwner: uniqueValues(rowsInDateRange.map((row) => row.salesOwner)),
      exportOwner: uniqueValues(rowsInDateRange.map((row) => row.exportOwner)),
      country: uniqueValues(rowsInDateRange.map((row) => row.country)),
      buyer: uniqueValues(rowsInDateRange.map((row) => row.buyer)),
      product: uniqueValues(rowsInDateRange.map((row) => row.product))
    } satisfies Record<FilterKey, string[]>;
  }, [rowsInDateRange]);

  function updateFilter(key: FilterKey, values: string[]) {
    setFilters((current) => ({ ...current, [key]: values }));
  }

  function filterLabel(key: FilterKey) {
    if (key === "country" && kind === "shipments") return "수출국";
    return labels[key];
  }

  function download() {
    const params = new URLSearchParams({ format });
    if (kind === "shipments") {
      if (dateFrom) params.set("etdFrom", dateFrom);
      if (dateTo) params.set("etdTo", dateTo);
    } else {
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
    }
    filterKeys.forEach((key) => filters[key].forEach((value) => params.append(key, value)));
    const href = kind === "shipments" ? `/api/export/shipments?${params}` : `/api/export/payments?kind=${kind}&${params}`;
    if (format === "pdf") window.open(href, "_blank", "noopener,noreferrer");
    else window.location.href = href;
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="fixed bottom-6 right-6 z-40 flex h-12 items-center gap-2 rounded-full bg-blue-600 px-5 text-sm font-semibold text-white shadow-lg shadow-blue-200 hover:bg-blue-700"
        onClick={() => setOpen(true)}
      >
        <Download size={18} />
        데이터 추출
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-end bg-slate-950/20 p-6">
          <div className="max-h-[calc(100vh-48px)] w-full max-w-sm overflow-y-auto rounded-lg border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">{title}</h2>
              <button type="button" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={() => setOpen(false)} aria-label="닫기">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="field">
                  <label>{dateLabel} 시작</label>
                  <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
                </div>
                <div className="field">
                  <label>{dateLabel} 종료</label>
                  <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
                </div>
              </div>

              {filterKeys.map((key) => (
                <MultiSelect
                  key={key}
                  id={key}
                  label={filterLabel(key)}
                  options={optionMap[key]}
                  values={filters[key]}
                  open={openFilter === key}
                  onOpen={setOpenFilter}
                  onChange={(values) => updateFilter(key, values)}
                />
              ))}

              <div className="field">
                <label>파일 형식</label>
                <select value={format} onChange={(event) => setFormat(event.target.value as "excel" | "pdf")}>
                  <option value="excel">Excel</option>
                  <option value="pdf">PDF</option>
                </select>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="btn h-11 px-4" onClick={() => setOpen(false)}>
                취소
              </button>
              <button type="button" className="btn-primary h-11 px-5" onClick={download}>
                데이터 다운
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MultiSelect({
  id,
  label,
  options,
  values,
  open,
  onOpen,
  onChange
}: {
  id: string;
  label: string;
  options: string[];
  values: string[];
  open: boolean;
  onOpen: (id: string | null) => void;
  onChange: (values: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const [draftValues, setDraftValues] = useState<string[]>(values);
  const filteredOptions = options.filter((option) => option.toLowerCase().includes(input.trim().toLowerCase()));
  const allFilteredSelected = filteredOptions.length > 0 && filteredOptions.every((option) => draftValues.includes(option));

  function openDropdown() {
    setDraftValues(values);
    onOpen(id);
  }

  function toggle(value: string) {
    setDraftValues((current) => (current.includes(value) ? current.filter((item) => item !== value) : [...current, value]));
  }

  function toggleAll() {
    setDraftValues((current) => {
      if (allFilteredSelected) return current.filter((value) => !filteredOptions.includes(value));
      return [...new Set([...current, ...filteredOptions])];
    });
  }

  function confirm() {
    onChange(draftValues);
    onOpen(null);
  }

  function cancel() {
    setDraftValues(values);
    setInput("");
    onOpen(null);
  }

  return (
    <div className="field">
      <label>{label}</label>
      <div className="relative">
        <input
          value={input}
          onChange={(event) => {
            setInput(event.target.value);
            if (!open) openDropdown();
          }}
          onFocus={openDropdown}
          onClick={openDropdown}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
            if (event.key === "Escape") cancel();
          }}
          placeholder={`${label} 검색/선택`}
        />
        {open ? (
          <div className="absolute z-20 mt-1 w-full min-w-[280px] overflow-hidden rounded-md border border-slate-300 bg-white shadow-lg">
            <label className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} />
              모두 선택
            </label>
            <div className="max-h-[200px] overflow-y-auto">
              {filteredOptions.map((option) => (
                <label key={option} className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-blue-50">
                  <input type="checkbox" checked={draftValues.includes(option)} onChange={() => toggle(option)} />
                  <span>{option}</span>
                </label>
              ))}
              {!filteredOptions.length ? <div className="px-3 py-2 text-sm text-slate-500">검색 결과가 없습니다.</div> : null}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-100 p-2">
              <button type="button" className="btn h-9 px-3 text-sm" onMouseDown={(event) => event.preventDefault()} onClick={cancel}>
                취소
              </button>
              <button type="button" className="btn-primary h-9 px-3 text-sm" onMouseDown={(event) => event.preventDefault()} onClick={confirm}>
                확인
              </button>
            </div>
          </div>
        ) : null}
      </div>
      {values.length ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {values.map((value) => (
            <button
              key={value}
              type="button"
              className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              {value} ×
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value)))].sort((a, b) => a.localeCompare(b, "ko"));
}

function isDateInRange(value: string, from: string, to: string) {
  if (!value) return !from && !to;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

function fallbackRowsFromShipmentOptions(options?: ShipmentExportOptions): ExportRow[] {
  if (!options) return [];
  const rows: ExportRow[] = [];
  for (const salesOwner of options.salesOwners ?? []) rows.push({ date: "", salesOwner });
  for (const exportOwner of options.exportOwners ?? []) rows.push({ date: "", exportOwner });
  for (const country of options.countries ?? []) rows.push({ date: "", country });
  for (const buyer of options.buyers ?? []) rows.push({ date: "", buyer });
  for (const product of options.products ?? []) rows.push({ date: "", product });
  return rows;
}
