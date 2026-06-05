"use client";

import { PaymentLcKind, Team } from "@prisma/client";
import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { CountryCombobox } from "@/components/CountryCombobox";
import { DeleteButton } from "@/components/DeleteButton";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import { confirmPaymentLCAction, confirmPaymentTTAction, createPaymentLCAction, createPaymentTTAction, deletePaymentAction, notifyPaymentLCAction, notifyPaymentTTAction } from "@/server/actions";

type UserOption = { id: string; name: string; team: Team };
type BuyerOption = {
  id: string;
  exportCountry: string;
  buyerName: string;
  defaultCurrency: string | null;
  salesOwner: string | null;
  exportOwner: string | null;
  salesEmailRecipients: string | null;
};
type PaymentTTRow = {
  id: string;
  exportCountry: string | null;
  buyer: string | null;
  amount: unknown;
  currency: string | null;
  date: string;
  refNo: string | null;
  salesOwner: string | null;
  exportOwner: string | null;
  depositOwner: string | null;
  salesEmailRecipients: string | null;
  productionRequestNo: string | null;
  invNo: string | null;
  description: string | null;
  note: string | null;
};
type PaymentLCRow = {
  id: string;
  kind: PaymentLcKind;
  bank: string | null;
  exportCountry: string | null;
  buyer: string | null;
  amount: unknown;
  currency: string | null;
  lcSd: string | null;
  noticeDate: string;
  lcNo: string | null;
  productionRequestNo: string | null;
  salesOwner: string | null;
  exportOwner: string | null;
  depositOwner: string | null;
  salesEmailRecipients: string | null;
  form: string | null;
  note: string | null;
};
type AttachmentRow = {
  id: string;
  ownerId: string;
  originalName: string;
  path: string;
  mimeType: string | null;
};

const emptyTT: PaymentTTRow = {
  id: "",
  exportCountry: "",
  buyer: "",
  amount: "",
  currency: "USD",
  date: "",
  refNo: "",
  salesOwner: "",
  exportOwner: "",
  depositOwner: "이해원",
  salesEmailRecipients: "",
  productionRequestNo: "",
  invNo: "",
  description: "",
  note: ""
};

const emptyLC: PaymentLCRow = {
  id: "",
  kind: PaymentLcKind.OPEN,
  bank: "",
  exportCountry: "",
  buyer: "",
  amount: "",
  currency: "USD",
  lcSd: "",
  noticeDate: "",
  lcNo: "",
  productionRequestNo: "",
  salesOwner: "",
  exportOwner: "",
  depositOwner: "이해원",
  salesEmailRecipients: "",
  form: "",
  note: ""
};

export function PaymentClient({
  ttPayments,
  lcPayments,
  buyers,
  users,
  countries,
  banks,
  mode,
  attachments,
  searchQuery,
  pendingOnly
}: {
  ttPayments: PaymentTTRow[];
  lcPayments: PaymentLCRow[];
  buyers: BuyerOption[];
  users: UserOption[];
  countries: string[];
  banks: string[];
  mode: "tt" | "lc";
  attachments: AttachmentRow[];
  searchQuery: string;
  pendingOnly: boolean;
}) {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const salesOwners = users.filter((user) => user.team === Team.OVERSEAS_MARKETING || user.team === Team.OVERSEAS_SALES);
  const exportOwners = users.filter((user) => user.team === Team.OVERSEAS_SALES_SUPPORT);

  return mode === "tt" ? (
    <TTSection payments={ttPayments} buyers={buyers} countries={countries} salesOwners={salesOwners} exportOwners={exportOwners} attachments={attachments} searchQuery={searchQuery} pendingOnly={pendingOnly} />
  ) : (
    <LCSection payments={lcPayments} buyers={buyers} countries={countries} banks={banks} salesOwners={salesOwners} exportOwners={exportOwners} attachments={attachments} initialEditId={editId} searchQuery={searchQuery} pendingOnly={pendingOnly} />
  );
}

