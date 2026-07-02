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

# --ignore-scripts: dependencias de runtime sao JS puro (sem build nativo) e o lockfile marca
# drizzle-kit como devOptional (peer), cujo esbuild aninhado quebra o postinstall no --omit=dev.
RUN npm ci --omit=dev --ignore-scripts

FROM node:22-alpine AS build

WORKDIR /app

# Copia a arvore inteira do estagio deps: o npm aninha dependencias em node_modules
# DE WORKSPACE (ex.: api/node_modules/@better-auth/drizzle-adapter); copiar so o
# node_modules da raiz deixaria esses pacotes de fora e o build falharia com TS2307.
COPY --from=deps /app /app
COPY . .

RUN npm run build --workspace @padaria/shared
RUN npm run build --workspace @padaria/db
RUN npm run build --workspace @padaria/api

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production

# Traz o esqueleto completo de producao (package.json da raiz e dos workspaces +
# node_modules da raiz E aninhados por workspace — ver comentario no estagio build).
COPY --from=prod-deps /app /app

COPY --from=build /app/api/dist api/dist
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/db/dist db/dist

# Diretorio de uploads: precisa existir com dono node ANTES do USER node, para que o
# volume nomeado montado em /app/storage herde a permissao e o runtime nao-root consiga escrever.
RUN mkdir -p /app/storage && chown node:node /app/storage

EXPOSE 4100
USER node

CMD ["node", "api/dist/server.js"]
