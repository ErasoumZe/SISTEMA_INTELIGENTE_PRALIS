FROM node:22-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* tsconfig.base.json ./
COPY api/package.json api/package.json
COPY db/package.json db/package.json
COPY integracoes-scripts/package.json integracoes-scripts/package.json
COPY shared/package.json shared/package.json
COPY tests/package.json tests/package.json
COPY web-vue/package.json web-vue/package.json

RUN npm ci

FROM node:22-alpine AS prod-deps

WORKDIR /app

COPY package.json package-lock.json* tsconfig.base.json ./
COPY api/package.json api/package.json
COPY db/package.json db/package.json
COPY integracoes-scripts/package.json integracoes-scripts/package.json
COPY shared/package.json shared/package.json
COPY tests/package.json tests/package.json
COPY web-vue/package.json web-vue/package.json

RUN npm ci --omit=dev

FROM node:22-alpine AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run build --workspace @padaria/shared
RUN npm run build --workspace @padaria/db
RUN npm run build --workspace @padaria/api

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps /app/package.json ./package.json
COPY --from=prod-deps /app/package-lock.json ./package-lock.json
COPY --from=prod-deps /app/node_modules ./node_modules

COPY --from=build /app/api/package.json api/package.json
COPY --from=build /app/api/dist api/dist
COPY --from=build /app/shared/package.json shared/package.json
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/db/package.json db/package.json
COPY --from=build /app/db/dist db/dist

EXPOSE 4100
USER node

CMD ["node", "api/dist/server.js"]
