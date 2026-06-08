"use client";

import { Factory, ShipmentStatus } from "@prisma/client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { DeleteButton } from "@/components/DeleteButton";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import { createProductAction, deleteProductAction, deleteShipmentAction, sendProductCoaMailAction, sendShipmentQuoteMailAction, sendShipmentRequestMailAction, sendShipmentScheduleMailAction, updateBuyerSpecialNoteAction, updateProductAction, updateShipmentAction } from "@/server/actions";

type Option = { id: string; value: string; label: string };
type Options = {
  transport: Option[];
  destinationPort: Option[];
  storageCondition: Option[];
  incoterms: Option[];
  paymentTerm: Option[];
  depositStatus: Option[];
  forwarder: Option[];
  departurePort: Option[];
};
type ProductMaster = { id: string; name: string; costGroupCode: string | null; factory: Factory | null };
type Attachment = { id: string; ownerId: string; originalName: string; path: string; mimeType: string | null };
type LcRow = { id: string; lcNo: string | null; productionRequestNo: string | null; lcSd: string | null; buyer: string | null };
type BuyerNote = { id: string; buyerName: string; specialNote: string | null; specialNoteUpdatedAt: string | null };
type ProductRow = {
  id: string;
  productMasterId: string | null;
  productName: string;
  costGroupCode: string | null;
  factory: Factory | null;
  englishName: string | null;
  productionRequestNo: string | null;
  piNo: string | null;
  lotNo: string | null;
  exportUnitPrice: unknown;
  bxQtyPaid: number;
  bxQtyFoc: number;
  bxQtyTotal: number;
  amount: unknown;
  normalBoxQty: number;
  iceBoxQty: number;
  injectionBoxQty: number;
  commonBoxQty: number;
  grossWeight: unknown;
  changeNote: string | null;
  exportEmailRecipients: string | null;
};
type ShipmentValue = {
  id: string;
  status: ShipmentStatus;
  title: string;
  exportCountry: string | null;
  buyer: string | null;
  transport: string | null;
  destinationPort: string | null;
  storageCondition: string | null;
  incoterms: string | null;
  paymentTerm: string | null;
  forwarder: string | null;
  departurePort: string | null;
  transitFlight: string | null;
  currency: string | null;
  depositStatus: string | null;
  lcSd: string | null;
  salesOwner: string | null;
  exportOwner: string | null;
  salesEmailRecipients: string | null;
  salesRequest: string | null;
  note: string | null;
  emailSent: string | null;
  invNo: string | null;
  releaseDate: string;
  etd: string;
  eta: string;
  invoiceValue: unknown;
  freightTotal: unknown;
  dispatchNote: string | null;
  linkedLcId: string | null;
  products: ProductRow[];
};

const emptyProduct: ProductRow = {
  id: "",
  productMasterId: "",
  productName: "",
  costGroupCode: "",
  factory: null,
  englishName: "",
  productionRequestNo: "",
  piNo: "",
  lotNo: "",
  exportUnitPrice: "",
  bxQtyPaid: 0,
  bxQtyFoc: 0,
  bxQtyTotal: 0,
  amount: "",
  normalBoxQty: 0,
  iceBoxQty: 0,
  injectionBoxQty: 0,
  commonBoxQty: 0,
  grossWeight: "",
  changeNote: "",
  exportEmailRecipients: ""
};

