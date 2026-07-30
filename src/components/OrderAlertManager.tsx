"use client";

import { Bell, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { SearchableCombobox } from "@/components/SearchableCombobox";
import { findRegisteredProduct, type ExportProductOption } from "@/lib/order-pi-import";
import { uniqueProductsForOwnerCountries } from "@/lib/order-alert-owner";
import {
  cancelOrderAlertAction,
  dismissOrderAlertAction,
  saveOrderAlertAction,
  type TriggeredOrderAlert,
  updateOrderAlertAction
} from "@/server/actions";

export type OrderAlertItem = {
  id: string;
  exportCountry: string;
  productName: string;
  content: string;
  createdAt: string;
};

export type CompletedOrderAlertItem = OrderAlertItem & {
  completedAt: string;
  completedReason: "cancelled" | "dismissed";
};

type OrderAlertContextValue = {
  showTriggeredAlerts: (alerts: TriggeredOrderAlert[]) => void;
};

const OrderAlertContext = createContext<OrderAlertContextValue | null>(null);

export function useOrderAlertTrigger() {
  return useContext(OrderAlertContext);
}

function listProductName(exportCountry: string, productName: string, products: ExportProductOption[]) {
  const matched = findRegisteredProduct(exportCountry, productName, products);
  if (matched) return matched.productName;
  return productName.split(" · ")[0]?.trim() || productName;
}

function matchesAlertSearch(
  alert: OrderAlertItem,
  query: string,
  products: ExportProductOption[]
) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const productLabel = listProductName(alert.exportCountry, alert.productName, products).toLowerCase();
  return alert.exportCountry.toLowerCase().includes(normalized) || productLabel.includes(normalized);
}

