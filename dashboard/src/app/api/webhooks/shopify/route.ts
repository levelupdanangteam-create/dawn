import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { db, logSync } from '@/lib/supabase';
import { fetchOrderById } from '@/lib/shopify';
import { upsertShopifyOrder } from '@/lib/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Điểm nhận đơn realtime từ Shopify.
 * Đăng ký webhook cho các topic: orders/create, orders/updated,
 * orders/cancelled, fulfillments/create.
 *
 * Shopify chỉ chờ 5 giây — nên ở đây làm càng nhanh càng tốt.
 */
export async function POST(request: Request) {
  const raw = await request.text();
  const hmacHeader = request.headers.get('x-shopify-hmac-sha256') ?? '';
  const topic = request.headers.get('x-shopify-topic') ?? 'unknown';

  if (!verifyShopifyHmac(raw, hmacHeader)) {
    return NextResponse.json({ error: 'HMAC không hợp lệ' }, { status: 401 });
  }

  let payload: { id?: number; admin_graphql_api_id?: string; order_id?: number };
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Body không phải JSON' }, { status: 400 });
  }

  const orderId = payload.order_id ?? payload.id;
  if (!orderId) {
    return NextResponse.json({ ok: true, skipped: 'không có order id' });
  }

  try {
    if (topic === 'orders/cancelled') {
      await db()
        .from('orders')
        .update({ stage: 'cancelled' })
        .eq('shopify_order_id', orderId);
      await logSync('shopify', 'ok', 1, `webhook ${topic} #${orderId}`);
      return NextResponse.json({ ok: true });
    }

    // Webhook payload REST không có unitCost/UTM — đọc lại bằng GraphQL
    // để có đủ giá vốn và nguồn đơn.
    const node = await fetchOrderById(orderId);
    if (!node) {
      return NextResponse.json({ ok: true, skipped: 'không tìm thấy đơn' });
    }

    const { created } = await upsertShopifyOrder(node);
    await logSync('shopify', 'ok', 1, `webhook ${topic} ${node.name} (${created ? 'mới' : 'cập nhật'})`);

    return NextResponse.json({ ok: true, created });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logSync('shopify', 'error', 0, `webhook ${topic}: ${message}`);
    // Trả 500 để Shopify tự gửi lại (retry tới 48h).
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function verifyShopifyHmac(rawBody: string, header: string): boolean {
  if (!header) return false;
  const digest = createHmac('sha256', env.shopifyWebhookSecret)
    .update(rawBody, 'utf8')
    .digest('base64');

  const a = Buffer.from(digest);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}
