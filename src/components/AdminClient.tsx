"use client";

import { DropdownCategory, Factory, Team } from "@prisma/client";
import { GripVertical } from "lucide-react";
import { useEffect, useState } from "react";
import { CountryCombobox } from "@/components/CountryCombobox";
import { SalesRecipientsPicker } from "@/components/SalesRecipientsPicker";
import { changePasswordAction, deleteAccountAction, deleteGenericAction, reorderDropdownAction, upsertBuyerMasterAction, upsertDropdownAction, upsertProductMasterAction } from "@/server/actions";

type UserRow = { id: string; name: string; email: string; team: Team; createdAt: string };
type ProductRow = { id: string; name: string; factory: Factory };
type BuyerRow = { id: string; exportCountry: string; buyerName: string; defaultCurrency: string | null; salesOwner: string | null; exportOwner: string | null; salesEmailRecipients: string | null };
type DropdownRow = { id: string; category: DropdownCategory; label: string; value: string; sortOrder: number };

const INITIAL_VISIBLE_COUNT = 5;
const LOAD_MORE_COUNT = 10;

const dropdownLabels: Record<DropdownCategory, string> = {
  EXPORT_COUNTRY: "수출국",
  TRANSPORT: "운송",
  DESTINATION_PORT: "목적항",
  STORAGE_CONDITION: "보관조건",
  INCOTERMS: "인코텀즈",
  PAYMENT_TERM: "결제조건",
  DEPOSIT_STATUS: "입금상황",
  BANK: "\uC740\uD589",
  CURRENCY: "통화",
  FORWARDER: "포워딩",
  DEPARTURE_PORT: "출발항"
};

const localTeamLabels: Record<Team, string> = {
  OVERSEAS_MARKETING: "해외마케팅팀",
  OVERSEAS_SALES_SUPPORT: "해외영업지원팀",
  OVERSEAS_SALES: "해외영업팀",
  SEOMYEON_QA: "서면공장",
  JEONDONG_QA: "전동공장",
  OVERSEAS_BRANCH: "해외지사"
};

