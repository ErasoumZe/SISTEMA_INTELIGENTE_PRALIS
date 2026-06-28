FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json ./
COPY api/package.json api/package.json
COPY db/package.json db/package.json
COPY shared/package.json shared/package.json
COPY web/package.json web/package.json
COPY web-vue/package.json web-vue/package.json
COPY tests/package.json tests/package.json
RUN npm install

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
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/api ./api
COPY --from=build /app/shared ./shared
COPY --from=build /app/db ./db
CMD ["npm", "run", "start", "--workspace", "@padaria/api"]