function TTSection({
  payments,
  buyers,
  countries,
  salesOwners,
  exportOwners,
  attachments,
  searchQuery,
  pendingOnly
}: {
  payments: PaymentTTRow[];
  buyers: BuyerOption[];
  countries: string[];
  salesOwners: UserOption[];
  exportOwners: UserOption[];
  attachments: AttachmentRow[];
  searchQuery: string;
  pendingOnly: boolean;
}) {
  const [editing, setEditing] = useState<PaymentTTRow | null>(null);
  const [formKey, setFormKey] = useState(0);
  const [buyerName, setBuyerName] = useState("");
  const current = editing ?? emptyTT;
  const selectedBuyer = useMemo(() => buyers.find((buyer) => buyer.buyerName === buyerName), [buyers, buyerName]);
  const currentAttachments = attachments.filter((file) => file.ownerId === current.id);

  function startEdit(payment: PaymentTTRow) {
    setEditing(payment);
    setBuyerName(payment.buyer ?? "");
    setFormKey((key) => key + 1);
  }

  function resetForm() {
    setEditing(null);
    setBuyerName("");
    setFormKey((key) => key + 1);
  }

  const autoCurrency = selectedBuyer?.defaultCurrency ?? current.currency ?? "USD";
  const autoSalesOwner = selectedBuyer?.salesOwner ?? current.salesOwner ?? "";
  const autoExportOwner = selectedBuyer?.exportOwner ?? current.exportOwner ?? "";
  const autoDepositOwner = current.depositOwner ?? "이해원";
  const autoSalesRecipients = selectedBuyer?.salesEmailRecipients ?? current.salesEmailRecipients ?? "";
  const countryOptions = [...new Set([...countries, ...buyers.map((buyer) => buyer.exportCountry)].filter(Boolean))];

  return (
    <div className="space-y-5">
      <form key={formKey} action={createPaymentTTAction} className="space-y-5">
        <input type="hidden" name="id" value={current.id} />
        <section className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">T/T 입금 등록</h2>
            <div className="flex gap-2">
              {editing ? <button className="btn" type="button" onClick={resetForm}>신규로 돌아가기</button> : null}
              <button className="btn" formAction={createPaymentTTAction}>저장</button>
              <button className="btn-primary" formAction={notifyPaymentTTAction}>통지</button>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-5 gap-3">
              <Field label="국가">
                <CountryCombobox name="exportCountry" countries={countryOptions} defaultValue={selectedBuyer?.exportCountry ?? current.exportCountry ?? ""} />
              </Field>
              <BuyerSelect buyers={buyers} value={buyerName || current.buyer || ""} onChange={setBuyerName} />
              <Field label="통화"><CurrencySelect name="currency" value={autoCurrency} /></Field>
              <Field label="금액"><AmountInput name="amount" defaultValue={current.amount} /></Field>
              <Field label="입금일"><input name="date" type="date" defaultValue={current.date} /></Field>
            </div>
            <div className="grid grid-cols-5 gap-3">
              <Field label="REF No."><input name="refNo" defaultValue={current.refNo ?? ""} /></Field>
              <OwnerSelect label="영업담당자" name="salesOwner" users={salesOwners} value={autoSalesOwner} />
              <OwnerSelect label="수출담당자" name="exportOwner" users={exportOwners} value={autoExportOwner} />
              <OwnerSelect label="입금담당자" name="depositOwner" users={exportOwners} value={autoDepositOwner} fallbackOption="이해원" />
              <Field label="영업메일수신자"><input name="salesEmailRecipients" value={autoSalesRecipients} onChange={() => undefined} /></Field>
            </div>
            <Field label="첨부파일" className="col-span-4">
              <input name="files" type="file" multiple />
              {editing ? <ExistingAttachments files={currentAttachments} /> : null}
            </Field>
          </div>
        </section>

        {editing ? (
          <section className="panel p-5">
            <h2 className="text-base font-semibold">T/T 입금 확인</h2>
            <div className="mt-4 grid grid-cols-4 gap-4">
              <Field label="생산의뢰번호"><input name="productionRequestNo" defaultValue={current.productionRequestNo ?? ""} /></Field>
              <Field label="INV No."><input name="invNo" defaultValue={current.invNo ?? ""} /></Field>
              <Field label="설명" className="col-span-2"><input name="description" defaultValue={current.description ?? ""} /></Field>
              <Field label="비고" className="col-span-4"><textarea name="note" defaultValue={current.note ?? ""} rows={4} /></Field>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-primary" formAction={confirmPaymentTTAction}>등록</button>
            </div>
          </section>
        ) : null}
      </form>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">T/T 입금 관리 목록</h2>
        <PaymentSearchForm tab="tt" defaultValue={searchQuery} pendingOnly={pendingOnly} />
        <div className="mt-3 divide-y divide-slate-100">
          <div className="grid grid-cols-[110px_120px_140px_130px_1fr_1fr_auto] items-center gap-3 py-2 text-xs font-medium text-slate-500">
            <span>영업담당자</span>
            <span>국가</span>
            <span>바이어</span>
            <span>금액</span>
            <span>생산의뢰번호</span>
            <span>INV No.</span>
            <span />
          </div>
          {payments.map((payment) => (
            <div key={payment.id} className="grid grid-cols-[110px_120px_140px_130px_1fr_1fr_auto] items-center gap-3 py-3 text-sm">
              <RowButton onClick={() => startEdit(payment)}>{payment.salesOwner || "-"}</RowButton>
              <RowButton onClick={() => startEdit(payment)}>{payment.exportCountry || "-"}</RowButton>
              <RowButton onClick={() => startEdit(payment)}>{payment.buyer || "-"}</RowButton>
              <button type="button" className="text-left font-medium text-slate-900" onClick={() => startEdit(payment)}>
                {payment.currency ?? "USD"}{Number(payment.amount ?? 0).toLocaleString("ko-KR")}
              </button>
              <RowButton onClick={() => startEdit(payment)}>{payment.productionRequestNo || "-"}</RowButton>
              <RowButton onClick={() => startEdit(payment)}>{payment.invNo || "-"}</RowButton>
              <DeletePaymentForm id={payment.id} type="tt" />
            </div>
          ))}
          {!payments.length ? <p className="py-3 text-sm text-slate-500">등록된 T/T 입금 내역이 없습니다.</p> : null}
        </div>
      </section>
    </div>
  );
}