function ModalShell({
  title,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
      <div className="panel max-h-[85vh] w-full max-w-lg overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">{title}</h2>
          <button type="button" className="rounded-md p-1 text-slate-500 hover:bg-slate-100" onClick={onClose} aria-label="닫기">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AlertFormFields({
  countries,
  products,
  exportCountry,
  productName,
  content,
  countryOptional = false,
  productOptional = false,
  onCountryChange,
  onProductChange,
  onContentChange
}: {
  countries: string[];
  products: ExportProductOption[];
  exportCountry: string;
  productName: string;
  content: string;
  countryOptional?: boolean;
  productOptional?: boolean;
  onCountryChange: (value: string) => void;
  onProductChange: (value: string) => void;
  onContentChange: (value: string) => void;
}) {
  const countryOptions = useMemo(
    () => countries.map((country) => ({ value: country, label: country })),
    [countries]
  );
  const productOptions = useMemo(() => {
    if (exportCountry) {
      return products
        .filter((product) => product.exportCountry === exportCountry)
        .map((product) => ({
          value: product.productName,
          label: product.productName,
          searchText: product.productName
        }));
    }
    return uniqueProductsForOwnerCountries(countries, products).map((product) => ({
      value: product.productName,
      label: product.productName,
      searchText: product.productName
    }));
  }, [countries, exportCountry, products]);

  return (
    <div className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">국가</span>
        <SearchableCombobox
          name="exportCountry"
          value={exportCountry}
          onChange={onCountryChange}
          options={countryOptions}
          placeholder={countryOptional ? "선택(담당 전체 국가)" : "국가 선택"}
          registeredOnly
          allowClear={countryOptional}
        />
        {countryOptional ? (
          <p className="text-xs text-slate-500">국가를 비우면 담당 국가 중 해당 품목이 있는 모든 국가에 알림이 생성됩니다.</p>
        ) : null}
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">품목</span>
        <SearchableCombobox
          name="productName"
          value={productName}
          onChange={onProductChange}
          options={productOptions}
          placeholder={productOptional && exportCountry ? "선택(해당 국가 전체 품목)" : "품목 선택"}
          registeredOnly
          allowClear={productOptional && Boolean(exportCountry)}
        />
        {productOptional && exportCountry ? (
          <p className="text-xs text-slate-500">품목을 비우면 선택한 국가의 모든 품목에 알림이 생성됩니다.</p>
        ) : null}
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-slate-700">알림 내용</span>
        <textarea
          name="content"
          value={content}
          onChange={(event) => onContentChange(event.target.value)}
          rows={5}
          className="w-full"
          placeholder="해당 국가·품목 오더 입력 시 보여줄 내용"
        />
      </label>
    </div>
  );
}

function AlertListCard({
  alert,
  products,
  readOnly,
  onEdit,
  onCancel
}: {
  alert: OrderAlertItem | CompletedOrderAlertItem;
  products: ExportProductOption[];
  readOnly?: boolean;
  onEdit?: () => void;
  onCancel?: () => void;
}) {
  const completed = "completedReason" in alert;
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">
            {alert.exportCountry} · {listProductName(alert.exportCountry, alert.productName, products)}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{alert.content}</p>
          {completed ? (
            <p className="mt-2 text-xs text-slate-500">
              {alert.completedReason === "cancelled" ? "취소됨" : "확인 완료"} ·{" "}
              {new Date(alert.completedAt).toLocaleDateString("ko-KR")}
            </p>
          ) : null}
        </div>
        {!readOnly && onEdit && onCancel ? (
          <div className="flex shrink-0 gap-2">
            <button type="button" className="btn px-2 py-1 text-xs" onClick={onEdit}>
              수정
            </button>
            <button type="button" className="btn px-2 py-1 text-xs text-red-600" onClick={onCancel}>
              취소
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function OrderAlertProvider({
  owner,
  countries,
  products,
  initialAlerts,
  initialCompletedAlerts,
  children
}: {
  owner: string;
  countries: string[];
  products: ExportProductOption[];
  initialAlerts: OrderAlertItem[];
  initialCompletedAlerts: CompletedOrderAlertItem[];
  children: ReactNode;
}) {
  const router = useRouter();
  const [alerts, setAlerts] = useState(initialAlerts);
  const [completedAlerts, setCompletedAlerts] = useState(initialCompletedAlerts);
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelView, setPanelView] = useState<"list" | "create" | "edit">("list");
  const [showCompleted, setShowCompleted] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editing, setEditing] = useState<OrderAlertItem | null>(null);
  const [triggered, setTriggered] = useState<TriggeredOrderAlert[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [exportCountry, setExportCountry] = useState("");
  const [productName, setProductName] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    setAlerts(initialAlerts);
  }, [initialAlerts]);

  useEffect(() => {
    setCompletedAlerts(initialCompletedAlerts);
  }, [initialCompletedAlerts]);

  const resetForm = useCallback(() => {
    setExportCountry("");
    setProductName("");
    setContent("");
    setMessage("");
  }, []);

  const openPanel = useCallback(() => {
    setPanelView("list");
    setShowCompleted(false);
    setSearchQuery("");
    setEditing(null);
    setMessage("");
    setPanelOpen(true);
  }, []);

  const openCreate = useCallback(() => {
    resetForm();
    setEditing(null);
    setPanelView("create");
    setPanelOpen(true);
  }, [resetForm]);

  const openEdit = useCallback((alert: OrderAlertItem) => {
    setEditing(alert);
    setExportCountry(alert.exportCountry);
    setProductName(alert.productName);
    setContent(alert.content);
    setMessage("");
    setPanelView("edit");
    setPanelOpen(true);
  }, []);

  const showTriggeredAlerts = useCallback((items: TriggeredOrderAlert[]) => {
    if (items.length) setTriggered(items);
  }, []);

  const visibleAlerts = useMemo(() => {
    const source = showCompleted ? completedAlerts : alerts;
    return source.filter((alert) => matchesAlertSearch(alert, searchQuery, products));
  }, [alerts, completedAlerts, products, searchQuery, showCompleted]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    formData.set("owner", owner);
    const result = await saveOrderAlertAction(formData);
    setSaving(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setPanelView("list");
    setShowCompleted(false);
    resetForm();
    router.refresh();
  }

  async function handleUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setSaving(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    formData.set("owner", owner);
    formData.set("id", editing.id);
    const result = await updateOrderAlertAction(formData);
    setSaving(false);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setPanelView("list");
    setEditing(null);
    resetForm();
    router.refresh();
  }

  async function handleCancel(id: string) {
    if (!window.confirm("이 알림을 취소하시겠습니까?")) return;
    const formData = new FormData();
    formData.set("id", id);
    await cancelOrderAlertAction(formData);
    setAlerts((current) => current.filter((item) => item.id !== id));
    router.refresh();
  }

  async function dismissTriggered(alert: TriggeredOrderAlert, dismissType: "PERMANENT" | "LATER") {
    const formData = new FormData();
    formData.set("alertId", alert.alertId);
    formData.set("orderEntryId", alert.orderEntryId);
    formData.set("dismissType", dismissType);
    await dismissOrderAlertAction(formData);
    setTriggered((current) => {
      const next = current.filter((item) => !(item.alertId === alert.alertId && item.orderEntryId === alert.orderEntryId));
      if (!next.length) router.refresh();
      return next;
    });
  }

  return (
    <OrderAlertContext.Provider value={{ showTriggeredAlerts }}>
      {children}

      <div className="fixed bottom-6 right-6 z-40">
        <button
          type="button"
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-white shadow-lg shadow-red-200 hover:bg-red-700"
          onClick={openPanel}
          aria-label="오더 알림"
        >
          <Bell className="h-6 w-6" />
        </button>
      </div>

      {panelOpen && panelView === "list" ? (
        <ModalShell title={showCompleted ? "완료된 알림" : "오더 알림"} onClose={() => setPanelOpen(false)}>
          <div className="space-y-4">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="국가 또는 품목 검색"
                className="h-11 w-full pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                className={`btn px-3 py-1.5 text-sm ${showCompleted ? "btn-primary" : ""}`}
                onClick={() => setShowCompleted((current) => !current)}
              >
                {showCompleted ? "예정 알림" : "완료된 알림"}
              </button>
              {!showCompleted ? (
                <button type="button" className="btn-primary px-4 py-2 text-sm" onClick={openCreate}>
                  알림 등록
                </button>
              ) : null}
            </div>
            <div className="space-y-3">
              {visibleAlerts.length ? (
                visibleAlerts.map((alert) => (
                  <AlertListCard
                    key={alert.id}
                    alert={alert}
                    products={products}
                    readOnly={showCompleted}
                    onEdit={showCompleted ? undefined : () => openEdit(alert)}
                    onCancel={showCompleted ? undefined : () => void handleCancel(alert.id)}
                  />
                ))
              ) : (
                <p className="text-sm text-slate-500">
                  {showCompleted ? "완료된 알림이 없습니다." : "등록된 알림이 없습니다."}
                </p>
              )}
            </div>
          </div>
        </ModalShell>
      ) : null}

      {panelOpen && panelView === "create" ? (
        <ModalShell title="오더 알림 등록" onClose={() => setPanelView("list")}>
          <form className="space-y-4" onSubmit={handleCreate}>
            <AlertFormFields
              countries={countries}
              products={products}
              exportCountry={exportCountry}
              productName={productName}
              content={content}
              countryOptional
              productOptional
              onCountryChange={setExportCountry}
              onProductChange={setProductName}
              onContentChange={setContent}
            />
            {message ? <p className="text-sm text-red-600">{message}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setPanelView("list")}>
                목록
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                저장
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {panelOpen && panelView === "edit" && editing ? (
        <ModalShell title="오더 알림 수정" onClose={() => setPanelView("list")}>
          <form className="space-y-4" onSubmit={handleUpdate}>
            <AlertFormFields
              countries={countries}
              products={products}
              exportCountry={exportCountry}
              productName={productName}
              content={content}
              onCountryChange={setExportCountry}
              onProductChange={setProductName}
              onContentChange={setContent}
            />
            {message ? <p className="text-sm text-red-600">{message}</p> : null}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => setPanelView("list")}>
                목록
              </button>
              <button type="submit" className="btn-primary" disabled={saving}>
                수정 저장
              </button>
            </div>
          </form>
        </ModalShell>
      ) : null}

      {triggered.length ? (
        <ModalShell title="오더 알림" onClose={() => setTriggered([])}>
          <div className="space-y-4">
            {triggered.map((alert) => (
              <div key={`${alert.alertId}:${alert.orderEntryId}`} className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="font-semibold text-slate-900">
                  {alert.exportCountry} · {listProductName(alert.exportCountry, alert.productName, products)}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{alert.content}</p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <button type="button" className="btn px-3 py-1.5 text-sm" onClick={() => void dismissTriggered(alert, "LATER")}>
                    다음에 또 보기
                  </button>
                  <button
                    type="button"
                    className="btn-primary px-3 py-1.5 text-sm"
                    onClick={() => void dismissTriggered(alert, "PERMANENT")}
                  >
                    다시 보지 않기
                  </button>
                </div>
              </div>
            ))}
          </div>
        </ModalShell>
      ) : null}
    </OrderAlertContext.Provider>
  );
}
