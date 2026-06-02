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

  return (
    <div className="relative w-full">
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
    </div>
  );
}
