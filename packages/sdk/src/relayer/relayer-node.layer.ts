import { Context, Effect, Layer } from "effect";
import type { RelayerNodeConfig } from "./relayer-node";
import { NodeWorkerPool, type NodeWorkerPoolConfig } from "../worker/worker.node-pool";
import { Relayer } from "../services/Relayer";
import { EncryptionFailed } from "../errors";
import { mergeFhevmConfig } from "./relayer-utils";
import { buildRelayerService } from "./relayer-service";

export class RelayerNodeConfiguration extends Context.Tag("RelayerNodeConfiguration")<
  RelayerNodeConfiguration,
  RelayerNodeConfig
>() {}

/**
 * Effect Layer that provides the Relayer service backed by a Node.js worker pool.
 *
 * The pool is initialized when the layer is built and terminated when the
 * Effect scope closes, using `acquireRelease` for safe resource management.
 */
export const RelayerNodeLive: Layer.Layer<Relayer, EncryptionFailed, RelayerNodeConfiguration> =
  Layer.scoped(
    Relayer,
    Effect.gen(function* () {
      const config = yield* RelayerNodeConfiguration;

      const pool = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const chainId = await config.getChainId();
            const poolConfig: NodeWorkerPoolConfig = {
              fhevmConfig: mergeFhevmConfig(chainId, config.transports[chainId]),
              poolSize: config.poolSize,
              logger: config.logger,
            };
            const workerPool = new NodeWorkerPool(poolConfig);
            await workerPool.initPool();
            return workerPool;
          },
          catch: (error) =>
            new EncryptionFailed({
              message: "Failed to initialize FHE worker pool",
              cause: error instanceof Error ? error : undefined,
            }),
        }),
        (workerPool) => Effect.sync(() => workerPool.terminate()),
      );

      return buildRelayerService(pool);
    }),
  );
