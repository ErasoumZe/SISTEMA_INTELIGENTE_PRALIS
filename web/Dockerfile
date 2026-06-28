FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* tsconfig.base.json ./
COPY api/package.json api/package.json
COPY shared/package.json shared/package.json
COPY web/package.json web/package.json
COPY tests/package.json tests/package.json
RUN npm install

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace @padaria/shared
RUN npm run build --workspace @padaria/web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PUBLIC_API_URL=http://localhost:4100
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/web ./web
COPY --from=build /app/shared ./shared
EXPOSE 4173
CMD ["npm", "run", "preview", "--workspace", "@padaria/web", "--", "--host", "0.0.0.0"]
