# =============================================================
# Pramana — multi-stage Docker build
# Stage 1: builder  — installs all deps, compiles TypeScript
# Stage 2: runner   — production-only deps + compiled dist
# Target: <200 MB image, runs as non-root user (uid 1001)
# =============================================================

# ---- builder ------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests first (better layer caching)
COPY pnpm-workspace.yaml .
COPY package.json pnpm-lock.yaml ./
COPY packages/engine/package.json ./packages/engine/
COPY packages/shared/package.json ./packages/shared/

# Install all deps (dev + prod) with frozen lockfile
RUN pnpm install --frozen-lockfile

# Copy source
COPY tsconfig.base.json .
COPY packages/shared/ ./packages/shared/
COPY packages/engine/ ./packages/engine/

# Build both packages
RUN pnpm -r build

# ---- runner -------------------------------------------------
FROM node:20-alpine AS runner

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy workspace manifests for prod install
COPY pnpm-workspace.yaml .
COPY package.json pnpm-lock.yaml ./
COPY packages/engine/package.json ./packages/engine/
COPY packages/shared/package.json ./packages/shared/

# Production deps only
RUN pnpm install --frozen-lockfile --prod

# Copy compiled output from builder
COPY --from=builder /build/packages/engine/dist ./packages/engine/dist
COPY --from=builder /build/packages/shared/dist ./packages/shared/dist

# Run as non-root user
RUN addgroup -g 1001 -S pramana && adduser -u 1001 -S pramana -G pramana
USER pramana

EXPOSE 3000

ENV NODE_ENV=production PORT=3000 LOG_LEVEL=info

CMD ["node", "packages/engine/dist/main.js"]