export function ShipmentDetailEditor({
  shipment,
  options,
  productMasters,
  shipmentAttachments,
  productAttachments,
  buyerNote,
  buyerAttachments,
  lcs
}: {
  shipment: ShipmentValue;
  options: Options;
  productMasters: ProductMaster[];
  shipmentAttachments: Attachment[];
  productAttachments: Attachment[];
  buyerNote: BuyerNote | null;
  buyerAttachments: Attachment[];
  lcs: LcRow[];
}) {
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [productKey, setProductKey] = useState(0);
  const productFormValue = editingProduct ?? emptyProduct;
  const productAction = editingProduct ? updateProductAction : createProductAction;
  const summary = useMemo(() => shipmentSummary(shipment), [shipment]);
  const [statusValue, setStatusValue] = useState<ShipmentStatus>(shipment.status);
  const [showBuyerNote, setShowBuyerNote] = useState(false);
  const shipmentRequestDefault = shipment.emailSent?.includes("SHIPMENT_REQUEST_SENT") ? "update" : "new";
  const scheduleMailDefault = shipment.emailSent?.includes("SCHEDULE_MAIL_SENT") ? "change" : "new";

  function editProduct(product: ProductRow) {
    setEditingProduct(product);
    setProductKey((key) => key + 1);
  }

  function resetProduct() {
    setEditingProduct(null);
    setProductKey((key) => key + 1);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <form action={updateShipmentAction} className="space-y-6">
        <input type="hidden" name="id" value={shipment.id} />
        <input type="hidden" name="emailSent" value={shipment.emailSent ?? ""} />
        <input type="hidden" name="currency" value={shipment.currency ?? "USD"} />
        <input type="hidden" name="buyer" value={shipment.buyer ?? ""} />
        <input type="hidden" name="exportCountry" value={shipment.exportCountry ?? ""} />
        <input type="hidden" name="salesOwner" value={shipment.salesOwner ?? ""} />
        <input type="hidden" name="exportOwner" value={shipment.exportOwner ?? ""} />

        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-950">{shipment.title}</h1>
            <div className="mt-2 space-y-1 text-sm font-semibold text-slate-800">
              {shipment.products.map((product) => (
                <p key={product.id}>
                  {productLabel(product)} - Q&apos;ty: {product.bxQtyPaid.toLocaleString()}Box+FOC{product.bxQtyFoc.toLocaleString()}Box · INV Value {shipment.currency ?? "USD"}{formatNumber(product.amount)}
                </p>
              ))}
              {!shipment.products.length ? <p>Q&apos;ty: 0Box+FOC0Box · INV Value {shipment.currency ?? "USD"}0</p> : null}
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button className="btn-primary px-5">수정</button>
            <button
              type="submit"
              form="delete-shipment-form"
              className="btn px-5 text-red-700"
              onClick={(event) => {
                if (!confirm("정말 삭제할까요?")) event.preventDefault();
              }}
            >
              삭제
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-end gap-2">
                <Field label="선적 요청" compact>
                  <select name="shipmentRequestType" defaultValue={shipmentRequestDefault} className="h-10 w-44">
                    <option value="new">신규 요청</option>
                    <option value="update">수정 요청</option>
                  </select>
                </Field>
                <button formAction={sendShipmentRequestMailAction} className="btn-primary h-10 px-5">메일 전송</button>
              </div>
            </div>

            <Box title="선적 의뢰란" columns={1}>
              <FormRow>
                <ReadonlyBox label="수출국" value={shipment.exportCountry} />
                <ReadonlyBox label="바이어" value={shipment.buyer} />
              </FormRow>
              <FormRow>
                <SelectBox label="운송" name="transport" value={shipment.transport} options={options.transport} />
                <SelectBox label="인코텀즈" name="incoterms" value={shipment.incoterms} options={options.incoterms} />
              </FormRow>
              <FormRow>
                <SelectBox label="목적항" name="destinationPort" value={shipment.destinationPort} options={options.destinationPort} />
                <SelectBox label="보관조건" name="storageCondition" value={shipment.storageCondition} options={options.storageCondition} />
              </FormRow>
              <FormRow columns={3}>
                <SelectBox label="결제조건" name="paymentTerm" value={shipment.paymentTerm} options={options.paymentTerm} />
                <ComboBox label="입금상황" name="depositStatus" value={shipment.depositStatus} options={options.depositStatus} />
                <InputBox label="LC S/D" name="lcSd" value={shipment.lcSd} />
              </FormRow>
              <FormRow columns={3}>
                <ReadonlyBox label="영업담당자" name="salesOwner" value={shipment.salesOwner} />
                <ReadonlyBox label="수출담당자" name="exportOwner" value={shipment.exportOwner} />
                <ReadonlyBox label="영업메일수신자" name="salesEmailRecipients" value={shipment.salesEmailRecipients} />
              </FormRow>
              <TextBox label="영업담당자 의견" name="salesRequest" value={shipment.salesRequest} />
            </Box>
          </div>

          <div className="space-y-2">
            <div className="flex items-end justify-between gap-3">
              <div className="flex items-end gap-2">
                <Field label="상태" compact>
                  <select
                    name="status"
                    value={statusValue}
                    onChange={(event) => {
                      setStatusValue(event.target.value as ShipmentStatus);
                    }}
                    className="h-10 w-44"
                  >
                    <option value="REQUEST_WAITING">의뢰대기</option>
                    <option value="SCHEDULE">1. 스케줄</option>
                    <option value="QUOTE">★견적</option>
                    <option value="SHIPPING_DOCS">2. 출고 및 선적/서류</option>
                    <option value="NEGO_COLLECTION">3. 네고 및 수금처리</option>
                    <option value="AFTERCARE">4. 사후관리</option>
                  </select>
                </Field>
                {statusValue === "QUOTE" ? (
                  <button formAction={sendShipmentQuoteMailAction} className="btn-primary h-10 px-5">
                    견적 요청 메일
                  </button>
                ) : null}
                {statusValue === "SHIPPING_DOCS" ? (
                  <>
                    <Field label="스케줄 안내" compact>
                      <select name="scheduleMailType" defaultValue={scheduleMailDefault} className="h-10 w-24">
                        <option value="new">신규</option>
                        <option value="change">변경</option>
                      </select>
                    </Field>
                    <button formAction={sendShipmentScheduleMailAction} className="btn-primary h-10 px-5">메일 전송</button>
                  </>
                ) : null}
              </div>
              <button
                type="button"
                className="h-10 rounded-md border border-violet-200 bg-violet-50 px-4 text-sm font-semibold text-violet-700 hover:bg-violet-100"
                onClick={() => setShowBuyerNote(true)}
                disabled={!buyerNote}
                title={buyerNote ? `${buyerNote.buyerName} 특이사항` : "바이어 마스터가 없습니다"}
              >
                바이어
              </button>
            </div>

            <Box title="선적 관리란" columns={1}>
              <FormRow>
                <ReadonlyBox label="서면 총CT" value={summary.seomyeonCt || "-"} />
                <ReadonlyBox label="전동 총CT" value={summary.jeondongCt || "-"} />
              </FormRow>
              <FormRow columns={3}>
                <SelectBox label="포워딩" name="forwarder" value={shipment.forwarder} options={options.forwarder} />
                <SelectBox label="출발항" name="departurePort" value={shipment.departurePort} options={options.departurePort} />
                <InputBox label="경유항/편명" name="transitFlight" value={shipment.transitFlight} />
              </FormRow>
              <FormRow>
                <InputBox label="INV No." name="invNo" value={shipment.invNo} />
                <InputBox label="출고일" name="releaseDate" type="date" value={shipment.releaseDate} />
              </FormRow>
              <FormRow>
                <InputBox label="ETD" name="etd" type="datetime-local" value={shipment.etd} />
                <InputBox label="ETA" name="eta" type="datetime-local" value={shipment.eta} />
              </FormRow>
              <FormRow>
                <ReadonlyBox label="INV Value" value={`${shipment.currency ?? "USD"}${formatNumber(shipment.invoiceValue)}`} />
                <InputBox label="운임총액" name="freightTotal" value={String(shipment.freightTotal ?? "")} />
              </FormRow>
              <TextBox label="배차 특이사항" name="dispatchNote" value={shipment.dispatchNote} />
            </Box>
          </div>
        </div>

        <Box title="첨부파일" columns={1}>
          <input name="files" type="file" multiple className="w-full" />
          <AttachmentLinks files={shipmentAttachments} />
        </Box>
      </form>

      <form id="delete-shipment-form" action={deleteShipmentAction}>
        <input type="hidden" name="id" value={shipment.id} />
      </form>

      {showBuyerNote && buyerNote ? (
        <BuyerSpecialNotePopup
          shipmentId={shipment.id}
          buyerNote={buyerNote}
          files={buyerAttachments}
          onClose={() => setShowBuyerNote(false)}
        />
      ) : null}

      <Box title="제품 LIST" columns={1}>
        <div className="space-y-2">
          {shipment.products.map((product) => (
            <div key={product.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2">
              <button type="button" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:border-blue-300 hover:bg-blue-50" onClick={() => editProduct(product)}>
                {productSummary(product)}
              </button>
              <button type="button" className="btn" onClick={() => editProduct(product)}>수정</button>
              <form action={deleteProductAction}>
                <input type="hidden" name="id" value={product.id} />
                <input type="hidden" name="shipmentId" value={shipment.id} />
                <DeleteButton />
              </form>
            </div>
          ))}
          {!shipment.products.length ? <p className="text-sm text-slate-500">등록된 제품이 없습니다.</p> : null}
        </div>
      </Box>

      <form key={productKey} action={productAction} className="space-y-4">
        <input type="hidden" name="shipmentId" value={shipment.id} />
        {editingProduct ? <input type="hidden" name="id" value={editingProduct.id} /> : null}
        <input type="hidden" name="exportEmailRecipients" value="" />
        <Box title={editingProduct ? "제품 수정" : "제품 추가"} columns={3}>
          <ProductMasterSelect products={productMasters} current={productFormValue} />
          <ProductInput label="일반박스 (58*44*47)" name="normalBoxQty" type="number" value={productFormValue.normalBoxQty} />
          <ProductInput label="영문제품명" name="englishName" value={productFormValue.englishName} />
          <ProductInput label="수출단가" name="exportUnitPrice" type="number" step="0.01" value={productFormValue.exportUnitPrice} />
          <ProductInput label="아이스박스 (57*51*49)" name="iceBoxQty" type="number" value={productFormValue.iceBoxQty} />
          <ProductInput label="PI No." name="piNo" value={productFormValue.piNo} />
          <ProductInput label={<span>BOX(FOC <span className="font-bold text-pink-500">X</span>)</span>} name="bxQtyPaid" type="number" value={productFormValue.bxQtyPaid} />
          <ProductInput label="주사제박스 (57*38*33)" name="injectionBoxQty" type="number" value={productFormValue.injectionBoxQty} />
          <ProductInput label="생산의뢰번호" name="productionRequestNo" value={productFormValue.productionRequestNo} />
          <ProductInput label={<span>BOX(FOC <span className="font-bold text-pink-500">O</span>)</span>} name="bxQtyFoc" type="number" value={productFormValue.bxQtyFoc} />
          <ProductInput label="공용박스 (44*33*27)" name="commonBoxQty" type="number" value={productFormValue.commonBoxQty} />
          <ProductInput label="배치번호" name="lotNo" value={productFormValue.lotNo} />
          <ReadonlyProductBox label="박스 수량 합계" value={formatNumberInput(productFormValue.bxQtyTotal || "")} />
          <ProductInput label="GW" name="grossWeight" type="number" step="0.01" value={productFormValue.grossWeight} />
          <div className="col-span-3">
            <ProductTextarea label="COA 요청사항" name="changeNote" value={productFormValue.changeNote} />
          </div>
          <div className="col-span-3 grid grid-cols-[1fr_auto_auto_auto] gap-2">
            <LcConnect linkedLcId={shipment.linkedLcId} lcs={shipment.linkedLcId ? lcs : matchingLcs(lcs, productFormValue.productionRequestNo)} />
            <button formAction={sendProductCoaMailAction} className="btn px-5">COA 메일</button>
            <button className="btn-primary px-5">{editingProduct ? "수정" : "등록"}</button>
            {editingProduct ? <button type="button" className="btn px-5" onClick={resetProduct}>취소</button> : null}
          </div>
          {editingProduct ? <div className="col-span-3"><AttachmentLinks files={productAttachments.filter((file) => file.ownerId === editingProduct.id)} /></div> : null}
        </Box>
      </form>

      <Link href="/shipments" className="btn">목록으로</Link>
    </div>
  );
}

function Box({ title, children, columns = 3 }: { title: string; children: ReactNode; columns?: 1 | 2 | 3 }) {
  const grid = columns === 1 ? "space-y-3" : columns === 2 ? "grid grid-cols-2 gap-3" : "grid grid-cols-3 gap-3";
  return (
    <section className="panel p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-950">{title}</h2>
      <div className={grid}>{children}</div>
    </section>
  );
}

function BuyerSpecialNotePopup({
  shipmentId,
  buyerNote,
  files,
  onClose
}: {
  shipmentId: string;
  buyerNote: BuyerNote;
  files: Attachment[];
  onClose: () => void;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = buyerNote.specialNote ?? "";
  }, [buyerNote.id, buyerNote.specialNote]);

  function runCommand(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  function prepareSubmit() {
    if (hiddenInputRef.current) hiddenInputRef.current.value = editorRef.current?.innerHTML ?? "";
  }

  return (
    <div className="fixed right-8 top-32 z-50 w-[720px] max-w-[calc(100vw-2rem)] rounded-lg border border-violet-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-950">바이어 특이사항</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {buyerNote.buyerName}
            {buyerNote.specialNoteUpdatedAt ? ` · ${buyerNote.specialNoteUpdatedAt.slice(0, 10)} 수정` : ""}
          </p>
        </div>
        <button type="button" className="rounded-md px-2 py-1 text-lg font-semibold text-slate-500 hover:bg-slate-100" onClick={onClose}>
          ×
        </button>
      </div>
      <form action={updateBuyerSpecialNoteAction} className="space-y-3 p-4" onSubmit={prepareSubmit}>
        <input type="hidden" name="shipmentId" value={shipmentId} />
        <input type="hidden" name="buyerId" value={buyerNote.id} />
        <input ref={hiddenInputRef} type="hidden" name="specialNote" defaultValue={buyerNote.specialNote ?? ""} />
        <div className="flex flex-wrap items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-2">
          <button type="button" className="btn h-8 px-3 font-bold" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("bold")}>B</button>
          <button type="button" className="btn h-8 px-3 italic" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("italic")}>I</button>
          <button type="button" className="btn h-8 px-3" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertUnorderedList")}>목록</button>
          <button type="button" className="btn h-8 px-3" onMouseDown={(event) => event.preventDefault()} onClick={() => runCommand("insertOrderedList")}>번호</button>
          <label className="ml-1 flex h-8 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600">
            색상
            <input
              type="color"
              className="border-0 bg-transparent"
              style={{ width: 28, height: 20, minWidth: 28, padding: 0 }}
              onChange={(event) => runCommand("foreColor", event.target.value)}
            />
          </label>
        </div>
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          tabIndex={0}
          className="min-h-56 cursor-text rounded-md border border-slate-300 bg-white p-4 text-sm leading-7 text-slate-900 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">첨부파일</label>
          <input name="files" type="file" multiple className="w-full rounded-md border border-slate-300 bg-white px-3 py-2" />
          <AttachmentLinks files={files} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn px-5" onClick={onClose}>닫기</button>
          <button className="btn-primary px-5">수정</button>
        </div>
      </form>
    </div>
  );
}

