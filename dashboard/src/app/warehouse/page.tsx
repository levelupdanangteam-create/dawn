import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { StageBadge, relativeHours } from '@/components/ui';
import { StageButton } from '@/components/StageButton';
import { SetupNotice } from '@/components/SetupNotice';
import { formatMoney } from '@/lib/money';
import { getWarehouseQueue, summarisePicking } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * Màn hình của KHO — thay thế Sheet B.
 * Không cần ai copy dữ liệu sang đây: đơn tự chảy vào khi Sale bấm "Đã xác nhận".
 */
export default async function WarehousePage() {
  let content: React.ReactNode;

  try {
    const queue = await getWarehouseQueue();
    const picking = summarisePicking(queue);

    content = (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Hàng chờ đóng gói</h1>
            <p className="text-sm text-[var(--color-muted)]">
              {queue.length} đơn đang chờ — đơn cũ nhất lên trên.
            </p>
          </div>
        </div>

        {/* Tổng hợp SKU: đi một vòng kho lấy đủ cho tất cả đơn */}
        <section className="card mt-4 overflow-hidden">
          <h2 className="border-b border-[var(--color-line)] px-4 py-3 text-sm font-bold">
            Tổng số cần lấy trong kho
          </h2>
          {picking.length === 0 ? (
            <p className="p-4 text-sm text-[var(--color-muted)]">Không có gì cần lấy.</p>
          ) : (
            <div className="flex flex-wrap gap-2 p-3">
              {picking.map((p) => (
                <div
                  key={p.sku + p.title}
                  className="rounded-lg border border-[var(--color-line)] px-3 py-2"
                >
                  <div className="text-sm font-medium">{p.title}</div>
                  <div className="text-xs text-[var(--color-muted)]">
                    <span className="font-mono">{p.sku}</span> ·{' '}
                    <span className="text-base font-bold text-[var(--color-ink)]">{p.quantity}</span> cái
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Từng đơn */}
        <div className="mt-6 space-y-3">
          {queue.length === 0 ? (
            <div className="card p-10 text-center text-sm text-[var(--color-muted)]">
              Không còn đơn nào chờ. 🎉
            </div>
          ) : (
            queue.map((o) => (
              <article key={o.id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/orders/${o.id}`} className="text-base font-bold hover:underline">
                        {o.order_number}
                      </Link>
                      <StageBadge stage={o.stage} />
                      {o.is_cod ? (
                        <span className="pill bg-[var(--color-warn-soft)] text-[var(--color-warn)]">
                          THU HỘ {formatMoney(o.total_minor, o.currency)}
                        </span>
                      ) : (
                        <span className="pill bg-[var(--color-good-soft)] text-[var(--color-good)]">
                          Đã trả tiền
                        </span>
                      )}
                      <span className="text-xs text-[var(--color-muted)]">
                        đặt {relativeHours(o.shopify_created_at)} trước
                      </span>
                    </div>

                    <div className="mt-1 text-sm">
                      <strong>{o.customer_name ?? '—'}</strong>
                      <span className="text-[var(--color-muted)]"> · {o.customer_phone ?? '—'}</span>
                    </div>
                    <div className="text-sm text-[var(--color-muted)]">
                      {[o.ship_address1, o.ship_address2, o.ship_zip, o.ship_city, o.ship_country_code]
                        .filter(Boolean)
                        .join(', ')}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {o.stage === 'confirmed' ? (
                      <StageButton orderId={o.id} stage="picking" label="Bắt đầu lấy hàng" variant="primary" />
                    ) : null}
                    {o.stage === 'picking' ? (
                      <StageButton orderId={o.id} stage="packed" label="Đã đóng xong" variant="primary" />
                    ) : null}
                    {o.stage === 'packed' ? (
                      <Link href={`/orders/${o.id}`} className="btn-primary">
                        Tạo vận đơn PPL
                      </Link>
                    ) : null}
                    <StageButton orderId={o.id} stage="problem" label="Thiếu hàng" />
                  </div>
                </div>

                <ul className="mt-3 grid gap-1 border-t border-[var(--color-line)] pt-3 sm:grid-cols-2">
                  {(o.order_items ?? []).map((i) => (
                    <li key={i.id} className="flex items-baseline gap-2 text-sm">
                      <span className="min-w-8 rounded bg-[var(--color-canvas)] px-1.5 text-center font-bold tabular-nums">
                        {i.quantity}
                      </span>
                      <span className="flex-1">
                        {i.title}
                        {i.variant_title ? (
                          <span className="text-[var(--color-muted)]"> — {i.variant_title}</span>
                        ) : null}
                      </span>
                      <span className="font-mono text-xs text-[var(--color-muted)]">{i.sku ?? ''}</span>
                    </li>
                  ))}
                </ul>

                {o.customer_note || o.internal_note ? (
                  <p className="mt-3 rounded-lg bg-[var(--color-warn-soft)] px-3 py-2 text-sm">
                    {[o.customer_note, o.internal_note].filter(Boolean).join(' — ')}
                  </p>
                ) : null}
              </article>
            ))
          )}
        </div>
      </>
    );
  } catch (err) {
    content = <SetupNotice error={err instanceof Error ? err.message : String(err)} />;
  }

  return (
    <>
      <Nav current="/warehouse" />
      <main className="mx-auto max-w-7xl px-4 py-6">{content}</main>
    </>
  );
}
