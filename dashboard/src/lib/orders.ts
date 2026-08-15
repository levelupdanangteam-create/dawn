import { db, logOrderEvent } from './supabase';
import { mapShopifyOrder } from './shopify';

export type OrderStage =
  | 'new'
  | 'confirmed'
  | 'picking'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'problem'
  | 'cancelled';

export const STAGE_LABELS: Record<OrderStage, string> = {
  new: 'Đơn mới',
  confirmed: 'Đã xác nhận',
  picking: 'Kho đang lấy hàng',
  packed: 'Đã đóng gói',
  shipped: 'Đã gửi PPL',
  delivered: 'Đã giao',
  problem: 'Có vấn đề',
  cancelled: 'Đã huỷ',
};

export const STAGE_ORDER: OrderStage[] = [
  'new',
  'confirmed',
  'picking',
  'packed',
  'shipped',
  'delivered',
];

/** Bước tiếp theo trong quy trình — dùng cho nút "Chuyển bước" một chạm. */
export function nextStage(stage: OrderStage): OrderStage | null {
  const i = STAGE_ORDER.indexOf(stage);
  if (i === -1 || i === STAGE_ORDER.length - 1) return null;
  return STAGE_ORDER[i + 1];
}

/**
 * Ghi (hoặc cập nhật) một đơn Shopify vào DB.
 * Giữ nguyên `stage` nội bộ nếu đơn đã tồn tại — Shopify không được phép
 * ghi đè tiến độ mà team đang xử lý.
 */
export async function upsertShopifyOrder(
  node: Parameters<typeof mapShopifyOrder>[0],
): Promise<{ id: string; created: boolean }> {
  const supabase = db();
  const { order, items } = mapShopifyOrder(node);

  const { data: existing } = await supabase
    .from('orders')
    .select('id, stage')
    .eq('shopify_order_id', order.shopify_order_id)
    .maybeSingle();

  // Đơn bị huỷ bên Shopify -> đồng bộ sang stage cancelled.
  const patch: Record<string, unknown> = { ...order };
  if (!existing) {
    patch.stage = 'new';
  } else if (order.financial_status === 'refunded' || order.financial_status === 'voided') {
    patch.stage = 'cancelled';
  } else if (order.fulfillment_status === 'fulfilled' && existing.stage !== 'delivered') {
    // Ai đó bấm Fulfil thẳng trên Shopify — dashboard đi theo.
    patch.stage = 'shipped';
  }

  const { data: saved, error } = await supabase
    .from('orders')
    .upsert(patch, { onConflict: 'shopify_order_id' })
    .select('id')
    .single();

  if (error) throw new Error(`Lưu đơn thất bại: ${error.message}`);

  const orderId = saved.id as string;

  if (items.length > 0) {
    const { error: itemError } = await supabase
      .from('order_items')
      .upsert(
        items.map((i) => ({ ...i, order_id: orderId })),
        { onConflict: 'order_id,shopify_line_id' },
      );
    if (itemError) throw new Error(`Lưu dòng hàng thất bại: ${itemError.message}`);
  }

  if (!existing) {
    await logOrderEvent(orderId, 'sync', `Đơn ${order.order_number} về từ Shopify`);
  }

  return { id: orderId, created: !existing };
}

export interface OrderRow {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  ship_address1: string | null;
  ship_address2: string | null;
  ship_city: string | null;
  ship_zip: string | null;
  ship_country_code: string | null;
  customer_note: string | null;
  internal_note: string | null;
  problem_reason: string | null;
  currency: string;
  total_minor: number;
  cogs_minor: number;
  shipping_minor: number;
  is_cod: boolean;
  payment_method: string | null;
  financial_status: string | null;
  stage: OrderStage;
  stage_changed_at: string;
  assigned_to: string | null;
  shopify_created_at: string;
  shopify_order_gid: string | null;
  shopify_order_id: number;
}

export interface OrderItemRow {
  id: string;
  sku: string | null;
  title: string;
  variant_title: string | null;
  quantity: number;
  unit_price_minor: number;
  unit_cost_minor: number;
}

export interface ShipmentRow {
  id: string;
  tracking_number: string | null;
  label_url: string | null;
  status: string;
  status_detail: string | null;
  carrier: string;
  pushed_to_shopify: boolean;
  created_at: string;
}
