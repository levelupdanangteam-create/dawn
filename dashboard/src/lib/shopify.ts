import { env } from './env';
import { toMinor } from './money';

const USER_AGENT = 'Phomifood-Dashboard/0.1';

export class ShopifyError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ShopifyError';
  }
}

export async function shopifyGraphQL<T = unknown>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const url = `https://${env.shopifyShop}/admin/api/${env.shopifyApiVersion}/graphql.json`;

  let lastError: unknown;
  // Shopify trả 429/5xx khi bị throttle — thử lại vài lần với backoff.
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': env.shopifyToken,
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ query, variables }),
      cache: 'no-store',
    });

    if (res.status === 429 || res.status >= 500) {
      lastError = new ShopifyError(`Shopify HTTP ${res.status}`);
      await sleep(2 ** attempt * 1000);
      continue;
    }

    const json = (await res.json()) as {
      data?: T;
      errors?: Array<{ message: string; extensions?: { code?: string } }>;
    };

    if (json.errors?.length) {
      const throttled = json.errors.some((e) => e.extensions?.code === 'THROTTLED');
      if (throttled) {
        lastError = new ShopifyError('THROTTLED');
        await sleep(2 ** attempt * 1000);
        continue;
      }
      throw new ShopifyError(json.errors.map((e) => e.message).join('; '), json.errors);
    }

    if (!json.data) throw new ShopifyError('Shopify không trả về data', json);
    return json.data;
  }

  throw new ShopifyError('Shopify không phản hồi sau 4 lần thử', lastError);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Đọc đơn hàng
// ---------------------------------------------------------------------------

const ORDER_FIELDS = `
  id
  legacyResourceId
  name
  createdAt
  note
  currencyCode
  displayFinancialStatus
  displayFulfillmentStatus
  paymentGatewayNames
  customAttributes { key value }
  totalPriceSet { shopMoney { amount currencyCode } }
  subtotalPriceSet { shopMoney { amount } }
  totalShippingPriceSet { shopMoney { amount } }
  totalDiscountsSet { shopMoney { amount } }
  customer { firstName lastName email phone }
  shippingAddress {
    name phone address1 address2 city zip countryCodeV2
  }
  fulfillments(first: 5) { trackingInfo { number url company } createdAt }
  lineItems(first: 100) {
    nodes {
      id
      sku
      title
      variantTitle
      quantity
      product { legacyResourceId }
      variant {
        legacyResourceId
        inventoryItem { unitCost { amount } }
      }
      originalUnitPriceSet { shopMoney { amount } }
    }
  }
`;

const JOURNEY_FRAGMENT = `
  customerJourneySummary {
    lastVisit {
      landingPage
      referrerUrl
      utmParameters { source medium campaign }
    }
  }
`;

interface ShopifyOrderNode {
  id: string;
  legacyResourceId: string;
  name: string;
  createdAt: string;
  note: string | null;
  currencyCode: string;
  displayFinancialStatus: string | null;
  displayFulfillmentStatus: string | null;
  paymentGatewayNames: string[];
  customAttributes: Array<{ key: string; value: string | null }>;
  totalPriceSet: { shopMoney: { amount: string; currencyCode: string } };
  subtotalPriceSet: { shopMoney: { amount: string } } | null;
  totalShippingPriceSet: { shopMoney: { amount: string } } | null;
  totalDiscountsSet: { shopMoney: { amount: string } } | null;
  customer: { firstName: string | null; lastName: string | null; email: string | null; phone: string | null } | null;
  shippingAddress: {
    name: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    zip: string | null;
    countryCodeV2: string | null;
  } | null;
  fulfillments: Array<{
    trackingInfo: Array<{ number: string | null; url: string | null; company: string | null }>;
    createdAt: string;
  }>;
  lineItems: {
    nodes: Array<{
      id: string;
      sku: string | null;
      title: string;
      variantTitle: string | null;
      quantity: number;
      product: { legacyResourceId: string } | null;
      variant: { legacyResourceId: string; inventoryItem: { unitCost: { amount: string } | null } | null } | null;
      originalUnitPriceSet: { shopMoney: { amount: string } };
    }>;
  };
  customerJourneySummary?: {
    lastVisit: {
      landingPage: string | null;
      referrerUrl: string | null;
      utmParameters: { source: string | null; medium: string | null; campaign: string | null } | null;
    } | null;
  } | null;
}

