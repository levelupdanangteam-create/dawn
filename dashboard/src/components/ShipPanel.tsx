'use client';

import { useActionState } from 'react';
import { shipOrderAction } from '@/app/actions';

/**
 * Một nút duy nhất thay cho: kho báo mã → nhắn marketing → mở Shopify →
 * Mark as Fulfilled → dán mã vận đơn → khách nhận mail.
 */
export function ShipPanel({
  orderId,
  pplReady,
  alreadyShipped,
}: {
  orderId: string;
  pplReady: boolean;
  alreadyShipped: boolean;
}) {
  const [state, formAction, pending] = useActionState(shipOrderAction, null);

  return (
    <div className="card p-4">
      <h2 className="text-sm font-bold">Gửi hàng</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        {pplReady
          ? 'Bấm nút là hệ thống tạo vận đơn PPL, lấy mã, fulfil trên Shopify và gửi mail cho khách.'
          : 'Chưa bật API PPL — nhập mã vận đơn vào ô dưới, hệ thống sẽ tự fulfil và gửi mail cho khách.'}
      </p>

      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="orderId" value={orderId} />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-muted)]">
              Cân nặng (kg)
            </label>
            <input name="weightKg" type="number" step="0.1" min="0" placeholder="1.5" className="input" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-[var(--color-muted)]">Số kiện</label>
            <input name="packageCount" type="number" min="1" defaultValue={1} className="input" />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-muted)]">
            Mã vận đơn nhập tay {pplReady ? '(để trống nếu muốn PPL tự cấp)' : '(bắt buộc)'}
          </label>
          <input
            name="manualTracking"
            placeholder="VD: 12345678901"
            className="input"
            required={!pplReady}
          />
        </div>

        <button type="submit" className="btn-primary w-full" disabled={pending}>
          {pending
            ? 'Đang xử lý…'
            : alreadyShipped
              ? 'Gửi thêm kiện / tạo lại vận đơn'
              : 'Tạo vận đơn + Fulfil Shopify'}
        </button>
      </form>

      {state ? (
        <p
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            state.ok
              ? 'bg-[var(--color-good-soft)] text-[var(--color-good)]'
              : 'bg-[var(--color-bad-soft)] text-[var(--color-bad)]'
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
