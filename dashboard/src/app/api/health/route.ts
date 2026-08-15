import { NextResponse } from 'next/server';
import { isConfigured } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    ok: true,
    time: new Date().toISOString(),
    configured: {
      supabase: isConfigured('SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'),
      shopify: isConfigured('SHOPIFY_SHOP', 'SHOPIFY_ADMIN_TOKEN'),
      shopifyWebhook: isConfigured('SHOPIFY_WEBHOOK_SECRET'),
      meta: isConfigured('META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'),
      ppl: isConfigured('PPL_CLIENT_ID', 'PPL_CLIENT_SECRET', 'PPL_CUSTOMER_ID'),
      auth: isConfigured('DASHBOARD_PASSWORD', 'SESSION_SECRET', 'CRON_SECRET'),
    },
  });
}
