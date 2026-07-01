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

FROM node:22-alpine AS build

WORKDIR /app

ARG NUXT_PUBLIC_API_URL
ARG PUBLIC_API_URL
ENV NUXT_PUBLIC_API_URL=${NUXT_PUBLIC_API_URL}
ENV PUBLIC_API_URL=${PUBLIC_API_URL}

COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm run generate --workspace @padaria/web-vue

FROM nginxinc/nginx-unprivileged:1.27-alpine

COPY --chown=101:101 web-vue/nginx.conf /etc/nginx/conf.d/default.conf
COPY --chown=101:101 --from=build /app/web-vue/.output/public /usr/share/nginx/html

EXPOSE 8080