function LCSection({
  payments,
  buyers,
  countries,
  banks,
  salesOwners,
  exportOwners,
  attachments,
  initialEditId,
  searchQuery,
  pendingOnly
}: {
  payments: PaymentLCRow[];
  buyers: BuyerOption[];
  countries: string[];
  banks: string[];
  salesOwners: UserOption[];
  exportOwners: UserOption[];
  attachments: AttachmentRow[];
  initialEditId: string | null;
  searchQuery: string;
  pendingOnly: boolean;
}) {
  const [editing, setEditing] = useState<PaymentLCRow | null>(() => payments.find((payment) => payment.id === initialEditId) ?? null);
  const [formKey, setFormKey] = useState(0);
  const [buyerName, setBuyerName] = useState(() => payments.find((payment) => payment.id === initialEditId)?.buyer ?? "");
  const current = editing ?? emptyLC;
  const selectedBuyer = useMemo(() => buyers.find((buyer) => buyer.buyerName === buyerName), [buyers, buyerName]);
  const currentAttachments = attachments.filter((file) => file.ownerId === current.id);

  function startEdit(payment: PaymentLCRow) {
    setEditing(payment);
    setBuyerName(payment.buyer ?? "");
    setFormKey((key) => key + 1);
  }

  function resetForm() {
    setEditing(null);
    setBuyerName("");
    setFormKey((key) => key + 1);
  }

  const autoSalesOwner = selectedBuyer?.salesOwner ?? current.salesOwner ?? "";
  const autoExportOwner = selectedBuyer?.exportOwner ?? current.exportOwner ?? "";
  const autoSalesRecipients = selectedBuyer?.salesEmailRecipients ?? current.salesEmailRecipients ?? "";
  const autoCurrency = selectedBuyer?.defaultCurrency ?? current.currency ?? "USD";
  const countryOptions = [...new Set([...countries, ...buyers.map((buyer) => buyer.exportCountry)].filter(Boolean))];

  return (
    <div className="space-y-5">
      <form key={formKey} action={createPaymentLCAction} className="space-y-5">
        <input type="hidden" name="id" value={current.id} />
        <section className="panel p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">L/C 통지 등록</h2>
            <div className="flex gap-2">
              {editing ? <button className="btn" type="button" onClick={resetForm}>신규로 돌아가기</button> : null}
              <button className="btn" formAction={createPaymentLCAction}>저장</button>
              <button className="btn-primary" formAction={notifyPaymentLCAction}>통지</button>
            </div>
          </div>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-4 gap-4">
              <Field label="OPEN / AMEND">
                <select name="kind" defaultValue={current.kind === PaymentLcKind.AMEND ? PaymentLcKind.AMEND_1ST : current.kind}>
                  <option value={PaymentLcKind.OPEN}>OPEN</option>
                  <option value={PaymentLcKind.AMEND_1ST}>1st AMEND</option>
                  <option value={PaymentLcKind.AMEND_2ND}>2nd AMEND</option>
                  <option value={PaymentLcKind.AMEND_3RD}>3rd AMEND</option>
                  <option value={PaymentLcKind.AMEND_4TH}>4th AMEND</option>
                  <option value={PaymentLcKind.AMEND_5TH}>5th AMEND</option>
                </select>
              </Field>
              <Field label="은행">
                <SearchableCombobox
                  name="bank"
                  defaultValue={current.bank ?? ""}
                  placeholder="은행 선택/입력"
                  options={banks.map((bank) => ({ value: bank, label: bank }))}
                />
              </Field>
              <Field label="국가"><CountryCombobox name="exportCountry" countries={countryOptions} defaultValue={selectedBuyer?.exportCountry ?? current.exportCountry ?? ""} /></Field>
              <BuyerSelect buyers={buyers} value={buyerName || current.buyer || ""} onChange={setBuyerName} />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="통화"><CurrencySelect name="currency" value={autoCurrency} /></Field>
              <Field label="금액"><AmountInput name="amount" defaultValue={current.amount} /></Field>
              <Field label="통지일"><input name="noticeDate" type="date" defaultValue={current.noticeDate} /></Field>
              <Field label="LC S/D"><input name="lcSd" type="date" defaultValue={current.lcSd ?? ""} /></Field>
            </div>
            <div className="grid grid-cols-4 gap-3">
              <Field label="LC No."><input name="lcNo" defaultValue={current.lcNo ?? ""} /></Field>
              <OwnerSelect label="영업담당자" name="salesOwner" users={salesOwners} value={autoSalesOwner} />
              <OwnerSelect label="수출담당자" name="exportOwner" users={exportOwners} value={autoExportOwner} />
              <Field label="영업메일수신자"><input name="salesEmailRecipients" value={autoSalesRecipients} onChange={() => undefined} /></Field>
            </div>
            <Field label="첨부파일" className="col-span-4">
              <input name="files" type="file" multiple />
              {editing ? <ExistingAttachments files={currentAttachments} /> : null}
            </Field>
          </div>
        </section>

        {editing ? (
          <section className="panel p-5">
            <h2 className="text-base font-semibold">L/C 확인</h2>
            <div className="mt-4 grid grid-cols-4 gap-4">
              <Field label="수주등록번호"><input name="productionRequestNo" defaultValue={current.productionRequestNo ?? ""} /></Field>
            </div>
            <div className="mt-4 flex justify-end">
              <button className="btn-primary" formAction={confirmPaymentLCAction}>등록</button>
            </div>
          </section>
        ) : null}
      </form>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">L/C 통지 관리 목록</h2>
        <PaymentSearchForm tab="lc" defaultValue={searchQuery} pendingOnly={pendingOnly} />
        <div className="mt-3 divide-y divide-slate-100">
          <div className="grid grid-cols-[110px_110px_130px_130px_1fr_1fr_1fr_auto] items-center gap-3 py-2 text-xs font-medium text-slate-500">
            <span>영업담당자</span>
            <span>국가</span>
            <span>바이어</span>
            <span>금액</span>
            <span>생산의뢰번호</span>
            <span>LC No.</span>
            <span>LC S/D</span>
            <span />
          </div>
          {payments.map((payment) => (
            <div key={payment.id} className="grid grid-cols-[110px_110px_130px_130px_1fr_1fr_1fr_auto] items-center gap-3 py-3 text-sm">
              <RowButton onClick={() => startEdit(payment)}>{payment.salesOwner || "-"}</RowButton>
              <RowButton onClick={() => startEdit(payment)}>{payment.exportCountry || "-"}</RowButton>
              <RowButton onClick={() => startEdit(payment)}>{payment.buyer || "-"}</RowButton>
              <button type="button" className="text-left font-medium text-slate-900" onClick={() => startEdit(payment)}>
                {payment.currency ?? "USD"}{Number(payment.amount ?? 0).toLocaleString("ko-KR")}
              </button>
              <RowButton onClick={() => startEdit(payment)}>{payment.productionRequestNo || "-"}</RowButton>
              <RowButton onClick={() => startEdit(payment)}>{payment.lcNo || "-"}</RowButton>
              <RowButton onClick={() => startEdit(payment)} muted>{payment.lcSd || "-"}</RowButton>
              <DeletePaymentForm id={payment.id} type="lc" />
            </div>
          ))}
          {!payments.length ? <p className="py-3 text-sm text-slate-500">등록된 L/C 통지가 없습니다.</p> : null}
        </div>
      </section>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={`field ${className}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function PaymentSearchForm({ tab, defaultValue, pendingOnly }: { tab: "tt" | "lc"; defaultValue: string; pendingOnly: boolean }) {
  const placeholder =
    tab === "tt"
      ? "영업담당자, 국가, 바이어, 금액, 생산의뢰번호, INV No."
      : "영업담당자, 국가, 바이어, 금액, 생산의뢰번호, LC No., LC S/D";

  return (
    <form className="mt-4 flex items-end gap-3 rounded-md border border-slate-200 bg-slate-50 p-4">
      <input type="hidden" name="tab" value={tab} />
      <div className="field min-w-96">
        <label>검색</label>
        <input name="q" defaultValue={defaultValue} placeholder={placeholder} />
      </div>
      <button className="btn h-11">검색</button>
      <label className="flex h-11 items-center gap-2 self-end whitespace-nowrap text-sm font-medium text-slate-700">
        <input
          type="checkbox"
          name="pending"
          value="1"
          defaultChecked={pendingOnly}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="h-4 w-4"
        />
        확인대기
      </label>
    </form>
  );
}

function AmountInput({ name, defaultValue }: { name: string; defaultValue: unknown }) {
  const [value, setValue] = useState(() => formatAmount(defaultValue));

  return (
    <input
      className="w-full"
      name={name}
      inputMode="decimal"
      value={value}
      onChange={(event) => setValue(formatAmount(event.target.value))}
    />
  );
}

function formatAmount(value: unknown) {
  const raw = String(value ?? "").replaceAll(",", "");
  if (!raw) return "";
  const [integer, decimal] = raw.split(".");
  const formattedInteger = Number(integer || 0).toLocaleString("ko-KR");
  return decimal !== undefined ? `${formattedInteger}.${decimal}` : formattedInteger;
}

function BuyerSelect({ buyers, value, onChange }: { buyers: BuyerOption[]; value: string; onChange: (value: string) => void }) {
  return (
    <Field label="바이어">
      <SearchableCombobox
        name="buyer"
        value={value}
        onChange={onChange}
        placeholder="바이어 선택"
        required
        options={buyers.map((buyer) => ({ id: buyer.id, value: buyer.buyerName, label: buyer.buyerName }))}
      />
    </Field>
  );
}

function CurrencySelect({ name, value }: { name: string; value: string }) {
  return (
    <select name={name} value={value} onChange={() => undefined} className="w-full">
      <option value="USD">USD</option>
      <option value="EUR">EUR</option>
      <option value="KRW">KRW</option>
    </select>
  );
}

function OwnerSelect({ label, name, users, value, fallbackOption }: { label: string; name: string; users: UserOption[]; value: string; fallbackOption?: string }) {
  const hasFallbackInUsers = fallbackOption ? users.some((user) => user.name === fallbackOption) : true;
  return (
    <Field label={label}>
      <select name={name} value={value} onChange={() => undefined} className="w-full">
        <option value="">{label}</option>
        {fallbackOption && !hasFallbackInUsers ? <option value={fallbackOption}>{fallbackOption}</option> : null}
        {users.map((user) => (
          <option key={user.id} value={user.name}>{user.name}</option>
        ))}
      </select>
    </Field>
  );
}

function RowButton({ children, muted = false, onClick }: { children: ReactNode; muted?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`text-left ${muted ? "text-slate-600" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}

function DeletePaymentForm({ id, type }: { id: string; type: "tt" | "lc" }) {
  return (
    <form action={deletePaymentAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="type" value={type} />
      <DeleteButton />
    </form>
  );
}

function ExistingAttachments({ files }: { files: AttachmentRow[] }) {
  return (
    <div className="mt-2">
      <p className="mb-1 text-xs font-medium text-slate-500">기존 첨부파일</p>
      <AttachmentLinks files={files} showEmpty />
    </div>
  );
}

function AttachmentLinks({ files, showEmpty = false }: { files: AttachmentRow[]; showEmpty?: boolean }) {
  if (!files.length) return showEmpty ? <span className="text-xs text-slate-400">첨부파일 없음</span> : <span className="text-xs text-slate-400">-</span>;
  return (
    <div className="flex flex-col gap-1 overflow-hidden">
      {files.map((file) => (
        <a key={file.id} href={file.path} className="truncate text-xs font-medium text-blue-700 hover:underline" download={file.originalName} title={file.originalName}>
          {file.mimeType?.startsWith("image/") ? "이미지 " : "파일 "} {file.originalName}
        </a>
      ))}
    </div>
  );
}


