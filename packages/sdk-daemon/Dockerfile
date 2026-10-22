# Debian 13, the same release as the distroless runtime stage.
FROM node:24-trixie-slim@sha256:43b9ba1142b8dcf33fa8f922ca1be85714adc444e0586c7cf7726daaeabc1bea AS build
RUN npm install --global pnpm@11.1.2
WORKDIR /workspace
ENV CI=1
# Releases don't change these files, so the fetched store stays cached until dependencies change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
# The private runtime directories are created here: COPY keeps their 0700 mode, and a new named volume copies it.
# The prune drops about 40 MB: TypeScript and @types are optional peers of viem and @fhevm/sdk that nothing loads
# at runtime, and the workspace packages need only their dist output.
RUN pnpm install --frozen-lockfile --offline \
  && pnpm daemon:build \
  && pnpm exec turbo prune @zama-fhe/sdk-daemon --docker --out-dir=/pruned \
  && cp -a packages/sdk/dist /pruned/full/packages/sdk/dist \
  && cp -a packages/sdk-daemon/dist /pruned/full/packages/sdk-daemon/dist \
  && cp /pruned/pnpm-lock.yaml /pruned/full/pnpm-lock.yaml \
  && pnpm install --dir /pruned/full --prod --frozen-lockfile --offline --ignore-scripts \
  && rm -rf /pruned/full/node_modules/.pnpm/typescript@* /pruned/full/node_modules/.pnpm/@typescript+* /pruned/full/node_modules/.pnpm/@types+* \
  && find /pruned/full/node_modules /pruned/full/packages -xtype l -delete \
  && find /pruned/full/packages/sdk /pruned/full/packages/sdk-daemon -mindepth 1 -maxdepth 1 ! -name dist ! -name package.json ! -name node_modules ! -name LICENSE -exec rm -rf {} + \
  && install -d -m 0700 /rootfs/run/zama /rootfs/var/lib/zama

# Node.js only: no shell or package manager.
FROM gcr.io/distroless/nodejs24-debian13:nonroot@sha256:78f07ef1b5ea71ad7c055df15d0dd8997f2d288f9158623c4d4ae3d765b7d50d
ARG RUNTIME_UID=10000
ARG RUNTIME_GID=10001
ENV NODE_ENV=production PATH=/nodejs/bin:$PATH
WORKDIR /app/packages/sdk-daemon
# Root-owned, so the daemon user cannot modify its own code.
COPY --from=build /pruned/full /app
COPY LICENSE /app/LICENSE
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /rootfs/run/ /run/
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /rootfs/var/lib/ /var/lib/
USER ${RUNTIME_UID}:${RUNTIME_GID}
HEALTHCHECK --interval=3s --timeout=3s --start-period=10s CMD ["node", "dist/healthcheck.js"]
# The base image's entrypoint is node.
CMD ["dist/main.js"]
