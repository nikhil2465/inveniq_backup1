# ─────────────────────────────────────────────────────────────────────────────
# InvenIQ — React Frontend Production Container
# Stage 1: Node 20 Alpine — build React bundle
# Stage 2: nginx Alpine    — serve optimised static files
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Install deps first (cached layer unless package.json changes)
COPY package*.json ./
RUN npm ci --prefer-offline --no-audit

# Copy source and build
COPY . .
RUN npm run build

# ── Stage 2: Serve ───────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

# Copy React production build
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
