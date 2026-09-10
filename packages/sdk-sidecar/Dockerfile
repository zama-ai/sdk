FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553 AS build
RUN npm install --global pnpm@11.1.2
WORKDIR /workspace
ENV CI=1
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm sidecar:build
RUN pnpm exec turbo prune @zama-fhe/sdk-sidecar --docker --out-dir=/pruned
RUN cp -a packages/sdk/dist /pruned/full/packages/sdk/dist && cp -a packages/sdk-sidecar/dist /pruned/full/packages/sdk-sidecar/dist && cp /pruned/pnpm-lock.yaml /pruned/full/pnpm-lock.yaml
RUN cd /pruned/full && pnpm install --prod --frozen-lockfile --offline --ignore-scripts

FROM node:24-bookworm-slim@sha256:2fe369e969550cde8e867afc3fe370b260140cab4a23d467074295b42163d553
ARG RUNTIME_UID=1000
ARG RUNTIME_GID=1000
ENV NODE_ENV=production
WORKDIR /app/packages/sdk-sidecar
COPY --from=build --chown=node:node /pruned/full /app
RUN mkdir -p /run/zama /var/lib/zama && chown ${RUNTIME_UID}:${RUNTIME_GID} /run/zama /var/lib/zama && chmod 700 /run/zama /var/lib/zama
USER ${RUNTIME_UID}:${RUNTIME_GID}
HEALTHCHECK --interval=3s --timeout=3s --start-period=10s CMD ["node", "dist/healthcheck.js"]
CMD ["node", "dist/main.js"]