function FormRow({ children, columns = 2 }: { children: ReactNode; columns?: 2 | 3 }) {
  const grid = columns === 3 ? "grid-cols-3" : "grid-cols-2";
  return <div className={`grid gap-3 ${grid}`}>{children}</div>;
}

function Field({ label, compact = false, children }: { label: ReactNode; compact?: boolean; children: ReactNode }) {
  return (
    <label className={`block ${compact ? "" : "space-y-1"}`}>
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  );
}

function InputBox({ label, name, value, type = "text" }: { label: string; name: string; value?: string | null; type?: string }) {
  return (
    <Field label={label}>
      <input name={name} type={type} defaultValue={value ?? ""} className="h-11 w-full" />
    </Field>
  );
}

function TextBox({ label, name, value, className = "" }: { label: string; name: string; value?: string | null; className?: string }) {
  return (
    <Field label={label}>
      <textarea name={name} defaultValue={value ?? ""} rows={3} className={`w-full ${className}`} />
    </Field>
  );
}

function ReadonlyBox({ label, value, name }: { label: string; value?: string | number | null; name?: string }) {
  return (
    <Field label={label}>
      <input name={name} value={value || ""} readOnly className="h-11 w-full bg-slate-50" />
    </Field>
  );
}

function SelectBox({ label, name, value, options }: { label: string; name: string; value?: string | null; options: Option[] }) {
  return (
    <Field label={label}>
      <SearchableCombobox
        name={name}
        defaultValue={value ?? ""}
        placeholder="선택"
        options={options.map((option) => ({ id: option.id, value: option.label, label: option.label }))}
      />
    </Field>
  );
}

