"use client";

import { DropdownCategory, DropdownOption, ShipmentStatus } from "@prisma/client";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import { FlexibleDateInput } from "@/components/FlexibleDateInput";
import {
  buildDestinationRegistry,
  pickDestinationByCountry,
  type RegisteredDestination
} from "@/lib/destination-registry";
import { createShipmentAction, updateShipmentAction } from "@/server/actions";
import { findRegisteredBuyer } from "@/lib/order-pi-import";
import { type ShipmentOrderProductDraft } from "@/lib/shipment-order-draft";

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
  suitabilityDate: string | null;
  shippingApprovalDate: string | null;
  desiredShipDate: string | null;
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
  buyers,
  destinationPorts = [],
  draftProducts = [],
  draftKey = ""
}: {
  shipment?: ShipmentFormValue;
  options: Options;
  buyers: BuyerOption[];
  destinationPorts?: RegisteredDestination[];
  draftProducts?: ShipmentOrderProductDraft[];
  draftKey?: string;
}) {
  const isEdit = Boolean(shipment?.id);
  const action = isEdit ? updateShipmentAction : createShipmentAction;
  const destinationRegistry = useMemo(() => buildDestinationRegistry(destinationPorts), [destinationPorts]);
  const [buyer, setBuyer] = useState(shipment?.buyer ?? "");
  const [buyerId, setBuyerId] = useState("");
  const [salesOwner, setSalesOwner] = useState(shipment?.salesOwner ?? "");
  const [exportCountry, setExportCountry] = useState(shipment?.exportCountry ?? "");
  const [currency, setCurrency] = useState(shipment?.currency ?? "USD");
  const [exportOwner, setExportOwner] = useState(shipment?.exportOwner ?? "");
  const [salesEmailRecipients, setSalesEmailRecipients] = useState(shipment?.salesEmailRecipients ?? "");
  const [transport, setTransport] = useState(shipment?.transport ?? "");
  const [incoterms, setIncoterms] = useState(shipment?.incoterms ?? "");
  const [destinationPort, setDestinationPort] = useState(shipment?.destinationPort ?? "");
  const [paymentTerm, setPaymentTerm] = useState(shipment?.paymentTerm ?? "");

  function applyBuyerMaster(selected: BuyerOption | null | undefined, options?: { forceCountry?: boolean; forceCurrency?: boolean }) {
    if (!selected) return;
    setBuyer(selected.buyerName);
    setBuyerId(selected.id);
    setSalesOwner(selected.salesOwner ?? "");
    setExportOwner(selected.exportOwner ?? "");
    setSalesEmailRecipients(selected.salesEmailRecipients ?? "");
    if (options?.forceCountry || !exportCountry.trim()) {
      setExportCountry(selected.exportCountry ?? "");
    }
    if (options?.forceCurrency || !currency.trim()) {
      setCurrency(selected.defaultCurrency ?? "USD");
    }
  }

  function applyBuyer(value: string) {
    if (!value.trim()) {
      setBuyer("");
      setBuyerId("");
      return;
    }
    const byId = buyers.find((item) => item.id === value);
    if (byId) {
      applyBuyerMaster(byId, { forceCountry: true, forceCurrency: true });
    }
  }

  useEffect(() => {
    const draftBuyer = shipment?.buyer?.trim();
    if (!draftBuyer) return;
    const selected =
      (shipment?.exportCountry
        ? buyers.find((item) => item.buyerName === draftBuyer && item.exportCountry === shipment.exportCountry)
        : undefined) ?? findRegisteredBuyer(draftBuyer, buyers);
    if (!selected) return;
    applyBuyerMaster(selected, {
      forceCountry: !shipment?.exportCountry,
      forceCurrency: !shipment?.currency
    });
    // Only resolve once when draft/shipment buyer or buyer list is ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buyers, shipment?.buyer, shipment?.currency, shipment?.exportCountry]);

  useEffect(() => {
    if (!incoterms.trim() || !transport.trim() || !exportCountry.trim() || !destinationRegistry.length) return;
    const picked = pickDestinationByCountry(exportCountry, transport, destinationRegistry);
    if (picked) setDestinationPort(picked);
  }, [incoterms, transport, exportCountry, destinationRegistry]);

  return (
    <form action={action} className="space-y-6">
      {isEdit ? <input type="hidden" name="id" value={shipment!.id} /> : null}
      {draftKey ? <input type="hidden" name="draftKey" value={draftKey} /> : null}
      <input type="hidden" name="status" value={ShipmentStatus.REQUEST_WAITING} />
      <input type="hidden" name="currency" value={currency} />
      <input type="hidden" name="exportEmailRecipients" value={exportOwner} />
      <input type="hidden" name="contactPerson" value={exportOwner} />
      <input type="hidden" name="emailSent" value={shipment?.emailSent ?? ""} />
      <input type="hidden" name="note" value={shipment?.note ?? ""} />

      <Box title="선적 의뢰란" columns={1}>
        <FormRow columns={3}>
          <Select label="수출국" name="exportCountry" value={exportCountry} onChange={setExportCountry} options={options.EXPORT_COUNTRY} />
          <BuyerSelect buyers={buyers} value={buyer} selectedId={buyerId} onChange={applyBuyer} />
          <Select label="보관조건" name="storageCondition" defaultValue={shipment?.storageCondition} options={options.STORAGE_CONDITION} />
        </FormRow>
        <FormRow columns={3}>
          <Select label="운송" name="transport" value={transport} onChange={setTransport} options={options.TRANSPORT} />
          <Select label="인코텀즈" name="incoterms" value={incoterms} onChange={setIncoterms} options={options.INCOTERMS} />
          <Select label="목적항" name="destinationPort" value={destinationPort} onChange={setDestinationPort} options={options.DESTINATION_PORT} />
        </FormRow>
        <FormRow columns={3}>
          <Select label="결제조건" name="paymentTerm" value={paymentTerm} onChange={setPaymentTerm} options={options.PAYMENT_TERM} />
          <Select label="입금상황" name="depositStatus" defaultValue={shipment?.depositStatus} options={options.DEPOSIT_STATUS} />
          <Input label="LC S/D" name="lcSd" value={shipment?.lcSd} />
        </FormRow>
        <FormRow columns={3}>
          <ReadonlyInput label="영업담당자" name="salesOwner" value={salesOwner} placeholder="바이어 선택 시 자동 입력" />
          <ReadonlyInput label="수출담당자" name="exportOwner" value={exportOwner} placeholder="바이어 선택 시 자동 입력" />
          <ReadonlyInput label="영업메일수신자" name="salesEmailRecipients" value={salesEmailRecipients} placeholder="바이어 선택 시 자동 입력" />
        </FormRow>
        <FormRow columns={3}>
          <FlexibleDateInput label="적합일" name="suitabilityDate" defaultValue={shipment?.suitabilityDate} />
          <FlexibleDateInput label="출하승인일" name="shippingApprovalDate" defaultValue={shipment?.shippingApprovalDate} />
          <FlexibleDateInput label="선적희망일" name="desiredShipDate" defaultValue={shipment?.desiredShipDate} />
        </FormRow>
        <TextArea label="영업담당자 의견" name="salesRequest" value={shipment?.salesRequest} />
      </Box>

      {draftProducts.length ? (
        <Box title="제품 LIST" columns={1}>
          <input type="hidden" name="draftProductsJson" value={JSON.stringify(draftProducts)} />
          <div className="space-y-2">
            {draftProducts.map((product, index) => (
              <div key={`${product.piNo}-${product.productionRequestNo}-${index}`} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                <p className="font-medium">{product.productName}</p>
                <p className="mt-1 text-slate-600">
                  {product.englishName ? `${product.englishName} · ` : ""}
                  PI {product.piNo || "-"} · 생산의뢰 {product.productionRequestNo || "-"} · 수출단가 {product.exportUnitPrice}
                </p>
              </div>
            ))}
          </div>
        </Box>
      ) : null}

      <div className="flex justify-end">
        <button className="btn-primary px-6">{isEdit ? "수정 저장" : "선적의뢰 등록"}</button>
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

function BuyerSelect({
  buyers,
  value,
  selectedId,
  onChange
}: {
  buyers: BuyerOption[];
  value: string;
  selectedId: string;
  onChange: (value: string) => void;
}) {
  const selected =
    buyers.find((buyer) => buyer.id === selectedId) ||
    buyers.find((buyer) => buyer.buyerName === value) ||
    null;
  const resolvedId = selected?.id ?? "";

  return (
    <Field label="바이어">
      <input type="hidden" name="buyer" value={selected?.buyerName || value} required />
      <SearchableCombobox
        name="buyerPicker"
        value={resolvedId}
        onChange={onChange}
        placeholder="바이어 선택"
        required={!resolvedId && !value}
        registeredOnly
        useHiddenName
        displayValue={(id) => {
          const buyer = buyers.find((item) => item.id === id) ?? selected;
          if (!buyer) return "";
          return buyer.exportCountry ? `${buyer.buyerName} · ${buyer.exportCountry}` : buyer.buyerName;
        }}
        options={buyers.map((buyer) => ({
          id: buyer.id,
          value: buyer.id,
          label: buyer.exportCountry ? `${buyer.buyerName} · ${buyer.exportCountry}` : buyer.buyerName,
          searchText: `${buyer.buyerName} ${buyer.exportCountry}`
        }))}
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
