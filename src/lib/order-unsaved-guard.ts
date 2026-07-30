export type OrderUnsavedGuardApi = {
  isDirty: boolean;
  save: () => Promise<boolean>;
  discard: () => void;
};

let guardApi: OrderUnsavedGuardApi | null = null;
let pendingHref: string | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) {
    listener();
  }
}

export function registerOrderUnsavedGuard(api: OrderUnsavedGuardApi | null) {
  guardApi = api;
  notify();
}

export function getOrderUnsavedGuard() {
  return guardApi;
}

export function getPendingOrderNavigation() {
  return pendingHref;
}

export function subscribeOrderUnsavedGuard(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearPendingOrderNavigation() {
  pendingHref = null;
  notify();
}

export function attemptOrderNavigation(href: string, navigate: (href: string) => void) {
  if (!guardApi?.isDirty) {
    navigate(href);
    return;
  }
  pendingHref = href;
  notify();
}
