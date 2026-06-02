"use client";

import Link from "next/link";
import { ShipmentStatus } from "@prisma/client";
import { useEffect, useState } from "react";
import { StatusBadge } from "@/components/StatusBadge";
import { copyShipmentAction, deleteSelectedShipmentsAction, reorderShipmentsAction, updateShipmentKanbanStatusAction } from "@/server/actions";

type ShipmentRow = {
  id: string;
  owner: string;
  title: string;
  extra: string;
  factories: string[];
  currency: string;
  amount: string;
  updatedAt: string;
  status: ShipmentStatus;
};

export function ShipmentsListClient({ groups, currentUserName }: { groups: [string, ShipmentRow[]][]; currentUserName: string }) {
  const [groupRows, setGroupRows] = useState(groups);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [aftercareOwners, setAftercareOwners] = useState<string[]>([]);
  const selectedCount = selectedIds.length;

  useEffect(() => {
    setGroupRows(groups);
  }, [groups]);

  function toggle(id: string) {
    setSelectedIds((current) => (current.includes(id) ? current.filter((value) => value !== id) : [...current, id]));
  }

  async function persistOrder(rows: ShipmentRow[]) {
    const formData = new FormData();
    formData.set("ids", rows.map((row) => row.id).join(","));
    await reorderShipmentsAction(formData);
  }

  function dropShipment(owner: string, targetId: string, visibleRows: ShipmentRow[]) {
    if (!draggingId || draggingId === targetId) return;
    const from = visibleRows.findIndex((row) => row.id === draggingId);
    const to = visibleRows.findIndex((row) => row.id === targetId);
    if (from < 0 || to < 0) return;

    const reorderedVisible = [...visibleRows];
    const [moved] = reorderedVisible.splice(from, 1);
    reorderedVisible.splice(to, 0, moved);

    setGroupRows((current) =>
      current.map(([groupOwner, rows]) => {
        if (groupOwner !== owner) return [groupOwner, rows];
        const visibleIds = new Set(visibleRows.map((row) => row.id));
        let visibleIndex = 0;
        const nextRows = rows.map((row) => (visibleIds.has(row.id) ? reorderedVisible[visibleIndex++] : row));
        void persistOrder(nextRows);
        return [groupOwner, nextRows];
      })
    );
    setDraggingId(null);
  }

  function toggleAftercare(owner: string) {
    setAftercareOwners((current) => (current.includes(owner) ? current.filter((value) => value !== owner) : [...current, owner]));
  }

  return (
    <div className="space-y-3">
      {selectedCount ? (
        <div className="panel sticky top-16 z-10 flex items-center justify-between gap-3 p-3 shadow-sm">
          <span className="text-sm font-medium text-slate-700">{selectedCount}건 선택됨</span>
          <div className="flex gap-2">
            <form action={copyShipmentAction}>
              <input type="hidden" name="id" value={selectedIds[0] ?? ""} />
              <button className="btn" disabled={selectedCount !== 1} title={selectedCount !== 1 ? "복사는 1건만 선택했을 때 가능합니다." : undefined}>
                복사
              </button>
            </form>
            <form action={deleteSelectedShipmentsAction}>
              {selectedIds.map((id) => <input key={id} type="hidden" name="ids" value={id} />)}
              <button
                className="btn text-red-700"
                onClick={(event) => {
                  if (!confirm(`${selectedCount}건을 삭제할까요?`)) event.preventDefault();
                }}
              >
                삭제
              </button>
            </form>
          </div>
        </div>
      ) : null}

      {groupRows.map(([owner, rows]) => {
        const aftercareRows = rows.filter((row) => row.status === "AFTERCARE");
        const normalRows = rows.filter((row) => row.status !== "AFTERCARE");
        const showAftercare = aftercareOwners.includes(owner);
        const visibleRows = showAftercare ? aftercareRows : normalRows;
        return (
        <details key={owner} open={owner === currentUserName} className="panel">
          <summary className="cursor-pointer px-4 py-3 font-medium">
            {owner} <span className="text-sm text-slate-500">({rows.length}건)</span>
          </summary>
          {aftercareRows.length ? (
            <div className="border-t border-slate-100 px-4 py-2">
              <button type="button" className={showAftercare ? "btn-primary px-3 py-1.5 text-xs" : "btn px-3 py-1.5 text-xs"} onClick={() => toggleAftercare(owner)}>
                사후관리 {aftercareRows.length}건
              </button>
              {showAftercare ? <button type="button" className="btn ml-2 px-3 py-1.5 text-xs" onClick={() => toggleAftercare(owner)}>일반 목록</button> : null}
            </div>
          ) : null}
          <div className="divide-y divide-slate-100">
            {visibleRows.map((shipment) => {
              const checked = selectedIds.includes(shipment.id);
              return (
                <div
                  key={shipment.id}
                  className={`flex cursor-grab items-center gap-3 px-4 py-3 ${checked ? "bg-blue-50" : "hover:bg-slate-50"}`}
                  draggable
                  onDragStart={() => setDraggingId(shipment.id)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => dropShipment(owner, shipment.id, visibleRows)}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(shipment.id)}
                    aria-label={`${shipment.title} 선택`}
                    className="h-4 w-4 cursor-pointer"
                  />
                  <Link href={`/shipments/${shipment.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                    <span className="min-w-0 flex-1 text-sm">
                      <b>{shipment.title}</b>{shipment.extra}
                      <span className="ml-2 text-xs text-slate-400">{shipment.factories.join(", ")}</span>
                    </span>
                    <span className="whitespace-nowrap text-sm font-medium text-slate-700">{shipment.currency} {shipment.amount}</span>
                    <span className="whitespace-nowrap text-xs text-slate-400">{shipment.updatedAt}</span>
                    <StatusBadge status={shipment.status} />
                  </Link>
                </div>
              );
            })}
            {!visibleRows.length ? <p className="px-4 py-3 text-sm text-slate-500">{showAftercare ? "사후관리 선적건이 없습니다." : "표시할 선적건이 없습니다."}</p> : null}
          </div>
        </details>
        );
      })}
    </div>
  );
}

const kanbanStatuses: Array<{ status: ShipmentStatus; label: string; tone: string }> = [
  { status: "REQUEST_WAITING", label: "의뢰대기", tone: "border-amber-200 bg-amber-50" },
  { status: "SCHEDULE", label: "1. 스케줄", tone: "border-sky-200 bg-sky-50" },
  { status: "QUOTE", label: "★견적", tone: "border-blue-200 bg-blue-50" },
  { status: "SHIPPING_DOCS", label: "2. 출고 및 선적/서류", tone: "border-indigo-200 bg-indigo-50" },
  { status: "NEGO_COLLECTION", label: "3. 네고 및 수금처리", tone: "border-violet-200 bg-violet-50" },
  { status: "AFTERCARE", label: "4. 사후관리", tone: "border-emerald-200 bg-emerald-50" }
];

export function ExportShipmentsKanbanClient({ groups, currentUserName }: { groups: [string, ShipmentRow[]][]; currentUserName: string }) {
  const [kanbanGroups, setKanbanGroups] = useState(groups);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  useEffect(() => {
    setKanbanGroups(groups);
  }, [groups]);

  async function moveShipment(owner: string, status: ShipmentStatus) {
    if (!draggingId) return;
    const formData = new FormData();
    formData.set("id", draggingId);
    formData.set("status", status);
    setKanbanGroups((current) =>
      current.map(([groupOwner, rows]) => [
        groupOwner,
        rows.map((row) => (groupOwner === owner && row.id === draggingId ? { ...row, status } : row))
      ])
    );
    const movedId = draggingId;
    setDraggingId(null);
    try {
      await updateShipmentKanbanStatusAction(formData);
    } catch {
      setKanbanGroups(groups);
      setDraggingId(movedId);
    }
  }

  return (
    <div className="space-y-3">
      {kanbanGroups.map(([owner, rows]) => (
        <details key={owner} open={owner === currentUserName} className="panel">
          <summary className="cursor-pointer px-4 py-3 font-medium">
            {owner} <span className="text-sm text-slate-500">({rows.length}건)</span>
          </summary>
          <div className="grid grid-cols-6 gap-2 border-t border-slate-100 p-3">
            {kanbanStatuses.map(({ status, label, tone }) => {
              const statusRows = rows.filter((row) => row.status === status);
              const visibleStatusRows = status === "AFTERCARE" ? statusRows.slice(0, 5) : statusRows;
              return (
                <section
                  key={status}
                  className={`min-h-[520px] min-w-0 rounded-lg border ${tone} p-2`}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => moveShipment(owner, status)}
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold leading-tight text-slate-800">{label}</h3>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500">{statusRows.length}</span>
                  </div>
                  <div className="space-y-2">
                    {visibleStatusRows.map((shipment) => (
                      <Link
                        key={shipment.id}
                        href={`/shipments/${shipment.id}`}
                        draggable
                        onDragStart={() => setDraggingId(shipment.id)}
                        onDragEnd={() => setDraggingId(null)}
                        className="block cursor-grab rounded-md border border-slate-200 bg-white p-2 text-xs shadow-sm hover:border-blue-300 hover:bg-blue-50 active:cursor-grabbing"
                      >
                        <p className="line-clamp-4 font-semibold leading-snug text-slate-900">{shipment.title}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{shipment.currency}{shipment.amount}</span>
                          {shipment.factories.length ? <span>{shipment.factories.join(", ")}</span> : null}
                          <span>{shipment.updatedAt}</span>
                        </div>
                      </Link>
                    ))}
                    {status === "AFTERCARE" && statusRows.length > 5 ? (
                      <p className="rounded-md border border-dashed border-emerald-200 bg-white/70 p-3 text-xs text-emerald-700">
                        최신 5건만 표시 중
                      </p>
                    ) : null}
                    {!statusRows.length ? <p className="rounded-md border border-dashed border-slate-200 bg-white/70 p-3 text-xs text-slate-400">선적건 없음</p> : null}
                  </div>
                </section>
              );
            })}
          </div>
        </details>
      ))}
    </div>
  );
}
