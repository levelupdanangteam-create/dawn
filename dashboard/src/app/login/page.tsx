import { LoginForm } from './LoginForm';

export const dynamic = 'force-dynamic';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm p-6">
        <h1 className="text-lg font-bold">
          Phomi<span className="text-[var(--color-brand)]">food</span> — Bảng điều hành
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">Dành cho nội bộ Marketing, Sale và Kho.</p>
        <LoginForm next={next ?? '/'} />
      </div>
    </main>
  );
}
