# Phomifood — Bảng điều hành nội bộ

Dashboard nội bộ nối **Shopify + Meta Ads + vận đơn PPL + tồn kho** vào một chỗ,
và **thay thế hoàn toàn Sheet A / Sheet B** trong quy trình hiện tại.

Toàn bộ hạ tầng chạy trên gói **miễn phí**. Code nằm trong repo của công ty, không
phụ thuộc nhà cung cấp SaaS nào.

---

## 1. Quy trình cũ và quy trình mới

**Cũ** — 9 bước, 4 lần chép tay, 3 lần chờ người khác:

```
Đơn về Shopify
  → Marketing chép sang Sheet A
  → Sale đọc Sheet A, nhập sang Sheet B
  → Kho đọc Sheet B, đi lấy hàng
  → Kho đóng gói
  → Kho gửi ĐVVC
  → ĐVVC trả mã vận đơn
  → Kho nhắn mã cho Marketing
  → Marketing mở Shopify, Mark as Fulfilled, dán mã
  → Khách nhận mail
```

**Mới** — 3 lần bấm nút, không chép tay, không nhắn tin qua lại:

```
Đơn về Shopify
  → (webhook, ~2 giây) tự vào dashboard, trạng thái "Đơn mới"
  → Sale bấm "Đã xác nhận"      ← 1 chạm, đơn tự hiện ở màn hình Kho
  → Kho bấm "Đã đóng xong"      ← 1 chạm
  → Kho bấm "Tạo vận đơn PPL"   ← 1 chạm: PPL cấp mã, Shopify tự fulfil,
                                   mail báo mã vận đơn tự gửi cho khách
  → Cron tự tra PPL, đơn tự chuyển "Đã giao"
```

Sheet A và Sheet B biến mất. Mã vận đơn không đi qua tay ai.

---

## 2. Hạ tầng — tất cả miễn phí

