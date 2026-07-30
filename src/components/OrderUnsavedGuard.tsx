"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ComponentProps, type MouseEvent } from "react";
import {
  attemptOrderNavigation,
  clearPendingOrderNavigation,
  getOrderUnsavedGuard,
  getPendingOrderNavigation,
  subscribeOrderUnsavedGuard
} from "@/lib/order-unsaved-guard";

function normalizeNavigationUrl(href: string) {
  try {
    const url = new URL(href, window.location.origin);
    return `${url.pathname}${url.search}`;
  } catch {
    return href;
  }
}

export function OrderUnsavedGuardHost() {
  const router = useRouter();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const sync = () => setPendingHref(getPendingOrderNavigation());
    sync();
    return subscribeOrderUnsavedGuard(sync);
  }, []);

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!getOrderUnsavedGuard()?.isDirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  if (!pendingHref) return null;

  async function confirmSave() {
    const guard = getOrderUnsavedGuard();
    if (!guard) return;
    setIsSaving(true);
    try {
      const ok = await guard.save();
      if (!ok) return;
      const href = pendingHref;
      clearPendingOrderNavigation();
      if (href) router.push(href);
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDiscard() {
    const guard = getOrderUnsavedGuard();
    if (!guard) return;
    guard.discard();
    const href = pendingHref;
    clearPendingOrderNavigation();
    if (href) router.push(href);
  }

  function cancelNavigation() {
    clearPendingOrderNavigation();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/45 p-4">
      <div className="panel w-full max-w-sm p-5">
        <p className="text-base font-semibold text-slate-950">변경사항을 저장하시겠습니까?</p>
        <p className="mt-2 text-sm text-slate-600">저장하지 않으면 수정한 오더 내용이 사라집니다.</p>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="btn" onClick={cancelNavigation} disabled={isSaving}>
            취소
          </button>
          <button type="button" className="btn" onClick={confirmDiscard} disabled={isSaving}>
            저장 안 함
          </button>
          <button type="button" className="btn-primary" onClick={confirmSave} disabled={isSaving}>
            {isSaving ? "저장 중..." : "저장"}
          </button>
        </div>
      </div>
    </div>
  );
}

type GuardedLinkProps = ComponentProps<typeof Link>;

export function GuardedLink({ href, onClick, ...props }: GuardedLinkProps) {
  const router = useRouter();
  const targetHref = typeof href === "string" ? href : `${href.pathname ?? ""}${href.search ?? ""}`;

  return (
    <Link
      {...props}
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        event.preventDefault();
        const currentHref = `${window.location.pathname}${window.location.search}`;
        if (normalizeNavigationUrl(targetHref) === normalizeNavigationUrl(currentHref)) return;
        attemptOrderNavigation(targetHref, (nextHref) => router.push(nextHref));
      }}
    />
  );
}
