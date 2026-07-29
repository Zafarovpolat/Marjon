# ── Сборка ───────────────────────────────────────────────────────────────────
FROM node:20-alpine AS build

WORKDIR /app

# Зависимости отдельным слоем — переустанавливаются только при смене package*.json
COPY package*.json ./
RUN npm ci

COPY . .

# Адрес API относительный: браузер зовёт /api/v1/... на том же origin, а nginx
# проксирует на бэкенд. Благодаря этому в сборку не «зашивается» IP машины и
# не возникает CORS — веб одинаково работает с ПК, планшета и телефона.
ENV VITE_API_URL=/api/v1
ENV VITE_ADMIN_API_URL=/api/v1
RUN npm run build

# ── Раздача ──────────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=5 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
