import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { checkCronSecret } from '@/lib/auth';
import { db, logSync } from '@/lib/supabase';
import { fetchOrdersSince, fetchInventory } from '@/lib/shopify';
import { upsertShopifyOrder } from '@/lib/orders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Lưới an toàn cho webhook: kéo lại mọi đơn cập nhật trong N ngày gần đây.
 * Webhook có thể rớt; cron này đảm bảo không đơn nào bị bỏ sót.
 *
 *   GET /api/sync/shopify?key=CRON_SECRET&days=2&inventory=1
 */
export async function GET(request: Request) {
  if (!checkCronSecret(request, env.cronSecret)) {
    return NextResponse.json({ error: 'Sai CRON_SECRET' }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.min(Number(url.searchParams.get('days') ?? 2) || 2, 60);
  const withInventory = url.searchParams.get('inventory') === '1';
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const nodes = await fetchOrdersSince(since);
    let created = 0;
    const failures: string[] = [];

    for (const node of nodes) {
      try {
        const result = await upsertShopifyOrder(node);
        if (result.created) created++;
      } catch (err) {
        failures.push(`${node.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    let inventoryCount = 0;
    if (withInventory) {
      const rows = await fetchInventory();
      if (rows.length > 0) {
        const { error } = await db()
          .from('inventory_snapshot')
          .upsert(
            rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
            { onConflict: 'variant_id' },
          );
        if (error) failures.push(`tồn kho: ${error.message}`);
        else inventoryCount = rows.length;
      }
    }

    await logSync(
      'shopify',
      failures.length ? 'error' : 'ok',
      nodes.length,
      failures.length ? failures.slice(0, 10).join(' | ') : `${nodes.length} đơn, ${created} mới`,
    );

    return NextResponse.json({
      ok: failures.length === 0,
      orders: nodes.length,
      created,
      inventory: inventoryCount,
      failures,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logSync('shopify', 'error', 0, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