| Thành phần | Dịch vụ | Gói miễn phí |
|---|---|---|
| Cơ sở dữ liệu | [Supabase](https://supabase.com) | 500 MB Postgres — đủ cho hàng trăm nghìn đơn |
| Chạy web | [Vercel](https://vercel.com) hoặc [Cloudflare Workers](https://workers.cloudflare.com) | Hobby / Free plan |
| Chạy nền (cron) | GitHub Actions | 2.000 phút/tháng cho repo private |
| Nhận đơn realtime | Shopify Webhooks | miễn phí |

> **Lưu ý về Vercel:** gói Hobby theo điều khoản là dành cho mục đích phi thương mại.
> Với một dashboard nội bộ nhỏ thì thực tế vẫn chạy tốt, nhưng nếu muốn đúng điều khoản
> mà vẫn miễn phí, dùng **Cloudflare Workers** (free plan cho phép dùng thương mại)
> qua `@opennextjs/cloudflare`, hoặc trả ~$20/tháng cho Vercel Pro.

---

## 3. Cài đặt (khoảng 45 phút)

### Bước 1 — Supabase

1. Tạo project mới tại [supabase.com](https://supabase.com) (chọn region **Frankfurt** cho gần CH Séc).
2. Vào **SQL Editor**, dán toàn bộ nội dung `supabase/schema.sql`, bấm **Run**.
3. Vào **Project Settings → API**, copy `URL` và `service_role` key.

### Bước 2 — App Shopify (custom app)

Shopify Admin → **Settings → Apps and sales channels → Develop apps → Create an app**.

Cấp các quyền (Configuration → Admin API scopes):

| Scope | Dùng để |
|---|---|
| `read_orders` | đọc đơn hàng |
| `read_merchant_managed_fulfillment_orders` | tìm dòng hàng cần fulfil |
| `write_merchant_managed_fulfillment_orders` | Mark as Fulfilled + gắn mã vận đơn |
| `read_products` | tên sản phẩm, biến thể |
| `read_inventory` | tồn kho và giá vốn (`unitCost`) |
| `read_all_orders` | *(tuỳ chọn)* đọc đơn cũ hơn 60 ngày — phải xin Shopify duyệt |

Kho của Phomifood là **merchant-managed location** (tự đóng gói) nên chỉ cần cặp scope
`*_merchant_managed_fulfillment_orders`. Các scope `*_assigned_*` và `*_third_party_*`
là dành cho bên fulfillment service, không cần.

Bấm **Install app** → copy **Admin API access token** (`shpat_…`) và **client secret**
(mục *Client credentials* — dùng làm `SHOPIFY_WEBHOOK_SECRET`).

> Cột UTM (`utm_campaign`) lấy từ `customerJourneySummary` cần Shopify duyệt quyền
> *protected customer data*. Chưa được duyệt thì code tự động bỏ qua, mọi thứ khác vẫn chạy —
> chỉ là không ghép được đơn với chiến dịch cụ thể.

### Bước 3 — Meta Ads

1. Business Manager → **Business settings → Users → System users** → tạo system user.
2. Gán tài sản: **Ad account** với quyền xem.
3. **Generate token** với scope `ads_read` → token này không hết hạn.
4. Lấy `act_…` của tài khoản quảng cáo.

### Bước 4 — PPL (có thể làm sau)

Liên hệ người phụ trách tài khoản PPL của công ty để xin quyền truy cập **PPL myAPI2**,
lấy `client_id`, `client_secret`, mã khách hàng.

**Chưa có PPL API vẫn dùng được dashboard ngay** — kho nhập mã vận đơn vào ô trong màn
hình đơn hàng, hệ thống vẫn tự fulfil Shopify và gửi mail cho khách. Riêng bước
"chờ ĐVVC trả mã" là còn thủ công.

> ⚠️ Trước khi bật PPL thật: chạy thử trên sandbox của PPL và đối chiếu tên trường trong
> hàm `buildShipmentPayload()` ở `src/lib/ppl.ts`. Toàn bộ phần còn lại của hệ thống
> không phụ thuộc vào tên trường của PPL, nên nếu sai chỉ cần sửa đúng một hàm đó.

### Bước 5 — Chạy thử ở máy

```bash
cd dashboard
npm install
cp .env.example .env.local     # rồi điền các giá trị đã lấy ở trên
openssl rand -base64 32        # dán vào SESSION_SECRET
openssl rand -base64 32        # dán vào CRON_SECRET
npm run dev
```

Mở http://localhost:3000 → đăng nhập bằng `DASHBOARD_PASSWORD`.

Nạp dữ liệu lần đầu (30 ngày đơn + tồn kho):

```bash
curl "http://localhost:3000/api/sync/shopify?key=CRON_SECRET&days=30&inventory=1"
curl "http://localhost:3000/api/sync/meta?key=CRON_SECRET&days=30"
```

### Bước 6 — Deploy

**Vercel:** import repo → **Root Directory** đặt là `dashboard` → dán toàn bộ biến môi
trường → Deploy.

**Cloudflare Workers:** `npm i -D @opennextjs/cloudflare` rồi theo hướng dẫn tại
https://opennext.js.org/cloudflare.

### Bước 7 — Webhook Shopify

Trong **chính custom app vừa tạo** → tab **Configuration → Webhook subscriptions**,
thêm 4 webhook, format JSON, trỏ tới `https://<domain>/api/webhooks/shopify`:

- `orders/create`
- `orders/updated`
- `orders/cancelled`
- `fulfillments/create`

> ⚠️ **Phải tạo webhook trong app, không phải ở Settings → Notifications.** Webhook tạo từ
> trang Notifications thuộc về cửa hàng chứ không thuộc app, nên được ký bằng một secret
> khác — dashboard sẽ trả `401 HMAC không hợp lệ` và không đơn nào vào được.
>
> Nếu đổi client secret của app, Shopify cần tới 1 tiếng để ký webhook bằng secret mới.

### Bước 8 — Cron

Trong GitHub repo → **Settings → Secrets and variables → Actions**, thêm:

- `DASHBOARD_URL` — ví dụ `https://phomifood-dashboard.vercel.app`
- `CRON_SECRET` — đúng bằng biến `CRON_SECRET` của dashboard

Workflow `.github/workflows/dashboard-sync.yml` sẽ tự chạy:
- mỗi 30 phút: kéo lại đơn Shopify (lưới an toàn nếu webhook rớt), tra vận đơn PPL, fulfil bù
- 05:10 UTC hằng ngày: kéo Meta Ads + snapshot tồn kho

---

## 4. Ai dùng màn hình nào

| Vai trò | Màn hình | Việc cần làm |
|---|---|---|
| Sale | **Đơn hàng** → lọc "Đơn mới" | Gọi khách xong bấm **Đã xác nhận** |
| Kho | **Kho** | Bấm **Bắt đầu lấy hàng** → **Đã đóng xong** → **Tạo vận đơn PPL** |
| Marketing | **Tổng quan**, **Quảng cáo**, **Tồn kho** | Xem lời gộp/ROAS thật theo nước, kiểm tra hàng còn trước khi scale |
| Quản lý | **Tổng quan** → *Đơn kẹt quá 6 giờ* | Đúng chỗ đang mất thời gian, ai đang giữ đơn |

---

## 5. Cấu trúc code

```
dashboard/
├─ supabase/schema.sql        Toàn bộ bảng, view, trigger — chạy 1 lần
├─ src/lib/
│  ├─ shopify.ts              GraphQL Admin API: đọc đơn, fulfil, tồn kho
│  ├─ ppl.ts                  PPL myAPI2: tạo vận đơn, nhãn, tra trạng thái
│  ├─ meta.ts                 Meta Marketing API: chi phí theo ngày × nước
│  ├─ ship.ts                 Ghép 3 cái trên thành 1 nút "Gửi hàng"
│  ├─ orders.ts               Trạng thái đơn + upsert từ Shopify
│  ├─ queries.ts              Truy vấn cho từng màn hình
│  └─ auth.ts                 Đăng nhập nội bộ (cookie ký HMAC)
├─ src/app/
│  ├─ api/webhooks/shopify/   Nhận đơn realtime (xác thực HMAC)
│  ├─ api/sync/{shopify,meta,ppl}/  Endpoint cho cron
│  ├─ actions.ts              Server actions cho các nút bấm
│  └─ (các trang)             /, /orders, /orders/[id], /warehouse, /ads, /inventory
└─ src/proxy.ts               Chặn truy cập chưa đăng nhập
```

## 6. Cách hệ thống chống mất đơn

- **Webhook rớt** → cron 30 phút kéo lại mọi đơn đã cập nhật trong 2 ngày.
- **Tạo được vận đơn nhưng Shopify lỗi** → vận đơn vẫn lưu, cron tự fulfil bù ở lần chạy sau,
  đơn không bao giờ ở trạng thái "có mã mà khách không nhận được mail".
- **Ai đó fulfil thẳng trên Shopify** → dashboard tự nhận và chuyển đơn sang "Đã gửi".
- **Mọi thao tác đều ghi nhật ký** (`order_events`) — biết ai làm gì lúc nào.

## 7. Bảo mật

- Một mật khẩu chung cho cả team, cookie ký HMAC-SHA256, hết hạn 14 ngày.
  Muốn tách tài khoản từng người: thay `src/lib/auth.ts` bằng Supabase Auth (magic link, cũng miễn phí).
- Webhook Shopify xác thực bằng HMAC — request giả bị chặn.
- Endpoint cron xác thực bằng `CRON_SECRET`.
- `service_role` key chỉ dùng ở server, không bao giờ gửi xuống trình duyệt.
