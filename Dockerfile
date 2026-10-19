# =====================================================================
# HavenDesk AI Receptionist — Production Dockerfile
# Multi-tenant Node.js 24 with native SQLite WAL support
# =====================================================================

FROM node:24-alpine AS base

# Install curl for container healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Copy dependency manifests
COPY package.json ./

# Install production dependencies
RUN npm install --omit=dev

# Copy entire application codebase
COPY . .

# Create database directory for persistent volume mount
RUN mkdir -p /app/server/db

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3000

# Expose HTTP port
EXPOSE 3000

# Health check to ensure service responsiveness
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Launch HavenDesk server
CMD ["node", "server/server.js"]
