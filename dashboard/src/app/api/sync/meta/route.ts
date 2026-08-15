import { NextResponse } from 'next/server';
import { env } from '@/lib/env';
import { checkCronSecret } from '@/lib/auth';
import { db, logSync } from '@/lib/supabase';
import { fetchAdInsights } from '@/lib/meta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Kéo chi phí Meta Ads theo ngày + theo nước.
 * Mặc định lấy lại 3 ngày gần nhất vì Meta còn chỉnh số hồi tố (attribution).
 *
 *   GET /api/sync/meta?key=CRON_SECRET&days=3
 */
export async function GET(request: Request) {
  if (!checkCronSecret(request, env.cronSecret)) {
    return NextResponse.json({ error: 'Sai CRON_SECRET' }, { status: 401 });
  }

  const url = new URL(request.url);
  const days = Math.min(Number(url.searchParams.get('days') ?? 3) || 3, 90);

  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  try {
    const rows = await fetchAdInsights(fmt(since), fmt(until));

    if (rows.length > 0) {
      const { error } = await db()
        .from('ad_insights')
        .upsert(
          rows.map((r) => ({ ...r, synced_at: new Date().toISOString() })),
          { onConflict: 'platform,date,ad_id,country' },
        );
      if (error) throw new Error(error.message);
    }

    await logSync('meta', 'ok', rows.length, `${fmt(since)} → ${fmt(until)}`);
    return NextResponse.json({ ok: true, rows: rows.length, since: fmt(since), until: fmt(until) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logSync('meta', 'error', 0, message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
