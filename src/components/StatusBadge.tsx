import { ShipmentStatus } from "@prisma/client";
import { statusLabels } from "@/lib/constants";

export function StatusBadge({ status }: { status: ShipmentStatus }) {
  const waiting = status === "REQUEST_WAITING";
  const green = status === "AFTERCARE";
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium ${waiting ? "bg-amber-50 text-amber-700" : green ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
      {statusLabels[status]}
    </span>
  );
}
