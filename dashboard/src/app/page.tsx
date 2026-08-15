import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { StatTile, StageBadge, relativeHours } from '@/components/ui';
import { SetupNotice } from '@/components/SetupNotice';
import { formatMoney, formatNumber } from '@/lib/money';
import { STAGE_LABELS, type OrderStage } from '@/lib/orders';
import {
  daysAgo,
  getPnl,
  getStageCounts,
  getStuckOrders,
  getRecentSyncs,
  type PnlRow,
} from '@/lib/queries';

export const dynamic = 'force-dynamic';

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await searchParams;
  const window = Math.min(Math.max(Number(days ?? 7) || 7, 1), 90);
  const since = daysAgo(window);

  let content: React.ReactNode;
  try {
    const [pnl, stages, stuck, syncs] = await Promise.all([
      getPnl(since),
      getStageCounts(),
      getStuckOrders(),
      getRecentSyncs(),
    ]);

    const totals = pnl.reduce(
      (acc, r) => ({
        orders: acc.orders + (r.orders ?? 0),
        revenue: acc.revenue + (r.revenue_minor ?? 0),
        cogs: acc.cogs + (r.cogs_minor ?? 0),
        spend: acc.spend + (r.ad_spend_minor ?? 0),
      }),
      { orders: 0, revenue: 0, cogs: 0, spend: 0 },
    );
    const profit = totals.revenue - totals.cogs - totals.spend;
    const roas = totals.spend > 0 ? totals.revenue / totals.spend : null;
    const aov = totals.orders > 0 ? Math.round(totals.revenue / totals.orders) : 0;

    const byCountry = groupByCountry(pnl);

    content = (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Tổng quan {window} ngày</h1>
          <div className="flex gap-1">
            {[7, 14, 30].map((d) => (
              <Link
                key={d}
                href={`/?days=${d}`}
                className={`rounded-lg px-3 py-1.5 text-sm ${
                  d === window
                    ? 'bg-[var(--color-brand-soft)] font-semibold text-[var(--color-brand)]'
                    : 'text-[var(--color-muted)] hover:bg-white'
                }`}
              >
                {d} ngày
              </Link>
            ))}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <StatTile label="Doanh thu" value={formatMoney(totals.revenue)} sub={`${formatNumber(totals.orders)} đơn`} />
          <StatTile label="Chi quảng cáo" value={formatMoney(totals.spend)} />
          <StatTile
            label="Lời gộp"
            value={formatMoney(profit)}
            sub="doanh thu − giá vốn − ads"
            tone={profit >= 0 ? 'good' : 'bad'}
          />
          <StatTile
            label="ROAS"
            value={roas ? roas.toFixed(2) : '—'}
            sub="doanh thu / chi ads"
            tone={roas === null ? 'neutral' : roas >= 2 ? 'good' : roas >= 1.3 ? 'warn' : 'bad'}
          />
          <StatTile label="Giá trị đơn TB" value={formatMoney(aov)} />
        </div>

        {/* Hàng chờ xử lý — thay cho việc mở Sheet A / Sheet B để đếm */}
        <h2 className="mt-8 text-sm font-bold uppercase tracking-wide text-[var(--color-muted)]">
          Đơn đang nằm ở đâu
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {stages.map((s) => (
            <Link key={s.stage} href={`/orders?stage=${s.stage}`} className="card p-3 hover:border-[var(--color-brand)]">
              <div className="text-xs font-medium text-[var(--color-muted)]">
                {STAGE_LABELS[s.stage as OrderStage]}
              </div>
              <div className="mt-1 text-xl font-bold tabular-nums">{formatNumber(s.count)}</div>
            </Link>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          {/* Đơn kẹt — chính là chỗ đang mất thời gian nhất */}
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-muted)]">
              Đơn kẹt quá 6 giờ
            </h2>
            <div className="card mt-2 overflow-hidden">
              {stuck.length === 0 ? (
                <p className="p-6 text-center text-sm text-[var(--color-muted)]">
                  Không có đơn nào bị kẹt. 👌
                </p>
              ) : (
                <table className="table-dense w-full">
                  <thead>
                    <tr>
                      <th>Đơn</th>
                      <th>Khách</th>
                      <th>Đang ở</th>
                      <th className="text-right">Kẹt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stuck.map((o) => (
                      <tr key={o.id}>
                        <td>
                          <Link href={`/orders/${o.id}`} className="font-semibold hover:underline">
                            {o.order_number}
                          </Link>
                        </td>
                        <td>
                          {o.customer_name ?? '—'}
                          <div className="text-xs text-[var(--color-muted)]">{o.ship_country_code}</div>
                        </td>
                        <td>
                          <StageBadge stage={o.stage} />
                        </td>
                        <td className="text-right font-medium text-[var(--color-bad)]">
                          {relativeHours(o.stage_changed_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>

          {/* Hiệu quả theo nước */}
          <section>
            <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-muted)]">
              Theo thị trường
            </h2>
            <div className="card mt-2 overflow-x-auto">
              <table className="table-dense w-full">
                <thead>
                  <tr>
                    <th>Nước</th>
                    <th className="text-right">Đơn</th>
                    <th className="text-right">Doanh thu</th>
                    <th className="text-right">Ads</th>
                    <th className="text-right">Lời gộp</th>
                    <th className="text-right">ROAS</th>
                  </tr>
                </thead>
                <tbody>
                  {byCountry.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-6 text-center text-sm text-[var(--color-muted)]">
                        Chưa có dữ liệu trong khoảng này.
                      </td>
                    </tr>
                  ) : (
                    byCountry.map((c) => (
                      <tr key={c.country}>
                        <td className="font-semibold">{c.country}</td>
                        <td className="text-right tabular-nums">{formatNumber(c.orders)}</td>
                        <td className="text-right tabular-nums">{formatMoney(c.revenue)}</td>
                        <td className="text-right tabular-nums">{formatMoney(c.spend)}</td>
                        <td
                          className={`text-right font-medium tabular-nums ${
                            c.profit >= 0 ? 'text-[var(--color-good)]' : 'text-[var(--color-bad)]'
                          }`}
                        >
                          {formatMoney(c.profit)}
                        </td>
                        <td className="text-right tabular-nums">
                          {c.spend > 0 ? (c.revenue / c.spend).toFixed(2) : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="mt-8">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--color-muted)]">
            Đồng bộ gần nhất
          </h2>
          <div className="card mt-2 divide-y divide-[var(--color-line)]">
            {syncs.length === 0 ? (
              <p className="p-4 text-sm text-[var(--color-muted)]">Chưa chạy đồng bộ lần nào.</p>
            ) : (
              syncs.map((s, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
                  <span
                    className={`pill ${
                      s.status === 'ok'
                        ? 'bg-[var(--color-good-soft)] text-[var(--color-good)]'
                        : 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]'
                    }`}
                  >
                    {s.source}
                  </span>
                  <span className="text-[var(--color-muted)]">{relativeHours(s.started_at)} trước</span>
                  <span className="flex-1 truncate">{s.message ?? `${s.records} bản ghi`}</span>
                </div>
              ))
            )}
          </div>
        </section>
      </>
    );
  } catch (err) {
    content = <SetupNotice error={err instanceof Error ? err.message : String(err)} />;
  }

  return (
    <>
      <Nav current="/" />
      <main className="mx-auto max-w-7xl px-4 py-6">{content}</main>
    </>
  );
}

function groupByCountry(rows: PnlRow[]) {
  const map = new Map<string, { country: string; orders: number; revenue: number; spend: number; profit: number }>();
  for (const r of rows) {
    const key = r.country ?? '—';
    const acc = map.get(key) ?? { country: key, orders: 0, revenue: 0, spend: 0, profit: 0 };
    acc.orders += r.orders ?? 0;
    acc.revenue += r.revenue_minor ?? 0;
    acc.spend += r.ad_spend_minor ?? 0;
    acc.profit += r.gross_profit_minor ?? 0;
    map.set(key, acc);
  }
  return [...map.values()].sort((a, b) => b.revenue - a.revenue);
}
