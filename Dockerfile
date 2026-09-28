# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22.23.3-alpine3.24

FROM ${NODE_IMAGE} AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN --mount=type=cache,target=/root/.npm npm ci

FROM dependencies AS builder
WORKDIR /app
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
COPY . .
RUN npm run build

FROM dependencies AS migrations
WORKDIR /app
ARG BUILD_VERSION=development
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Printopus migrations" \
      org.opencontainers.image.version=$BUILD_VERSION \
      org.opencontainers.image.revision=$VCS_REF
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && npm prune --omit=dev \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY app/pricing.ts ./app/pricing.ts
USER nextjs
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && ./node_modules/.bin/tsx prisma/bootstrap.ts"]

FROM ${NODE_IMAGE} AS telegram-setup
WORKDIR /app
ARG BUILD_VERSION=development
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Printopus Telegram webhook setup" \
      org.opencontainers.image.version=$BUILD_VERSION \
      org.opencontainers.image.revision=$VCS_REF
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY scripts/configure-telegram-webhook.mjs ./scripts/configure-telegram-webhook.mjs
COPY scripts/disable-telegram-webhook.mjs ./scripts/disable-telegram-webhook.mjs
USER nextjs
CMD ["node", "scripts/configure-telegram-webhook.mjs"]

FROM dependencies AS telegram-worker
WORKDIR /app
ARG BUILD_VERSION=development
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Printopus Telegram delivery worker" \
      org.opencontainers.image.version=$BUILD_VERSION \
      org.opencontainers.image.revision=$VCS_REF
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && npm prune --omit=dev \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --chown=nextjs:nodejs lib ./lib
COPY --chown=nextjs:nodejs app/site-config.ts ./app/site-config.ts
COPY --chown=nextjs:nodejs scripts/telegram-delivery-worker.ts ./scripts/telegram-delivery-worker.ts
COPY --chown=nextjs:nodejs scripts/telegram-bot-daemon.ts ./scripts/telegram-bot-daemon.ts
USER nextjs
CMD ["./node_modules/.bin/tsx", "scripts/telegram-delivery-worker.ts"]

FROM ${NODE_IMAGE} AS runner
WORKDIR /app
ARG BUILD_VERSION=development
ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Printopus application" \
      org.opencontainers.image.version=$BUILD_VERSION \
      org.opencontainers.image.revision=$VCS_REF
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    UPLOAD_DIR=/var/lib/printopus/uploads
RUN apk add --no-cache libc6-compat fontconfig font-noto font-liberation font-liberation-sans-narrow font-urw-base35 \
    && addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs \
    && mkdir -p /var/lib/printopus/uploads \
    && chown -R nextjs:nodejs /var/lib/printopus \
    && rm -rf /usr/local/lib/node_modules/npm \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
