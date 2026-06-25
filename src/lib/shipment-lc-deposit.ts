export const LC_DEPOSIT_WAITING = "L/C 대기 중";
export const LC_DEPOSIT_RECEIVED = "L/C 수령 완료";

export function lcDepositStatusAfterLcSd(
  currentDepositStatus: string | null | undefined,
  lcSd: string | null | undefined
) {
  if (!lcSd?.trim()) return null;
  if (currentDepositStatus !== LC_DEPOSIT_WAITING) return null;
  return LC_DEPOSIT_RECEIVED;
}
