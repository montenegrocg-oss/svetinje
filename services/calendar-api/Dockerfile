FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY admin/package.json admin/package.json
COPY services/calendar-api/package.json services/calendar-api/package.json
RUN pnpm install --frozen-lockfile --prod --filter @svetinje/calendar-api

COPY data/calendar/2026-08-01_2026-12-31.json data/calendar/2026-08-01_2026-12-31.json
COPY scripts/lib/verified-calendar-seed.mjs scripts/lib/verified-calendar-seed.mjs
COPY services/calendar-api/migrations services/calendar-api/migrations
COPY services/calendar-api/src services/calendar-api/src

USER node
EXPOSE 3001
CMD ["node", "services/calendar-api/src/server.mjs"]
