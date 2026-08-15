#!/usr/bin/env bash
# Deploy dashboard lên Google Cloud Run.
#
# Vì sao Cloud Run: gói miễn phí cho 2 triệu request/tháng và tự tắt khi không
# ai dùng, nên một dashboard nội bộ vài người dùng sẽ KHÔNG phát sinh chi phí.
# Điều khoản cho phép dùng cho mục đích thương mại (khác với Vercel Hobby).
#
# Chuẩn bị một lần:
#   1. Cài gcloud CLI: https://cloud.google.com/sdk/docs/install
#   2. gcloud auth login
#   3. Tạo project trên console.cloud.google.com, bật billing
#      (bắt buộc gắn thẻ, nhưng ở mức dùng này vẫn nằm trong hạn mức miễn phí)
#   4. Điền đủ dashboard/.env.local
#
# Chạy:
#   cd dashboard
#   ./deploy-cloudrun.sh my-project-id
#
set -euo pipefail

PROJECT_ID="${1:-${GCP_PROJECT_ID:-}}"
REGION="${GCP_REGION:-europe-west3}"   # Frankfurt — gần CH Séc nhất
SERVICE="${GCP_SERVICE:-phomifood-dashboard}"
ENV_FILE="${ENV_FILE:-.env.local}"

if [ -z "$PROJECT_ID" ]; then
  echo "Cách dùng: ./deploy-cloudrun.sh <project-id>" >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Không tìm thấy $ENV_FILE. Copy .env.example thành .env.local rồi điền giá trị." >&2
  exit 1
fi

echo "→ Project: $PROJECT_ID | Region: $REGION | Service: $SERVICE"

gcloud config set project "$PROJECT_ID" >/dev/null

echo "→ Bật các API cần thiết (chỉ chạy thật ở lần đầu)…"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com \
  artifactregistry.googleapis.com >/dev/null

# Gom biến môi trường từ .env.local.
# Dùng dấu phân cách ^@^ vì giá trị có thể chứa dấu phẩy.
ENV_VARS=""
while IFS= read -r line || [ -n "$line" ]; do
  case "$line" in
    ''|\#*) continue ;;
  esac
  key="${line%%=*}"
  value="${line#*=}"
  [ -z "$value" ] && continue          # bỏ qua biến chưa điền (PPL, Meta…)
  ENV_VARS="${ENV_VARS}${key}=${value}@"
done < "$ENV_FILE"

if [ -z "$ENV_VARS" ]; then
  echo "$ENV_FILE chưa có biến nào được điền." >&2
  exit 1
fi
ENV_VARS="^@^${ENV_VARS%@}"

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
  --set-env-vars "$ENV_VARS"

URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"

cat <<EOF

✓ Xong. Dashboard đang chạy tại:
  $URL

Việc tiếp theo:
  1. Kiểm tra cấu hình:  $URL/api/health
  2. Nạp dữ liệu lần đầu:
     curl "$URL/api/sync/shopify?key=<CRON_SECRET>&days=30&inventory=1"
  3. Trỏ webhook Shopify tới: $URL/api/webhooks/shopify
  4. Đặt secret DASHBOARD_URL = $URL trong GitHub Actions

Ghi chú: --min-instances 0 nghĩa là không ai dùng thì service tắt hẳn, không
tính tiền. Đổi lại, request đầu tiên sau một lúc nghỉ sẽ chậm 1-2 giây.
EOF
