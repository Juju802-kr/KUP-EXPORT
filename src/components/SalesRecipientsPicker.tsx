"use client";

import { useState } from "react";

type RecipientOption = {
  id: string;
  name: string;
  teamLabel: string;
};

export function SalesRecipientsPicker({ users, initial = [] }: { users: RecipientOption[]; initial?: string[] }) {
  const [selected, setSelected] = useState<RecipientOption[]>(() => users.filter((user) => initial.includes(user.name)));
  const selectedNames = selected.map((user) => user.name).join(", ");
  const remaining = users.filter((user) => !selected.some((item) => item.id === user.id));

  function addRecipient(id: string) {
    const user = users.find((item) => item.id === id);
    if (!user) return;
    setSelected((current) => [...current, user]);
  }

  function removeRecipient(id: string) {
    setSelected((current) => current.filter((item) => item.id !== id));
  }

  return (
    <div className="relative w-full space-y-2">
      <input type="hidden" name="salesEmailRecipients" value={selectedNames} />
      <select
        className="h-11 w-full"
        value=""
        onChange={(event) => addRecipient(event.target.value)}
      >
        <option value="">{selectedNames || "영업메일수신자"}</option>
        {remaining.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} ({user.teamLabel})
          </option>
        ))}
      </select>
      {selected.length > 0 ? (
        <div className="flex min-h-10 flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5">
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
        </div>
      ) : null}
    </div>
  );
}
