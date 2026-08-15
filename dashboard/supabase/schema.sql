-- Phomifood internal dashboard — Postgres schema (Supabase free tier)
-- Chạy toàn bộ file này trong Supabase SQL Editor một lần duy nhất.
-- An toàn khi chạy lại (idempotent).

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- 1. ĐƠN HÀNG — thay thế hoàn toàn Sheet A và Sheet B
-- ---------------------------------------------------------------------------

-- Trạng thái nội bộ. Đây là "cột sống" của quy trình:
--   new       đơn vừa về từ Shopify, chưa ai đụng vào
--   confirmed sale đã gọi/xác nhận khách  (trước đây = nhập tay vào Sheet B)
--   picking   kho đang đi lấy hàng
--   packed    kho đã đóng xong, chờ giao cho PPL
--   shipped   đã có mã vận đơn, Shopify đã fulfil, khách đã nhận mail
--   delivered PPL báo giao thành công
--   problem   đơn có vấn đề (thiếu hàng, khách không nghe máy, PPL trả về)
--   cancelled huỷ
do $$ begin
  create type order_stage as enum (
    'new', 'confirmed', 'picking', 'packed', 'shipped', 'delivered', 'problem', 'cancelled'
  );
exception when duplicate_object then null; end $$;

create table if not exists orders (
  id                  uuid primary key default gen_random_uuid(),

  -- Khoá từ Shopify
  shopify_order_id    bigint unique not null,
  shopify_order_gid   text,
  order_number        text not null,               -- ví dụ "#1042"

  -- Thông tin khách (denormalise để kho/sale không phải join)
  customer_name       text,
  customer_phone      text,
  customer_email      text,
  ship_address1       text,
  ship_address2       text,
  ship_city           text,
  ship_zip            text,
  ship_country_code   text,                        -- CZ, DE, PL, SK...
  customer_note       text,

  -- Tiền (lưu theo đơn vị nhỏ nhất: cent/haléř — tránh lỗi số thực)
  currency            text not null default 'CZK',
  total_minor         bigint not null default 0,
  subtotal_minor      bigint not null default 0,
  shipping_minor      bigint not null default 0,
  discount_minor      bigint not null default 0,
  cogs_minor          bigint not null default 0,   -- giá vốn, tính từ order_items

  -- Thanh toán
  payment_method      text,                        -- 'cod' | 'card' | 'bank' ...
  is_cod              boolean not null default false,
  financial_status    text,                        -- Shopify: paid/pending/refunded

  -- Quy trình nội bộ
  stage               order_stage not null default 'new',
  stage_changed_at    timestamptz not null default now(),
  assigned_to         text,                        -- tên người phụ trách
  internal_note       text,
  problem_reason      text,

  -- Đối soát Shopify
  fulfillment_status  text,                        -- null | 'fulfilled' | 'partial'
  fulfilled_at        timestamptz,

  -- Nguồn đơn (để ghép với Meta Ads)
  utm_source          text,
  utm_medium          text,
  utm_campaign        text,
  landing_site        text,
  referring_site      text,

  shopify_created_at  timestamptz not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  raw                 jsonb                        -- payload gốc, để debug
);

create index if not exists orders_stage_idx        on orders (stage, shopify_created_at desc);
create index if not exists orders_created_idx      on orders (shopify_created_at desc);
create index if not exists orders_country_idx      on orders (ship_country_code, shopify_created_at desc);
create index if not exists orders_campaign_idx     on orders (utm_campaign);
create index if not exists orders_number_idx       on orders (order_number);

create table if not exists order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders (id) on delete cascade,
  shopify_line_id     bigint,
  product_id          bigint,
  variant_id          bigint,
  sku                 text,
  title               text not null,
  variant_title       text,
  quantity            integer not null default 1,
  unit_price_minor    bigint not null default 0,
  unit_cost_minor     bigint not null default 0,   -- giá vốn từ Shopify InventoryItem.unitCost
  location_hint       text,                        -- vị trí trong kho, kho tự điền
  unique (order_id, shopify_line_id)
);

