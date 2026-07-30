"use client";

import { useState, useTransition } from "react";
import { ackOrderLeaderNoteAction } from "@/server/actions";

export type LeaderNoteAlertItem = {
  orderEntryId: string;
  exportCountry: string;
  buyer: string;
  piNo: string;
  productName: string;
  leaderNote: string;
};

export function OrderLeaderNoteAlerts({
  owner,
  alerts: initialAlerts
}: {
  owner: string;
  alerts: LeaderNoteAlertItem[];
}) {
  const [queue, setQueue] = useState(initialAlerts);
  const [showAgain, setShowAgain] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = queue[0];

  if (!current) return null;

  function confirm() {
    const target = queue[0];
    if (!target) return;
    const keep = showAgain;
    startTransition(async () => {
      await ackOrderLeaderNoteAction({
        orderEntryId: target.orderEntryId,
        noteSnapshot: target.leaderNote,
        showAgain: keep,
        owner
      });
      setShowAgain(false);
      setQueue((currentQueue) => currentQueue.slice(1));
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-lg rounded-lg border border-slate-200 bg-white shadow-xl">
        <div className="border-b border-slate-200 px-5 py-3">
          <h2 className="text-base font-semibold text-slate-900">팀장의견</h2>
          <p className="mt-1 text-xs text-slate-500">
            {queue.length > 1 ? `남은 알림 ${queue.length}건` : "확인이 필요한 팀장의견입니다."}
          </p>
        </div>
        <div className="space-y-2 px-5 py-4 text-sm text-slate-800">
          <p>
            <span className="font-semibold text-slate-500">국가</span> {current.exportCountry || "-"}
          </p>
          <p>
            <span className="font-semibold text-slate-500">거래처</span> {current.buyer || "-"}
          </p>
          <p>
            <span className="font-semibold text-slate-500">PI No.</span> {current.piNo || "-"}
          </p>
          <p>
            <span className="font-semibold text-slate-500">제품명</span> {current.productName || "-"}
          </p>
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 whitespace-pre-wrap text-amber-950">
            <p className="mb-1 text-xs font-semibold text-amber-800">팀장의견</p>
            {current.leaderNote}
          </div>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-3">
          <label className="inline-flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={showAgain}
              onChange={(event) => setShowAgain(event.target.checked)}
              disabled={pending}
            />
            이 의견 또 보기
          </label>
          <button type="button" className="btn-primary px-5" onClick={confirm} disabled={pending}>
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
