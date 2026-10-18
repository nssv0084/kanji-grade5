// 学習日の計算。日本時間の午前3時で翌日に切り替える（STK-02）。日付はすべて "YYYY-MM-DD" の文字列で扱う

const JST_OFFSET_HOURS = 9;
const DAY_START_HOUR = 3;

export function studyDate(now: Date): string {
  const shifted = new Date(now.getTime() + (JST_OFFSET_HOURS - DAY_START_HOUR) * 3600_000);
  return shifted.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** その月の最後の日 */
export function endOfMonth(date: string): string {
  const d = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(0);
  return d.toISOString().slice(0, 10);
}
