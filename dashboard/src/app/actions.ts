'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { env } from '@/lib/env';
import { createSessionToken, sessionCookie } from '@/lib/auth';
import { db, logOrderEvent } from '@/lib/supabase';
import { shipOrder } from '@/lib/ship';
import type { OrderRow, OrderStage } from '@/lib/orders';

async function currentUser(): Promise<string> {
  const jar = await cookies();
  const token = jar.get(sessionCookie.name)?.value ?? '';
  const user = token.split('.')[0];
  return user ? decodeURIComponent(user) : 'unknown';
}

// --- Đăng nhập / đăng xuất -------------------------------------------------

export async function loginAction(
  _prev: { error: string } | null,
  formData: FormData,
): Promise<{ error: string } | null> {
  const password = String(formData.get('password') ?? '');
  const name = String(formData.get('name') ?? '').trim() || 'team';
  const next = String(formData.get('next') ?? '/') || '/';

  if (password !== env.dashboardPassword) {
    return { error: 'Sai mật khẩu' };
  }

  const token = await createSessionToken(env.sessionSecret, name);
  const jar = await cookies();
  jar.set(sessionCookie.name, token, sessionCookie.options);

  redirect(next.startsWith('/') ? next : '/');
}

export async function logoutAction(): Promise<void> {
  const jar = await cookies();
  jar.delete(sessionCookie.name);
  redirect('/login');
}

// --- Thao tác trên đơn -----------------------------------------------------

export async function setStageAction(formData: FormData): Promise<void> {
  const orderId = String(formData.get('orderId') ?? '');
  const stage = String(formData.get('stage') ?? '') as OrderStage;
  const reason = String(formData.get('reason') ?? '').trim();
  if (!orderId || !stage) return;

  const actor = await currentUser();
  const patch: Record<string, unknown> = { stage, assigned_to: actor };
  if (stage === 'problem' && reason) patch.problem_reason = reason;

  await db().from('orders').update(patch).eq('id', orderId);

  revalidatePath('/orders');
  revalidatePath('/warehouse');
  revalidatePath(`/orders/${orderId}`);
}

export async function saveNoteAction(formData: FormData): Promise<void> {
  const orderId = String(formData.get('orderId') ?? '');
  const note = String(formData.get('note') ?? '').trim();
  if (!orderId) return;

  const actor = await currentUser();
  await db().from('orders').update({ internal_note: note }).eq('id', orderId);
  await logOrderEvent(orderId, 'note', note || '(xoá ghi chú)', actor);

  revalidatePath(`/orders/${orderId}`);
}

export interface ShipActionResult {
  ok: boolean;
  message: string;
}

/**
 * Nút "Gửi PPL + Fulfil" — thay cho toàn bộ chuỗi thao tác tay hiện tại.
 */
export async function shipOrderAction(
  _prev: ShipActionResult | null,
  formData: FormData,
): Promise<ShipActionResult> {
  const orderId = String(formData.get('orderId') ?? '');
  const manual = String(formData.get('manualTracking') ?? '').trim();
  const weight = Number(formData.get('weightKg') ?? 0);
  const packages = Number(formData.get('packageCount') ?? 1);

  if (!orderId) return { ok: false, message: 'Thiếu mã đơn' };

  const actor = await currentUser();

  const { data: order, error } = await db()
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();

  if (error || !order) return { ok: false, message: 'Không tìm thấy đơn' };

  try {
    const result = await shipOrder(order as OrderRow, {
      manualTrackingNumber: manual || undefined,
      weightKg: weight > 0 ? weight : undefined,
      packageCount: packages > 0 ? packages : 1,
      actor,
    });

    revalidatePath('/orders');
    revalidatePath('/warehouse');
    revalidatePath(`/orders/${orderId}`);

    return {
      ok: true,
      message: result.warning
        ? `Mã vận đơn ${result.trackingNumber}. ${result.warning}`
        : `Xong — mã vận đơn ${result.trackingNumber}, đã fulfil và gửi mail cho khách.`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logOrderEvent(orderId, 'error', `Gửi hàng thất bại: ${message}`, actor);
    return { ok: false, message };
  }
}
