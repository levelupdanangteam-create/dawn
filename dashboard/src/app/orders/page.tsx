import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { StageBadge, relativeHours } from '@/components/ui';
import { SetupNotice } from '@/components/SetupNotice';
import { StageButton } from '@/components/StageButton';
import { formatMoney } from '@/lib/money';
import { STAGE_LABELS, nextStage, type OrderStage } from '@/lib/orders';
import { getOrders } from '@/lib/queries';

export const dynamic = 'force-dynamic';

const FILTERS: Array<{ value: OrderStage | 'all'; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'new', label: STAGE_LABELS.new },
  { value: 'confirmed', label: STAGE_LABELS.confirmed },
  { value: 'picking', label: STAGE_LABELS.picking },
  { value: 'packed', label: STAGE_LABELS.packed },
  { value: 'shipped', label: STAGE_LABELS.shipped },
  { value: 'delivered', label: STAGE_LABELS.delivered },
  { value: 'problem', label: STAGE_LABELS.problem },
];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ stage?: string; q?: string }>;
}) {
  const { stage: stageParam, q } = await searchParams;
  const stage = (stageParam ?? 'all') as OrderStage | 'all';

  let content: React.ReactNode;
  try {
    const orders = await getOrders({ stage, search: q });

    content = (
      <>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-xl font-bold">Đơn hàng</h1>
          <form className="flex gap-2" action="/orders">
            {stage !== 'all' ? <input type="hidden" name="stage" value={stage} /> : null}
            <input
              name="q"
              defaultValue={q ?? ''}
              placeholder="Tìm số đơn, tên, SĐT, email…"
              className="input w-64"
            />
            <button className="btn-ghost" type="submit">
              Tìm
            </button>
          </form>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {FILTERS.map((f) => (
            <Link
              key={f.value}
              href={`/orders?stage=${f.value}${q ? `&q=${encodeURIComponent(q)}` : ''}`}
              className={`rounded-lg px-3 py-1.5 text-sm ${
                f.value === stage
                  ? 'bg-[var(--color-brand-soft)] font-semibold text-[var(--color-brand)]'
                  : 'text-[var(--color-muted)] hover:bg-white'
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>

        <div className="card mt-4 overflow-x-auto">
          <table className="table-dense w-full">
            <thead>
              <tr>
                <th>Đơn</th>
                <th>Khách hàng</th>
                <th>Giao tới</th>
                <th className="text-right">Tiền</th>
                <th>Trạng thái</th>
                <th className="text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {orders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-sm text-[var(--color-muted)]">
                    Không có đơn nào khớp bộ lọc.
                  </td>
                </tr>
              ) : (
                orders.map((o) => {
                  const next = nextStage(o.stage);
                  return (
                    <tr key={o.id}>
                      <td>
                        <Link href={`/orders/${o.id}`} className="font-semibold hover:underline">
                          {o.order_number}
                        </Link>
                        <div className="text-xs text-[var(--color-muted)]">
                          {relativeHours(o.shopify_created_at)} trước
                        </div>
                      </td>
                      <td>
                        <div className="font-medium">{o.customer_name ?? '—'}</div>
                        <div className="text-xs text-[var(--color-muted)]">{o.customer_phone ?? '—'}</div>
                      </td>
                      <td className="max-w-[220px]">
                        <div className="truncate">{o.ship_address1 ?? '—'}</div>
                        <div className="text-xs text-[var(--color-muted)]">
                          {[o.ship_zip, o.ship_city, o.ship_country_code].filter(Boolean).join(' · ')}
                        </div>
                      </td>
                      <td className="text-right">
                        <div className="font-semibold tabular-nums">
                          {formatMoney(o.total_minor, o.currency)}
                        </div>
                        {o.is_cod ? (
                          <span className="pill bg-[var(--color-warn-soft)] text-[var(--color-warn)]">COD</span>
                        ) : null}
                      </td>
                      <td>
                        <StageBadge stage={o.stage} />
                        <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                          {relativeHours(o.stage_changed_at)}
                        </div>
                      </td>
                      <td className="text-right">
                        {o.stage === 'packed' ? (
                          <Link href={`/orders/${o.id}`} className="btn-primary">
                            Gửi PPL
                          </Link>
                        ) : next ? (
                          <StageButton orderId={o.id} stage={next} label={`→ ${STAGE_LABELS[next]}`} />
                        ) : (
                          <span className="text-xs text-[var(--color-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </>
    );
  } catch (err) {
    content = <SetupNotice error={err instanceof Error ? err.message : String(err)} />;
  }

  return (
    <>
      <Nav current="/orders" />
      <main className="mx-auto max-w-7xl px-4 py-6">{content}</main>
    </>
  );
}
