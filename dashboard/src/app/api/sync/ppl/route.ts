import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { checkCronSecret } from '@/lib/auth';
import { db, logSync, logOrderEvent } from '@/lib/supabase';
import { trackShipments } from '@/lib/ppl';
import { retryPendingFulfilments, pplConfigured } from '@/lib/ship';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * 1. Fulfil bù những đơn đã có mã vận đơn nhưng chưa đẩy được sang Shopify.
 * 2. Tra trạng thái PPL cho các vận đơn đang trên đường → cập nhật đơn 'delivered'.
 *
 *   GET /api/sync/ppl?key=CRON_SECRET
 */
export async function GET(request: Request) {
  if (!checkCronSecret(request, env.cronSecret)) {
    return NextResponse.json({ error: 'Sai CRON_SECRET' }, { status: 401 });
  }

  const supabase = db();

  try {
    const refulfilled = await retryPendingFulfilments();

    if (!pplConfigured()) {
      await logSync('ppl', 'ok', refulfilled, 'Chưa cấu hình PPL — chỉ chạy fulfil bù');
      return NextResponse.json({ ok: true, refulfilled, tracked: 0, note: 'PPL chưa cấu hình' });
    }

    const { data: open } = await supabase
      .from('shipments')
      .select('id, order_id, tracking_number')
      .not('tracking_number', 'is', null)
      .eq('carrier', 'ppl')
      .not('status', 'in', '("delivered","returned")')
      .limit(100);

    const numbers = (open ?? [])
      .map((s) => s.tracking_number as string)
      .filter(Boolean);

    let updated = 0;
    if (numbers.length > 0) {
      // PPL giới hạn số mã mỗi lần tra — chia lô 25.
      for (let i = 0; i < numbers.length; i += 25) {
        const chunk = numbers.slice(i, i + 25);
        const statuses = await trackShipments(chunk);

        for (const st of statuses) {
          const row = (open ?? []).find((s) => s.tracking_number === st.shipmentNumber);
          if (!row) continue;

          await supabase
            .from('shipments')
            .update({ status: st.status, status_detail: st.detail, raw: st.raw })
            .eq('id', row.id);

          if (st.status === 'delivered') {
            await supabase.from('orders').update({ stage: 'delivered' }).eq('id', row.order_id);
          } else if (st.status === 'returned') {
            await supabase
              .from('orders')
              .update({ stage: 'problem', problem_reason: `PPL trả hàng: ${st.detail ?? ''}` })
              .eq('id', row.order_id);
            await logOrderEvent(row.order_id, 'error', `PPL trả hàng về: ${st.detail ?? ''}`);
          }
          updated++;
        }
      }
    }

    await logSync('ppl', 'ok', updated, `fulfil bù ${refulfilled}, cập nhật ${updated} vận đơn`);
    return NextResponse.json({ ok: true, refulfilled, tracked: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logSync('ppl', 'error', 0, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
