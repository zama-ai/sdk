# Pulling from dhi.io needs `docker login dhi.io` with a Docker Hub account. The build stage is the same Debian
# release as the runtime stage, so the pruned node_modules link against the same glibc.
FROM dhi.io/node:24-debian13-dev@sha256:bd0e46a6276a5d973149b0a6df6080ae5bfe46674a04a07e3e61ef40da70aa84 AS build
# The dev image ships bash; don't depend on /bin/sh being present.
SHELL ["/bin/bash", "-eo", "pipefail", "-c"]
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

# Node.js only: no shell or package manager, and no entrypoint, so CMD names node.
FROM dhi.io/node:24-debian13@sha256:4f76f8507955f0cd1700b532da30629030ef44cd15691d1df6146d405be29fa5
ARG RUNTIME_UID=10000
ARG RUNTIME_GID=10001
ENV NODE_ENV=production
WORKDIR /app/packages/sdk-daemon
# Root-owned, so the daemon user cannot modify its own code.
COPY --from=build /pruned/full /app
COPY LICENSE /app/LICENSE
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /rootfs/run/ /run/
COPY --from=build --chown=${RUNTIME_UID}:${RUNTIME_GID} /rootfs/var/lib/ /var/lib/
# A dedicated high UID, not the base image's node user.
USER ${RUNTIME_UID}:${RUNTIME_GID}
HEALTHCHECK --interval=3s --timeout=3s --start-period=10s CMD ["node", "dist/healthcheck.js"]
CMD ["node", "dist/main.js"]
