import type {
  InputProofBytesType,
  KmsDelegatedUserDecryptEIP712Type,
  KmsUserDecryptEIP712Type,
  ZKProofLike,
} from "@zama-fhe/relayer-sdk/bundle";
import type { ClearValueType, EncryptInput, Handle } from "../relayer/relayer-sdk.types";
import type { FheChain } from "../chains/types";
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
// ============================================================================

export type WorkerEnv = "web" | "node";

export type WorkerRequestType =
  | "INIT"
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

export interface BaseRequest {
  id: string;
  type: WorkerRequestType;
}

interface InitWebPayload {
  env: "web";
  cdnUrl: string;
  chains: FheChain[];
  csrfToken: string;
  /** Expected SHA-384 hex digest for integrity verification. */
  integrity?: string;
  /** Number of WASM threads for parallel FHE operations. */
  thread?: number;
}

interface InitNodePayload {
  env: "node";
  chains: FheChain[];
}

export type InitPayload = InitWebPayload | InitNodePayload;

export interface InitRequest extends BaseRequest {
  type: "INIT";
  payload: InitPayload;
}

export interface UpdateCsrfRequest extends BaseRequest {
  type: "UPDATE_CSRF";
  payload: {
    csrfToken: string;
  };
}

export interface EncryptRequest extends BaseRequest {
  type: "ENCRYPT";
  payload: {
    chainId: number;
    values: EncryptInput[];
    contractAddress: Address;
    userAddress: Address;
  };
}

export interface UserDecryptRequest extends BaseRequest {
  type: "USER_DECRYPT";
  payload: {
    chainId: number;
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

export interface PublicDecryptRequest extends BaseRequest {
  type: "PUBLIC_DECRYPT";
  payload: {
    chainId: number;
    handles: Handle[];
  };
}

export interface GenerateKeypairRequest extends BaseRequest {
  type: "GENERATE_KEYPAIR";
  payload: { chainId: number };
}

export interface CreateEIP712Request extends BaseRequest {
  type: "CREATE_EIP712";
  payload: {
    chainId: number;
    publicKey: Hex;
    contractAddresses: Address[];
    startTimestamp: number;
    durationDays: number;
  };
}

export interface CreateDelegatedEIP712Request extends BaseRequest {
  type: "CREATE_DELEGATED_EIP712";
  payload: {
    chainId: number;
    publicKey: Hex;
    contractAddresses: Address[];
    delegatorAddress: Address;
    startTimestamp: number;
    durationDays: number;
  };
}

export interface DelegatedUserDecryptRequest extends BaseRequest {
  type: "DELEGATED_USER_DECRYPT";
  payload: {
    chainId: number;
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

export interface RequestZKProofVerificationRequest extends BaseRequest {
  type: "REQUEST_ZK_PROOF_VERIFICATION";
  payload: {
    chainId: number;
    zkProof: ZKProofLike;
  };
}

export interface GetPublicKeyRequest extends BaseRequest {
  type: "GET_PUBLIC_KEY";
  payload: { chainId: number };
}

export interface GetPublicParamsRequest extends BaseRequest {
  type: "GET_PUBLIC_PARAMS";
  payload: {
    chainId: number;
    bits: number;
  };
}

export type WorkerRequest =
  | InitRequest
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

export type EncryptPayload = EncryptRequest["payload"];
export type UserDecryptPayload = UserDecryptRequest["payload"];
export type PublicDecryptPayload = PublicDecryptRequest["payload"];
export type DelegatedUserDecryptPayload = DelegatedUserDecryptRequest["payload"];
export type CreateEIP712Payload = CreateEIP712Request["payload"];
export type CreateDelegatedEIP712Payload = CreateDelegatedEIP712Request["payload"];

// ============================================================================
// Response Types
// ============================================================================

interface BaseResponse {
  id: string;
  type: WorkerRequestType;
}

export interface SuccessResponse<T> extends BaseResponse {
  success: true;
  data: T;
}

export interface ErrorResponse extends BaseResponse {
  success: false;
  error: string;
  /** HTTP status code from the relayer, when available. */
  statusCode?: number;
}

export type WorkerResponse<T> = SuccessResponse<T> | ErrorResponse;

// ============================================================================
// Response Data Types
// ============================================================================

export interface InitResponseData {
  initialized: true;
}

export interface UpdateCsrfResponseData {
  updated: true;
}

export type EncryptResponseData = InputProofBytesType;

export interface UserDecryptResponseData {
  clearValues: Record<Handle, ClearValueType>;
}

export interface PublicDecryptResponseData {
  clearValues: Readonly<Record<Handle, ClearValueType>>;
  abiEncodedClearValues: Hex;
  decryptionProof: Hex;
}

export interface GenerateKeypairResponseData {
  publicKey: Hex;
  privateKey: Hex;
}

export type CreateEIP712ResponseData = KmsUserDecryptEIP712Type;

export type CreateDelegatedEIP712ResponseData = KmsDelegatedUserDecryptEIP712Type;

export interface DelegatedUserDecryptResponseData {
  clearValues: Record<Handle, ClearValueType>;
}

export type RequestZKProofVerificationResponseData = InputProofBytesType;

export interface GetPublicKeyResponseData {
  result: { publicKeyId: string; publicKey: Uint8Array } | null;
}

export interface GetPublicParamsResponseData {
  result: { publicParams: Uint8Array; publicParamsId: string } | null;
}
