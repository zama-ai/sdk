/**
 * Node.js backend for `@zama-fhe/sdk` — provides the `node()` transport
 * factory for server-side FHE operations.
 *
 * The `node()` transport factory self-registers its handler on first call,
 * keeping `node:worker_threads` out of browser bundles.
 *
 * @packageDocumentation
 */

export { node } from "./config";
export type { NodeRelayerConfig, NodePoolOptions } from "./config";
export { cleartext } from "../config/cleartext";
export type { RelayerConfig } from "../config/types";
export type { RelayerNodeConfig } from "../relayer/relayer-node";
export type { RelayerSDK } from "../relayer/relayer-sdk";
export type { NodeWorkerClientConfig } from "../worker/worker.node-client";
export type { NodeWorkerPoolConfig } from "../worker/worker.node-pool";
export type {
  GenericLogger,
  WorkerRequestType,
  WorkerRequest,
  WorkerResponse,
  InitRequest,
  InitPayload,
  WorkerEnv,
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
  ClearValue,
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
} from "../relayer/relayer-sdk.types";
// Decrypt parameter/result types — aligned with the canonical Zama glossary (see main entry).
export type {
  UserDecryptParams as DecryptValuesParams,
  PublicDecryptResult as DecryptPublicValuesResult,
  DelegatedUserDecryptParams as DelegatedDecryptValuesParams,
} from "../relayer/relayer-sdk.types";

// Storage
export { asyncLocalStorage, AsyncLocalMapStorage } from "../storage/async-local-storage";

// Chain presets
export { mainnet, sepolia, hoodi, hardhat, anvil, chains } from "../chains";