function ComboBox({ label, name, value, options }: { label: string; name: string; value?: string | null; options: Option[] }) {
  return (
    <Field label={label}>
      <SearchableCombobox
        name={name}
        defaultValue={value ?? ""}
        placeholder="선택"
        options={options.map((option) => ({ id: option.id, value: option.label, label: option.label }))}
      />
    </Field>
  );
}

function ProductMasterSelect({ products, current }: { products: ProductMaster[]; current: ProductRow }) {
  const [selected, setSelected] = useState(current.productMasterId ?? "");
  const [name, setName] = useState(current.productName ?? "");
  const [costGroupCode, setCostGroupCode] = useState(current.costGroupCode ?? "");
  const [factory, setFactory] = useState(current.factory ?? "");
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);
  const filteredProducts = useMemo(() => {
    const query = name.trim().toLowerCase();
    if (!query) return products.slice(0, 30);
    return products.filter((product) => product.name.toLowerCase().includes(query)).slice(0, 30);
  }, [name, products]);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    setActiveIndex(0);
  }, [name, filteredProducts.length]);

  function onSelect(value: string) {
    setSelected(value);
    const product = productMap.get(value);
    if (!product) return;
    setName(product.name);
    setCostGroupCode(product.costGroupCode ?? "");
    setFactory(product.factory ?? "");
    setOpen(false);
  }

  function onType(value: string) {
    setName(value);
    setSelected("");
    setCostGroupCode("");
    setFactory("");
    setOpen(true);
  }

  return (
    <>
      <Field label="제품명">
        <div className="relative">
          <input
            value={name}
            onChange={(event) => onType(event.target.value)}
            onFocus={() => setOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setOpen(true);
                if (filteredProducts.length > 0) setActiveIndex((index) => (index + 1) % filteredProducts.length);
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
                if (filteredProducts.length > 0) setActiveIndex((index) => (index - 1 + filteredProducts.length) % filteredProducts.length);
              }
              if (event.key === "Enter") {
                event.preventDefault();
                if (filteredProducts.length > 0) onSelect(filteredProducts[activeIndex]?.id ?? filteredProducts[0].id);
              }
              if (event.key === "Escape") setOpen(false);
            }}
            placeholder="제품명 선택 또는 입력"
            autoComplete="off"
            required
            className="h-11 w-full pr-10"
          />
          <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-slate-500 hover:text-slate-900" onClick={() => setOpen((currentOpen) => !currentOpen)}>
            ▾
          </button>
          {open ? (
            <div className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-md border border-slate-300 bg-white shadow-lg">
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm text-slate-600 hover:bg-blue-50"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  setSelected("");
                  setOpen(false);
                }}
              >
                직접 입력
              </button>
              {filteredProducts.map((product, index) => (
                <button
                  key={product.id}
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-blue-50 ${
                    product.id === selected || index === activeIndex ? "bg-blue-600 font-semibold text-white hover:bg-blue-600" : "text-slate-900"
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => onSelect(product.id)}
                >
                  {product.name}
                </button>
              ))}
              {filteredProducts.length === 0 ? <div className="px-3 py-2 text-sm text-slate-500">검색 결과 없음</div> : null}
            </div>
          ) : null}
        </div>
      </Field>
      <ReadonlyProductBox label="공장" value={factoryLabel(factory)} />
      <input name="productMasterId" value={selected} readOnly className="hidden" />
      <input name="productName" value={name} onChange={(event) => setName(event.target.value)} required className="hidden" />
      <input name="costGroupCode" value={costGroupCode} onChange={(event) => setCostGroupCode(event.target.value)} className="hidden" />
      <input name="factory" value={factory} readOnly className="hidden" />
    </>
  );
}

