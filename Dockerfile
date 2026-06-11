# ═══════════════════════════════════════════════════════════════
# DeltaAI WhatsApp Bot v2 — Render.com Dockerfile
# ═══════════════════════════════════════════════════════════════
# Runs a web server showing QR code for phone scanning.
# Connects to WhatsApp via Baileys (free forever — no Business API).
# Sends messages to DeltaAI Space for AI processing.
# ═══════════════════════════════════════════════════════════════

FROM node:20-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    libssl3 \
    && rm -rf /var/lib/apt/lists/*

# Copy package files and install dependencies FIRST (for Docker layer caching)
COPY package.json ./
RUN npm install --omit=dev && npm cache clean --force

# Copy source code
COPY src/ ./src/

# Create directories for persistent data
RUN mkdir -p /app/auth_info /app/bot_data

# ─── Environment Variables ───────────────────────────────────
# Override these in Render "Environment Variables"
ENV DELTA_AI_URL=http://localhost:3000
ENV BOT_NAME=DeltaAI
ENV BOT_LANGUAGE=ar
ENV DEFAULT_MODEL=delta-general
ENV RATE_LIMIT_PER_MINUTE=10
ENV LOG_LEVEL=info
ENV NODE_OPTIONS="--max-old-space-size=512"

# Render provides PORT env var automatically
# Our config.js reads PORT first, then falls back to WEB_PORT
EXPOSE 10000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
  CMD node -e "const http = require('http'); const port = process.env.PORT || 10000; http.get('http://localhost:' + port + '/', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));" || exit 1

# Start the bot
CMD ["node", "src/index.js"]
