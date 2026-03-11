/** Format a number with commas and optional decimals */
export function fmt(value: unknown, decimals = 2): string {
  if (value == null) return '—';
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  if (isNaN(n)) return '—';
  return n.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/** Parse a value to number, returning 0 for nullish/NaN */
export function N(value: unknown): number {
  if (value == null) return 0;
  const n = typeof value === 'string' ? parseFloat(value) : Number(value);
  return isNaN(n) ? 0 : n;
}

/** Return a short relative time string like "3m ago", "2h ago", "1d ago" */
export function timeAgoShort(timestamp: string | number | Date | null | undefined): string {
  if (!timestamp) return '—';
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  if (isNaN(then)) return '—';
  const diff = Math.max(0, now - then);
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Return a CSS class name for risk level badges */
export function riskColor(risk: string | null | undefined): string {
  if (!risk) return 'bg-secondary';
  switch (risk.toLowerCase()) {
    case 'critical':
    case 'high':
      return 'bg-danger';
    case 'medium':
    case 'warning':
      return 'bg-warning text-dark';
    case 'low':
    case 'info':
      return 'bg-success';
    default:
      return 'bg-secondary';
  }
}
