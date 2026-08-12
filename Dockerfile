# Use official Node.js LTS image
FROM node:20-slim AS builder

# Install build essentials for native modules (bcrypt, pg, etc.)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache-bust: forces Docker to re-copy package files on every deploy
ARG CACHEBUST=1

# Copy package files (lockfile contains resolved versions)
COPY package.json package-lock.json ./
COPY .npmrc ./

# Install ALL dependencies using the lockfile exactly as-is
RUN npm ci

# Copy source code
COPY . .

# Build frontend (static -> dist/) then bundle the Express server (dist/index.js).
# VITE_API_URL is forced EMPTY so the bundled frontend calls the API on its own
# origin (Express serves dist/ + /api together). Without this, client/.env.production
# would bake an external API hostname into the image. The split topology (static
# frontend on thorx.freebuff.app + API here) is unaffected: that build runs
# separately with its own VITE_API_URL.
RUN VITE_API_URL= npm run build && npm run build:server

# --- Production Image ---
FROM node:20-slim

WORKDIR /app

# Cache-bust for production stage too
ARG CACHEBUST=1

# Install production dependencies ONLY
COPY package.json package-lock.json ./
COPY .npmrc ./
RUN apt-get update && apt-get install -y python3 make g++ \
    && npm ci --omit=dev \
    && apt-get purge -y python3 make g++ && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Set production environment
ENV NODE_ENV=production

# Run as non-root user for container security (Finding 2-O)
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 --ingroup nodejs thorx
USER thorx

# Start the server with strict memory limits to prevent Railway 500MB OOM crashes
CMD ["node", "--max-old-space-size=256", "dist/index.js"]
