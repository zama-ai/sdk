/**
 * Node.js backend for `@zama-fhe/sdk` — provides {@link RelayerNode},
 * {@link NodeWorkerClient}, and {@link NodeWorkerPool} for server-side FHE operations.
 *
 * @packageDocumentation
 */

export { RelayerNode } from "../relayer/relayer-node";
export type { RelayerNodeConfig } from "../relayer/relayer-node";
export { NodeWorkerClient } from "../worker/worker.node-client";
export type { NodeWorkerClientConfig } from "../worker/worker.node-client";
export { NodeWorkerPool } from "../worker/worker.node-pool";
export type { NodeWorkerPoolConfig } from "../worker/worker.node-pool";

// Node-specific storage
export { asyncLocalStorage, AsyncLocalMapStorage } from "../storage/async-local-storage";

// Types that appear in public/protected signatures of the classes above.
// Consumers of `@zama-fhe/sdk/node` also have access to `@zama-fhe/sdk`, where
// these types are the canonical public exports; they are surfaced here so
// api-extractor sees them from the /node entry point.
export type { RelayerSDK } from "../relayer/relayer-sdk";
export type {
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  Handle,
  PublicDecryptResult,
  UserDecryptParams,
  DelegatedUserDecryptParams,
} from "../relayer/relayer-sdk.types";
export type { GenericStorage } from "../types/storage";

// @internal types re-exported so api-extractor sees them from the entry point.
// These types appear in protected/public signatures of classes above but are
// not part of the public contract — they are flagged @internal at source.
export type { BaseWorkerClient } from "../worker/worker.base-client";
export type { GenericLogger } from "../worker/worker.types";
export type {
  WorkerRequestType,
  WorkerRequest,
  WorkerResponse,
  BaseRequest,
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
  EncryptResponseData,
  UserDecryptPayload,
  UserDecryptResponseData,
  DelegatedUserDecryptPayload,
  DelegatedUserDecryptResponseData,
  CreateEIP712Payload,
  CreateEIP712ResponseData,
  CreateDelegatedEIP712Payload,
  CreateDelegatedEIP712ResponseData,
  GenerateKeypairResponseData,
  GetPublicKeyResponseData,
  GetPublicParamsResponseData,
  PublicDecryptResponseData,
  RequestZKProofVerificationResponseData,
} from "../worker/worker.types";
