import type { FheChain } from "../chains/types";
import type { RelayerConfig } from "../config/types";
import { FhevmRelayer } from "../relayer/fhevm-relayer";
import type { RelayerOptions } from "../relayer/types";
import type { LoggerService } from "../services/logger-service";
import { telemetryModeFromEnv, type TelemetryState } from "../telemetry";

/** Node transport — drives the FHE backend directly on the calling thread. */
export interface NodeRelayerConfig extends RelayerConfig {
  /** Discriminant for the node transport. */
  readonly type: "node";
  /** @internal */
  readonly createRelayer: (
    chain: FheChain,
    logger: LoggerService,
    telemetry?: TelemetryState,
  ) => FhevmRelayer;
}

/**
 * Node.js transport — drives `@fhevm/sdk` via {@link FhevmRelayer} on the calling thread.
 *
 * `ZAMA_SDK_TELEMETRY` overrides `createConfig({ telemetry })` for the whole
 * process: `header`, `query` or `off` (`0` and `false` also mean `off`).
 *
 * @example
 * ```ts
 * relayers: {
 *   [sepolia.id]: node({ timeout: 5 * 60_000 }),
 *   [mainnet.id]: node({ batchRpcCalls: true }),
 * }
 * ```
 */
export function node(options?: RelayerOptions): NodeRelayerConfig {
  return {
    type: "node",
    createRelayer: (chain, logger, telemetry) => {
      const mode = telemetryModeFromEnv(globalThis.process?.env ?? {}) ?? telemetry?.mode;
      return new FhevmRelayer({
        chain,
        options,
        logger,
        telemetry:
          telemetry && mode !== undefined && mode !== "off"
            ? { state: telemetry, runtime: "node", mode }
            : undefined,
      });
    },
  };
}
