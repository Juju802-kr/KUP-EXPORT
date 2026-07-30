"use client";

import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import { useOrderAlertTrigger } from "@/components/OrderAlertManager";
import { piDateFromPiNo } from "@/lib/order-board-linking";
import {
  exportProductEnglishName,
  formatPiExclusionMessage,
  partitionPiImportRows,
  rowNeedsAdditionalInput,
  sortPiImportRows,
  type ExportProductOption,
  type PiImportExclusion
} from "@/lib/order-pi-import";
import { type RegisteredDestination } from "@/lib/destination-registry";
import { saveOrderEntriesAction } from "@/server/actions";

type BuyerOption = { buyerName: string; exportCountry: string };
type Row = {
  key: string;
  exportCountry: string;
  buyer: string;
  piNo: string;
  piDate: string;
  piDateManual: boolean;
  productionRequestNo: string;
  productName: string;
  unitPrice: string;
  quantity: string;
  focQuantity: string;
  incoterms: string;
  transport: string;
  destinationPort: string;
};

const emptyRow = (): Row => ({
  key: crypto.randomUUID(),
  exportCountry: "",
  buyer: "",
  piNo: "",
  piDate: "",
  piDateManual: false,
  productionRequestNo: "",
  productName: "",
  unitPrice: "",
  quantity: "",
  focQuantity: "",
  incoterms: "",
  transport: "",
  destinationPort: ""
});

const columnHeaders = [
  "국가",
  "거래처",
  "PI No.",
  "생산의뢰번호",
  "제품명",
  "단가",
  "수량(FOC X)",
  "수량(FOC O)",
  "PI DATE",
  ""
];

const entryRowGridClass =
  "grid w-full min-w-[1080px] grid-cols-[72px_112px_132px_140px_168px_80px_92px_92px_104px_52px] gap-2";

const entryInputClass = "h-11 min-w-0 w-full";
const comboboxClass = "h-11 min-w-0 w-full pr-10";

function resolvePiDate(row: Row, nextPiNo: string) {
  const autoDate = piDateFromPiNo(nextPiNo);
  if (!row.piDateManual || !row.piDate.trim() || row.piDate === piDateFromPiNo(row.piNo)) {
    return { piDate: autoDate, piDateManual: false };
  }
  return { piDate: row.piDate, piDateManual: row.piDateManual };
}

function preventEnterSubmit(event: KeyboardEvent<HTMLFormElement>) {
  if (event.key !== "Enter") return;
  const target = event.target;
  if (target instanceof HTMLTextAreaElement) return;
  if (target instanceof HTMLButtonElement && target.type === "submit") return;
  event.preventDefault();
}

