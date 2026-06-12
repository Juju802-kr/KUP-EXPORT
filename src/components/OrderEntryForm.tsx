"use client";

import { useMemo, useState } from "react";
import { saveOrderEntriesAction } from "@/server/actions";

type BuyerOption = { buyerName: string; exportCountry: string };
type Row = {
  key: string;
  exportCountry: string;
  buyer: string;
  piNo: string;
  productionRequestNo: string;
  productName: string;
  unitPrice: string;
  quantity: string;
};

const emptyRow = (): Row => ({
  key: crypto.randomUUID(),
  exportCountry: "",
  buyer: "",
  piNo: "",
  productionRequestNo: "",
  productName: "",
  unitPrice: "",
  quantity: ""
});

function piDateFromPiNo(piNo: string) {
  const match = piNo.match(/KUP-(\d{2})(\d{2})(\d{2})/i);
  if (!match) return "";
  return `20${match[1]}-${match[2]}-${match[3]}`;
}

export function OrderEntryForm({ owner, buyers }: { owner: string; buyers: BuyerOption[] }) {
  const [rows, setRows] = useState<Row[]>([emptyRow()]);
  const [ocrMessage, setOcrMessage] = useState("");
  const [isReading, setIsReading] = useState(false);
  const buyerMap = useMemo(() => new Map(buyers.map((buyer) => [buyer.buyerName, buyer.exportCountry])), [buyers]);

  function addRow() {
    setRows((current) => [emptyRow(), ...current]);
  }

  function deleteRow(key: string) {
    setRows((current) => (current.length > 1 ? current.filter((row) => row.key !== key) : current));
  }

  function updateRow(key: string, patch: Partial<Row>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function applyBuyer(key: string, buyerName: string) {
    updateRow(key, { buyer: buyerName, exportCountry: buyerMap.get(buyerName) ?? "" });
  }

  async function readPiFile(file: File | null) {
    if (!file) return;
    setIsReading(true);
    setOcrMessage("PI 파일을 읽는 중입니다.");
    const formData = new FormData();
    formData.set("file", file);
    try {
      const response = await fetch("/api/orders/pi-ocr", { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) {
        setOcrMessage(result.error ?? "PI 파일을 읽지 못했습니다.");
        return;
      }
      const extracted = Array.isArray(result.orders) ? result.orders : [];
      if (!extracted.length) {
        setOcrMessage("추출된 오더가 없습니다.");
        return;
      }
      setRows(
        extracted.map((item: Partial<Row>) => ({
          ...emptyRow(),
          exportCountry: item.exportCountry ?? "",
          buyer: item.buyer ?? "",
          piNo: item.piNo ?? "",
          productionRequestNo: item.productionRequestNo ?? "",
          productName: item.productName ?? "",
          unitPrice: item.unitPrice ? String(item.unitPrice) : "",
          quantity: item.quantity ? String(item.quantity) : ""
        }))
      );
      setOcrMessage(`${extracted.length}건을 읽었습니다. 저장 전 내용을 확인해주세요.`);
    } catch {
      setOcrMessage("PI 파일 OCR 처리 중 오류가 발생했습니다.");
    } finally {
      setIsReading(false);
    }
  }

  return (
    <form action={saveOrderEntriesAction} className="space-y-3">
      <input type="hidden" name="owner" value={owner} />
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-950">오더 추가</h2>
          <p className="mt-1 text-xs text-slate-500">PI Date는 PI No.의 KUP-YYMMDD 값을 기준으로 자동 입력됩니다.</p>
        </div>
        <div className="flex gap-2">
          <label className={`btn cursor-pointer ${isReading ? "opacity-60" : ""}`}>
            PI 업로드
            <input type="file" accept=".pdf,image/*" className="hidden" disabled={isReading} onChange={(event) => void readPiFile(event.target.files?.[0] ?? null)} />
          </label>
          <button type="button" className="btn" onClick={addRow}>추가</button>
          <button className="btn-primary">저장</button>
        </div>
      </div>
      {ocrMessage ? <p className="rounded-md bg-blue-50 px-3 py-2 text-xs text-blue-700">{ocrMessage}</p> : null}

      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={row.key} className="grid grid-cols-[1.1fr_1.3fr_1.2fr_1.4fr_1.3fr_0.8fr_0.8fr_0.9fr_auto] gap-2">
            <input type="hidden" name="rowKey" value={row.key} />
            <input type="hidden" name={`piDate-${index}`} value={piDateFromPiNo(row.piNo)} />
            <input name={`exportCountry-${index}`} value={row.exportCountry} onChange={(event) => updateRow(row.key, { exportCountry: event.target.value })} placeholder="국가" className="h-10" />
            <input
              name={`buyer-${index}`}
              list="order-buyer-list"
              value={row.buyer}
              placeholder="거래처"
              className="h-10"
              onChange={(event) => applyBuyer(row.key, event.target.value)}
            />
            <input name={`piNo-${index}`} value={row.piNo} onChange={(event) => updateRow(row.key, { piNo: event.target.value })} placeholder="PI No." className="h-10" />
            <input name={`productionRequestNo-${index}`} value={row.productionRequestNo} onChange={(event) => updateRow(row.key, { productionRequestNo: event.target.value })} placeholder="생산의뢰번호" className="h-10" />
            <input name={`productName-${index}`} value={row.productName} onChange={(event) => updateRow(row.key, { productName: event.target.value })} placeholder="제품명" className="h-10" />
            <input name={`unitPrice-${index}`} value={row.unitPrice} onChange={(event) => updateRow(row.key, { unitPrice: event.target.value })} placeholder="단가" inputMode="decimal" className="h-10" />
            <input name={`quantity-${index}`} value={row.quantity} onChange={(event) => updateRow(row.key, { quantity: event.target.value })} placeholder="수량" inputMode="numeric" className="h-10" />
            <div className="flex h-10 items-center rounded-md border border-slate-200 bg-slate-50 px-3 text-xs text-slate-500">
              {piDateFromPiNo(row.piNo) || "PI Date 자동"}
            </div>
            <button type="button" className="btn text-red-700" onClick={() => deleteRow(row.key)}>삭제</button>
          </div>
        ))}
      </div>
      <datalist id="order-buyer-list">
        {buyers.map((buyer) => <option key={buyer.buyerName} value={buyer.buyerName} />)}
      </datalist>
    </form>
  );
}
