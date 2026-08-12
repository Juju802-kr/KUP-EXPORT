"use client";

import { Factory } from "@prisma/client";
import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  createShipmentSummaryDefaultNoteAction,
  deleteShipmentSummaryDefaultNoteAction,
  saveShipmentSummaryAction
} from "@/server/actions";

export type SummaryProduct = {
  id: string;
  productName: string;
  englishName: string | null;
  factory: Factory | null;
  lotNo: string | null;
  bxQtyPaid: number;
  bxQtyFoc: number;
  bxQtyTotal: number;
  normalBoxQty: number;
  iceBoxQty: number;
  injectionBoxQty: number;
  commonBoxQty: number;
};

export type SummaryDefaultNote = {
  id: string;
  content: string;
  sortOrder: number;
};

export type ShipmentSummaryData = {
  id: string;
  invNo: string | null;
  transport: string | null;
  storageCondition: string | null;
  exportCountry: string | null;
  buyer: string | null;
  usePt: boolean;
  ptQty: number;
  summaryDataLogger: string | null;
  summaryDataLoggerDetail: string | null;
  summaryShippingLabelMethod: string | null;
  summarySpecialNotes: string | null;
  products: SummaryProduct[];
  vatNo: string | null;
  eoriNo: string | null;
};

function factoryLabel(factory?: Factory | null) {
  if (factory === Factory.SEOMYEON) return "서면";
  if (factory === Factory.JEONDONG) return "전동";
  return "";
}

function cartonTotal(product: SummaryProduct) {
  return Number(product.normalBoxQty || 0) + Number(product.iceBoxQty || 0) + Number(product.injectionBoxQty || 0) + Number(product.commonBoxQty || 0);
}

function productQtyText(product: SummaryProduct) {
  const total = Number(product.bxQtyTotal || 0);
  let amount = "";
  if (total) amount = total.toLocaleString("ko-KR");
  else {
    const paid = Number(product.bxQtyPaid || 0);
    const foc = Number(product.bxQtyFoc || 0);
    if (!paid && !foc) return "";
    amount = foc ? `${paid.toLocaleString("ko-KR")}+FOC${foc.toLocaleString("ko-KR")}` : paid.toLocaleString("ko-KR");
  }
  return `${amount} Box`;
}

function cartonQtyText(product: SummaryProduct) {
  const total = cartonTotal(product);
  return total ? `${total.toLocaleString("ko-KR")} CT` : "";
}

function palletQtyText(usePt: boolean, ptQty: number) {
  if (!usePt || !ptQty) return "";
  return `${Number(ptQty).toLocaleString("ko-KR")} PT`;
}

type StorageKind = "일반" | "냉장" | "풀냉장" | "";

function parseStorageCondition(raw?: string | null): { kind: StorageKind; dataLogger: "O" | "X" | "" } {
  const text = (raw ?? "").replace(/\s+/g, "");
  if (!text) return { kind: "", dataLogger: "" };

  let kind: StorageKind = "";
  if (text.includes("풀냉장")) kind = "풀냉장";
  else if (text.includes("냉장")) kind = "냉장";
  else if (text.includes("일반")) kind = "일반";

  if (kind === "일반") return { kind, dataLogger: "X" };
  if (/데이터로거\s*O|\(O\)/i.test(text)) {
    return { kind: kind || "냉장", dataLogger: "O" };
  }
  if (kind === "냉장" || kind === "풀냉장" || /데이터로거\s*X|\(X\)/i.test(text)) {
    return { kind, dataLogger: "X" };
  }
  return { kind, dataLogger: "" };
}

