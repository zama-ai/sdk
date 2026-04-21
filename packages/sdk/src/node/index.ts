/**
 * Node.js backend for `@zama-fhe/sdk` — provides {@link RelayerNode},
 * {@link NodeWorkerClient}, and {@link NodeWorkerPool} for server-side FHE operations.
 *
 * Importing this module registers the `node()` transport handler so that
 * `createZamaConfig` can route chains to {@link RelayerNode}.
 *
 * @packageDocumentation
 */

import { ConfigurationError } from "../errors";
import { registerTransportHandler } from "../config/resolve";

// Register the node transport handler (side-effect).
// This keeps the dynamic import("../relayer/relayer-node") out of the main
// @zama-fhe/sdk entry, so browser bundles never reference node:worker_threads.
registerTransportHandler("node", (chain, transport) => {
  if (transport.type !== "node") {throw new Error("unreachable");}
  const merged = { ...chain, ...transport.chain };
  if (!merged.relayerUrl) {
    throw new ConfigurationError(
      `Chain ${chain.chainId} has an empty relayerUrl. Use cleartext() for chains without a relayer.`,
    );
  }
  return import("../relayer/relayer-node").then(
    (m) => new m.RelayerNode({ chain: merged, ...transport.relayer }),
  );
});

export { node } from "../config/transports";
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
