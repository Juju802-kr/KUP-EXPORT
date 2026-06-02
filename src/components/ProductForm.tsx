"use client";

import { useMemo, useState } from "react";
import { createProductAction } from "@/server/actions";

type FactoryValue = "JEONDONG" | "SEOMYEON";

type ProductMasterOption = {
  id: string;
  name: string;
  costGroupCode: string;
  factory: FactoryValue;
};

export function ProductForm({ shipmentId, products }: { shipmentId: string; products: ProductMasterOption[] }) {
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [costGroupCode, setCostGroupCode] = useState("");
  const [factory, setFactory] = useState("");
  const productMap = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  function onSelect(value: string) {
    setSelectedId(value);
    const product = productMap.get(value);
    if (!product) return;
    setName(product.name);
    setCostGroupCode(product.costGroupCode);
    setFactory(product.factory);
  }

  return (
    <form action={createProductAction} className="panel p-5">
      <input type="hidden" name="shipmentId" value={shipmentId} />
      <h2 className="text-base font-semibold">제품 추가</h2>
      <div className="mt-4 grid grid-cols-5 gap-4">
        <div className="field">
          <label>제품 마스터</label>
          <select name="productMasterId" value={selectedId} onChange={(event) => onSelect(event.target.value)}>
            <option value="">직접 입력</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name} / {product.costGroupCode}
              </option>
            ))}
          </select>
        </div>
        <Input label="제품명" name="productName" required value={name} onChange={setName} />
        <Input label="원가군코드" name="costGroupCode" value={costGroupCode} onChange={setCostGroupCode} />
        <div className="field">
          <label>공장</label>
          <select name="factory" value={factory} onChange={(event) => setFactory(event.target.value)}>
            <option value="">선택</option>
            <option value="JEONDONG">전동</option>
            <option value="SEOMYEON">서면</option>
          </select>
        </div>
        <Input label="영문제품명" name="englishName" />
        <Input label="생산의뢰번호" name="productionRequestNo" />
        <Input label="P/I No." name="piNo" />
        <Input label="제조번호" name="lotNo" />
        <Input label="수출단가" name="exportUnitPrice" type="number" step="0.01" />
        <Input label="BX수량(FOC❌)" name="bxQtyPaid" type="number" />
        <Input label="BX수량(FOC⭕️)" name="bxQtyFoc" type="number" />
        <Input label="일반박스 수량" name="normalBoxQty" type="number" />
        <Input label="아이스박스 수량" name="iceBoxQty" type="number" />
        <Input label="주사제박스 수량" name="injectionBoxQty" type="number" />
        <Input label="공용박스 수량" name="commonBoxQty" type="number" />
        <Input label="GW" name="grossWeight" type="number" step="0.01" />
        <Input label="수출메일수신자" name="exportEmailRecipients" />
        <div className="field col-span-3">
          <label>변경사항</label>
          <textarea name="changeNote" />
        </div>
        <div className="field col-span-2">
          <label>제품 첨부파일</label>
          <input name="files" type="file" multiple />
        </div>
      </div>
      <button className="btn-primary mt-5">+ 제품 추가</button>
    </form>
  );
}

function Input(props: { label: string; name: string; type?: string; step?: string; required?: boolean; value?: string; onChange?: (value: string) => void }) {
  return (
    <div className="field">
      <label>{props.label}</label>
      <input
        name={props.name}
        type={props.type ?? "text"}
        step={props.step}
        required={props.required}
        value={props.value}
        onChange={props.onChange ? (event) => props.onChange?.(event.target.value) : undefined}
      />
    </div>
  );
}