/**
 * Lấy đơn hàng tạo/cập nhật sau `since`.
 * Thử kèm customerJourneySummary (để có UTM ghép với Meta Ads); nếu app chưa
 * được duyệt quyền protected customer data thì tự động chạy lại bản rút gọn.
 */
export async function fetchOrdersSince(since: Date, max = 250): Promise<ShopifyOrderNode[]> {
  const filter = `updated_at:>='${since.toISOString()}'`;

  const build = (withJourney: boolean) => `
    query Orders($cursor: String) {
      orders(first: 50, after: $cursor, query: "${filter}", sortKey: UPDATED_AT) {
        nodes { ${ORDER_FIELDS} ${withJourney ? JOURNEY_FRAGMENT : ''} }
        pageInfo { hasNextPage endCursor }
      }
    }
  `;

  let withJourney = true;
  const out: ShopifyOrderNode[] = [];
  let cursor: string | null = null;

  while (out.length < max) {
    let page: { orders: { nodes: ShopifyOrderNode[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } };
    try {
      page = await shopifyGraphQL(build(withJourney), { cursor });
    } catch (err) {
      if (withJourney) {
        // Rất có thể do thiếu quyền read_customer_journey / protected data.
        withJourney = false;
        continue;
      }
      throw err;
    }

    out.push(...page.orders.nodes);
    if (!page.orders.pageInfo.hasNextPage) break;
    cursor = page.orders.pageInfo.endCursor;
  }

  return out;
}

export async function fetchOrderById(shopifyOrderId: string | number): Promise<ShopifyOrderNode | null> {
  const gid = String(shopifyOrderId).startsWith('gid://')
    ? String(shopifyOrderId)
    : `gid://shopify/Order/${shopifyOrderId}`;

  const data = await shopifyGraphQL<{ order: ShopifyOrderNode | null }>(
    `query Order($id: ID!) { order(id: $id) { ${ORDER_FIELDS} } }`,
    { id: gid },
  );
  return data.order;
}

// ---------------------------------------------------------------------------
// Chuyển đơn Shopify -> hàng trong bảng orders / order_items
// ---------------------------------------------------------------------------

const COD_HINTS = ['cash on delivery', 'cod', 'dobírka', 'dobirka', 'nachnahme', 'pobranie'];

export interface MappedOrder {
  order: Record<string, unknown>;
  items: Array<Record<string, unknown>>;
}

export function mapShopifyOrder(node: ShopifyOrderNode): MappedOrder {
  const addr = node.shippingAddress;
  const gateways = node.paymentGatewayNames ?? [];
  const gatewayText = gateways.join(' ').toLowerCase();
  const isCod = COD_HINTS.some((h) => gatewayText.includes(h));

  const attrs = new Map(
    (node.customAttributes ?? []).map((a) => [a.key.toLowerCase(), a.value ?? '']),
  );
  const journey = node.customerJourneySummary?.lastVisit;

  const items = node.lineItems.nodes.map((li) => ({
    shopify_line_id: gidToId(li.id),
    product_id: li.product ? Number(li.product.legacyResourceId) : null,
    variant_id: li.variant ? Number(li.variant.legacyResourceId) : null,
    sku: li.sku,
    title: li.title,
    variant_title: li.variantTitle,
    quantity: li.quantity,
    unit_price_minor: toMinor(li.originalUnitPriceSet.shopMoney.amount),
    unit_cost_minor: toMinor(li.variant?.inventoryItem?.unitCost?.amount ?? 0),
  }));

  const cogs = items.reduce((sum, i) => sum + i.unit_cost_minor * i.quantity, 0);

  const customerName =
    addr?.name ||
    [node.customer?.firstName, node.customer?.lastName].filter(Boolean).join(' ') ||
    null;

  const order = {
    shopify_order_id: Number(node.legacyResourceId),
    shopify_order_gid: node.id,
    order_number: node.name,
    customer_name: customerName,
    customer_phone: addr?.phone ?? node.customer?.phone ?? null,
    customer_email: node.customer?.email ?? null,
    ship_address1: addr?.address1 ?? null,
    ship_address2: addr?.address2 ?? null,
    ship_city: addr?.city ?? null,
    ship_zip: addr?.zip ?? null,
    ship_country_code: addr?.countryCodeV2 ?? null,
    customer_note: node.note ?? null,
    currency: node.totalPriceSet.shopMoney.currencyCode ?? node.currencyCode,
    total_minor: toMinor(node.totalPriceSet.shopMoney.amount),
    subtotal_minor: toMinor(node.subtotalPriceSet?.shopMoney.amount ?? 0),
    shipping_minor: toMinor(node.totalShippingPriceSet?.shopMoney.amount ?? 0),
    discount_minor: toMinor(node.totalDiscountsSet?.shopMoney.amount ?? 0),
    cogs_minor: cogs,
    payment_method: gateways[0] ?? null,
    is_cod: isCod,
    financial_status: node.displayFinancialStatus?.toLowerCase() ?? null,
    fulfillment_status: node.displayFulfillmentStatus?.toLowerCase() ?? null,
    fulfilled_at: node.fulfillments[0]?.createdAt ?? null,
    utm_source: journey?.utmParameters?.source ?? attrs.get('utm_source') ?? null,
    utm_medium: journey?.utmParameters?.medium ?? attrs.get('utm_medium') ?? null,
    utm_campaign: journey?.utmParameters?.campaign ?? attrs.get('utm_campaign') ?? null,
    landing_site: journey?.landingPage ?? null,
    referring_site: journey?.referrerUrl ?? null,
    shopify_created_at: node.createdAt,
    raw: node as unknown as Record<string, unknown>,
  };

  return { order, items };
}

function gidToId(gid: string): number | null {
  const m = /\/(\d+)(?:\?|$)/.exec(gid);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Mark as Fulfilled + gắn mã vận đơn (bước Marketing đang làm tay)
// ---------------------------------------------------------------------------

export interface FulfillResult {
  fulfillmentId: string;
  status: string;
}

export async function fulfillOrderWithTracking(params: {
  orderGid: string;
  trackingNumber: string;
  trackingUrl?: string;
  company?: string;
  notifyCustomer?: boolean;
}): Promise<FulfillResult> {
  const { orderGid, trackingNumber, trackingUrl, company = 'PPL', notifyCustomer = true } = params;

  // 1. Tìm các fulfillment order đang mở của đơn.
  const foData = await shopifyGraphQL<{
    order: {
      fulfillmentOrders: {
        nodes: Array<{
          id: string;
          status: string;
          lineItems: { nodes: Array<{ id: string; remainingQuantity: number }> };
        }>;
      };
    } | null;
  }>(
    `query FO($id: ID!) {
       order(id: $id) {
         fulfillmentOrders(first: 10, query: "status:open OR status:in_progress") {
           nodes {
             id
             status
             lineItems(first: 100) { nodes { id remainingQuantity } }
           }
         }
       }
     }`,
    { id: orderGid },
  );

  const openOrders = (foData.order?.fulfillmentOrders.nodes ?? []).filter((fo) =>
    fo.lineItems.nodes.some((li) => li.remainingQuantity > 0),
  );

  if (openOrders.length === 0) {
    throw new ShopifyError('Đơn này không còn dòng hàng nào cần fulfil (có thể đã fulfil rồi).');
  }

  const lineItemsByFulfillmentOrder = openOrders.map((fo) => ({
    fulfillmentOrderId: fo.id,
    fulfillmentOrderLineItems: fo.lineItems.nodes
      .filter((li) => li.remainingQuantity > 0)
      .map((li) => ({ id: li.id, quantity: li.remainingQuantity })),
  }));

  // 2. Tạo fulfillment kèm tracking — Shopify tự gửi mail cho khách.
  const result = await shopifyGraphQL<{
    fulfillmentCreate: {
      fulfillment: { id: string; status: string } | null;
      userErrors: Array<{ field: string[] | null; message: string }>;
    };
  }>(
    `mutation Fulfil($fulfillment: FulfillmentInput!) {
       fulfillmentCreate(fulfillment: $fulfillment) {
         fulfillment { id status }
         userErrors { field message }
       }
     }`,
    {
      fulfillment: {
        lineItemsByFulfillmentOrder,
        notifyCustomer,
        trackingInfo: {
          number: trackingNumber,
          url: trackingUrl ?? `https://www.ppl.cz/vyhledat-zasilku?shipmentId=${encodeURIComponent(trackingNumber)}`,
          company,
        },
      },
    },
  );

  const errors = result.fulfillmentCreate.userErrors;
  if (errors?.length) {
    throw new ShopifyError(errors.map((e) => e.message).join('; '), errors);
  }
  const f = result.fulfillmentCreate.fulfillment;
  if (!f) throw new ShopifyError('Shopify không tạo được fulfillment');

  return { fulfillmentId: f.id, status: f.status };
}

// ---------------------------------------------------------------------------
// Tồn kho
// ---------------------------------------------------------------------------

export interface InventoryRow {
  variant_id: number;
  product_id: number | null;
  sku: string | null;
  product_title: string;
  variant_title: string | null;
  available: number;
  committed: number;
  unit_cost_minor: number;
  price_minor: number;
  product_status: string;
}

export async function fetchInventory(max = 1000): Promise<InventoryRow[]> {
  const out: InventoryRow[] = [];
  let cursor: string | null = null;

  while (out.length < max) {
    const data: {
      productVariants: {
        nodes: Array<{
          legacyResourceId: string;
          sku: string | null;
          title: string | null;
          price: string;
          product: { legacyResourceId: string; title: string; status: string };
          inventoryItem: {
            unitCost: { amount: string } | null;
            inventoryLevels: {
              nodes: Array<{ quantities: Array<{ name: string; quantity: number }> }>;
            };
          } | null;
        }>;
        pageInfo: { hasNextPage: boolean; endCursor: string | null };
      };
    } = await shopifyGraphQL(
      `query Variants($cursor: String) {
         productVariants(first: 100, after: $cursor) {
           nodes {
             legacyResourceId
             sku
             title
             price
             product { legacyResourceId title status }
             inventoryItem {
               unitCost { amount }
               inventoryLevels(first: 5) {
                 nodes { quantities(names: ["available", "committed"]) { name quantity } }
               }
             }
           }
           pageInfo { hasNextPage endCursor }
         }
       }`,
      { cursor },
    );

    for (const v of data.productVariants.nodes) {
      let available = 0;
      let committed = 0;
      for (const level of v.inventoryItem?.inventoryLevels.nodes ?? []) {
        for (const q of level.quantities) {
          if (q.name === 'available') available += q.quantity;
          if (q.name === 'committed') committed += q.quantity;
        }
      }
      out.push({
        variant_id: Number(v.legacyResourceId),
        product_id: Number(v.product.legacyResourceId),
        sku: v.sku,
        product_title: v.product.title,
        variant_title: v.title,
        available,
        committed,
        unit_cost_minor: toMinor(v.inventoryItem?.unitCost?.amount ?? 0),
        price_minor: toMinor(v.price),
        product_status: v.product.status.toLowerCase(),
      });
    }

    if (!data.productVariants.pageInfo.hasNextPage) break;
    cursor = data.productVariants.pageInfo.endCursor;
  }

  return out;
}
