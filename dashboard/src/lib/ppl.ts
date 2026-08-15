/**
 * Client cho PPL myAPI2 (ppl.cz — thuộc nhóm DHL eCommerce).
 *
 * Luồng của PPL là BẤT ĐỒNG BỘ:
 *   1. POST /shipment  → PPL trả 201 + header `Location` chứa id của lô (batch)
 *   2. GET  /shipment/batch/{id} → poll tới khi `completed`, lấy shipmentNumber
 *   3. GET  /shipment/batch/{id}/label → file PDF nhãn dán để kho in
 *
 * LƯU Ý QUAN TRỌNG: tên trường trong payload dưới đây bám theo tài liệu myAPI2.
 * Trước khi chạy thật, hãy test trên môi trường sandbox của PPL và chỉnh lại
 * đúng một chỗ duy nhất là hàm `buildShipmentPayload()`.
 * Toàn bộ phần còn lại của hệ thống không phụ thuộc vào tên trường của PPL.
 */

import { env } from './env';

export class PplError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'PplError';
  }
}

// --- Token cache (token PPL sống ~30 phút) ---------------------------------

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.token;
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: env.pplClientId,
    client_secret: env.pplClientSecret,
    scope: 'myapi2',
  });

  const res = await fetch(env.pplAuthUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  });

  if (!res.ok) {
    throw new PplError(`PPL auth thất bại: HTTP ${res.status}`, res.status, await res.text());
  }

  const json = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 1800) * 1000,
  };
  return tokenCache.token;
}

