# syntax=docker/dockerfile:1.7
# ---------- deps ----------
FROM node:22-alpine AS deps
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/package.json
RUN pnpm install --frozen-lockfile --filter paperloom-web...

# ---------- dev ----------
# Used by docker-compose.dev.yml via `command: pnpm dev` over a bind mount.
# node_modules baked here so the anonymous volume in compose preserves them
# when the host bind overlays /app.
FROM node:22-alpine AS dev
WORKDIR /app
RUN corepack enable
COPY --from=deps /repo/node_modules /repo/node_modules
COPY --from=deps /repo/web/node_modules ./node_modules
COPY web/package.json ./
ENV NODE_ENV=development
EXPOSE 3000
CMD ["pnpm", "dev"]

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY --from=deps /repo/node_modules ./node_modules
COPY --from=deps /repo/web/node_modules ./web/node_modules
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web ./web
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter paperloom-web build

# ---------- runner (prod) ----------
FROM node:22-alpine AS runner
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=build --chown=nextjs:nodejs /repo/web/.next ./.next
COPY --from=build --chown=nextjs:nodejs /repo/web/public ./public
COPY --from=build --chown=nextjs:nodejs /repo/web/node_modules ./node_modules
COPY --from=build --chown=nextjs:nodejs /repo/web/package.json ./package.json
USER nextjs
EXPOSE 3000
CMD ["pnpm", "start"]
