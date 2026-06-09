"use client";

import { useEffect, useRef, useState } from "react";

type RecipientOption = {
  id: string;
  name: string;
  teamLabel: string;
};

export function SalesRecipientsPicker({ users, initial = [] }: { users: RecipientOption[]; initial?: string[] }) {
  const [selected, setSelected] = useState<RecipientOption[]>(() => users.filter((user) => initial.includes(user.name)));
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedNames = selected.map((user) => user.name).join(", ");
  const remaining = users.filter((user) => !selected.some((item) => item.id === user.id));

  useEffect(() => {
    function close(event: MouseEvent) {
      if (containerRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function addRecipient(user: RecipientOption) {
    setSelected((current) => [...current, user]);
  }

  function removeRecipient(id: string) {
    setSelected((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <input type="hidden" name="salesEmailRecipients" value={selectedNames} />
      <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white px-2 py-1.5">
        {selected.map((user) => (
          <span key={user.id} className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-sm text-blue-700">
            {user.name}
            <button
              type="button"
              className="rounded-full px-1 text-blue-500 hover:bg-blue-100 hover:text-blue-800"
              onClick={() => removeRecipient(user.id)}
              aria-label={`${user.name} 제거`}
            >
              ×
            </button>
          </span>
        ))}
        <button
          type="button"
          className="ml-auto min-w-24 px-2 py-1 text-left text-sm text-slate-500"
          onClick={() => setOpen((current) => !current)}
        >
          {selected.length ? "수신자 추가 ▾" : "영업메일수신자 ▾"}
        </button>
      </div>
      {open ? (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border border-slate-200 bg-white p-1 shadow-lg">
          {remaining.map((user) => (
            <button
              key={user.id}
              type="button"
              className="block w-full rounded px-3 py-2 text-left text-sm hover:bg-blue-50"
              onClick={() => addRecipient(user)}
            >
              {user.name} <span className="text-slate-400">({user.teamLabel})</span>
            </button>
          ))}
          {remaining.length === 0 ? <p className="px-3 py-2 text-sm text-slate-500">모든 수신자가 선택되었습니다.</p> : null}
        </div>
      ) : null}
    </div>
  );
}
