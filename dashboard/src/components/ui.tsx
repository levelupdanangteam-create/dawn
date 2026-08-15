import { STAGE_LABELS, type OrderStage } from '@/lib/orders';

const STAGE_STYLE: Record<OrderStage, string> = {
  new: 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]',
  confirmed: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]',
  picking: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]',
  packed: 'bg-[var(--color-warn-soft)] text-[var(--color-warn)]',
  shipped: 'bg-[#e8eefb] text-[#2c4d8f]',
  delivered: 'bg-[var(--color-good-soft)] text-[var(--color-good)]',
  problem: 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]',
  cancelled: 'bg-[#f0eeec] text-[var(--color-muted)]',
};

export function StageBadge({ stage }: { stage: OrderStage }) {
  return <span className={`pill ${STAGE_STYLE[stage]}`}>{STAGE_LABELS[stage]}</span>;
}

export function StatTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'neutral' | 'good' | 'bad' | 'warn';
}) {
  const toneClass =
    tone === 'good'
      ? 'text-[var(--color-good)]'
      : tone === 'bad'
        ? 'text-[var(--color-bad)]'
        : tone === 'warn'
          ? 'text-[var(--color-warn)]'
          : 'text-[var(--color-ink)]';

  return (
    <div className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
        {label}
      </div>
      <div className={`mt-1.5 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-[var(--color-muted)]">{sub}</div> : null}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      {hint ? <p className="mt-1 text-sm text-[var(--color-muted)]">{hint}</p> : null}
    </div>
  );
}

export function relativeHours(iso: string): string {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} phút`;
  if (hours < 48) return `${hours.toFixed(1)} giờ`;
  return `${Math.round(hours / 24)} ngày`;
}
