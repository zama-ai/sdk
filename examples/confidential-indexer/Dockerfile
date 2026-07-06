FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src

FROM node:22-alpine
WORKDIR /app
RUN addgroup -S indexer && adduser -S indexer -G indexer
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/src ./src
USER indexer
EXPOSE 8787
ENTRYPOINT ["npx", "tsx", "src/cli.ts"]
