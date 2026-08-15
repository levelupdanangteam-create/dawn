import { db } from './supabase';
import type { OrderRow, OrderStage } from './orders';

export function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
}

export interface PnlRow {
  date: string;
  country: string | null;
  orders: number;
  revenue_minor: number;
  cogs_minor: number;
  ad_spend_minor: number;
  gross_profit_minor: number;
  roas: number | null;
}

export async function getPnl(since: string): Promise<PnlRow[]> {
  const { data, error } = await db()
    .from('daily_pnl')
    .select('*')
    .gte('date', since)
    .order('date', { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as PnlRow[];
}

export interface StageCount {
  stage: OrderStage;
  count: number;
}

export async function getStageCounts(): Promise<StageCount[]> {
  // Supabase JS chưa hỗ trợ group by trực tiếp — đếm song song từng trạng thái.
  const stages: OrderStage[] = [
    'new',
    'confirmed',
    'picking',
    'packed',
    'shipped',
    'delivered',
    'problem',
  ];

  const results = await Promise.all(
    stages.map(async (stage) => {
      const { count } = await db()
        .from('orders')
        .select('id', { count: 'exact', head: true })
        .eq('stage', stage);
      return { stage, count: count ?? 0 };
    }),
  );

  return results;
}

export interface StuckOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  ship_country_code: string | null;
  stage: OrderStage;
  stage_changed_at: string;
  hours_in_stage: number;
}

export async function getStuckOrders(limit = 15): Promise<StuckOrder[]> {
  const { data, error } = await db().from('stuck_orders').select('*').limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as StuckOrder[];
}

export async function getOrders(params: {
  stage?: OrderStage | 'all';
  search?: string;
  country?: string;
  limit?: number;
}): Promise<OrderRow[]> {
  let query = db()
    .from('orders')
    .select('*')
    .order('shopify_created_at', { ascending: false })
    .limit(params.limit ?? 100);

  if (params.stage && params.stage !== 'all') query = query.eq('stage', params.stage);
  if (params.country) query = query.eq('ship_country_code', params.country);

  if (params.search) {
    const s = params.search.replace(/[%,()]/g, ' ').trim();
    if (s) {
      query = query.or(
        `order_number.ilike.%${s}%,customer_name.ilike.%${s}%,customer_phone.ilike.%${s}%,customer_email.ilike.%${s}%`,
      );
    }
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as OrderRow[];
}

export async function getOrderDetail(id: string) {
  const supabase = db();

  const [orderRes, itemsRes, shipmentsRes, eventsRes] = await Promise.all([
    supabase.from('orders').select('*').eq('id', id).maybeSingle(),
    supabase.from('order_items').select('*').eq('order_id', id),
    supabase.from('shipments').select('*').eq('order_id', id).order('created_at', { ascending: false }),
    supabase
      .from('order_events')
      .select('*')
      .eq('order_id', id)
      .order('created_at', { ascending: false })
      .limit(30),
  ]);

  if (orderRes.error) throw new Error(orderRes.error.message);

  return {
    order: orderRes.data as OrderRow | null,
    items: itemsRes.data ?? [],
    shipments: shipmentsRes.data ?? [],
    events: eventsRes.data ?? [],
  };
}

export interface PickingOrder extends OrderRow {
  order_items: Array<{
    id: string;
    sku: string | null;
    title: string;
    variant_title: string | null;
    quantity: number;
  }>;
}

/**
 * Hàng chờ của KHO — thay thế Sheet B.
 * Kho mở đúng trang này, thấy đơn nào cần lấy hàng, lấy món gì, bao nhiêu cái.
 */
export async function getWarehouseQueue(): Promise<PickingOrder[]> {
  const { data, error } = await db()
    .from('orders')
    .select('*, order_items(id, sku, title, variant_title, quantity)')
    .in('stage', ['confirmed', 'picking', 'packed'])
    .order('shopify_created_at', { ascending: true })
    .limit(200);

  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as PickingOrder[];
}

/** Gộp tổng số lượng từng SKU cần lấy — kho đi một vòng kho là đủ. */
export function summarisePicking(orders: PickingOrder[]) {
  const map = new Map<string, { sku: string; title: string; quantity: number }>();
  for (const o of orders) {
    for (const i of o.order_items ?? []) {
      const key = i.sku ?? i.title;
      const acc = map.get(key) ?? {
        sku: i.sku ?? '—',
        title: [i.title, i.variant_title].filter(Boolean).join(' — '),
        quantity: 0,
      };
      acc.quantity += i.quantity;
      map.set(key, acc);
    }
  }
  return [...map.values()].sort((a, b) => b.quantity - a.quantity);
}

export interface InventoryRowDb {
  variant_id: number;
  sku: string | null;
  product_title: string;
  variant_title: string | null;
  available: number;
  committed: number;
  price_minor: number;
  unit_cost_minor: number;
  product_status: string;
  reorder_point: number;
  updated_at: string;
}

export async function getInventory(onlyLow = false): Promise<InventoryRowDb[]> {
  let query = db()
    .from('inventory_snapshot')
    .select('*')
    .order('available', { ascending: true })
    .limit(300);

  if (onlyLow) query = query.lte('available', 20);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []) as InventoryRowDb[];
}

export interface CampaignRow {
  campaign_name: string | null;
  country: string | null;
  spend_minor: number;
  impressions: number;
  link_clicks: number;
  purchases: number;
  purchase_value_minor: number;
}

export async function getCampaignPerformance(since: string): Promise<CampaignRow[]> {
  const { data, error } = await db()
    .from('ad_insights')
    .select('campaign_name, country, spend_minor, impressions, link_clicks, purchases, purchase_value_minor')
    .gte('date', since)
    .limit(5000);

  if (error) throw new Error(error.message);

  // Gộp theo campaign + nước ngay trong app (dữ liệu nhỏ, không cần view riêng).
  const map = new Map<string, CampaignRow>();
  for (const r of (data ?? []) as CampaignRow[]) {
    const key = `${r.campaign_name ?? '—'}|${r.country ?? 'ALL'}`;
    const acc = map.get(key) ?? {
      campaign_name: r.campaign_name,
      country: r.country,
      spend_minor: 0,
      impressions: 0,
      link_clicks: 0,
      purchases: 0,
      purchase_value_minor: 0,
    };
    acc.spend_minor += r.spend_minor;
    acc.impressions += r.impressions;
    acc.link_clicks += r.link_clicks;
    acc.purchases += r.purchases;
    acc.purchase_value_minor += r.purchase_value_minor;
    map.set(key, acc);
  }

  return [...map.values()].sort((a, b) => b.spend_minor - a.spend_minor);
}

export interface SyncRun {
  source: string;
  status: string;
  records: number;
  message: string | null;
  started_at: string;
}

export async function getRecentSyncs(limit = 6): Promise<SyncRun[]> {
  const { data } = await db()
    .from('sync_runs')
    .select('source, status, records, message, started_at')
    .order('started_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as SyncRun[];
}
