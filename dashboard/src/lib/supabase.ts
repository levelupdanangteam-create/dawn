import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let cached: SupabaseClient | null = null;

/**
 * Client dùng service-role key — CHỈ được gọi từ code chạy trên server
 * (route handler, server component, server action). Không bao giờ import
 * file này vào component có 'use client'.
 */
export function db(): SupabaseClient {
  if (!cached) {
    cached = createClient(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cached;
}

export async function logSync(
  source: string,
  status: 'ok' | 'error',
  records: number,
  message?: string,
) {
  await db()
    .from('sync_runs')
    .insert({
      source,
      status,
      records,
      message: message?.slice(0, 2000) ?? null,
      finished_at: new Date().toISOString(),
    });
}

export async function logOrderEvent(
  orderId: string,
  kind: string,
  message: string,
  actor = 'system',
  meta?: Record<string, unknown>,
) {
  await db()
    .from('order_events')
    .insert({ order_id: orderId, kind, message, actor, meta: meta ?? null });
}
