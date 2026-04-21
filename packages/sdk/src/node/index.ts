/**
 * Node.js backend for `@zama-fhe/sdk` — provides {@link RelayerNode},
 * {@link NodeWorkerClient}, and {@link NodeWorkerPool} for server-side FHE operations.
 *
 * The `node()` transport factory self-registers its handler on first call,
 * keeping `node:worker_threads` out of browser bundles.
 *
 * @packageDocumentation
 */

import { registerRelayer, relayersMap } from "../config/relayers";
import type { NodeTransportConfig, NodeRelayerOptions } from "../config/transports";
import type { ExtendedFhevmInstanceConfig } from "../relayer/relayer-utils";
import { assertCondition } from "../utils";

/**
 * Node.js transport — routes to RelayerNode (worker thread pool).
 *
 * Self-registers the node transport handler on first call. No side-effect
 * import needed — just call `node()` in your transports map.
 *
 * @param chain - Per-chain FHE instance overrides.
 * @param relayer - Shared relayer-pool options (e.g. `poolSize`, `logger`).
 *
 * @example
 * ```ts
 * import { node } from "@zama-fhe/sdk/node";
 * transports: { [sepolia.id]: node({ relayerUrl: "..." }, { poolSize: 4 }) }
 * ```
 */
export function node(
  chain?: Partial<ExtendedFhevmInstanceConfig>,
  relayer?: NodeRelayerOptions,
): NodeTransportConfig {
  if (!relayersMap.has("node")) {
    registerRelayer("node", async (resolvedChain, transport) => {
      assertCondition(transport.type === "node", "Transport type must be of type `node`");
      const merged = { ...resolvedChain, ...transport.chain };
      const m = await import("../relayer/relayer-node");
      return new m.RelayerNode({ chain: merged, ...transport.relayer });
    });
  }
  return { type: "node", chain, relayer };
}

export { cleartext } from "../config/transports";
export type { NodeTransportConfig, CleartextTransportConfig } from "../config/transports";
export { RelayerNode } from "../relayer/relayer-node";
export type { RelayerNodeConfig } from "../relayer/relayer-node";
export type { RelayerSDK } from "../relayer/relayer-sdk";
export { NodeWorkerClient } from "../worker/worker.node-client";
export type { NodeWorkerClientConfig } from "../worker/worker.node-client";
export { NodeWorkerPool } from "../worker/worker.node-pool";
export type { NodeWorkerPoolConfig } from "../worker/worker.node-pool";
export type {
  GenericLogger,
  WorkerRequestType,
  WorkerRequest,
  WorkerResponse,
  InitRequest,
  NodeInitRequest,
  UpdateCsrfRequest,
  EncryptRequest,
  UserDecryptRequest,
  PublicDecryptRequest,
  GenerateKeypairRequest,
  CreateEIP712Request,
  CreateDelegatedEIP712Request,
  DelegatedUserDecryptRequest,
  RequestZKProofVerificationRequest,
  GetPublicKeyRequest,
  GetPublicParamsRequest,
  EncryptPayload,
  UserDecryptPayload,
  DelegatedUserDecryptPayload,
  CreateEIP712Payload,
  CreateDelegatedEIP712Payload,
  EncryptResponseData,
  UserDecryptResponseData,
  PublicDecryptResponseData,
  GenerateKeypairResponseData,
  CreateEIP712ResponseData,
  CreateDelegatedEIP712ResponseData,
  DelegatedUserDecryptResponseData,
  RequestZKProofVerificationResponseData,
  GetPublicKeyResponseData,
  GetPublicParamsResponseData,
  BaseRequest,
  SuccessResponse,
  ErrorResponse,
} from "../worker/worker.types";
export { BaseWorkerClient } from "../worker/worker.base-client";

// Relayer types used in RelayerNode's public API
export type {
  ClearValueType,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  UserDecryptParams,
  DelegatedUserDecryptParams,
  PublicDecryptResult,
} from "../relayer/relayer-sdk.types";

// Storage
export { asyncLocalStorage, AsyncLocalMapStorage } from "../storage/async-local-storage";

// Network preset configs
export { HardhatConfig, MainnetConfig, SepoliaConfig } from "../relayer/relayer-utils";
