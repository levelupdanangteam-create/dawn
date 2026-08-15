/**
 * "Một nút bấm" thay cho chuỗi: kho báo mã → Zalo cho marketing →
 * marketing mở Shopify → Mark as Fulfilled → dán mã vận đơn.
 *
 * shipOrder() làm trọn gói:
 *   1. Tạo vận đơn PPL (hoặc nhận mã nhập tay nếu chưa có API)
 *   2. Lưu vận đơn vào DB
 *   3. Gọi Shopify fulfillmentCreate kèm tracking → Shopify tự gửi mail cho khách
 *   4. Đẩy đơn sang stage 'shipped' và ghi nhật ký
 */

import { db, logOrderEvent } from './supabase';
import { fulfillOrderWithTracking } from './shopify';
import { createShipments, waitForBatch, trackingUrl, type ShipmentRequest } from './ppl';
import { fromMinor } from './money';
import { isConfigured } from './env';
import type { OrderRow } from './orders';

export interface ShipOptions {
  /** Nhập tay khi chưa bật API PPL, hoặc khi gửi qua nhà xe. */
  manualTrackingNumber?: string;
  weightKg?: number;
  packageCount?: number;
  notifyCustomer?: boolean;
  actor?: string;
}

export interface ShipOutcome {
  trackingNumber: string;
  labelUrl: string | null;
  fulfilledOnShopify: boolean;
  warning?: string;
}

export function pplConfigured(): boolean {
  return isConfigured('PPL_CLIENT_ID', 'PPL_CLIENT_SECRET', 'PPL_CUSTOMER_ID');
}

export async function shipOrder(order: OrderRow, opts: ShipOptions = {}): Promise<ShipOutcome> {
  const supabase = db();
  const actor = opts.actor ?? 'system';

  let trackingNumber = opts.manualTrackingNumber?.trim() ?? '';
  let labelUrl: string | null = null;
  let batchId: string | null = null;
  let warning: string | undefined;

  // --- 1. Tạo vận đơn ------------------------------------------------------
  if (!trackingNumber) {
    if (!pplConfigured()) {
      throw new Error(
        'Chưa cấu hình API PPL. Hãy nhập mã vận đơn thủ công, hoặc điền PPL_CLIENT_ID / PPL_CLIENT_SECRET / PPL_CUSTOMER_ID.',
      );
    }

    const request: ShipmentRequest = {
      reference: order.order_number,
      recipientName: order.customer_name ?? 'Zákazník',
      recipientPhone: order.customer_phone,
      recipientEmail: order.customer_email,
      street: [order.ship_address1, order.ship_address2].filter(Boolean).join(', '),
      city: order.ship_city ?? '',
      zip: (order.ship_zip ?? '').replace(/\s/g, ''),
      countryCode: order.ship_country_code ?? 'CZ',
      note: order.customer_note,
      codAmount: order.is_cod ? fromMinor(order.total_minor) : 0,
      codCurrency: order.currency,
      codVariableSymbol: order.order_number.replace(/\D/g, ''),
      weightKg: opts.weightKg,
      packageCount: opts.packageCount ?? 1,
    };

    const batch = await createShipments([request]);
    batchId = batch.batchId;

    const status = await waitForBatch(batch.batchId);
    const item =
      status.items.find((i) => i.reference === order.order_number) ?? status.items[0];

    if (!item?.shipmentNumber) {
      const errors = item?.errors?.join('; ');
      throw new Error(
        `PPL chưa cấp số vận đơn cho ${order.order_number}${errors ? `: ${errors}` : '. Thử lại sau ít phút hoặc kiểm tra trong PPL myAPI.'}`,
      );
    }

    trackingNumber = item.shipmentNumber;
    labelUrl = item.labelUrl ?? null;
  }

  // --- 2. Lưu vận đơn ------------------------------------------------------
  const { data: shipment, error: shipError } = await supabase
    .from('shipments')
    .upsert(
      {
        order_id: order.id,
        carrier: opts.manualTrackingNumber ? 'manual' : 'ppl',
        tracking_number: trackingNumber,
        label_url: labelUrl,
        ppl_batch_id: batchId,
        status: 'labelled',
        cod_amount_minor: order.is_cod ? order.total_minor : 0,
        weight_grams: opts.weightKg ? Math.round(opts.weightKg * 1000) : null,
      },
      { onConflict: 'tracking_number' },
    )
    .select('id')
    .single();

  if (shipError) throw new Error(`Lưu vận đơn thất bại: ${shipError.message}`);

  // --- 3. Fulfil trên Shopify ---------------------------------------------
  let fulfilled = false;
  try {
    if (!order.shopify_order_gid) throw new Error('Đơn thiếu shopify_order_gid');

    await fulfillOrderWithTracking({
      orderGid: order.shopify_order_gid,
      trackingNumber,
      trackingUrl: trackingUrl(trackingNumber),
      company: 'PPL',
      notifyCustomer: opts.notifyCustomer ?? true,
    });
    fulfilled = true;

    await supabase
      .from('shipments')
      .update({ pushed_to_shopify: true, pushed_at: new Date().toISOString() })
      .eq('id', shipment.id);
  } catch (err) {
    // Vận đơn đã tạo rồi — không được rollback. Ghi cảnh báo để cron thử lại.
    warning = `Đã có mã vận đơn ${trackingNumber} nhưng chưa fulfil được trên Shopify: ${
      err instanceof Error ? err.message : String(err)
    }. Hệ thống sẽ tự thử lại ở lần đồng bộ tới.`;
    await logOrderEvent(order.id, 'error', warning, actor);
  }

  // --- 4. Đổi trạng thái ---------------------------------------------------
  await supabase
    .from('orders')
    .update({
      stage: 'shipped',
      fulfillment_status: fulfilled ? 'fulfilled' : order.financial_status,
      fulfilled_at: fulfilled ? new Date().toISOString() : null,
      assigned_to: actor,
    })
    .eq('id', order.id);

  await logOrderEvent(
    order.id,
    'ship',
    `Gửi PPL — mã vận đơn ${trackingNumber}${fulfilled ? ', đã fulfil trên Shopify' : ''}`,
    actor,
    { trackingNumber, batchId },
  );

  return { trackingNumber, labelUrl, fulfilledOnShopify: fulfilled, warning };
}

