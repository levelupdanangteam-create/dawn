# Đóng gói dashboard thành một container tự chạy.
# Chạy được ở mọi nơi: Google Cloud Run (miễn phí), Render, Koyeb, VPS,
# hoặc ngay một máy tính trong văn phòng.
#
#   docker build -t phomifood-dashboard .
#   docker run -p 3000:3000 --env-file .env.local phomifood-dashboard

# --- 1. Cài thư viện ---------------------------------------------------------
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# --- 2. Build ----------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# --- 3. Ảnh chạy thật (chỉ chứa thứ cần thiết) -------------------------------
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Không chạy bằng root
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000

# Cloud Run / Render tự truyền biến PORT — server.js đọc sẵn biến này.
CMD ["node", "server.js"]
