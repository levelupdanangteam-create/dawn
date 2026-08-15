export function SetupNotice({ error }: { error: string }) {
  return (
    <div className="card border-[var(--color-warn)] bg-[var(--color-warn-soft)] p-5">
      <h2 className="text-sm font-bold text-[var(--color-warn)]">Chưa lấy được dữ liệu</h2>
      <p className="mt-1 text-sm text-[var(--color-ink)]">{error}</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[var(--color-ink)]">
        <li>
          Chạy <code className="rounded bg-white px-1">dashboard/supabase/schema.sql</code> trong Supabase
          SQL Editor.
        </li>
        <li>
          Điền đủ biến trong <code className="rounded bg-white px-1">.env.local</code> (xem
          <code className="mx-1 rounded bg-white px-1">.env.example</code>).
        </li>
        <li>
          Gọi <code className="rounded bg-white px-1">/api/sync/shopify?key=CRON_SECRET&amp;days=30&amp;inventory=1</code>{' '}
          để nạp dữ liệu lần đầu.
        </li>
      </ol>
    </div>
  );
}