export function AdminClient({
  products,
  buyers,
  dropdowns,
  users,
  error,
  success
}: {
  products: ProductRow[];
  buyers: BuyerRow[];
  dropdowns: DropdownRow[];
  users: UserRow[];
  error?: string;
  success?: string;
}) {
  const exportOwners = users.filter((user) => user.team === Team.OVERSEAS_SALES_SUPPORT);
  const salesOwners = users.filter((user) => user.team === Team.OVERSEAS_MARKETING || user.team === Team.OVERSEAS_SALES);
  const salesMailTeams: Team[] = [Team.OVERSEAS_MARKETING, Team.OVERSEAS_SALES, Team.OVERSEAS_BRANCH];
  const salesMailUsers = users.filter((user) => salesMailTeams.includes(user.team));
  const [category, setCategory] = useState<DropdownCategory>(DropdownCategory.EXPORT_COUNTRY);
  const [orderedDropdowns, setOrderedDropdowns] = useState(dropdowns);
  const [team, setTeam] = useState<Team>(Team.OVERSEAS_MARKETING);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [buyerFormKey, setBuyerFormKey] = useState(0);
  const [productSearch, setProductSearch] = useState("");
  const [buyerSearch, setBuyerSearch] = useState("");
  const [dropdownSearch, setDropdownSearch] = useState("");
  const [visibleProductCount, setVisibleProductCount] = useState(INITIAL_VISIBLE_COUNT);
  const [visibleBuyerCount, setVisibleBuyerCount] = useState(INITIAL_VISIBLE_COUNT);
  const [visibleDropdownCount, setVisibleDropdownCount] = useState(INITIAL_VISIBLE_COUNT);

  const visibleDropdowns = orderedDropdowns.filter((item) => item.category === category).sort((a, b) => a.sortOrder - b.sortOrder);
  const teamUsers = users.filter((user) => user.team === team);
  const countries = orderedDropdowns.filter((item) => item.category === DropdownCategory.EXPORT_COUNTRY).sort((a, b) => a.sortOrder - b.sortOrder).map((item) => item.label);
  const filteredProducts = products.filter((product) => {
    const keyword = productSearch.trim().toLowerCase();
    if (!keyword) return true;
    const factoryLabel = product.factory === Factory.JEONDONG ? "전동" : "서면";
    return `${product.name} ${factoryLabel}`.toLowerCase().includes(keyword);
  });
  const filteredBuyers = buyers.filter((buyer) => {
    const keyword = buyerSearch.trim().toLowerCase();
    if (!keyword) return true;
    return [
      buyer.exportCountry,
      buyer.buyerName,
      buyer.defaultCurrency ?? "",
      buyer.salesOwner ?? "",
      buyer.exportOwner ?? "",
      buyer.salesEmailRecipients ?? ""
    ].join(" ").toLowerCase().includes(keyword);
  });
  const filteredDropdowns = visibleDropdowns.filter((item) => `${item.label} ${item.value}`.toLowerCase().includes(dropdownSearch.trim().toLowerCase()));
  const displayedProducts = filteredProducts.slice(0, visibleProductCount);
  const displayedBuyers = filteredBuyers.slice(0, visibleBuyerCount);
  const displayedDropdowns = filteredDropdowns.slice(0, visibleDropdownCount);

  useEffect(() => setOrderedDropdowns(dropdowns), [dropdowns]);
  useEffect(() => {
    if (error) alert(error);
  }, [error]);
  useEffect(() => setVisibleProductCount(INITIAL_VISIBLE_COUNT), [productSearch, products]);
  useEffect(() => setVisibleBuyerCount(INITIAL_VISIBLE_COUNT), [buyerSearch, buyers]);
  useEffect(() => setVisibleDropdownCount(INITIAL_VISIBLE_COUNT), [dropdownSearch, category, dropdowns]);

  async function persistDropdownOrder(items: DropdownRow[]) {
    const formData = new FormData();
    formData.set("ids", items.map((item) => item.id).join(","));
    await reorderDropdownAction(formData);
  }

  function moveDropdown(id: string, direction: -1 | 1) {
    const index = visibleDropdowns.findIndex((item) => item.id === id);
    const target = index + direction;
    if (target < 0 || target >= visibleDropdowns.length) return;
    const nextVisible = [...visibleDropdowns];
    [nextVisible[index], nextVisible[target]] = [nextVisible[target], nextVisible[index]];
    const normalized = nextVisible.map((item, order) => ({ ...item, sortOrder: order }));
    setOrderedDropdowns((current) => [...current.filter((item) => item.category !== category), ...normalized]);
    void persistDropdownOrder(normalized);
  }

  function dropDropdown(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const from = visibleDropdowns.findIndex((item) => item.id === draggingId);
    const to = visibleDropdowns.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const nextVisible = [...visibleDropdowns];
    const [moved] = nextVisible.splice(from, 1);
    nextVisible.splice(to, 0, moved);
    const normalized = nextVisible.map((item, order) => ({ ...item, sortOrder: order }));
    setOrderedDropdowns((current) => [...current.filter((item) => item.category !== category), ...normalized]);
    void persistDropdownOrder(normalized);
    setDraggingId(null);
  }

  async function createBuyer(formData: FormData) {
    await upsertBuyerMasterAction(formData);
    setBuyerFormKey((current) => current + 1);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">관리 페이지</h1>
        <p className="mt-1 text-sm text-slate-500">팀 업무에 필요한 마스터 데이터를 관리합니다.</p>
        {error ? <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}
        {success ? <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{success}</p> : null}
      </div>

      <section className="grid grid-cols-2 gap-5">
        <div className="panel p-5">
          <h2 className="text-base font-semibold">제품 마스터 관리</h2>
          <form action={upsertProductMasterAction} className="mt-4 grid grid-cols-3 gap-3">
            <input name="name" placeholder="제품명" required />
            <input type="hidden" name="costGroupCode" value="" />
            <select name="factory" defaultValue={Factory.JEONDONG}>
              <option value={Factory.JEONDONG}>전동</option>
              <option value={Factory.SEOMYEON}>서면</option>
            </select>
            <button className="btn-primary">추가</button>
          </form>
          <SearchBox value={productSearch} onChange={setProductSearch} placeholder="제품명 또는 공장 검색" />
          <div className="mt-4 divide-y divide-slate-100">
            {displayedProducts.map((product) => <EditableProduct key={product.id} product={product} />)}
            {filteredProducts.length === 0 ? <p className="py-3 text-sm text-slate-500">검색 결과가 없습니다.</p> : null}
          </div>
          <LoadMoreButton shown={displayedProducts.length} total={filteredProducts.length} onClick={() => setVisibleProductCount((current) => current + LOAD_MORE_COUNT)} />
        </div>

        <div className="panel p-5">
          <h2 className="text-base font-semibold">팀별 이메일 목록 관리</h2>
          <select className="mt-4" value={team} onChange={(event) => setTeam(event.target.value as Team)}>
            {Object.values(Team).map((value) => (
              <option key={value} value={value}>{localTeamLabels[value]}</option>
            ))}
          </select>
          <div className="mt-4 divide-y divide-slate-100">
            {teamUsers.map((user) => (
              <div key={user.id} className="grid grid-cols-2 gap-3 py-2 text-sm">
                <span>{user.name}</span>
                <span>{user.email}</span>
              </div>
            ))}
            {!teamUsers.length ? <p className="py-3 text-sm text-slate-500">등록된 사용자가 없습니다.</p> : null}
          </div>
        </div>
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">바이어 마스터 관리</h2>
        <p className="mt-1 text-sm text-slate-500">수출 담당자는 해외영업지원팀, 영업메일수신자는 해외마케팅팀/해외영업팀/해외지사 사용자 중 선택합니다.</p>
        <form key={buyerFormKey} action={createBuyer} className="mt-4 grid grid-cols-[190px_170px_110px_135px_135px_minmax(210px,1fr)_120px] items-start gap-2">
          <CountryCombobox name="exportCountry" countries={countries} />
          <input className="h-11" name="buyerName" placeholder="바이어명" required />
          <CurrencySelect />
          <SalesOwnerSelect users={salesOwners} />
          <OwnerSelect users={exportOwners} />
          <SalesRecipientsPicker users={salesMailUsers.map((user) => ({ id: user.id, name: user.name, teamLabel: localTeamLabels[user.team] }))} />
          <button className="btn-primary h-11">추가</button>
        </form>
        <SearchBox value={buyerSearch} onChange={setBuyerSearch} placeholder="수출국, 바이어명, 담당자 검색" />
        <div className="mt-4 divide-y divide-slate-100">
          {displayedBuyers.map((buyer) => (
            <EditableBuyer key={buyer.id} buyer={buyer} salesOwners={salesOwners} exportOwners={exportOwners} salesMailUsers={salesMailUsers} countries={countries} />
          ))}
          {filteredBuyers.length === 0 ? <p className="py-3 text-sm text-slate-500">검색 결과가 없습니다.</p> : null}
        </div>
        <LoadMoreButton shown={displayedBuyers.length} total={filteredBuyers.length} onClick={() => setVisibleBuyerCount((current) => current + LOAD_MORE_COUNT)} />
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">공통 드롭다운 관리</h2>
        <div className="mt-4 flex items-end gap-3">
          <div className="field">
            <label>목차</label>
            <select value={category} onChange={(event) => setCategory(event.target.value as DropdownCategory)}>
              {Object.entries(dropdownLabels).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
          <form action={upsertDropdownAction} className="flex items-end gap-3">
            <input type="hidden" name="category" value={category} />
            <input type="hidden" name="sortOrder" value={visibleDropdowns.length} />
            <div className="field">
              <label>추가</label>
              <input name="label" placeholder={category === DropdownCategory.FORWARDER ? "포워딩사" : `${dropdownLabels[category]} 추가`} required />
            </div>
            {category === DropdownCategory.FORWARDER ? <ForwarderValueFields /> : null}
            <button className="btn-primary">추가</button>
          </form>
        </div>
        <SearchBox value={dropdownSearch} onChange={setDropdownSearch} placeholder={`${dropdownLabels[category]} 검색`} />
        <div className="mt-4 divide-y divide-slate-100">
          {displayedDropdowns.map((item) => (
            <EditableDropdown key={item.id} item={item} onMove={moveDropdown} onDragStart={setDraggingId} onDrop={dropDropdown} />
          ))}
          {filteredDropdowns.length === 0 ? <p className="py-3 text-sm text-slate-500">검색 결과가 없습니다.</p> : null}
        </div>
        <LoadMoreButton shown={displayedDropdowns.length} total={filteredDropdowns.length} onClick={() => setVisibleDropdownCount((current) => current + LOAD_MORE_COUNT)} />
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">내 비밀번호 변경 및 탈퇴</h2>
        <form className="mt-4 grid grid-cols-[1fr_1fr_1fr_auto_auto] items-end gap-3">
          <div className="field">
            <label>현재 비밀번호</label>
            <input id="account-current-password" name="currentPassword" type="password" autoComplete="current-password" />
          </div>
          <div className="field">
            <label>변경 비밀번호</label>
            <input name="newPassword" type="password" autoComplete="new-password" minLength={8} />
          </div>
          <div className="field">
            <label>변경 비밀번호 확인</label>
            <input name="newPasswordConfirm" type="password" autoComplete="new-password" minLength={8} />
          </div>
          <button formAction={changePasswordAction} className="btn-primary h-11 px-5">변경</button>
          <button
            formAction={deleteAccountAction}
            className="btn h-11 px-5 text-red-700"
            onClick={(event) => {
              const password = document.getElementById("account-current-password") as HTMLInputElement | null;
              if (!password?.value.trim()) {
                event.preventDefault();
                alert("현재 비밀번호를 입력해주세요");
                return;
              }
              if (!confirm("정말 탈퇴하시겠습니까?")) event.preventDefault();
            }}
          >
            회원탈퇴
          </button>
        </form>
      </section>

      <section className="panel p-5">
        <h2 className="text-base font-semibold">사용자 목록 조회</h2>
        <div className="mt-3 divide-y divide-slate-100">
          {users.map((user) => (
            <div key={user.id} className="grid grid-cols-4 gap-3 py-2 text-sm">
              <span>{user.name}</span>
              <span>{user.email}</span>
              <span>{localTeamLabels[user.team]}</span>
              <span>{user.createdAt}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <div className="mt-4 flex items-center gap-2">
      <input className="h-10 max-w-md" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
      {value ? (
        <button className="btn h-10 px-3" type="button" onClick={() => onChange("")}>
          초기화
        </button>
      ) : null}
    </div>
  );
}

function LoadMoreButton({ shown, total, onClick }: { shown: number; total: number; onClick: () => void }) {
  if (total <= shown) return null;
  return (
    <div className="mt-4 flex justify-center">
      <button className="btn h-10 px-5" type="button" onClick={onClick}>
        더보기 {shown}/{total}
      </button>
    </div>
  );
}

function ForwarderValueFields({ defaultValue = "", compact = false }: { defaultValue?: string; compact?: boolean }) {
  return (
    <div className={compact ? "" : "field min-w-80"}>
      {!compact ? <label>이메일/견적조건</label> : null}
      <input name="value" defaultValue={defaultValue} placeholder="이메일 또는 견적X" required />
    </div>
  );
}

function CurrencySelect({ defaultValue = "USD" }: { defaultValue?: string | null }) {
  return (
    <select className="h-11" name="defaultCurrency" defaultValue={defaultValue ?? "USD"} aria-label="기본 통화">
      <option value="USD">USD</option>
      <option value="EUR">EUR</option>
      <option value="KRW">KRW</option>
    </select>
  );
}

function OwnerSelect({ users, defaultValue = "" }: { users: UserRow[]; defaultValue?: string | null }) {
  return (
    <select className="h-11" name="exportOwner" defaultValue={defaultValue ?? ""} required>
      <option value="">수출 담당자</option>
      {users.map((user) => <option key={user.id} value={user.name}>{user.name}</option>)}
    </select>
  );
}

function SalesOwnerSelect({ users, defaultValue = "" }: { users: UserRow[]; defaultValue?: string | null }) {
  return (
    <select className="h-11" name="salesOwner" defaultValue={defaultValue ?? ""} required>
      <option value="">영업 담당자</option>
      {users.map((user) => <option key={user.id} value={user.name}>{user.name}</option>)}
    </select>
  );
}

function EditableProduct({ product }: { product: ProductRow }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    async function save(formData: FormData) {
      await upsertProductMasterAction(formData);
      setEditing(false);
    }
    return (
      <form action={save} className="grid grid-cols-[1fr_140px] gap-3 py-2 text-sm">
        <input type="hidden" name="id" value={product.id} />
        <input type="hidden" name="costGroupCode" value="" />
        <input name="name" defaultValue={product.name} required />
        <select name="factory" defaultValue={product.factory}>
          <option value={Factory.JEONDONG}>전동</option>
          <option value={Factory.SEOMYEON}>서면</option>
        </select>
        <div className="col-span-2 flex justify-end gap-2">
          <button className="btn-primary">저장</button>
        </div>
      </form>
    );
  }
  return <ReadRow cols={[product.name, product.factory === Factory.JEONDONG ? "전동" : "서면"]} model="product" id={product.id} onEdit={() => setEditing(true)} />;
}

function EditableBuyer({ buyer, salesOwners, exportOwners, salesMailUsers, countries }: { buyer: BuyerRow; salesOwners: UserRow[]; exportOwners: UserRow[]; salesMailUsers: UserRow[]; countries: string[] }) {
  const [editing, setEditing] = useState(false);
  const initial = buyer.salesEmailRecipients?.split(",").map((item) => item.trim()).filter(Boolean) ?? [];
  if (editing) {
    async function save(formData: FormData) {
      await upsertBuyerMasterAction(formData);
      setEditing(false);
    }
    return (
      <form action={save} className="grid grid-cols-[190px_170px_110px_135px_135px_minmax(210px,1fr)_120px] items-start gap-2 py-2 text-sm">
        <input type="hidden" name="id" value={buyer.id} />
        <CountryCombobox name="exportCountry" countries={countries} defaultValue={buyer.exportCountry} />
        <input className="h-11" name="buyerName" defaultValue={buyer.buyerName} required />
        <CurrencySelect defaultValue={buyer.defaultCurrency} />
        <SalesOwnerSelect users={salesOwners} defaultValue={buyer.salesOwner} />
        <OwnerSelect users={exportOwners} defaultValue={buyer.exportOwner} />
        <SalesRecipientsPicker users={salesMailUsers.map((user) => ({ id: user.id, name: user.name, teamLabel: localTeamLabels[user.team] }))} initial={initial} />
        <div>
          <button className="btn-primary h-11">저장</button>
        </div>
      </form>
    );
  }
  return <ReadRow cols={[buyer.exportCountry, buyer.buyerName, buyer.defaultCurrency ?? "USD", `영업: ${buyer.salesOwner ?? "-"}`, `수출: ${buyer.exportOwner ?? "-"}`, `영업메일: ${buyer.salesEmailRecipients ?? "-"}`]} model="buyer" id={buyer.id} onEdit={() => setEditing(true)} />;
}

function EditableDropdown({
  item,
  onMove,
  onDragStart,
  onDrop
}: {
  item: DropdownRow;
  onMove: (id: string, direction: -1 | 1) => void;
  onDragStart: (id: string) => void;
  onDrop: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    async function save(formData: FormData) {
      await upsertDropdownAction(formData);
      setEditing(false);
    }
    return (
      <form action={save} className={`grid gap-3 py-2 text-sm ${item.category === DropdownCategory.FORWARDER ? "grid-cols-[1fr_220px_auto]" : "grid-cols-[1fr_auto]"}`}>
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="category" value={item.category} />
        <input type="hidden" name="sortOrder" value={item.sortOrder} />
        <input name="label" defaultValue={item.label} placeholder={item.category === DropdownCategory.FORWARDER ? "포워딩사" : undefined} required />
        {item.category === DropdownCategory.FORWARDER ? <ForwarderValueFields defaultValue={item.value === item.label ? "" : item.value} compact /> : null}
        <button className="btn-primary">저장</button>
      </form>
    );
  }
  return (
    <div
      className="flex cursor-grab items-center justify-between gap-3 py-2 text-sm"
      draggable
      onDragStart={() => onDragStart(item.id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={() => onDrop(item.id)}
    >
      <div className="flex items-center gap-2">
        <GripVertical size={16} className="text-slate-400" />
        <button className="btn px-2 py-1" type="button" onClick={() => onMove(item.id, -1)}>위</button>
        <button className="btn px-2 py-1" type="button" onClick={() => onMove(item.id, 1)}>아래</button>
        <span>{item.label}</span>
        {item.category === DropdownCategory.FORWARDER && item.value !== item.label ? <span className="text-slate-500">{item.value}</span> : null}
      </div>
      <RowActions id={item.id} model="dropdown" onEdit={() => setEditing(true)} />
    </div>
  );
}

function ReadRow({ cols, id, model, onEdit }: { cols: string[]; id: string; model: string; onEdit: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 text-sm">
      <div className="flex flex-wrap gap-3">{cols.map((col, index) => <span key={index}>{col}</span>)}</div>
      <RowActions id={id} model={model} onEdit={onEdit} />
    </div>
  );
}

function RowActions({ id, model, onEdit }: { id: string; model: string; onEdit: () => void }) {
  return (
    <div className="flex gap-2">
      <button className="btn" type="button" onClick={onEdit}>수정</button>
      <form action={deleteGenericAction}>
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="model" value={model} />
        <button className="btn text-red-700" onClick={(event) => !confirm("정말 삭제할까요?") && event.preventDefault()}>삭제</button>
      </form>
    </div>
  );
}
