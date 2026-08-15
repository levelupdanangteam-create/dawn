import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { StatTile } from '@/components/ui';
import { SetupNotice } from '@/components/SetupNotice';
import { formatMoney, formatNumber } from '@/lib/money';
import { daysAgo, getCampaignPerformance, getPnl } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * Chi phí Meta Ads đặt cạnh doanh thu THẬT từ Shopify.
 * Cột "Meta báo" là số Meta tự nhận; cột doanh thu/ROAS thật lấy từ đơn hàng.
 */
export default async function AdsPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const { days } = await searchParams;
  const window = Math.min(Math.max(Number(days ?? 7) || 7, 1), 90);
  const since = daysAgo(window);

  let content: React.ReactNode;
  try {
    const [campaigns, pnl] = await Promise.all([getCampaignPerformance(since), getPnl(since)]);

    const spend = campaigns.reduce((s, c) => s + c.spend_minor, 0);
    const clicks = campaigns.reduce((s, c) => s + c.link_clicks, 0);
    const impressions = campaigns.reduce((s, c) => s + c.impressions, 0);
    const realRevenue = pnl.reduce((s, r) => s + (r.revenue_minor ?? 0), 0);
    const realOrders = pnl.reduce((s, r) => s + (r.orders ?? 0), 0);

    const ctr = impressions > 0 ? clicks / impressions : 0;
    const cpc = clicks > 0 ? Math.round(spend / clicks) : 0;
    const cpa = realOrders > 0 ? Math.round(spend / realOrders) : 0;

    content = (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Quảng cáo Meta — {window} ngày</h1>
          <div className="flex gap-1">
            {[7, 14, 30].map((d) => (
              <Link
                key={d}
                href={`/ads?days=${d}`}
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
          <StatTile label="Chi ads" value={formatMoney(spend)} />
          <StatTile label="Doanh thu thật" value={formatMoney(realRevenue)} sub={`${formatNumber(realOrders)} đơn`} />
          <StatTile
            label="ROAS thật"
            value={spend > 0 ? (realRevenue / spend).toFixed(2) : '—'}
            tone={spend > 0 && realRevenue / spend >= 2 ? 'good' : spend > 0 ? 'warn' : 'neutral'}
          />
          <StatTile label="CPA thật" value={cpa > 0 ? formatMoney(cpa) : '—'} sub="chi ads / số đơn" />
          <StatTile label="CTR / CPC" value={`${(ctr * 100).toFixed(2)}% · ${formatMoney(cpc)}`} />
        </div>

        <div className="card mt-6 overflow-x-auto">
          <table className="table-dense w-full">
            <thead>
              <tr>
                <th>Chiến dịch</th>
                <th>Nước</th>
                <th className="text-right">Chi</th>
                <th className="text-right">Hiển thị</th>
                <th className="text-right">Click</th>
                <th className="text-right">CPC</th>
                <th className="text-right">Meta báo đơn</th>
                <th className="text-right">Meta báo ROAS</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-sm text-[var(--color-muted)]">
                    Chưa có dữ liệu. Chạy <code>/api/sync/meta?key=…</code> hoặc kiểm tra META_ACCESS_TOKEN.
                  </td>
                </tr>
              ) : (
                campaigns.map((c, i) => (
                  <tr key={i}>
                    <td className="max-w-[280px] truncate font-medium">{c.campaign_name ?? '—'}</td>
                    <td>{c.country ?? 'ALL'}</td>
                    <td className="text-right font-semibold tabular-nums">{formatMoney(c.spend_minor)}</td>
                    <td className="text-right tabular-nums">{formatNumber(c.impressions)}</td>
                    <td className="text-right tabular-nums">{formatNumber(c.link_clicks)}</td>
                    <td className="text-right tabular-nums">
                      {c.link_clicks > 0 ? formatMoney(Math.round(c.spend_minor / c.link_clicks)) : '—'}
                    </td>
                    <td className="text-right tabular-nums">{formatNumber(c.purchases)}</td>
                    <td className="text-right tabular-nums">
                      {c.spend_minor > 0 ? (c.purchase_value_minor / c.spend_minor).toFixed(2) : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Hai cột &ldquo;Meta báo&rdquo; là số Meta tự nhận (attribution 7 ngày click / 1 ngày view) — thường cao
          hơn thực tế. Con số để ra quyết định là ROAS thật và lời gộp ở trang Tổng quan.
        </p>
      </>
    );
  } catch (err) {
    content = <SetupNotice error={err instanceof Error ? err.message : String(err)} />;
  }

  return (
    <>
      <Nav current="/ads" />
      <main className="mx-auto max-w-7xl px-4 py-6">{content}</main>
    </>
  );
}
