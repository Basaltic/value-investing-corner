export function parseOptionalNumber(s: string): number | null {
  const text = s.trim();
  if (!text) return null;
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(text))
    throw new Error("数值格式错误，不使用千分位或公式");
  const value = Number(text);
  if (
    !Number.isFinite(value) ||
    Math.abs(value) > 1e18 ||
    (value === 0 && /[1-9]/.test(text.split(/[eE]/)[0]))
  )
    throw new Error("数值必须有限且绝对值不超过10^18");
  return value;
}
export function latestVersions<
  T extends { series_id: string; version: number },
>(rows: T[]): T[] {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const old = latest.get(row.series_id);
    if (!old || row.version > old.version) latest.set(row.series_id, row);
  }
  return [...latest.values()];
}
export function buildSeries(
  rows: { date: string; value: number | null; reviewed: boolean }[],
  dates: string[],
): { reviewed: (number | null)[]; pending: (number | null)[] } {
  const reviewed: (number | null)[] = [];
  const pending: (number | null)[] = [];
  for (const date of dates) {
    const at = rows.filter((r) => r.date === date);
    const row = at.length === 1 ? at[0] : null;
    reviewed.push(row?.reviewed ? row.value : null);
    pending.push(row && !row.reviewed ? row.value : null);
  }
  return { reviewed, pending };
}