function storageBadgeClass(kind: StorageKind) {
  if (kind === "일반") return "border-slate-300 bg-slate-100 text-slate-700";
  if (kind === "냉장") return "border-sky-300 bg-sky-100 text-sky-800";
  if (kind === "풀냉장") return "border-violet-300 bg-violet-100 text-violet-800";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

const SHIPPING_LABEL_OPTIONS = ["ERP 출력", "수출담당자 전달"] as const;

export function ShipmentSummaryClient({
  shipment,
  defaultNotes: initialDefaultNotes
}: {
  shipment: ShipmentSummaryData;
  defaultNotes: SummaryDefaultNote[];
}) {
  const storage = useMemo(() => parseStorageCondition(shipment.storageCondition), [shipment.storageCondition]);
  const dataLogger = storage.dataLogger;
  const [dataLoggerDetail, setDataLoggerDetail] = useState(shipment.summaryDataLoggerDetail ?? "");
  const [shippingLabelMethod, setShippingLabelMethod] = useState(() => {
    const saved = shipment.summaryShippingLabelMethod?.trim() ?? "";
    if ((SHIPPING_LABEL_OPTIONS as readonly string[]).includes(saved)) return saved;
    if (saved.includes("수출담당자")) return "수출담당자 전달";
    if (saved.includes("ERP")) return "ERP 출력";
    return "ERP 출력";
  });
  const [specialNotes, setSpecialNotes] = useState(shipment.summarySpecialNotes ?? "");
  const [defaultNotes, setDefaultNotes] = useState(initialDefaultNotes);
  const [newDefaultNote, setNewDefaultNote] = useState("");
  const [showAddDefault, setShowAddDefault] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setDefaultNotes(initialDefaultNotes);
  }, [initialDefaultNotes]);

  const factories = useMemo(() => {
    const labels = [...new Set(shipment.products.map((product) => factoryLabel(product.factory)).filter(Boolean))];
    return labels.join("/") || "";
  }, [shipment.products]);

  const palletQty = palletQtyText(shipment.usePt, shipment.ptQty);

  function appendDefaultNote(content: string) {
    const line = content.trim();
    if (!line) return;
    setSpecialNotes((current) => (current.trim() ? `${current.replace(/\s+$/, "")}\n${line}` : line));
  }

  function saveSummary() {
    const formData = new FormData();
    formData.set("id", shipment.id);
    formData.set("summaryDataLogger", dataLogger);
    formData.set("summaryDataLoggerDetail", dataLoggerDetail);
    formData.set("summaryShippingLabelMethod", shippingLabelMethod);
    formData.set("summarySpecialNotes", specialNotes);
    startTransition(async () => {
      const result = await saveShipmentSummaryAction(formData);
      setMessage(result.ok ? "저장했습니다." : result.message);
    });
  }

  function addDefaultNote() {
    const content = newDefaultNote.trim();
    if (!content) return;
    const formData = new FormData();
    formData.set("content", content);
    formData.set("shipmentId", shipment.id);
    startTransition(async () => {
      const result = await createShipmentSummaryDefaultNoteAction(formData);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setDefaultNotes((current) => [...current, result.note]);
      setNewDefaultNote("");
      setShowAddDefault(false);
      setMessage("기본 특이사항을 추가했습니다.");
    });
  }

  function removeDefaultNote(id: string) {
    const formData = new FormData();
    formData.set("id", id);
    formData.set("shipmentId", shipment.id);
    startTransition(async () => {
      const result = await deleteShipmentSummaryDefaultNoteAction(formData);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setDefaultNotes((current) => current.filter((note) => note.id !== id));
      setMessage("기본 특이사항을 삭제했습니다.");
    });
  }

  return (
    <div className="summary-doc mx-auto min-h-screen max-w-5xl bg-white px-6 py-8 text-slate-900 print:px-0 print:py-0">
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">선적요약</p>
          {message ? <p className="mt-1 text-xs text-blue-700">{message}</p> : null}
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn h-10 px-4" disabled={pending} onClick={saveSummary}>
            저장
          </button>
          <button type="button" className="btn-primary h-10 px-4" onClick={() => window.print()}>
            PDF 다운
          </button>
        </div>
      </div>

      <header className="flex items-center justify-between gap-4 border-b-2 border-slate-900 pb-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold tracking-tight text-[#1a237e]">선적상세정보</h1>
          <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            SHIPMENT DETAIL INFORMATION
          </p>
        </div>
        <div className="flex h-[4.25rem] shrink-0 items-center gap-2 whitespace-nowrap rounded-md border-2 border-[#90caf9] bg-[#e3f2fd] px-4">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">INV. No.</span>
          <span className="text-lg font-bold text-[#1565c0]">{shipment.invNo || "-"}</span>
        </div>
      </header>

      <Section title="1. 기본 정보" english="BASIC INFORMATION">
        <Grid>
          <Field label="출고공장" value={factories || "-"} />
          <Field label="운송방식" value={shipment.transport || "-"} badge />
        </Grid>
      </Section>

      <Section title="2. 포장 정보" english="PACKAGING INFORMATION">
        <Grid>
          <Field
            label="보관"
            value={storage.kind || "-"}
            badge
            badgeClassName={storageBadgeClass(storage.kind)}
          />
          <Field label="데이터로거" value={dataLogger || "-"} />
        </Grid>
        <div className="mt-0 border-t border-slate-200">
          <EditableField
            label="데이터로거 상세"
            value={dataLoggerDetail}
            onChange={setDataLoggerDetail}
            placeholder="수기입력"
            wide
          />
        </div>
      </Section>

      <Section title="3. 제품 정보" english="PRODUCT INFORMATION">
        {shipment.products.length ? (
          <>
            {shipment.products.map((product, index) => (
              <div key={product.id} className={index > 0 ? "border-t-2 border-slate-300" : ""}>
                {shipment.products.length > 1 ? (
                  <div className="bg-[#e8eaf6] px-3 py-1.5 text-xs font-semibold text-[#1a237e]">
                    제품 {index + 1}
                  </div>
                ) : null}
                <Grid>
                  <Field label="제품명" value={product.productName || product.englishName || "-"} wide />
                </Grid>
                <Grid>
                  <Field label="배치번호" value={product.lotNo || ""} />
                  <Field label="제품수량" value={productQtyText(product)} />
                </Grid>
                <Grid>
                  <Field label="카톤수량" value={cartonQtyText(product)} />
                  <Field label="팔레트수량" value={palletQty} />
                </Grid>
              </div>
            ))}
            <div className="border-t-2 border-slate-300">
              <SelectField
                label="쉬핑라벨방식"
                value={shippingLabelMethod}
                onChange={setShippingLabelMethod}
                options={[...SHIPPING_LABEL_OPTIONS]}
                wide
              />
            </div>
          </>
        ) : (
          <div className="px-3 py-4 text-sm text-slate-500">등록된 제품이 없습니다.</div>
        )}
      </Section>

      <Section title="4. 거래처 정보" english="CLIENT & BUYER INFO">
        <Grid>
          <Field label="국가" value={shipment.exportCountry || ""} />
          <Field label="거래처명" value={shipment.buyer || ""} />
        </Grid>
        <Grid>
          <Field label="VAT 번호" value={shipment.vatNo || ""} />
          <Field label="EORI 번호" value={shipment.eoriNo || ""} />
        </Grid>
      </Section>

      <section className="mt-5 overflow-hidden rounded-md border border-[#bcaaa4]">
        <div className="flex items-center justify-between gap-3 bg-[#5d4037] px-3 py-2 text-white">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold">4. 특이사항</h2>
            <span className="text-[10px] font-medium uppercase tracking-wide text-amber-100">
              SPECIAL INSTRUCTIONS
            </span>
          </div>
          <button
            type="button"
            className="no-print flex h-7 w-7 items-center justify-center rounded bg-white/15 text-lg font-bold leading-none hover:bg-white/25"
            aria-label="기본 특이사항 추가"
            onClick={() => setShowAddDefault((open) => !open)}
          >
            +
          </button>
        </div>

        <div className="no-print space-y-3 border-b border-amber-200 bg-[#fff8e1] px-3 py-3">
          <p className="text-xs font-semibold text-[#5d4037]">기본 특이사항</p>
          <div className="flex flex-wrap gap-2">
            {defaultNotes.map((note) => (
              <div key={note.id} className="inline-flex max-w-full items-center gap-1 rounded-full border border-amber-300 bg-white px-2 py-1">
                <button
                  type="button"
                  className="truncate text-left text-xs font-medium text-slate-800 hover:text-[#1a237e]"
                  onClick={() => appendDefaultNote(note.content)}
                  title="클릭하면 아래 입력칸에 추가됩니다"
                >
                  {note.content}
                </button>
                <button
                  type="button"
                  className="rounded px-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
                  aria-label="기본 특이사항 삭제"
                  onClick={() => removeDefaultNote(note.id)}
                >
                  ×
                </button>
              </div>
            ))}
            {!defaultNotes.length ? <span className="text-xs text-slate-500">등록된 기본 특이사항이 없습니다. + 로 추가하세요.</span> : null}
          </div>
          {showAddDefault ? (
            <div className="flex gap-2">
              <input
                value={newDefaultNote}
                onChange={(event) => setNewDefaultNote(event.target.value)}
                className="h-10 flex-1 rounded-md border border-amber-300 bg-white px-3 text-sm"
                placeholder="기본 특이사항 내용 입력"
              />
              <button type="button" className="btn h-10 px-3" disabled={pending} onClick={addDefaultNote}>
                추가
              </button>
            </div>
          ) : null}
        </div>

        <div className={`bg-[#fffde7] ${specialNotes.trim() ? "p-3" : "p-2 print:py-1.5"}`}>
          <textarea
            value={specialNotes}
            onChange={(event) => setSpecialNotes(event.target.value)}
            rows={Math.max(2, specialNotes.split("\n").length)}
            className="no-print w-full resize-y rounded-md border border-amber-200 bg-white px-3 py-2 text-sm leading-6 text-slate-900 outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100"
            placeholder="특이사항을 입력하거나, 위 기본 특이사항을 클릭해 추가하세요."
          />
          <div className="hidden whitespace-pre-wrap text-sm leading-6 text-slate-900 print:block">
            {specialNotes.trim() ? specialNotes : <span className="text-slate-400">-</span>}
          </div>
        </div>
      </section>

      <style>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
          .summary-doc {
            max-width: none !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .summary-doc * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}

function Section({ title, english, children }: { title: string; english: string; children: ReactNode }) {
  return (
    <section className="mt-5 overflow-hidden rounded-md border border-slate-300">
      <div className="flex items-center justify-between gap-3 bg-[#1a237e] px-3 py-2 text-white">
        <h2 className="text-sm font-bold">{title}</h2>
        <span className="text-[10px] font-medium uppercase tracking-wide text-blue-100">{english}</span>
      </div>
      <div className="bg-white">{children}</div>
    </section>
  );
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 border-b border-slate-200 last:border-b-0">{children}</div>;
}

function Field({
  label,
  value,
  wide = false,
  badge = false,
  badgeClassName = "border-[#90caf9] bg-[#e3f2fd] text-[#1565c0]"
}: {
  label: string;
  value: string;
  wide?: boolean;
  badge?: boolean;
  badgeClassName?: string;
}) {
  return (
    <div className={`grid grid-cols-[140px_1fr] border-slate-200 border-r last:border-r-0 ${wide ? "col-span-2 border-r-0" : ""}`}>
      <div className="bg-[#e8eaf6] px-3 py-2.5 text-xs font-semibold text-slate-700">{label}</div>
      <div className="px-3 py-2.5 text-sm font-medium text-slate-900">
        {badge && value && value !== "-" ? (
          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClassName}`}>
            {value}
          </span>
        ) : (
          value || <span className="text-slate-300">-</span>
        )}
      </div>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  placeholder,
  wide = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[140px_1fr] border-r border-slate-200 last:border-r-0 ${wide ? "col-span-2 border-r-0" : ""}`}>
      <div className="bg-[#e8eaf6] px-3 py-2.5 text-xs font-semibold text-slate-700">{label}</div>
      <div className="px-3 py-2.5 text-sm font-medium text-slate-900">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="no-print h-6 w-full border-0 bg-transparent p-0 text-sm font-medium text-slate-900 outline-none ring-0 placeholder:text-slate-300"
        />
        <span className="hidden print:inline">{value.trim() || "-"}</span>
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  wide = false
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
  wide?: boolean;
}) {
  return (
    <div className={`grid grid-cols-[140px_1fr] border-slate-200 ${wide ? "col-span-2" : ""}`}>
      <div className="bg-[#e8eaf6] px-3 py-2.5 text-xs font-semibold text-slate-700">{label}</div>
      <div className="px-3 py-2.5">
        <div className="no-print flex flex-wrap gap-4">
          {options.map((option) => (
            <label key={option} className="inline-flex items-center gap-2 text-sm font-medium text-slate-800">
              <input
                type="radio"
                name="shippingLabelMethod"
                value={option}
                checked={value === option}
                onChange={() => onChange(option)}
                className="h-4 w-4"
              />
              {option}
            </label>
          ))}
        </div>
        <p className="hidden text-sm font-medium text-slate-900 print:block">{value || "-"}</p>
      </div>
    </div>
  );
}
