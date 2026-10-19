# syntax=docker/dockerfile:1
# Production image for docker-compose.prod.yml. Build through that file (or deploy/deploy.sh):
# `next build` prerenders docs pages from PostgreSQL, so the build needs DATABASE_URL and host networking.

FROM node:24-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=docsku-pnpm,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile

# One-shot database migrations (drizzle-kit is a dev dependency, so this stage keeps all of node_modules).
FROM deps AS migrator
COPY drizzle.config.ts ./
COPY db ./db
CMD ["pnpm", "exec", "drizzle-kit", "migrate"]

FROM deps AS builder
COPY . .
# Only this stage sees these; the runner image below does not keep them.
ARG DATABASE_URL
ARG SITE_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN test -n "$DATABASE_URL" || (echo "Build arg DATABASE_URL is required (the build reads pages from the database)." >&2 && exit 1)
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
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server.js"]