create index if not exists order_items_order_idx on order_items (order_id);
create index if not exists order_items_sku_idx   on order_items (sku);

-- ---------------------------------------------------------------------------
-- 2. VẬN ĐƠN — PPL
-- ---------------------------------------------------------------------------

create table if not exists shipments (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references orders (id) on delete cascade,

  carrier             text not null default 'ppl',
  tracking_number     text,                        -- số vận đơn PPL
  label_url           text,                        -- link PDF nhãn dán
  ppl_shipment_id     text,
  ppl_batch_id        text,                        -- id của lô import PPL (async)

  status              text not null default 'created',  -- created|labelled|handed_over|in_transit|delivered|returned|failed
  status_detail       text,
  cod_amount_minor    bigint not null default 0,
  weight_grams        integer,

  pushed_to_shopify   boolean not null default false,   -- đã Mark as Fulfilled chưa
  pushed_at           timestamptz,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  raw                 jsonb
);

create unique index if not exists shipments_tracking_idx on shipments (tracking_number)
  where tracking_number is not null;
create index if not exists shipments_order_idx  on shipments (order_id);
create index if not exists shipments_status_idx on shipments (status);

-- ---------------------------------------------------------------------------
-- 3. QUẢNG CÁO — Meta Ads (1 dòng / ngày / ad)
-- ---------------------------------------------------------------------------

create table if not exists ad_insights (
  id                  uuid primary key default gen_random_uuid(),
  platform            text not null default 'meta',
  date                date not null,

  account_id          text,
  campaign_id         text,
  campaign_name       text,
  adset_id            text,
  adset_name          text,
  ad_id               text,
  ad_name             text,
  country             text,                        -- nếu tách theo nước

  currency            text not null default 'CZK',
  spend_minor         bigint not null default 0,
  impressions         bigint not null default 0,
  clicks              bigint not null default 0,
  link_clicks         bigint not null default 0,
  -- Số Meta tự báo (attribution của Meta, thường lệch với Shopify)
  purchases           integer not null default 0,
  purchase_value_minor bigint not null default 0,

  synced_at           timestamptz not null default now(),
  unique (platform, date, ad_id, country)
);

create index if not exists ad_insights_date_idx     on ad_insights (date desc);
create index if not exists ad_insights_campaign_idx on ad_insights (campaign_id, date desc);

-- ---------------------------------------------------------------------------
-- 4. TỒN KHO — snapshot từ Shopify, để marketing biết còn hàng mà chạy ads
-- ---------------------------------------------------------------------------

create table if not exists inventory_snapshot (
  id                  uuid primary key default gen_random_uuid(),
  variant_id          bigint unique not null,
  product_id          bigint,
  sku                 text,
  product_title       text,
  variant_title       text,
  available           integer not null default 0,
  committed           integer not null default 0,  -- đã bán, chưa giao
  unit_cost_minor     bigint not null default 0,
  price_minor         bigint not null default 0,
  product_status      text,                        -- active|draft|archived
  reorder_point       integer not null default 10, -- dưới mức này thì cảnh báo
  updated_at          timestamptz not null default now()
);

create index if not exists inventory_available_idx on inventory_snapshot (available);

-- ---------------------------------------------------------------------------
-- 5. NHẬT KÝ — ai làm gì lúc nào (thay cho "hỏi nhau trên Zalo")
-- ---------------------------------------------------------------------------

create table if not exists order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders (id) on delete cascade,
  actor       text not null default 'system',
  kind        text not null,                       -- stage_change|note|ship|sync|error
  message     text,
  meta        jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists order_events_order_idx on order_events (order_id, created_at desc);

create table if not exists sync_runs (
  id          uuid primary key default gen_random_uuid(),
  source      text not null,                       -- shopify|meta|ppl
  status      text not null,                       -- ok|error
  records     integer not null default 0,
  message     text,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);

