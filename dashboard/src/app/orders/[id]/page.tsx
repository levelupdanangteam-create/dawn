import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Nav } from '@/components/Nav';
import { StageBadge, relativeHours } from '@/components/ui';
import { StageButton } from '@/components/StageButton';
import { ShipPanel } from '@/components/ShipPanel';
import { NoteForm } from '@/components/NoteForm';
import { SetupNotice } from '@/components/SetupNotice';
import { formatMoney } from '@/lib/money';
import { STAGE_LABELS, STAGE_ORDER, type OrderStage } from '@/lib/orders';
import { getOrderDetail } from '@/lib/queries';
import { pplConfigured } from '@/lib/ship';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let detail;
  try {
    detail = await getOrderDetail(id);
  } catch (err) {
    return (
      <>
        <Nav current="/orders" />
        <main className="mx-auto max-w-7xl px-4 py-6">
          <SetupNotice error={err instanceof Error ? err.message : String(err)} />
        </main>
      </>
    );
  }

  const { order, items, shipments, events } = detail;
  if (!order) notFound();

  const itemsTotal = items.reduce(
    (s, i) => s + (i.unit_price_minor as number) * (i.quantity as number),
    0,
  );
  const cogs = items.reduce(
    (s, i) => s + (i.unit_cost_minor as number) * (i.quantity as number),
    0,
  );
  const margin = order.total_minor - cogs;

  let shopUrl: string | null = null;
  try {
    shopUrl = `https://${env.shopifyShop}/admin/orders/${order.shopify_order_id}`;
  } catch {
    shopUrl = null;
  }

  return (
    <>
      <Nav current="/orders" />
      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/orders" className="text-sm text-[var(--color-muted)] hover:underline">
            ← Danh sách đơn
          </Link>
          <h1 className="text-xl font-bold">{order.order_number}</h1>
          <StageBadge stage={order.stage} />
          {order.is_cod ? (
            <span className="pill bg-[var(--color-warn-soft)] text-[var(--color-warn)]">
              COD {formatMoney(order.total_minor, order.currency)}
            </span>
          ) : null}
          {shopUrl ? (
            <a
              href={shopUrl}
              target="_blank"
              rel="noreferrer"
              className="ml-auto text-sm text-[var(--color-muted)] hover:underline"
            >
              Mở trên Shopify ↗
            </a>
          ) : null}
        </div>

        {/* Thanh chuyển bước — mỗi bước một chạm, không cần nhập lại gì */}
        <div className="card mt-4 flex flex-wrap items-center gap-2 p-3">
          <span className="text-xs font-semibold uppercase text-[var(--color-muted)]">Chuyển bước:</span>
          {STAGE_ORDER.filter((s) => s !== 'delivered').map((s) => (
            <StageButton
              key={s}
              orderId={order.id}
              stage={s}
              label={STAGE_LABELS[s]}
              variant={s === order.stage ? 'primary' : 'ghost'}
            />
          ))}
          <span className="mx-1 h-5 w-px bg-[var(--color-line)]" />
          <StageButton orderId={order.id} stage={'problem' as OrderStage} label="Có vấn đề" />
          <StageButton orderId={order.id} stage={'cancelled' as OrderStage} label="Huỷ" />
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {/* Hàng cần lấy */}
            <section className="card overflow-hidden">
              <h2 className="border-b border-[var(--color-line)] px-4 py-3 text-sm font-bold">
                Hàng trong đơn
              </h2>
              <table className="table-dense w-full">
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>SKU</th>
                    <th className="text-right">SL</th>
                    <th className="text-right">Đơn giá</th>
                    <th className="text-right">Thành tiền</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id as string}>
                      <td className="font-medium">
                        {i.title as string}
                        {i.variant_title ? (
                          <span className="text-[var(--color-muted)]"> — {i.variant_title as string}</span>
                        ) : null}
                      </td>
                      <td className="font-mono text-xs">{(i.sku as string) ?? '—'}</td>
                      <td className="text-right font-semibold tabular-nums">{i.quantity as number}</td>
                      <td className="text-right tabular-nums">
                        {formatMoney(i.unit_price_minor as number, order.currency)}
                      </td>
                      <td className="text-right tabular-nums">
                        {formatMoney(
                          (i.unit_price_minor as number) * (i.quantity as number),
                          order.currency,
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-[var(--color-line)] text-sm">
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-[var(--color-muted)]">
                      Hàng
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(itemsTotal, order.currency)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-[var(--color-muted)]">
                      Ship khách trả
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(order.shipping_minor, order.currency)}
                    </td>
                  </tr>
                  <tr className="font-semibold">
                    <td colSpan={4} className="px-3 py-2 text-right">
                      Tổng thu
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatMoney(order.total_minor, order.currency)}
                    </td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-3 py-2 text-right text-[var(--color-muted)]">
                      Giá vốn / Lời gộp (chưa trừ ads, ship)
                    </td>
                    <td
                      className={`px-3 py-2 text-right tabular-nums ${
                        margin >= 0 ? 'text-[var(--color-good)]' : 'text-[var(--color-bad)]'
                      }`}
                    >
                      {formatMoney(cogs, order.currency)} / {formatMoney(margin, order.currency)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </section>

            {/* Vận đơn */}
            <section className="card overflow-hidden">
              <h2 className="border-b border-[var(--color-line)] px-4 py-3 text-sm font-bold">Vận đơn</h2>
              {shipments.length === 0 ? (
                <p className="p-4 text-sm text-[var(--color-muted)]">Chưa có vận đơn.</p>
              ) : (
                <table className="table-dense w-full">
                  <thead>
                    <tr>
                      <th>Mã vận đơn</th>
                      <th>ĐVVC</th>
                      <th>Trạng thái</th>
                      <th>Shopify</th>
                      <th>Nhãn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shipments.map((s) => (
                      <tr key={s.id as string}>
                        <td className="font-mono font-semibold">
                          <a
                            href={`https://www.ppl.cz/vyhledat-zasilku?shipmentId=${s.tracking_number}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:underline"
                          >
                            {(s.tracking_number as string) ?? '—'}
                          </a>
                        </td>
                        <td className="uppercase">{s.carrier as string}</td>
                        <td>
                          {s.status as string}
                          {s.status_detail ? (
                            <div className="text-xs text-[var(--color-muted)]">
                              {s.status_detail as string}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          {s.pushed_to_shopify ? (
                            <span className="pill bg-[var(--color-good-soft)] text-[var(--color-good)]">
                              đã fulfil
                            </span>
                          ) : (
                            <span className="pill bg-[var(--color-warn-soft)] text-[var(--color-warn)]">
                              chờ đẩy
                            </span>
                          )}
                        </td>
                        <td>
                          {s.label_url ? (
                            <a
                              href={s.label_url as string}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[var(--color-brand)] hover:underline"
                            >
                              In nhãn
                            </a>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            {/* Nhật ký */}
            <section className="card overflow-hidden">
              <h2 className="border-b border-[var(--color-line)] px-4 py-3 text-sm font-bold">
                Nhật ký xử lý
              </h2>
              <ol className="divide-y divide-[var(--color-line)]">
                {events.length === 0 ? (
                  <li className="p-4 text-sm text-[var(--color-muted)]">Chưa có hoạt động.</li>
                ) : (
                  events.map((e) => (
                    <li key={e.id as string} className="flex gap-3 px-4 py-2.5 text-sm">
                      <span className="w-24 shrink-0 text-xs text-[var(--color-muted)]">
                        {relativeHours(e.created_at as string)} trước
                      </span>
                      <span className="w-20 shrink-0 text-xs font-medium">{e.actor as string}</span>
                      <span className="flex-1">{e.message as string}</span>
                    </li>
                  ))
                )}
              </ol>
            </section>
          </div>

          {/* Cột phải */}
          <div className="space-y-6">
            <section className="card p-4">
              <h2 className="text-sm font-bold">Khách hàng</h2>
              <dl className="mt-2 space-y-1.5 text-sm">
                <Row label="Tên" value={order.customer_name} />
                <Row label="Điện thoại" value={order.customer_phone} copyable />
                <Row label="Email" value={order.customer_email} />
                <Row
                  label="Địa chỉ"
                  value={[order.ship_address1, order.ship_address2].filter(Boolean).join(', ')}
                />
                <Row
                  label="Thành phố"
                  value={[order.ship_zip, order.ship_city, order.ship_country_code]
                    .filter(Boolean)
                    .join(' · ')}
                />
                <Row label="Thanh toán" value={order.payment_method} />
              </dl>
              {order.customer_note ? (
                <p className="mt-3 rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-sm">
                  <strong>Khách ghi chú:</strong> {order.customer_note}
                </p>
              ) : null}
            </section>

            <ShipPanel
              orderId={order.id}
              pplReady={pplConfigured()}
              alreadyShipped={shipments.length > 0}
            />

            <section className="card p-4">
              <h2 className="text-sm font-bold">Ghi chú nội bộ</h2>
              <div className="mt-2">
                <NoteForm orderId={order.id} note={order.internal_note} />
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}

function Row({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value: string | null | undefined;
  copyable?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-xs text-[var(--color-muted)]">{label}</dt>
      <dd className={`flex-1 ${copyable ? 'font-mono' : ''}`}>{value || '—'}</dd>
    </div>
  );
}
