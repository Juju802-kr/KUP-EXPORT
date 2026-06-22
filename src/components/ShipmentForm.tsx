"use client";

import { DropdownCategory, DropdownOption, ShipmentStatus } from "@prisma/client";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import { createShipmentAction, updateShipmentAction } from "@/server/actions";

type Options = Record<DropdownCategory, DropdownOption[]>;
type BuyerOption = {
  id: string;
  exportCountry: string;
  buyerName: string;
  defaultCurrency: string | null;
  salesOwner: string | null;
  exportOwner: string | null;
  salesEmailRecipients: string | null;
};
type ShipmentFormValue = {
  id: string;
  salesOwner: string | null;
  exportCountry: string | null;
  buyer: string | null;
  destinationPort: string | null;
  incoterms: string | null;
  transport: string | null;
  storageCondition: string | null;
  paymentTerm: string | null;
  forwarder?: string | null;
  departurePort?: string | null;
  currency: string | null;
  depositStatus: string | null;
  lcSd: string | null;
  salesRequest: string | null;
  note: string | null;
  emailSent: string | null;
  exportOwner: string | null;
  salesEmailRecipients: string | null;
  invNo: string | null;
  releaseDate: Date | string | null;
  etd: Date | string | null;
  eta: Date | string | null;
  freightTotal?: string | number | null;
  dispatchNote?: string | null;
};

export function ShipmentForm({
  shipment,
  options,
  buyers
}: {
  shipment?: ShipmentFormValue;
  options: Options;
  buyers: BuyerOption[];
}) {
  const action = shipment ? updateShipmentAction : createShipmentAction;
  const buyerMap = useMemo(() => new Map(buyers.map((buyer) => [buyer.buyerName, buyer])), [buyers]);
  const [buyer, setBuyer] = useState(shipment?.buyer ?? "");
  const [salesOwner, setSalesOwner] = useState(shipment?.salesOwner ?? "");
  const [exportCountry, setExportCountry] = useState(shipment?.exportCountry ?? "");
  const [currency, setCurrency] = useState(shipment?.currency ?? "USD");
  const [exportOwner, setExportOwner] = useState(shipment?.exportOwner ?? "");
  const [salesEmailRecipients, setSalesEmailRecipients] = useState(shipment?.salesEmailRecipients ?? "");

  function applyBuyer(value: string) {
    setBuyer(value);
    const selected = buyerMap.get(value);
    if (!selected) return;
    setSalesOwner(selected.salesOwner ?? "");
    setExportCountry(selected.exportCountry ?? "");
    setCurrency(selected.defaultCurrency ?? "USD");
    setExportOwner(selected.exportOwner ?? "");
    setSalesEmailRecipients(selected.salesEmailRecipients ?? "");
  }

  return (
    <form action={action} className="space-y-6">
      {shipment ? <input type="hidden" name="id" value={shipment.id} /> : null}
      <input type="hidden" name="status" value={ShipmentStatus.REQUEST_WAITING} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="exportEmailRecipients" value={exportOwner} />
      <input type="hidden" name="contactPerson" value={exportOwner} />
      <input type="hidden" name="emailSent" value={shipment?.emailSent ?? ""} />
      <input type="hidden" name="note" value={shipment?.note ?? ""} />

      <Box title="선적 의뢰란" columns={1}>
        <FormRow>
          <Select label="수출국" name="exportCountry" value={exportCountry} onChange={setExportCountry} options={options.EXPORT_COUNTRY} />
          <BuyerSelect buyers={buyers} value={buyer} onChange={applyBuyer} />
        </FormRow>
        <FormRow>
          <Select label="운송" name="transport" defaultValue={shipment?.transport} options={options.TRANSPORT} />
          <Select label="인코텀즈" name="incoterms" defaultValue={shipment?.incoterms} options={options.INCOTERMS} />
        </FormRow>
        <FormRow>
          <Select label="목적항" name="destinationPort" defaultValue={shipment?.destinationPort} options={options.DESTINATION_PORT} />
          <Select label="보관조건" name="storageCondition" defaultValue={shipment?.storageCondition} options={options.STORAGE_CONDITION} />
        </FormRow>
        <FormRow columns={3}>
          <Select label="결제조건" name="paymentTerm" defaultValue={shipment?.paymentTerm} options={options.PAYMENT_TERM} />
          <Select label="입금상황" name="depositStatus" defaultValue={shipment?.depositStatus} options={options.DEPOSIT_STATUS} />
          <Input label="LC S/D" name="lcSd" value={shipment?.lcSd} />
        </FormRow>
        <FormRow columns={3}>
          <ReadonlyInput label="영업담당자" name="salesOwner" value={salesOwner} placeholder="바이어 선택 시 자동 입력" />
          <ReadonlyInput label="수출담당자" name="exportOwner" value={exportOwner} placeholder="바이어 선택 시 자동 입력" />
          <ReadonlyInput label="영업메일수신자" name="salesEmailRecipients" value={salesEmailRecipients} placeholder="바이어 선택 시 자동 입력" />
        </FormRow>
        <TextArea label="영업담당자 의견" name="salesRequest" value={shipment?.salesRequest} />
      </Box>

      <div className="flex justify-end">
        <button className="btn-primary px-6">{shipment ? "수정 저장" : "선적의뢰 등록"}</button>
      </div>
    </form>
  );
}

function Box({ title, children, columns = 2 }: { title: string; children: ReactNode; columns?: 1 | 2 | 3 }) {
  const grid = columns === 1 ? "space-y-3" : columns === 2 ? "grid grid-cols-2 gap-4" : "grid grid-cols-3 gap-4";
  return (
    <section className="panel p-5">
      <h2 className="mb-4 text-base font-semibold text-slate-950">{title}</h2>
      <div className={grid}>{children}</div>
    </section>
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

function Input({ label, name, value, type = "text" }: { label: string; name: string; value?: string | null; type?: string }) {
  return (
    <Field label={label}>
      <input name={name} type={type} defaultValue={value ?? ""} className="h-11 w-full" />
    </Field>
  );
}

function TextArea({ label, name, value }: { label: string; name: string; value?: string | null }) {
  return (
    <Field label={label}>
      <textarea name={name} defaultValue={value ?? ""} rows={3} className="w-full" />
    </Field>
  );
}

function ReadonlyInput({ label, name, value, placeholder }: { label: string; name: string; value: string; placeholder?: string }) {
  return (
    <Field label={label}>
      <input name={name} value={value} readOnly placeholder={placeholder} className="h-11 w-full bg-slate-50 text-slate-700" />
    </Field>
  );
}

function Select({
  label,
  name,
  defaultValue,
  value,
  onChange,
  options
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  value?: string;
  onChange?: (value: string) => void;
  options?: DropdownOption[];
}) {
  return (
    <Field label={label}>
      <SearchableCombobox
        name={name}
        value={value}
        defaultValue={defaultValue}
        onChange={onChange}
        placeholder="선택"
        options={(options ?? []).map((option) => ({ id: option.id, value: option.label, label: option.label }))}
      />
    </Field>
  );
}