create index if not exists sync_runs_source_idx on sync_runs (source, started_at desc);

-- ---------------------------------------------------------------------------
-- 6. Tự động cập nhật updated_at + ghi nhật ký khi đổi trạng thái
-- ---------------------------------------------------------------------------

create or replace function touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_touch on orders;
create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();

drop trigger if exists shipments_touch on shipments;
create trigger shipments_touch before update on shipments
  for each row execute function touch_updated_at();

create or replace function log_stage_change() returns trigger as $$
begin
  if new.stage is distinct from old.stage then
    new.stage_changed_at = now();
    insert into order_events (order_id, actor, kind, message, meta)
    values (new.id, coalesce(new.assigned_to, 'system'), 'stage_change',
            old.stage::text || ' → ' || new.stage::text,
            jsonb_build_object('from', old.stage, 'to', new.stage));
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists orders_stage_log on orders;
create trigger orders_stage_log before update on orders
  for each row execute function log_stage_change();

-- ---------------------------------------------------------------------------
-- 7. VIEW báo cáo — dashboard đọc thẳng, không cần tính lại trong app
-- ---------------------------------------------------------------------------

-- Doanh thu + giá vốn theo ngày và theo nước
create or replace view daily_sales as
select
  (o.shopify_created_at at time zone 'Europe/Prague')::date as date,
  o.ship_country_code                                       as country,
  o.currency,
  count(*)                                                  as orders,
  count(*) filter (where o.is_cod)                          as cod_orders,
  count(*) filter (where o.stage = 'cancelled')             as cancelled_orders,
  count(*) filter (where o.stage = 'delivered')             as delivered_orders,
  sum(o.total_minor)                                        as revenue_minor,
  sum(o.cogs_minor)                                         as cogs_minor,
  sum(o.shipping_minor)                                     as shipping_minor
from orders o
where o.stage <> 'cancelled'
group by 1, 2, 3;

-- Chi phí quảng cáo theo ngày
create or replace view daily_ad_spend as
select
  date,
  coalesce(country, 'ALL') as country,
  currency,
  sum(spend_minor)         as spend_minor,
  sum(impressions)         as impressions,
  sum(link_clicks)         as link_clicks,
  sum(purchases)           as meta_purchases
from ad_insights
group by 1, 2, 3;

-- Bảng P&L thô theo ngày + nước: doanh thu, giá vốn, ads, lời gộp, ROAS
create or replace view daily_pnl as
select
  coalesce(s.date, a.date)                                    as date,
  coalesce(s.country, a.country)                              as country,
  coalesce(s.orders, 0)                                       as orders,
  coalesce(s.revenue_minor, 0)                                as revenue_minor,
  coalesce(s.cogs_minor, 0)                                   as cogs_minor,
  coalesce(a.spend_minor, 0)                                  as ad_spend_minor,
  coalesce(s.revenue_minor, 0)
    - coalesce(s.cogs_minor, 0)
    - coalesce(a.spend_minor, 0)                              as gross_profit_minor,
  case when coalesce(a.spend_minor, 0) = 0 then null
       else round(coalesce(s.revenue_minor, 0)::numeric / a.spend_minor, 2)
  end                                                         as roas
from daily_sales s
full outer join daily_ad_spend a
  on a.date = s.date and a.country = s.country;

-- Đơn đang "kẹt": quá N giờ mà chưa nhảy sang bước tiếp theo
create or replace view stuck_orders as
select
  o.id, o.order_number, o.customer_name, o.customer_phone,
  o.ship_country_code, o.stage, o.stage_changed_at,
  round(extract(epoch from (now() - o.stage_changed_at)) / 3600, 1) as hours_in_stage
from orders o
where o.stage in ('new', 'confirmed', 'picking', 'packed')
  and o.stage_changed_at < now() - interval '6 hours'
order by o.stage_changed_at asc;