export function OrderEntryForm({
  owner,
  buyers,
  products,
  destinationPorts
}: {
  owner: string;
  buyers: BuyerOption[];
  products: ExportProductOption[];
  destinationPorts: RegisteredDestination[];
}) {
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [ocrMessage, setOcrMessage] = useState("");
  const [excludedRows, setExcludedRows] = useState<PiImportExclusion[]>([]);
  const [isReading, setIsReading] = useState(false);
  const [fromPiUpload, setFromPiUpload] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();
  const alertTrigger = useOrderAlertTrigger();

  const countries = useMemo(
    () => [...new Set(buyers.map((buyer) => buyer.exportCountry).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko")),
    [buyers]
  );
  const countryOptions = useMemo(() => countries.map((country) => ({ value: country, label: country })), [countries]);

  function applyRows(next: Row[]) {
    setRows(fromPiUpload ? sortPiImportRows(next) : next);
  }

  function addRow() {
    setFromPiUpload(false);
    setExcludedRows([]);
    setOcrMessage("");
    setRows((current) => [emptyRow(), ...current]);
  }

  function deleteRow(key: string) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.key !== key) : current));
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((current) => {
      const next = current.map((row) => (row.key === key ? { ...row, ...patch } : row));
      return fromPiUpload ? sortPiImportRows(next) : next;
    });
  }

  function updatePiNo(key: string, piNo: string) {
    setRows((current) => {
      const next = current.map((row) => {
        if (row.key !== key) return row;
        const datePatch = resolvePiDate(row, piNo);
        return { ...row, piNo, ...datePatch };
      });
      return fromPiUpload ? sortPiImportRows(next) : next;
    });
  }

  function updatePiDate(key: string, piDate: string) {
    updateRow(key, { piDate, piDateManual: true });
  }

  function applyCountry(key: string, exportCountry: string) {
    setRows((current) => {
      const next = current.map((row) => {
        if (row.key !== key) return row;
        const buyerStillValid = exportCountry.trim()
          ? buyers.some((buyer) => buyer.buyerName === row.buyer && buyer.exportCountry === exportCountry.trim())
          : Boolean(row.buyer);
        const productStillValid = exportCountry.trim()
          ? products.some((product) => product.exportCountry === exportCountry.trim() && product.productName === row.productName)
          : Boolean(row.productName);
        return {
          ...row,
          exportCountry,
          buyer: buyerStillValid ? row.buyer : "",
          productName: productStillValid ? row.productName : ""
        };
      });
      return fromPiUpload ? sortPiImportRows(next) : next;
    });
  }

  function applyBuyerSelection(key: string, buyerName: string) {
    const buyer = buyers.find((item) => item.buyerName === buyerName);
    if (!buyer) {
      updateRow(key, { buyer: "" });
      return;
    }
    updateRow(key, { buyer: buyer.buyerName, exportCountry: buyer.exportCountry, productName: "" });
  }

  function buyerOptions(exportCountry: string) {
    const scoped = exportCountry.trim()
      ? buyers.filter((buyer) => buyer.exportCountry === exportCountry.trim())
      : buyers;
    return scoped.map((buyer) => ({
      value: buyer.buyerName,
      label: exportCountry.trim() ? buyer.buyerName : `${buyer.buyerName} · ${buyer.exportCountry}`,
      searchText: `${buyer.buyerName} ${buyer.exportCountry}`
    }));
  }

  function productOptions(exportCountry: string) {
    return products
      .filter((product) => product.exportCountry.trim() === exportCountry.trim())
      .map((product) => ({
        value: product.productName,
        label: product.englishName?.trim() || product.productName,
        searchText: `${product.productName} ${product.englishName}`
      }));
  }

  function productDisplayName(exportCountry: string, productName: string) {
    return exportProductEnglishName(exportCountry, productName, products);
  }

  async function readPiFile(file: File | null) {
    if (!file) return;
    setIsReading(true);
    setOcrMessage("PI 파일을 읽는 중입니다.");
    setExcludedRows([]);
    const formData = new FormData();
    formData.set("file", file);
    try {
      const response = await fetch("/api/orders/pi-ocr", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) {
        setOcrMessage(result.error ?? "PI 파일을 읽지 못했습니다.");
        setFromPiUpload(false);
        return;
      }
      const extracted = Array.isArray(result.orders) ? result.orders : [];
      if (!extracted.length) {
        setOcrMessage("추출된 오더가 없습니다.");
        setFromPiUpload(false);
        return;
      }

      const mapped = extracted.map((item: Partial<Row>) => ({
        exportCountry: item.exportCountry ?? "",
        buyer: item.buyer ?? "",
        piNo: item.piNo ?? "",
        productionRequestNo: item.productionRequestNo ?? "",
        productName: item.productName ?? "",
        unitPrice: item.unitPrice ? String(item.unitPrice) : "",
        quantity: item.quantity ? String(item.quantity) : "",
        focQuantity: item.focQuantity ? String(item.focQuantity) : "",
        termsText: (item as { termsText?: string }).termsText ?? "",
        destinationText: (item as { destinationText?: string }).destinationText ?? ""
      }));

      const { accepted, excluded } = partitionPiImportRows(mapped, buyers, products, destinationPorts);
      setExcludedRows(excluded);
      setFromPiUpload(true);

      if (!accepted.length) {
        setRows([]);
        setOcrMessage("등록 가능한 오더가 없습니다. 아래 제외 내역을 확인해주세요.");
        return;
      }

      applyRows(
        accepted.map((item) => {
          const piNo = item.piNo ?? "";
          return {
            ...emptyRow(),
            ...item,
            piDate: piDateFromPiNo(piNo),
            piDateManual: false
          };
        })
      );
      setOcrMessage(`${accepted.length}건을 불러왔습니다. 생산의뢰번호 등 추가 입력 후 저장하면 각 국가/거래처 보드에 반영됩니다.`);
    } catch {
      setOcrMessage("PI 파일 OCR 처리 중 오류가 발생했습니다.");
      setFromPiUpload(false);
    } finally {
      setIsReading(false);
    }
  }

  const showHeaders = rows.length > 0;

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setOcrMessage("");
    try {
      const formData = new FormData(event.currentTarget);
      const result = await saveOrderEntriesAction(formData);
      if (!result.ok || !result.count) {
        setOcrMessage("저장할 오더가 없습니다.");
        return;
      }
      setRows([emptyRow()]);
      setFromPiUpload(false);
      setExcludedRows([]);
      setOcrMessage(`${result.count}건을 저장했습니다.`);
      router.refresh();
      if (result.alerts.length) {
        alertTrigger?.showTriggeredAlerts(result.alerts);
      }
    } catch {
      setOcrMessage("오더 저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form className="space-y-3" onKeyDown={preventEnterSubmit} onSubmit={handleSave}>
      <input type="hidden" name="owner" value={owner} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">오더 추가</h2>
          <p className="mt-1 text-xs text-slate-500">
            PI 업로드 후 목록을 확인·보완하고 저장하면 각 국가/거래처 보드에 반영됩니다. PI DATE는 PI No. 입력 시 자동 반영되며 수정할 수 있습니다.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <label className={`btn cursor-pointer ${isReading ? "opacity-60" : ""}`}>
            PI 업로드
            <input
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              disabled={isReading}
              onChange={(event) => {
                void readPiFile(event.target.files?.[0] ?? null);
                event.target.value = "";
              }}
            />
          </label>
          <button type="button" className="btn" onClick={addRow}>
            추가
          </button>
          <button type="submit" className="btn-primary" disabled={!rows.length || isSaving}>
            {isSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>

      {ocrMessage ? <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">{ocrMessage}</p> : null}

      <div className="overflow-x-auto">
        {showHeaders ? (
          <div className={`${entryRowGridClass} px-1 pb-1 text-[11px] font-medium text-slate-500`}>
            {columnHeaders.map((header) => (
              <span key={header || "actions"} className="truncate">
                {header}
              </span>
            ))}
          </div>
        ) : null}

        <div className="space-y-2">
          {rows.length ? (
            rows.map((row, index) => {
              const needsInput = rowNeedsAdditionalInput(row);
              return (
                <div
                  key={row.key}
                  className={`${entryRowGridClass} items-center rounded-md ${needsInput ? "bg-amber-50/80 ring-1 ring-amber-200" : ""}`}
                >
                  <input type="hidden" name="rowKey" value={row.key} />
                  <input type="hidden" name={`piDate-${index}`} value={row.piDate} />
                  <input type="hidden" name={`incoterms-${index}`} value={row.incoterms} />
                  <input type="hidden" name={`transport-${index}`} value={row.transport} />
                  <input type="hidden" name={`destinationPort-${index}`} value={row.destinationPort} />
                  <SearchableCombobox
                    name={`exportCountry-${index}`}
                    value={row.exportCountry}
                    onChange={(exportCountry) => applyCountry(row.key, exportCountry)}
                    options={countryOptions}
                    placeholder="국가"
                    registeredOnly
                    useHiddenName
                    disabled={fromPiUpload}
                    inputClassName={comboboxClass}
                  />
                  <SearchableCombobox
                    name={`buyer-${index}`}
                    value={row.buyer}
                    onChange={(buyer) => applyBuyerSelection(row.key, buyer)}
                    options={buyerOptions(row.exportCountry)}
                    placeholder="거래처"
                    registeredOnly
                    useHiddenName
                    disabled={fromPiUpload}
                    inputClassName={comboboxClass}
                  />
                  <input
                    name={`piNo-${index}`}
                    value={row.piNo}
                    onChange={(event) => updatePiNo(row.key, event.target.value)}
                    placeholder="PI No."
                    className={entryInputClass}
                  />
                  <input
                    name={`productionRequestNo-${index}`}
                    value={row.productionRequestNo}
                    onChange={(event) => updateRow(row.key, { productionRequestNo: event.target.value })}
                    placeholder="생산의뢰번호"
                    className={`${entryInputClass} ${!row.productionRequestNo.trim() ? "border-amber-300 bg-white" : ""}`}
                  />
                  <SearchableCombobox
                    name={`productName-${index}`}
                    value={row.productName}
                    onChange={(productName) => updateRow(row.key, { productName })}
                    options={productOptions(row.exportCountry)}
                    placeholder="국문명 or 영문명"
                    registeredOnly
                    useHiddenName
                    disabled={fromPiUpload}
                    inputClassName={comboboxClass}
                    displayValue={(productName) => productDisplayName(row.exportCountry, productName)}
                  />
                  <input
                    name={`unitPrice-${index}`}
                    value={row.unitPrice}
                    onChange={(event) => updateRow(row.key, { unitPrice: event.target.value })}
                    placeholder="단가"
                    inputMode="decimal"
                    className={entryInputClass}
                  />
                  <input
                    name={`quantity-${index}`}
                    value={row.quantity}
                    onChange={(event) => updateRow(row.key, { quantity: event.target.value })}
                    placeholder="수량(FOC X)"
                    inputMode="numeric"
                    className={entryInputClass}
                  />
                  <input
                    name={`focQuantity-${index}`}
                    value={row.focQuantity}
                    onChange={(event) => updateRow(row.key, { focQuantity: event.target.value })}
                    placeholder="수량(FOC O)"
                    inputMode="numeric"
                    className={entryInputClass}
                  />
                  <input
                    value={row.piDate}
                    onChange={(event) => updatePiDate(row.key, event.target.value)}
                    placeholder="PI DATE"
                    className={entryInputClass}
                  />
                  <button type="button" className="btn h-11 px-2 text-xs text-red-700" onClick={() => deleteRow(row.key)}>
                    삭제
                  </button>
                </div>
              );
            })
          ) : (
            <p className="rounded-md border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500">
              PI 업로드 또는 추가 버튼으로 오더를 입력해주세요.
            </p>
          )}
        </div>
      </div>

      {excludedRows.length ? (
        <div className="space-y-1 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
          {excludedRows.map((item, index) => (
            <p key={`${item.piNo}-${item.productName}-${index}`}>{formatPiExclusionMessage(item)}</p>
          ))}
        </div>
      ) : null}
    </form>
  );
}
