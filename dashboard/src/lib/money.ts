/**
 * Tiền luôn lưu bằng đơn vị nhỏ nhất (haléř / cent) dưới dạng số nguyên.
 * Không bao giờ cộng trừ tiền bằng số thực.
 */

export function toMinor(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = typeof value === 'number' ? value : Number.parseFloat(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function fromMinor(minor: number | null | undefined): number {
  return (minor ?? 0) / 100;
}

const formatters = new Map<string, Intl.NumberFormat>();

export function formatMoney(minor: number | null | undefined, currency = 'CZK'): string {
  let f = formatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat('cs-CZ', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    });
    formatters.set(currency, f);
  }
  return f.format(fromMinor(minor));
}

export function formatNumber(n: number | null | undefined): string {
  return new Intl.NumberFormat('cs-CZ').format(n ?? 0);
}

export function formatPercent(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}
