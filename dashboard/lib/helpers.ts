/** Safe number coercion — returns 0 for NaN/Infinity */
export const N = (v: unknown): number => {
  const n = Number(v);
  return isFinite(n) ? n : 0;
};

/** Abbreviated number format: 1234567 → "1.23M" */
export const fmt = (n: unknown, d: number = 2): string => {
  const v = N(n);
  if (n == null || isNaN(Number(n))) return '\u2014';
  if (v >= 1e9) return parseFloat((v / 1e9).toFixed(d)) + 'B';
  if (v >= 1e6) return parseFloat((v / 1e6).toFixed(d)) + 'M';
  if (v >= 1e3) return parseFloat((v / 1e3).toFixed(d)) + 'K';
  return v.toFixed(d);
};

/** Full number with commas */
export const fmtFull = (n: unknown): string =>
  N(n) ? N(n).toLocaleString(undefined, { maximumFractionDigits: 0 }) : '\u2014';

/** Relative time from ISO string */
export function timeAgoShort(isoOrUnix: string | number | null): string {
  if (!isoOrUnix) return '—';
  const ts = typeof isoOrUnix === 'number' ? isoOrUnix * 1000 : new Date(isoOrUnix).getTime();
  if (isNaN(ts)) return '—';
  const sec = Math.floor((Date.now() - ts) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

/** Risk level to CSS class */
export function riskColor(risk: string): string {
  if (risk === 'ok' || risk === 'healthy') return 'ok';
  if (risk === 'warning') return 'warning';
  if (risk === 'critical') return 'critical';
  return 'stale';
}