function ProductInput({ label, name, value, type = "text", step, className = "" }: { label: ReactNode; name: string; value?: unknown; type?: string; step?: string; className?: string }) {
  const isNumeric = type === "number";
  const [displayValue, setDisplayValue] = useState(() => (isNumeric ? formatNumberInput(value) : String(value ?? "")));

  return (
    <Field label={label}>
      <input
        name={name}
        type={isNumeric ? "text" : type}
        inputMode={isNumeric ? "decimal" : undefined}
        step={step}
        value={displayValue}
        onChange={(event) => setDisplayValue(isNumeric ? formatNumberInput(event.target.value) : event.target.value)}
        className={`h-11 w-full ${className}`}
      />
    </Field>
  );
}

function formatNumberInput(value: unknown) {
  const raw = String(value ?? "").replaceAll(",", "");
  if (!raw) return "";
  const negative = raw.startsWith("-");
  const unsigned = negative ? raw.slice(1) : raw;
  const [integerPart, decimalPart] = unsigned.split(".");
  const digits = integerPart.replace(/\D/g, "");
  const formattedInteger = digits ? Number(digits).toLocaleString("ko-KR") : "";
  const decimal = decimalPart !== undefined ? `.${decimalPart.replace(/\D/g, "")}` : "";
  return `${negative ? "-" : ""}${formattedInteger}${decimal}`;
}

