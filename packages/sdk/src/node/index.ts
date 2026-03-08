/**
 * Node.js backend for `@zama-fhe/sdk` — provides {@link RelayerNode},
 * {@link NodeWorkerClient}, and {@link NodeWorkerPool} for server-side FHE operations.
 *
 * @packageDocumentation
 */

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
  EIP712TypedData,
  EncryptParams,
  EncryptResult,
  UserDecryptParams,
  DelegatedUserDecryptParams,
  PublicDecryptResult,
} from "../relayer/relayer-sdk.types";
export type { KeypairType } from "@zama-fhe/relayer-sdk/bundle";

// Storage
export { asyncLocalStorage, AsyncLocalMapStorage } from "../token/async-local-storage";
export type { GenericStorage } from "../token/token.types";

// Effect layer factories
export { makeRelayerNodeLayer } from "../relayer/relayer-node.layer";

// Network preset configs
export { HardhatConfig, MainnetConfig, SepoliaConfig } from "../relayer/relayer-utils";
