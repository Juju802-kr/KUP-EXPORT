"use client";

import { GripVertical } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { saveOverseasSalesRosterAction } from "@/server/actions";
import {
  OVERSEAS_SALES_LEADER_PART,
  OVERSEAS_SALES_PROBATION_PART,
  compareOverseasSalesMembers,
  overseasSalesPartLabel,
  overseasSalesPartSuffix,
  overseasSalesRankLabel,
  renumberOverseasSalesRoster
} from "@/lib/overseas-sales-roster";

export type OverseasSalesRosterRow = {
  id: string;
  label: string;
  partNo: number | null;
  rankNo: number | null;
};

function SuffixedNumberInput({
  value,
  onChange,
  suffix,
  min = -1,
  placeholder
}: {
  value: number;
  onChange: (value: number) => void;
  suffix: string;
  min?: number;
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <input
        type="number"
        min={min}
        step={1}
        value={Number.isFinite(value) ? value : ""}
        placeholder={placeholder}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 pr-12 text-sm outline-none focus:border-blue-500"
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-slate-500">
        {suffix}
      </span>
    </div>
  );
}

export function OverseasSalesRosterEditor({
  rows: initialRows,
  search
}: {
  rows: OverseasSalesRosterRow[];
  search: string;
}) {
  const [rows, setRows] = useState(initialRows);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  const visibleRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    const filtered = keyword
      ? rows.filter((row) => row.label.toLowerCase().includes(keyword))
      : rows;
    return [...filtered].sort(compareOverseasSalesMembers);
  }, [rows, search]);

  function persist(nextRows: OverseasSalesRosterRow[]) {
    const ordered = [...nextRows].sort(compareOverseasSalesMembers);
    const renumbered = renumberOverseasSalesRoster(
      ordered.map((row) => ({
        id: row.id,
        label: row.label,
        partNo: row.partNo ?? OVERSEAS_SALES_PROBATION_PART
      }))
    );
    const mapped = renumbered.map((row) => ({
      id: row.id,
      label: row.label,
      partNo: row.partNo,
      rankNo: row.rankNo
    }));
    setRows(mapped);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("rowsPayload", JSON.stringify(renumbered));
      const result = await saveOverseasSalesRosterAction(formData);
      setMessage(result.ok ? "파트·순위가 저장되었습니다." : result.message || "저장에 실패했습니다.");
    });
  }

  function updatePart(id: string, partNo: number) {
    const next = rows.map((row) =>
      row.id === id ? { ...row, partNo: Number.isFinite(partNo) ? partNo : OVERSEAS_SALES_PROBATION_PART } : row
    );
    persist(next);
  }

  function updateRank(id: string, rankNo: number) {
    const target = rows.find((row) => row.id === id);
    if (!target) return;
    const partNo = target.partNo ?? OVERSEAS_SALES_PROBATION_PART;
    const others = rows
      .filter((row) => row.id !== id)
      .sort(compareOverseasSalesMembers);
    const samePart = others.filter((row) => (row.partNo ?? OVERSEAS_SALES_PROBATION_PART) === partNo);
    const insertAt = Math.max(0, Math.min(samePart.length, Math.round(rankNo) - 1));
    const reorderedSame = [...samePart];
    reorderedSame.splice(insertAt, 0, { ...target, partNo, rankNo: insertAt + 1 });
    const next = [
      ...others.filter((row) => (row.partNo ?? OVERSEAS_SALES_PROBATION_PART) !== partNo),
      ...reorderedSame
    ];
    persist(next);
  }

  function dropOn(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const ordered = [...visibleRows];
    const from = ordered.findIndex((row) => row.id === draggingId);
    const to = ordered.findIndex((row) => row.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = ordered.splice(from, 1);
    const target = ordered[to] ?? ordered[to - 1];
    const nextPart = target?.partNo ?? moved.partNo ?? OVERSEAS_SALES_PROBATION_PART;
    ordered.splice(to, 0, { ...moved, partNo: nextPart });
    // Keep non-visible rows, replace visible order
    const visibleIds = new Set(ordered.map((row) => row.id));
    const hidden = rows.filter((row) => !visibleIds.has(row.id));
    persist([...ordered, ...hidden]);
    setDraggingId(null);
  }

  let lastPart: number | null = null;

  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm text-slate-500">
        회원가입된 해외영업팀 구성원의 파트·순위만 관리합니다. 드래그하면 위치 기준으로 파트와 순위가 자동 저장됩니다.
        파트 <code className="rounded bg-slate-100 px-1">-1</code>은 팀장(1파트 위), <code className="rounded bg-slate-100 px-1">0</code>은 수습입니다.
      </p>
      {message ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p> : null}
      <div className="grid grid-cols-[minmax(0,1fr)_110px_110px] gap-3 px-2 text-xs font-medium text-slate-500">
        <span>이름</span>
        <span>파트</span>
        <span>순위</span>
      </div>
      <div className="divide-y divide-slate-100 rounded-md border border-slate-200 bg-white">
        {visibleRows.map((row) => {
          const partNo = row.partNo ?? OVERSEAS_SALES_PROBATION_PART;
          const showHeader = lastPart !== partNo;
          lastPart = partNo;
          return (
            <div key={row.id}>
              {showHeader ? (
                <div className="bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600">
                  {overseasSalesPartLabel(partNo)}
                </div>
              ) : null}
              <div
                className={`grid grid-cols-[minmax(0,1fr)_110px_110px] items-center gap-3 px-3 py-2 text-sm ${
                  pending ? "opacity-70" : ""
                }`}
                draggable
                onDragStart={() => setDraggingId(row.id)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => dropOn(row.id)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <GripVertical size={16} className="shrink-0 cursor-grab text-slate-400" />
                  <span className="truncate font-medium text-slate-900">{row.label}</span>
                  <span className="text-xs text-slate-400">
                    {overseasSalesPartLabel(partNo)} · {overseasSalesRankLabel(row.rankNo)}
                  </span>
                </div>
                <SuffixedNumberInput
                  value={partNo}
                  min={OVERSEAS_SALES_LEADER_PART}
                  suffix={overseasSalesPartSuffix(partNo)}
                  onChange={(value) => updatePart(row.id, value)}
                />
                <SuffixedNumberInput
                  value={row.rankNo ?? 1}
                  min={1}
                  suffix="순위"
                  onChange={(value) => updateRank(row.id, value)}
                />
              </div>
            </div>
          );
        })}
        {!visibleRows.length ? <p className="px-3 py-4 text-sm text-slate-500">등록된 해외영업팀 사용자가 없습니다.</p> : null}
      </div>
    </div>
  );
}