function ProductTextarea({ label, name, value }: { label: ReactNode; name: string; value?: string | null }) {
  return (
    <Field label={label}>
      <textarea name={name} defaultValue={value ?? ""} rows={3} className="w-full" />
    </Field>
  );
}

function ReadonlyProductBox({ label, value }: { label: ReactNode; value: string }) {
  return (
    <Field label={label}>
      <input value={value} readOnly className="h-11 w-full bg-slate-50" />
    </Field>
  );
}

function LcConnect({ linkedLcId, lcs }: { linkedLcId: string | null; lcs: LcRow[] }) {
  if (linkedLcId) {
    const linkedLc = lcs.find((lc) => lc.id === linkedLcId);
    return (
      <Link href={`/payments?tab=lc&edit=${linkedLcId}`} className="block rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-blue-700 hover:border-blue-300 hover:bg-blue-50">
        L/C {linkedLc?.lcNo || "-"} / {linkedLc?.productionRequestNo || "-"} / {linkedLc?.lcSd || "-"}
      </Link>
    );
  }

  if (!lcs.length) return <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">동일 생산의뢰번호 L/C 없음</div>;

  return <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">저장하면 동일 생산의뢰번호 L/C가 자동 연결됩니다.</div>;
}

function factoryLabel(factory?: string | null) {
  if (factory === Factory.JEONDONG) return "전동";
  if (factory === Factory.SEOMYEON) return "서면";
  return "";
}