async function pplFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const res = await fetch(`${env.pplBaseUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (res.status === 401) {
    tokenCache = null; // token hết hạn sớm — buộc lấy lại lần sau
  }
  return res;
}

// --- Tạo vận đơn -----------------------------------------------------------

export interface ShipmentRequest {
  reference: string; // số đơn Shopify, ví dụ "#1042"
  recipientName: string;
  recipientPhone?: string | null;
  recipientEmail?: string | null;
  street: string;
  city: string;
  zip: string;
  countryCode: string; // CZ, SK, DE, PL...
  note?: string | null;
  codAmount?: number; // đơn vị tiền chính (CZK), 0 = không thu hộ
  codCurrency?: string;
  codVariableSymbol?: string; // thường lấy phần số của order_number
  weightKg?: number;
  packageCount?: number;
}

/**
 * >>> ĐÂY LÀ CHỖ DUY NHẤT CẦN CHỈNH nếu PPL đổi/khác tên trường. <<<
 */
function buildShipmentPayload(s: ShipmentRequest) {
  const hasCod = (s.codAmount ?? 0) > 0;

  return {
    referenceId: s.reference,
    productType: hasCod ? env.pplCodProductType : env.pplProductType,
    note: s.note ?? undefined,
    depot: undefined,
    shipmentSet: s.packageCount && s.packageCount > 1
      ? { numberOfShipments: s.packageCount }
      : undefined,
    sender: {
      name: env.pplSenderName,
      street: env.pplSenderStreet,
      city: env.pplSenderCity,
      zipCode: env.pplSenderZip,
      country: env.pplSenderCountry,
      phone: env.pplSenderPhone || undefined,
      email: env.pplSenderEmail || undefined,
    },
    recipient: {
      name: s.recipientName,
      street: s.street,
      city: s.city,
      zipCode: s.zip,
      country: s.countryCode,
      phone: s.recipientPhone || undefined,
      email: s.recipientEmail || undefined,
    },
    cashOnDelivery: hasCod
      ? {
          codCurrency: s.codCurrency ?? 'CZK',
          codPrice: s.codAmount,
          codVarSym: s.codVariableSymbol ?? s.reference.replace(/\D/g, ''),
          account: env.pplBankAccount || undefined,
          bankCode: env.pplBankCode || undefined,
        }
      : undefined,
    weightedShipmentInfo: s.weightKg ? { weight: s.weightKg } : undefined,
  };
}

export interface CreateBatchResult {
  batchId: string;
}

/** Gửi 1..N vận đơn lên PPL. Trả về id lô để poll. */
export async function createShipments(shipments: ShipmentRequest[]): Promise<CreateBatchResult> {
  const payload = { shipments: shipments.map(buildShipmentPayload) };

  const res = await pplFetch('/shipment', {
    method: 'POST',
    body: JSON.stringify(payload),
  });

  if (res.status !== 201 && res.status !== 202 && !res.ok) {
    throw new PplError(`PPL từ chối vận đơn: HTTP ${res.status}`, res.status, await res.text());
  }

  // PPL trả id lô trong header Location: .../shipment/batch/{id}
  const location = res.headers.get('location') ?? res.headers.get('Location');
  if (location) {
    const id = location.split('/').filter(Boolean).pop();
    if (id) return { batchId: id };
  }

  // Một số phiên bản trả JSON thay vì header.
  const text = await res.text();
  try {
    const json = JSON.parse(text) as { batchId?: string; id?: string };
    const id = json.batchId ?? json.id;
    if (id) return { batchId: String(id) };
  } catch {
    /* rơi xuống lỗi bên dưới */
  }

  throw new PplError('Không đọc được batchId từ phản hồi của PPL', res.status, text);
}

export interface BatchItem {
  reference: string | null;
  shipmentNumber: string | null;
  labelUrl: string | null;
  importState: string | null;
  errors: string[];
}

export interface BatchStatus {
  completed: boolean;
  items: BatchItem[];
  raw: unknown;
}

export async function getBatchStatus(batchId: string): Promise<BatchStatus> {
  const res = await pplFetch(`/shipment/batch/${encodeURIComponent(batchId)}`);

  if (res.status === 404) {
    return { completed: false, items: [], raw: null };
  }
  if (!res.ok) {
    throw new PplError(`Không đọc được lô PPL: HTTP ${res.status}`, res.status, await res.text());
  }

  const json = (await res.json()) as {
    completeStatus?: string;
    items?: Array<{
      referenceId?: string;
      shipmentNumber?: string;
      labelUrl?: string;
      importState?: string;
      messages?: Array<{ text?: string; message?: string }>;
    }>;
  };

  const items: BatchItem[] = (json.items ?? []).map((i) => ({
    reference: i.referenceId ?? null,
    shipmentNumber: i.shipmentNumber ?? null,
    labelUrl: i.labelUrl ?? null,
    importState: i.importState ?? null,
    errors: (i.messages ?? []).map((m) => m.text ?? m.message ?? '').filter(Boolean),
  }));

  const completed =
    (json.completeStatus ?? '').toLowerCase() === 'complete' ||
    items.some((i) => Boolean(i.shipmentNumber));

  return { completed, items, raw: json };
}

/** Poll lô cho tới khi PPL cấp số vận đơn (mặc định tối đa ~20 giây). */
export async function waitForBatch(batchId: string, attempts = 8, delayMs = 2500): Promise<BatchStatus> {
  let last: BatchStatus = { completed: false, items: [], raw: null };
  for (let i = 0; i < attempts; i++) {
    last = await getBatchStatus(batchId);
    if (last.completed) return last;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return last;
}

// --- Tra cứu trạng thái ----------------------------------------------------

export interface TrackingStatus {
  shipmentNumber: string;
  status: string; // chuẩn hoá về: in_transit | delivered | returned | failed | unknown
  detail: string | null;
  raw: unknown;
}

const DELIVERED = ['delivered', 'doručeno', 'dorucen'];
const RETURNED = ['returned', 'return', 'vráceno', 'vracen'];

export async function trackShipments(numbers: string[]): Promise<TrackingStatus[]> {
  if (numbers.length === 0) return [];

  const params = new URLSearchParams();
  for (const n of numbers) params.append('ShipmentNumbers', n);

  const res = await pplFetch(`/shipment?${params.toString()}`);
  if (!res.ok) {
    throw new PplError(`Không tra được vận đơn PPL: HTTP ${res.status}`, res.status, await res.text());
  }

  const json = (await res.json()) as Array<{
    shipmentNumber?: string;
    shipmentPhase?: string;
    trackAndTrace?: { events?: Array<{ eventText?: string; eventCode?: string; eventDate?: string }> };
  }>;

  return (json ?? []).map((s) => {
    const events = s.trackAndTrace?.events ?? [];
    const lastEvent = events[events.length - 1];
    const text = `${s.shipmentPhase ?? ''} ${lastEvent?.eventText ?? ''}`.toLowerCase();

    let status: TrackingStatus['status'] = 'in_transit';
    if (DELIVERED.some((k) => text.includes(k))) status = 'delivered';
    else if (RETURNED.some((k) => text.includes(k))) status = 'returned';
    else if (!text.trim()) status = 'unknown';

    return {
      shipmentNumber: s.shipmentNumber ?? '',
      status,
      detail: lastEvent?.eventText ?? s.shipmentPhase ?? null,
      raw: s,
    };
  });
}

export function trackingUrl(shipmentNumber: string): string {
  return `https://www.ppl.cz/vyhledat-zasilku?shipmentId=${encodeURIComponent(shipmentNumber)}`;
}

/** Lấy PDF nhãn dán của cả lô để kho in một lần. */
export async function getBatchLabelPdf(batchId: string): Promise<ArrayBuffer> {
  const res = await pplFetch(`/shipment/batch/${encodeURIComponent(batchId)}/label`, {
    headers: { Accept: 'application/pdf' },
  });
  if (!res.ok) {
    throw new PplError(`Không lấy được nhãn PPL: HTTP ${res.status}`, res.status, await res.text());
  }
  return res.arrayBuffer();
}
