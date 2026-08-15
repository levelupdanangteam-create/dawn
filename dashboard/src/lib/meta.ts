/**
 * Meta Marketing API — kéo chi phí quảng cáo theo NGÀY và theo NƯỚC.
 *
 * Token: dùng System User token của Business Manager (không hết hạn) với quyền
 * `ads_read`. Xem hướng dẫn trong dashboard/README.md.
 */

import { env } from './env';
import { toMinor } from './money';

export class MetaError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'MetaError';
  }
}

export interface AdInsightRow {
  platform: 'meta';
  date: string; // YYYY-MM-DD
  account_id: string;
  campaign_id: string | null;
  campaign_name: string | null;
  adset_id: string | null;
  adset_name: string | null;
  ad_id: string | null;
  ad_name: string | null;
  country: string;
  currency: string;
  spend_minor: number;
  impressions: number;
  clicks: number;
  link_clicks: number;
  purchases: number;
  purchase_value_minor: number;
}

interface RawInsight {
  date_start: string;
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  country?: string;
  account_currency?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
  action_values?: Array<{ action_type: string; value: string }>;
}

const FIELDS = [
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'account_currency',
  'spend',
  'impressions',
  'clicks',
  'inline_link_clicks',
  'actions',
  'action_values',
].join(',');

const PURCHASE_TYPES = new Set([
  'purchase',
  'omni_purchase',
  'offsite_conversion.fb_pixel_purchase',
]);

/**
 * @param since  ngày bắt đầu (YYYY-MM-DD)
 * @param until  ngày kết thúc (YYYY-MM-DD)
 * @param byCountry  true = tách theo nước (để so ROAS từng thị trường)
 */
export async function fetchAdInsights(
  since: string,
  until: string,
  byCountry = true,
): Promise<AdInsightRow[]> {
  const accountId = env.metaAdAccountId.startsWith('act_')
    ? env.metaAdAccountId
    : `act_${env.metaAdAccountId}`;

  const params = new URLSearchParams({
    access_token: env.metaToken,
    level: 'ad',
    time_increment: '1',
    time_range: JSON.stringify({ since, until }),
    fields: FIELDS,
    limit: '500',
  });
  if (byCountry) params.set('breakdowns', 'country');

  let url = `https://graph.facebook.com/${env.metaApiVersion}/${accountId}/insights?${params.toString()}`;
  const rows: AdInsightRow[] = [];
  let pages = 0;

  while (url && pages < 50) {
    const res = await fetch(url, { cache: 'no-store' });
    const json = (await res.json()) as {
      data?: RawInsight[];
      paging?: { next?: string };
      error?: { message: string; type?: string; code?: number };
    };

    if (json.error) {
      throw new MetaError(`Meta API lỗi: ${json.error.message}`, json.error);
    }

    for (const r of json.data ?? []) {
      const purchases = sumActions(r.actions, PURCHASE_TYPES);
      const purchaseValue = sumActions(r.action_values, PURCHASE_TYPES);

      rows.push({
        platform: 'meta',
        date: r.date_start,
        account_id: accountId,
        campaign_id: r.campaign_id ?? null,
        campaign_name: r.campaign_name ?? null,
        adset_id: r.adset_id ?? null,
        adset_name: r.adset_name ?? null,
        ad_id: r.ad_id ?? null,
        ad_name: r.ad_name ?? null,
        country: r.country ?? 'ALL',
        currency: r.account_currency ?? env.baseCurrency,
        spend_minor: toMinor(r.spend ?? '0'),
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        link_clicks: Number(r.inline_link_clicks ?? 0),
        purchases: Math.round(purchases),
        purchase_value_minor: toMinor(purchaseValue),
      });
    }

    url = json.paging?.next ?? '';
    pages++;
  }

  return rows;
}

function sumActions(
  actions: Array<{ action_type: string; value: string }> | undefined,
  types: Set<string>,
): number {
  if (!actions) return 0;
  // Chỉ lấy loại "mạnh nhất" để không cộng trùng purchase + omni_purchase.
  for (const preferred of ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase']) {
    const hit = actions.find((a) => a.action_type === preferred);
    if (hit) return Number.parseFloat(hit.value) || 0;
  }
  return actions
    .filter((a) => types.has(a.action_type))
    .reduce((s, a) => s + (Number.parseFloat(a.value) || 0), 0);
}
