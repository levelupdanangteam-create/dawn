import Link from 'next/link';
import { logoutAction } from '@/app/actions';

const LINKS = [
  { href: '/', label: 'Tổng quan' },
  { href: '/orders', label: 'Đơn hàng' },
  { href: '/warehouse', label: 'Kho' },
  { href: '/ads', label: 'Quảng cáo' },
  { href: '/inventory', label: 'Tồn kho' },
];

export function Nav({ current }: { current: string }) {
  return (
    <header className="border-b border-[var(--color-line)] bg-white">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
        <Link href="/" className="text-base font-bold tracking-tight">
          Phomi<span className="text-[var(--color-brand)]">food</span>
        </Link>

        <nav className="flex flex-1 flex-wrap gap-1">
          {LINKS.map((l) => {
            const active = l.href === '/' ? current === '/' : current.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  active
                    ? 'bg-[var(--color-brand-soft)] text-[var(--color-brand)]'
                    : 'text-[var(--color-muted)] hover:bg-[var(--color-canvas)]'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>

        <form action={logoutAction}>
          <button type="submit" className="text-sm text-[var(--color-muted)] hover:underline">
            Đăng xuất
          </button>
        </form>
      </div>
    </header>
  );
}
