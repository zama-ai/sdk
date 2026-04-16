import type {
  FhevmInstanceConfig,
  InputProofBytesType,
  KmsDelegatedUserDecryptEIP712Type,
  KmsUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type { ClearValueType, EncryptInput, Handle } from "../relayer/relayer-sdk.types";
import type { Address, Hex } from "viem";

// ============================================================================
// Logger
// ============================================================================

/**
 * Optional logger for worker client observability.
 * Pass to `WorkerClientConfig` or `NodeWorkerClientConfig` to observe
 * request lifecycle (start, success, error, timeout).
 */
export interface GenericLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
  debug: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

// ============================================================================
// Request Types
//
// The worker request/response protocol below describes message-passing between
// the main thread and the FHE worker. It is not part of the public SDK surface;
// no external consumer should build or inspect these messages directly.
// ============================================================================

/** @internal */
export type WorkerRequestType =
  | "INIT"
  | "NODE_INIT"
  | "UPDATE_CSRF"
  | "ENCRYPT"
  | "USER_DECRYPT"
  | "PUBLIC_DECRYPT"
  | "GENERATE_KEYPAIR"
  | "CREATE_EIP712"
  | "CREATE_DELEGATED_EIP712"
  | "DELEGATED_USER_DECRYPT"
  | "REQUEST_ZK_PROOF_VERIFICATION"
  | "GET_PUBLIC_KEY"
  | "GET_PUBLIC_PARAMS";

/** @internal */
export interface BaseRequest {
  id: string;
  type: WorkerRequestType;
}

/** @internal */
export interface InitRequest extends BaseRequest {
  type: "INIT";
  payload: {
    cdnUrl: string;
    fhevmConfig: FhevmInstanceConfig;
    csrfToken: string;
    /** Expected SHA-384 hex digest for integrity verification. */
    integrity?: string;
    /** Number of WASM threads for parallel FHE operations. */
    thread?: number;
  };
}

/** @internal */
export interface NodeInitRequest extends BaseRequest {
  type: "NODE_INIT";
  payload: {
    fhevmConfig: FhevmInstanceConfig;
  };
}

/** @internal */
export interface UpdateCsrfRequest extends BaseRequest {
  type: "UPDATE_CSRF";
  payload: {
    csrfToken: string;
  };
}

/** @internal */
export interface EncryptRequest extends BaseRequest {
  type: "ENCRYPT";
  payload: {
    values: EncryptInput[];
    contractAddress: Address;
    userAddress: Address;
  };
}

/** @internal */
export interface UserDecryptRequest extends BaseRequest {
  type: "USER_DECRYPT";
  payload: {
    handles: Handle[];
    contractAddress: Address;
    signedContractAddresses: Address[];
    privateKey: Hex;
    publicKey: Hex;
    signature: Hex;
    signerAddress: Address;
    startTimestamp: number;
    durationDays: number;
  };
}

/** @internal */
export interface PublicDecryptRequest extends BaseRequest {
  type: "PUBLIC_DECRYPT";
  payload: {
    handles: Handle[];
  };
}

/** @internal */
export interface GenerateKeypairRequest extends BaseRequest {
  type: "GENERATE_KEYPAIR";
  payload: Record<string, never>;
}

/** @internal */
export interface CreateEIP712Request extends BaseRequest {
  type: "CREATE_EIP712";
  payload: {
    publicKey: Hex;
    contractAddresses: Address[];
    startTimestamp: number;
    durationDays: number;
  };
}

/** @internal */
export interface CreateDelegatedEIP712Request extends BaseRequest {
  type: "CREATE_DELEGATED_EIP712";
  payload: {
    publicKey: Hex;
    contractAddresses: Address[];
    delegatorAddress: Address;
    startTimestamp: number;
    durationDays: number;
  };
}

/** @internal */
export interface DelegatedUserDecryptRequest extends BaseRequest {
  type: "DELEGATED_USER_DECRYPT";
  payload: {
    handles: Handle[];
    contractAddress: Address;
    signedContractAddresses: Address[];
    privateKey: Hex;
    publicKey: Hex;
    signature: Hex;
    delegatorAddress: Address;
    delegateAddress: Address;
    startTimestamp: number;
    durationDays: number;
  };
}

/** @internal */
export interface RequestZKProofVerificationRequest extends BaseRequest {
  type: "REQUEST_ZK_PROOF_VERIFICATION";
  payload: {
    zkProof: ZKProofLike;
  };
}

/** @internal */
export interface GetPublicKeyRequest extends BaseRequest {
  type: "GET_PUBLIC_KEY";
  payload: Record<string, never>;
}

/** @internal */
export interface GetPublicParamsRequest extends BaseRequest {
  type: "GET_PUBLIC_PARAMS";
  payload: {
    bits: number;
  };
}

/** @internal */
export type WorkerRequest =
  | InitRequest
  | NodeInitRequest
  | UpdateCsrfRequest
  | EncryptRequest
  | UserDecryptRequest
  | PublicDecryptRequest
  | GenerateKeypairRequest
  | CreateEIP712Request
  | CreateDelegatedEIP712Request
  | DelegatedUserDecryptRequest
  | RequestZKProofVerificationRequest
  | GetPublicKeyRequest
  | GetPublicParamsRequest;

// ============================================================================
// Payload Type Aliases
// ============================================================================

/** @internal */
export type EncryptPayload = EncryptRequest["payload"];
/** @internal */
export type UserDecryptPayload = UserDecryptRequest["payload"];
/** @internal */
export type DelegatedUserDecryptPayload = DelegatedUserDecryptRequest["payload"];
/** @internal */
export type CreateEIP712Payload = CreateEIP712Request["payload"];
/** @internal */
export type CreateDelegatedEIP712Payload = CreateDelegatedEIP712Request["payload"];

// ============================================================================
// Response Types
// ============================================================================

interface BaseResponse {
  id: string;
  type: WorkerRequestType;
}

/** @internal */
export interface SuccessResponse<T> extends BaseResponse {
  success: true;
  data: T;
}

/** @internal */
export interface ErrorResponse extends BaseResponse {
  success: false;
  error: string;
  /** HTTP status code from the relayer, when available. */
  statusCode?: number;
}

/** @internal */
export type WorkerResponse<T> = SuccessResponse<T> | ErrorResponse;

// ============================================================================
// Response Data Types
// ============================================================================

/** @internal */
export interface InitResponseData {
  initialized: true;
}

/** @internal */
export interface UpdateCsrfResponseData {
  updated: true;
}

/** @internal */
export type EncryptResponseData = InputProofBytesType;

/** @internal */
export interface UserDecryptResponseData {
  clearValues: Record<Handle, ClearValueType>;
}

/** @internal */
export interface PublicDecryptResponseData {
  clearValues: Readonly<Record<Handle, ClearValueType>>;
  abiEncodedClearValues: Hex;
  decryptionProof: Hex;
}

/** @internal */
export interface GenerateKeypairResponseData {
  publicKey: Hex;
  privateKey: Hex;
}

/** @internal */
export type CreateEIP712ResponseData = KmsUserDecryptEIP712Type;

/** @internal */
export type CreateDelegatedEIP712ResponseData = KmsDelegatedUserDecryptEIP712Type;

/** @internal */
export interface DelegatedUserDecryptResponseData {
  clearValues: Record<Handle, ClearValueType>;
}

/** @internal */
export type RequestZKProofVerificationResponseData = InputProofBytesType;

/** @internal */
export interface GetPublicKeyResponseData {
  result: { publicKeyId: string; publicKey: Uint8Array } | null;
}

/** @internal */
export interface GetPublicParamsResponseData {
  result: { publicParams: Uint8Array; publicParamsId: string } | null;
}
