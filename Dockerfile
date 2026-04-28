FROM node:24-alpine AS base

# Stage 1: Dependencies Installation
FROM base AS deps

RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# Stage 2: Application Build
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

COPY .env .env

RUN npm run build

# Stage 3: Production Runner
FROM node:24-alpine AS runner

WORKDIR /app

# copy env runtime
COPY --from=builder /app/.env .env
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER node

EXPOSE 3000

CMD ["node", "server.js"]