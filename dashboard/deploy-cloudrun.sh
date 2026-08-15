#!/usr/bin/env bash
# Deploy dashboard lên Google Cloud Run.
#
# Vì sao Cloud Run: gói miễn phí 2 triệu request/tháng và tự tắt khi không ai
# dùng, nên một dashboard nội bộ vài người dùng sẽ KHÔNG phát sinh chi phí.
# Điều khoản cho phép dùng cho mục đích thương mại (khác với Vercel Hobby).
#
# Chuẩn bị một lần:
#   1. Cài gcloud CLI: https://cloud.google.com/sdk/docs/install
#   2. gcloud auth login
#   3. Tạo project ở console.cloud.google.com và bật billing
#      (bắt buộc gắn thẻ, nhưng ở mức dùng này vẫn nằm trong hạn mức miễn phí)
#   4. Điền đủ dashboard/.env.local
#
# Chạy:
#   cd dashboard
#   ./deploy-cloudrun.sh my-project-id
#
# Deploy lại sau này: vẫn đúng lệnh đó.

set -euo pipefail

PROJECT_ID="${1:-${GCP_PROJECT_ID:-}}"
REGION="${GCP_REGION:-europe-west3}"   # Frankfurt — gần CH Séc nhất
SERVICE="${GCP_SERVICE:-phomifood-dashboard}"
ENV_FILE="${ENV_FILE:-.env.local}"

die() { echo "✗ $*" >&2; exit 1; }

# --- Kiểm tra điều kiện ------------------------------------------------------

command -v gcloud >/dev/null 2>&1 \
  || die "Chưa cài gcloud CLI. Xem https://cloud.google.com/sdk/docs/install"

[ -n "$PROJECT_ID" ] \
  || die "Cách dùng: ./deploy-cloudrun.sh <project-id>"

[ -f "$ENV_FILE" ] \
  || die "Không tìm thấy $ENV_FILE. Copy .env.example thành .env.local rồi điền giá trị."

gcloud auth list --filter=status:ACTIVE --format='value(account)' 2>/dev/null | grep -q . \
  || die "Chưa đăng nhập gcloud. Chạy: gcloud auth login"

echo "→ Project: $PROJECT_ID | Region: $REGION | Service: $SERVICE"

# --- Chuyển .env.local thành file YAML cho gcloud ----------------------------
# Dùng --env-vars-file thay vì --set-env-vars để giá trị chứa ký tự đặc biệt
# (@ trong email, dấu phẩy, +, /, =) không làm hỏng lệnh.

ENV_YAML="$(mktemp)"
chmod 600 "$ENV_YAML"
trap 'rm -f "$ENV_YAML"' EXIT INT TERM   # file chứa secret — luôn xoá khi thoát

count=0
missing=""
while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"                   # bỏ CRLF nếu file soạn trên Windows
  case "$line" in ''|\#*) continue ;; esac
  case "$line" in *=*) ;; *) continue ;; esac

  key="${line%%=*}"
  value="${line#*=}"

  # Bỏ khoảng trắng thừa quanh tên biến
  key="$(printf '%s' "$key" | tr -d '[:space:]')"
  [ -n "$key" ] || continue

  # Bỏ cặp nháy bao ngoài nếu người dùng có gõ
  case "$value" in
    \"*\") value="${value#\"}"; value="${value%\"}" ;;
    \'*\') value="${value#\'}"; value="${value%\'}" ;;
  esac

  # Biến chưa điền (PPL, Meta…) thì bỏ qua — app vẫn chạy thiếu phần đó
  if [ -z "$value" ]; then
    missing="$missing $key"
    continue
  fi

  # YAML: bọc nháy đơn, nhân đôi nháy đơn bên trong
  escaped="$(printf '%s' "$value" | sed "s/'/''/g")"
  printf "%s: '%s'\n" "$key" "$escaped" >> "$ENV_YAML"
  count=$((count + 1))
done < "$ENV_FILE"

[ "$count" -gt 0 ] || die "$ENV_FILE chưa có biến nào được điền."

# Cảnh báo nếu thiếu biến bắt buộc
for required in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY SHOPIFY_SHOP \
                SHOPIFY_ADMIN_TOKEN DASHBOARD_PASSWORD SESSION_SECRET CRON_SECRET; do
  grep -q "^${required}:" "$ENV_YAML" \
    || die "Thiếu biến bắt buộc $required trong $ENV_FILE"
done

echo "→ Nạp $count biến môi trường"
[ -n "$missing" ] && echo "  (bỏ qua vì chưa điền:$missing)"

# --- Deploy ------------------------------------------------------------------

gcloud config set project "$PROJECT_ID" >/dev/null

echo "→ Bật API cần thiết (chỉ tốn thời gian ở lần đầu)…"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com >/dev/null \
  || die "Không bật được API. Kiểm tra project đã bật billing chưa: https://console.cloud.google.com/billing"

echo "→ Build và deploy (lần đầu mất ~5 phút)…"
gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 3 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 60 \
  --port 3000 \
  --env-vars-file "$ENV_YAML"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)' 2>/dev/null || true)"

[ -n "$URL" ] || die "Deploy xong nhưng không đọc được địa chỉ service. Kiểm tra ở https://console.cloud.google.com/run"

# --- Kiểm tra sau deploy -----------------------------------------------------

echo "→ Kiểm tra service…"
if command -v curl >/dev/null 2>&1; then
  curl -fsS "$URL/api/health" || echo "  (chưa gọi được /api/health — thử lại sau vài giây)"
  echo
fi

CRON_SECRET_VALUE="$(sed -n "s/^CRON_SECRET: '\(.*\)'$/\1/p" "$ENV_YAML" | sed "s/''/'/g")"

cat <<EOF

✓ Xong. Dashboard đang chạy tại:
  $URL

Việc tiếp theo:
  1. Nạp dữ liệu lần đầu (30 ngày đơn + tồn kho):
     curl "$URL/api/sync/shopify?key=${CRON_SECRET_VALUE}&days=30&inventory=1"

  2. Webhook Shopify → trỏ 4 topic tới:
     $URL/api/webhooks/shopify

  3. GitHub → Settings → Secrets and variables → Actions:
     DASHBOARD_URL = $URL
     CRON_SECRET   = (đúng giá trị trong .env.local)

  4. Mở $URL và đăng nhập bằng DASHBOARD_PASSWORD

Chi phí: --min-instances 0 nên không ai dùng thì service tắt hẳn, không tính
tiền. Đổi lại request đầu tiên sau lúc nghỉ chậm 1-2 giây.

Dọn dẹp định kỳ: mỗi lần deploy tạo một image mới trong Artifact Registry
(hạn mức miễn phí 0,5 GB). Đặt chính sách tự xoá image cũ một lần duy nhất:
  gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy \\
    --location=$REGION --policy=<(echo '[{"name":"keep-3","action":{"type":"Keep"},"mostRecentVersions":{"keepCount":3}}]')
EOF
