import Link from 'next/link';
import { Nav } from '@/components/Nav';
import { SetupNotice } from '@/components/SetupNotice';
import { formatMoney, formatNumber } from '@/lib/money';
import { getInventory } from '@/lib/queries';

export const dynamic = 'force-dynamic';

/**
 * Marketing xem trang này trước khi lên ads: hết hàng thì đừng đổ tiền.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ low?: string }>;
}) {
  const { low } = await searchParams;
  const onlyLow = low === '1';

  let content: React.ReactNode;
  try {
    const rows = await getInventory(onlyLow);
    const outOfStock = rows.filter((r) => r.available <= 0 && r.product_status === 'active');
    const stockValue = rows.reduce((s, r) => s + r.available * r.unit_cost_minor, 0);

    content = (
      <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-bold">Tồn kho</h1>
          <div className="flex gap-1">
            <Link
              href="/inventory"
              className={`rounded-lg px-3 py-1.5 text-sm ${
                !onlyLow ? 'bg-[var(--color-brand-soft)] font-semibold text-[var(--color-brand)]' : 'text-[var(--color-muted)]'
              }`}
            >
              Tất cả
            </Link>
            <Link
              href="/inventory?low=1"
              className={`rounded-lg px-3 py-1.5 text-sm ${
                onlyLow ? 'bg-[var(--color-brand-soft)] font-semibold text-[var(--color-brand)]' : 'text-[var(--color-muted)]'
              }`}
            >
              Sắp hết (≤20)
            </Link>
          </div>
        </div>

        {outOfStock.length > 0 ? (
          <div className="card mt-4 border-[var(--color-bad)] bg-[var(--color-bad-soft)] p-4">
            <p className="text-sm font-semibold text-[var(--color-bad)]">
              {outOfStock.length} sản phẩm đang bán nhưng đã hết hàng — tắt ads hoặc nhập thêm ngay.
            </p>
            <p className="mt-1 text-sm">
              {outOfStock
                .slice(0, 8)
                .map((r) => r.product_title)
                .join(' · ')}
              {outOfStock.length > 8 ? ` … +${outOfStock.length - 8}` : ''}
            </p>
          </div>
        ) : null}

        <p className="mt-4 text-sm text-[var(--color-muted)]">
          Giá trị hàng trong kho (theo giá vốn): <strong>{formatMoney(stockValue)}</strong>
        </p>

        <div className="card mt-2 overflow-x-auto">
          <table className="table-dense w-full">
            <thead>
              <tr>
                <th>Sản phẩm</th>
                <th>SKU</th>
                <th className="text-right">Còn</th>
                <th className="text-right">Đã bán chờ giao</th>
                <th className="text-right">Giá bán</th>
                <th className="text-right">Giá vốn</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-sm text-[var(--color-muted)]">
                    Chưa có dữ liệu tồn kho. Chạy{' '}
                    <code>/api/sync/shopify?key=…&amp;inventory=1</code>
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.variant_id}>
                    <td className="font-medium">
                      {r.product_title}
                      {r.variant_title && r.variant_title !== 'Default Title' ? (
                        <span className="text-[var(--color-muted)]"> — {r.variant_title}</span>
                      ) : null}
                    </td>
                    <td className="font-mono text-xs">{r.sku ?? '—'}</td>
                    <td
                      className={`text-right font-bold tabular-nums ${
                        r.available <= 0
                          ? 'text-[var(--color-bad)]'
                          : r.available <= r.reorder_point
                            ? 'text-[var(--color-warn)]'
                            : ''
                      }`}
                    >
                      {formatNumber(r.available)}
                    </td>
                    <td className="text-right tabular-nums text-[var(--color-muted)]">
                      {formatNumber(r.committed)}
                    </td>
                    <td className="text-right tabular-nums">{formatMoney(r.price_minor)}</td>
                    <td className="text-right tabular-nums text-[var(--color-muted)]">
                      {formatMoney(r.unit_cost_minor)}
                    </td>
                    <td>
                      <span
                        className={`pill ${
                          r.product_status === 'active'
                            ? 'bg-[var(--color-good-soft)] text-[var(--color-good)]'
                            : 'bg-[#f0eeec] text-[var(--color-muted)]'
                        }`}
                      >
                        {r.product_status}
                      </span>
                    </td>
                  </tr>
                ))
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
      <Nav current="/inventory" />
      <main className="mx-auto max-w-7xl px-4 py-6">{content}</main>
    </>
  );
}
