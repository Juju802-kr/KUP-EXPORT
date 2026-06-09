"use client";

export function NoticeLatestToggle({ checked }: { checked: boolean }) {
  return (
    <label className="flex h-11 cursor-pointer items-center gap-2 whitespace-nowrap px-2 text-sm font-medium text-slate-700">
      <input
        name="latest"
        value="1"
        type="checkbox"
        defaultChecked={checked}
        className="h-4 w-4 cursor-pointer"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      />
      최신순
    </label>
  );
}
