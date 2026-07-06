FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src

FROM node:22-alpine
WORKDIR /app
RUN addgroup -S zama && adduser -S zama -G zama
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/src ./src
USER zama
EXPOSE 8545
ENTRYPOINT ["npx", "tsx", "src/cli.ts"]
