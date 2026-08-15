/**
 * Đọc biến môi trường một chỗ duy nhất.
 * `required()` chỉ ném lỗi khi thực sự dùng tới, để app vẫn build được
 * khi chưa cấu hình đủ key (ví dụ chưa xin xong API của PPL).
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Thiếu biến môi trường ${name}. Xem dashboard/.env.example và điền vào .env.local (local) hoặc Environment Variables (Vercel/Cloudflare).`,
    );
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const env = {
  // --- Supabase ---------------------------------------------------------
  get supabaseUrl() {
    return required('SUPABASE_URL');
  },
  get supabaseServiceKey() {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },

  // --- Shopify ----------------------------------------------------------
  get shopifyShop() {
    return required('SHOPIFY_SHOP'); // vd: phomifood.myshopify.com
  },
  get shopifyToken() {
    return required('SHOPIFY_ADMIN_TOKEN'); // shpat_...
  },
  get shopifyWebhookSecret() {
    return required('SHOPIFY_WEBHOOK_SECRET');
  },
  shopifyApiVersion: optional('SHOPIFY_API_VERSION', '2025-01'),
  shopifyLocationId: optional('SHOPIFY_LOCATION_ID'),

  // --- Meta Ads ---------------------------------------------------------
  get metaToken() {
    return required('META_ACCESS_TOKEN');
  },
  get metaAdAccountId() {
    return required('META_AD_ACCOUNT_ID'); // act_123456789
  },
  metaApiVersion: optional('META_API_VERSION', 'v21.0'),

  // --- PPL (ppl.cz) -----------------------------------------------------
  get pplClientId() {
    return required('PPL_CLIENT_ID');
  },
  get pplClientSecret() {
    return required('PPL_CLIENT_SECRET');
  },
  get pplCustomerId() {
    return required('PPL_CUSTOMER_ID'); // mã khách hàng PPL
  },
  pplBaseUrl: optional('PPL_BASE_URL', 'https://api.dhl.com/ecs/ppl/myapi2'),
  pplAuthUrl: optional(
    'PPL_AUTH_URL',
    'https://api.dhl.com/ecs/ppl/myapi2/login/getAccessToken',
  ),
  pplProductType: optional('PPL_PRODUCT_TYPE', 'BUSS'), // BUSS = PPL Parcel Business CZ
  pplCodProductType: optional('PPL_COD_PRODUCT_TYPE', 'BUSS'),
  pplSenderName: optional('PPL_SENDER_NAME', 'Phomifood'),
  pplSenderStreet: optional('PPL_SENDER_STREET'),
  pplSenderCity: optional('PPL_SENDER_CITY'),
  pplSenderZip: optional('PPL_SENDER_ZIP'),
  pplSenderCountry: optional('PPL_SENDER_COUNTRY', 'CZ'),
  pplSenderPhone: optional('PPL_SENDER_PHONE'),
  pplSenderEmail: optional('PPL_SENDER_EMAIL'),
  pplBankAccount: optional('PPL_BANK_ACCOUNT'), // để nhận tiền COD
  pplBankCode: optional('PPL_BANK_CODE'),

  // --- Dashboard --------------------------------------------------------
  get dashboardPassword() {
    return required('DASHBOARD_PASSWORD');
  },
  get sessionSecret() {
    return required('SESSION_SECRET');
  },
  get cronSecret() {
    return required('CRON_SECRET');
  },
  timezone: optional('APP_TIMEZONE', 'Europe/Prague'),
  baseCurrency: optional('BASE_CURRENCY', 'CZK'),
};

/** Kiểm tra nhanh xem một nhóm tính năng đã cấu hình đủ chưa (không ném lỗi). */
export function isConfigured(...names: string[]): boolean {
  return names.every((n) => Boolean(process.env[n]));
}
