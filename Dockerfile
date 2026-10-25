# syntax=docker/dockerfile:1
# Production image. GitHub Actions (.github/workflows/docker.yml) builds it for every release and
# pushes it to ghcr.io; deploy/deploy.sh pulls it. The build needs no database: the running app
# migrates PostgreSQL itself and renders every page from it (it refreshes all pages at startup).

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=docsku-pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

FROM deps AS builder
COPY . .
# A new id per build: browsers still running the previous version reload instead of
# requesting chunks that no longer exist.
ARG NEXT_DEPLOYMENT_ID
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_DEPLOYMENT_ID=$NEXT_DEPLOYMENT_ID
RUN pnpm build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    UPLOAD_DIR=/app/storage/uploads
# A uid no host account has, so the shared uploads folder doesn't become some host user's.
RUN addgroup -S -g 10001 nodejs && adduser -S -u 10001 -G nodejs nextjs \
    && mkdir -p storage/uploads .next \
    && chown -R nextjs:nodejs storage .next
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Applied automatically at startup (lib/migrate.ts).
COPY --from=builder --chown=nextjs:nodejs /app/db/migrations ./db/migrations
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server.js"]
