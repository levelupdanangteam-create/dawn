'use client';

import { useActionState } from 'react';
import { loginAction } from '@/app/actions';

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(loginAction, null);

  return (
    <form action={formAction} className="mt-5 space-y-3">
      <input type="hidden" name="next" value={next} />

      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--color-muted)]">Tên của bạn</label>
        <input name="name" className="input" placeholder="VD: Lan (Sale)" autoComplete="name" />
      </div>

      <div>
        <label className="mb-1 block text-xs font-semibold text-[var(--color-muted)]">Mật khẩu chung</label>
        <input
          name="password"
          type="password"
          className="input"
          required
          autoComplete="current-password"
        />
      </div>

      {state?.error ? (
        <p className="rounded-lg bg-[var(--color-bad-soft)] px-3 py-2 text-sm text-[var(--color-bad)]">
          {state.error}
        </p>
      ) : null}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? 'Đang vào…' : 'Vào bảng điều hành'}
      </button>
    </form>
  );
}