function AttachmentLinks({ files }: { files: Attachment[] }) {
  if (!files.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {files.map((file) => (
        <a key={file.id} href={file.path} download={file.originalName} className="rounded border border-slate-300 px-2 py-1 text-xs text-blue-700 hover:bg-blue-50">
          {file.originalName}
        </a>
      ))}
    </div>
  );
}

function shipmentSummary(shipment: ShipmentValue) {
  const seomyeonCt = shipment.products.filter((product) => product.factory === Factory.SEOMYEON).reduce((sum, product) => sum + cartonTotal(product), 0);
  const jeondongCt = shipment.products.filter((product) => product.factory === Factory.JEONDONG).reduce((sum, product) => sum + cartonTotal(product), 0);
  return { seomyeonCt, jeondongCt };
}

function cartonTotal(product: ProductRow) {
  return Number(product.normalBoxQty || 0) + Number(product.iceBoxQty || 0) + Number(product.injectionBoxQty || 0) + Number(product.commonBoxQty || 0);
}

function productLabel(product: ProductRow) {
  return product.englishName || product.productName || "제품명 없음";
}

function productSummary(product: ProductRow) {
  return [productLabel(product), product.piNo, product.productionRequestNo, product.lotNo].filter(Boolean).join(" ");
}

function matchingLcs(lcs: LcRow[], productionRequestNo?: string | null) {
  if (!productionRequestNo) return [];
  return lcs.filter((lc) => lc.productionRequestNo === productionRequestNo);
}

function formatNumber(value: unknown) {
  return Number(value ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 2 });
}
