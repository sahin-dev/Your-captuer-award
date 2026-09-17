FROM node:22-bookworm-slim AS base

WORKDIR /app
ENV NODE_ENV=production

FROM base AS deps

ENV NODE_ENV=development
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM deps AS build

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM base AS prod-deps

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

FROM base AS runner

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package*.json ./

RUN mkdir -p uploads && chown -R node:node /app

USER node

EXPOSE 5003

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD node -e "const port=process.env.PORT||5003; fetch('http://127.0.0.1:'+port+'/').then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
