import { Context, Effect, Layer } from "effect";
import type { RelayerWebConfig } from "./relayer-sdk.types";
import { RelayerWorkerClient, type WorkerClientConfig } from "../worker/worker.client";
import { Relayer } from "../services/Relayer";
import { EncryptionFailed } from "../errors";
import { mergeFhevmConfig } from "./relayer-utils";
import { buildRelayerService } from "./relayer-service";

/**
 * Pinned relayer SDK version used for the WASM CDN bundle.
 */
const RELAYER_SDK_VERSION = "0.4.1";
const CDN_URL = `https://cdn.zama.org/relayer-sdk-js/${RELAYER_SDK_VERSION}/relayer-sdk-js.umd.cjs`;
/** SHA-384 hex digest of the pinned CDN bundle for integrity verification. */
const CDN_INTEGRITY =
  "2bd5401738b74509549bed2029bbbabedd481b10ac260f66e64a4ff3723d6d704180c51e882757c56ca1840491e90e33";

export class RelayerWebConfiguration extends Context.Tag("RelayerWebConfiguration")<
  RelayerWebConfiguration,
  RelayerWebConfig
>() {}

function buildWorkerConfig(chainId: number, config: RelayerWebConfig): WorkerClientConfig {
  const { transports, security, threads } = config;
  return {
    cdnUrl: CDN_URL,
    fhevmConfig: mergeFhevmConfig(chainId, transports[chainId]),
    csrfToken: security?.getCsrfToken?.() ?? "",
    integrity: security?.integrityCheck === false ? undefined : CDN_INTEGRITY,
    logger: config.logger,
    thread: threads,
  };
}

/**
 * Effect Layer that provides the Relayer service backed by a Web Worker.
 *
 * The worker is initialized when the layer is built and terminated when the
 * Effect scope closes, using `acquireRelease` for safe resource management.
 */
export const RelayerWebLive: Layer.Layer<Relayer, EncryptionFailed, RelayerWebConfiguration> =
  Layer.scoped(
    Relayer,
    Effect.gen(function* () {
      const config = yield* RelayerWebConfiguration;

      const client = yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const chainId = await config.getChainId();
            const workerConfig = buildWorkerConfig(chainId, config);
            const workerClient = new RelayerWorkerClient(workerConfig);
            await workerClient.initWorker();
            return workerClient;
          },
          catch: (error) =>
            new EncryptionFailed({
              message: "Failed to initialize FHE worker",
              cause: error instanceof Error ? error : undefined,
            }),
        }),
        (workerClient) => Effect.sync(() => workerClient.terminate()),
      );

      config.onStatusChange?.("ready");

      return buildRelayerService(client, () => {
        const token = config.security?.getCsrfToken?.() ?? "";
        if (token) {
          return Effect.tryPromise(() => client.updateCsrf(token)).pipe(Effect.orDie);
        }
        return Effect.void;
      });
    }),
  );
