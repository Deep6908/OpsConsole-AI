# ── Stage 1: Build (nothing to compile — plain Node.js) ─────────────────────
FROM node:20-alpine AS base

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine

RUN apk add --no-cache dumb-init

# Non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy node_modules from build stage
COPY --from=base /app/node_modules ./node_modules

# Copy application source
COPY server/   ./server/
COPY client/   ./client/
COPY package*.json ./

# Ownership
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

ENV NODE_ENV=production

# Use dumb-init to handle SIGTERM properly
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server/index.js"]
