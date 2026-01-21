# ---- Base image ----
FROM node:22-alpine

# ---- App directory ----
WORKDIR /app

# ---- Copy only package files first (better caching) ----
COPY api/package.json api/package-lock.json ./api/

# ---- Install deps (prod + tsx runtime) ----
RUN cd api && npm ci

# ---- Copy source ----
COPY api ./api

# ---- Runtime config ----
WORKDIR /app/api
ENV NODE_ENV=production
EXPOSE 8080

# ---- Start API (tsx supports TS directly) ----
CMD ["npx", "tsx", "src/index.ts"]