/**
 * Thử fulfil lại những vận đơn đã có mã nhưng chưa đẩy được sang Shopify.
 * Cron gọi hàm này — không bao giờ để đơn "có mã mà khách không nhận được mail".
 */
export async function retryPendingFulfilments(): Promise<number> {
  const supabase = db();

  const { data: pending } = await supabase
    .from('shipments')
    .select('id, tracking_number, orders!inner(id, shopify_order_gid, order_number)')
    .eq('pushed_to_shopify', false)
    .not('tracking_number', 'is', null)
    .limit(50);

  let done = 0;
  for (const row of pending ?? []) {
    const order = (row as unknown as {
      orders: { id: string; shopify_order_gid: string | null; order_number: string };
    }).orders;
    const tracking = (row as { tracking_number: string }).tracking_number;

    if (!order?.shopify_order_gid) continue;

    try {
      await fulfillOrderWithTracking({
        orderGid: order.shopify_order_gid,
        trackingNumber: tracking,
        trackingUrl: trackingUrl(tracking),
        company: 'PPL',
      });
      await supabase
        .from('shipments')
        .update({ pushed_to_shopify: true, pushed_at: new Date().toISOString() })
        .eq('id', (row as { id: string }).id);
      await logOrderEvent(order.id, 'ship', `Fulfil bù thành công — ${tracking}`);
      done++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // "đã fulfil rồi" không phải lỗi — đánh dấu xong để khỏi thử mãi.
      if (/không còn dòng hàng|already fulfilled/i.test(message)) {
        await supabase
          .from('shipments')
          .update({ pushed_to_shopify: true, pushed_at: new Date().toISOString() })
          .eq('id', (row as { id: string }).id);
        done++;
      } else {
        await logOrderEvent(order.id, 'error', `Fulfil bù thất bại: ${message}`);
      }
    }
  }

  return done;
}
