"use client";

export function DeleteButton({ label = "삭제" }: { label?: string }) {
  return (
    <button
      className="btn text-red-700"
      onClick={(event) => {
        if (!confirm("정말 삭제할까요?")) event.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
