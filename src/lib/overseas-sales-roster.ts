export const OVERSEAS_SALES_LEADER_PART = -1;
export const OVERSEAS_SALES_PROBATION_PART = 0;
export const OVERSEAS_SALES_ALL_OWNER = "해외영업 전체";

export type OverseasSalesMember = {
  id?: string;
  label: string;
  partNo: number | null;
  rankNo: number | null;
  sortOrder?: number;
};

export type OverseasSalesPartGroup = {
  label: string;
  partNo: number;
  children: string[];
};

export function normalizeOverseasSalesPart(partNo?: number | null) {
  if (partNo === null || partNo === undefined || Number.isNaN(partNo)) {
    return OVERSEAS_SALES_PROBATION_PART;
  }
  const part = Math.round(partNo);
  if (part === OVERSEAS_SALES_LEADER_PART) return OVERSEAS_SALES_LEADER_PART;
  if (part < 0) return OVERSEAS_SALES_PROBATION_PART;
  return part;
}

export function overseasSalesPartLabel(partNo?: number | null) {
  const part = normalizeOverseasSalesPart(partNo);
  if (part === OVERSEAS_SALES_LEADER_PART) return "팀장";
  if (part === OVERSEAS_SALES_PROBATION_PART) return "수습";
  return `${part}파트`;
}

export function overseasSalesPartSuffix(partNo?: number | null) {
  const part = normalizeOverseasSalesPart(partNo);
  if (part === OVERSEAS_SALES_LEADER_PART) return "팀장";
  if (part === OVERSEAS_SALES_PROBATION_PART) return "수습";
  return "파트";
}

export function overseasSalesRankLabel(rankNo?: number | null) {
  if (!rankNo || rankNo < 1) return "-";
  return `${rankNo}순위`;
}

export function overseasSalesPartSortKey(partNo?: number | null) {
  const part = normalizeOverseasSalesPart(partNo);
  if (part === OVERSEAS_SALES_LEADER_PART) return -1;
  if (part === OVERSEAS_SALES_PROBATION_PART) return 9998;
  return part;
}

export function compareOverseasSalesMembers(a: OverseasSalesMember, b: OverseasSalesMember) {
  const partCompare = overseasSalesPartSortKey(a.partNo) - overseasSalesPartSortKey(b.partNo);
  if (partCompare) return partCompare;
  const rankCompare = (a.rankNo ?? 9999) - (b.rankNo ?? 9999);
  if (rankCompare) return rankCompare;
  return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.label.localeCompare(b.label, "ko");
}

export function buildOverseasSalesPartGroups(members: OverseasSalesMember[]): OverseasSalesPartGroup[] {
  const sorted = [...members].sort(compareOverseasSalesMembers);
  const groups = new Map<number, string[]>();
  for (const member of sorted) {
    const partNo = normalizeOverseasSalesPart(member.partNo);
    const list = groups.get(partNo) ?? [];
    list.push(member.label);
    groups.set(partNo, list);
  }
  return [...groups.entries()]
    .sort((a, b) => overseasSalesPartSortKey(a[0]) - overseasSalesPartSortKey(b[0]))
    .map(([partNo, children]) => ({
      partNo,
      label: overseasSalesPartLabel(partNo),
      children
    }));
}

export function overseasSalesSortOrder(partNo: number, rankNo: number) {
  const part = normalizeOverseasSalesPart(partNo);
  const rank = Math.max(1, Math.round(rankNo) || 1);
  if (part === OVERSEAS_SALES_LEADER_PART) return rank;
  if (part === OVERSEAS_SALES_PROBATION_PART) return 900000 + rank;
  return part * 1000 + rank;
}

/** After drag/drop or edit, renumber ranks within each part (1..n). */
export function renumberOverseasSalesRoster(
  members: Array<{ id: string; label: string; partNo: number }>
): Array<{ id: string; label: string; partNo: number; rankNo: number; sortOrder: number }> {
  const ranks = new Map<number, number>();
  return members.map((member) => {
    const partNo = normalizeOverseasSalesPart(member.partNo);
    const nextRank = (ranks.get(partNo) ?? 0) + 1;
    ranks.set(partNo, nextRank);
    return {
      id: member.id,
      label: member.label,
      partNo,
      rankNo: nextRank,
      sortOrder: overseasSalesSortOrder(partNo, nextRank)
    };
  });
}

export function isOverseasSalesLeader(name: string, members: OverseasSalesMember[]) {
  return members.some(
    (member) => member.label === name && normalizeOverseasSalesPart(member.partNo) === OVERSEAS_SALES_LEADER_PART
  );
}

export function overseasSalesMemberNames(members: OverseasSalesMember[]) {
  return [...new Set(members.map((member) => member.label.trim()).filter(Boolean))];
}

export function isOverseasSalesAllOwner(owner: string) {
  return owner.trim() === OVERSEAS_SALES_ALL_OWNER;
}
