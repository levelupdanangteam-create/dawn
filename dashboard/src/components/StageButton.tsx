'use client';

import { useFormStatus } from 'react-dom';
import { setStageAction } from '@/app/actions';
import type { OrderStage } from '@/lib/orders';

function Submit({ label, variant }: { label: string; variant: 'primary' | 'ghost' }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={variant === 'primary' ? 'btn-primary' : 'btn-ghost'}
    >
      {pending ? 'Đang lưu…' : label}
    </button>
  );
}

export function StageButton({
  orderId,
  stage,
  label,
  variant = 'ghost',
}: {
  orderId: string;
  stage: OrderStage;
  label: string;
  variant?: 'primary' | 'ghost';
}) {
  return (
    <form action={setStageAction} className="inline">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="stage" value={stage} />
      <Submit label={label} variant={variant} />
    </form>
  );
}
