"use client";

import { useEffect, useRef, useState } from "react";
import { saveDataLoggersAction } from "@/server/actions";

type DataLoggerRow = {
  id: string;
  loggerNo: string | null;
  quantity: string | null;
  receivedDate: string | null;
  releaseStatus: string | null;
};

type EditableRow = {
  key: string;
  id: string;
  loggerNo: string;
  quantity: string;
  receivedDate: string;
  releaseStatus: string;
};

export function DataLoggerTable({ rows }: { rows: DataLoggerRow[] }) {
  const [editableRows, setEditableRows] = useState<EditableRow[]>(
    rows.map((row) => ({
      key: row.id,
      id: row.id,
      loggerNo: row.loggerNo ?? "",
      quantity: row.quantity ?? "",
      receivedDate: row.receivedDate ?? "",
      releaseStatus: row.releaseStatus ?? ""
    }))
  );
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [deletedIds, setDeletedIds] = useState<string[]>([]);

  const selectedCount = selectedKeys.length;
  const allSelected = editableRows.length > 0 && selectedCount === editableRows.length;
  const total = editableRows.length;

  function addRow() {
    setEditableRows((current) => [blankRow(current.length), ...current]);
  }

  function copySelectedRows() {
    if (!selectedKeys.length) return;
    setEditableRows((current) => {
      const selected = current.filter((row) => selectedKeys.includes(row.key));
      const copies = selected.map((row, index) => ({
        ...row,
        key: `copy-${Date.now()}-${index}`,
        id: ""
      }));
      return [...copies, ...current];
    });
    setSelectedKeys([]);
  }

  function deleteSelectedRows() {
    if (!selectedKeys.length) return;
    setEditableRows((current) => {
      const selected = current.filter((row) => selectedKeys.includes(row.key));
      setDeletedIds((ids) => [...ids, ...selected.map((row) => row.id).filter(Boolean)]);
      return current.filter((row) => !selectedKeys.includes(row.key));
    });
    setSelectedKeys([]);
  }

  function toggleAll() {
    setSelectedKeys(allSelected ? [] : editableRows.map((row) => row.key));
  }

  function toggleRow(key: string) {
    setSelectedKeys((current) => (current.includes(key) ? current.filter((selectedKey) => selectedKey !== key) : [...current, key]));
  }

  function updateRow(index: number, field: keyof Omit<EditableRow, "key" | "id">, value: string) {
    setEditableRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row)));
  }

  return (
    <section className="panel p-5">
      <form action={saveDataLoggersAction}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">DATA LOGGER 출고순서</h2>
          <div className="flex gap-2">
            {selectedCount > 0 ? (
              <>
                <button type="button" className="btn" onClick={copySelectedRows}>
                  복사
                </button>
                <button type="button" className="btn" onClick={deleteSelectedRows}>
                  삭제
                </button>
              </>
            ) : (
              <button type="button" className="btn" onClick={addRow}>
                추가
              </button>
            )}
            <button className="btn-primary">저장</button>
          </div>
        </div>

        {deletedIds.map((id) => (
          <input key={id} type="hidden" name="deletedId" value={id} />
        ))}

        <div className="overflow-hidden rounded-md border border-slate-200">
          <div className="grid grid-cols-[48px_80px_1.5fr_1fr_1fr_1.5fr] bg-slate-50 text-sm font-semibold text-slate-600">
            <div className="flex items-center justify-center border-r border-slate-200 px-3 py-2">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="전체 선택" />
            </div>
            <div className="border-r border-slate-200 px-3 py-2 text-center">No.</div>
            <div className="border-r border-slate-200 px-3 py-2 text-center">로거 번호</div>
            <div className="border-r border-slate-200 px-3 py-2 text-center">수량</div>
            <div className="border-r border-slate-200 px-3 py-2 text-center">수령일</div>
            <div className="px-3 py-2 text-center">출고 현황</div>
          </div>

          {editableRows.map((row, index) => {
            const selected = selectedKeys.includes(row.key);
            return (
              <div key={row.key} className="grid grid-cols-[48px_80px_1.5fr_1fr_1fr_1.5fr] border-t border-slate-200">
                <input type="hidden" name="rowKey" value={row.key} />
                <input type="hidden" name={`id-${index}`} value={row.id} />
                <div className="flex items-start justify-center border-r border-slate-200 px-3 py-4">
                  <input type="checkbox" checked={selected} onChange={() => toggleRow(row.key)} aria-label={`${total - index}번 선택`} />
                </div>
                <div className="border-r border-slate-200 px-3 py-4 text-center text-sm font-medium text-slate-600">{total - index}</div>
                <DataLoggerTextarea name={`loggerNo-${index}`} value={row.loggerNo} onChange={(value) => updateRow(index, "loggerNo", value)} />
                <DataLoggerTextarea name={`quantity-${index}`} value={row.quantity} onChange={(value) => updateRow(index, "quantity", value)} />
                <DataLoggerTextarea name={`receivedDate-${index}`} value={row.receivedDate} onChange={(value) => updateRow(index, "receivedDate", value)} />
                <DataLoggerTextarea name={`releaseStatus-${index}`} value={row.releaseStatus} onChange={(value) => updateRow(index, "releaseStatus", value)} last />
              </div>
            );
          })}

          {!editableRows.length ? (
            <p className="border-t border-slate-200 px-4 py-6 text-sm text-slate-500">등록된 데이터로거가 없습니다. 추가 버튼으로 행을 생성하세요.</p>
          ) : null}
        </div>
      </form>
    </section>
  );
}

function blankRow(seed: number): EditableRow {
  return {
    key: `new-${Date.now()}-${seed}`,
    id: "",
    loggerNo: "",
    quantity: "",
    receivedDate: "",
    releaseStatus: ""
  };
}

function DataLoggerTextarea({
  name,
  value,
  onChange,
  last = false
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
  last?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    autoSize(ref.current);
  }, [value]);

  return (
    <div className={`${last ? "" : "border-r"} border-slate-200 px-2 py-2`}>
      <textarea
        ref={ref}
        name={name}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          autoSize(event.target);
        }}
        rows={1}
        className="min-h-12 w-full resize-none whitespace-pre-wrap rounded-md border-slate-200 bg-white leading-relaxed"
      />
    </div>
  );
}

function autoSize(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "auto";
  element.style.height = `${element.scrollHeight}px`;
}
