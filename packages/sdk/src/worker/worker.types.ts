import type {
  Address,
  DecryptedValue,
  EncryptInput,
  FhevmInstanceConfig,
  InputProofBytesType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "../relayer/relayer-sdk.types";

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

export interface BaseRequest {
  id: string;
  type: WorkerRequestType;
}

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

export interface NodeInitRequest extends BaseRequest {
  type: "NODE_INIT";
  payload: {
    fhevmConfig: FhevmInstanceConfig;
  };
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
    values: EncryptInput[];
    contractAddress: Address;
    userAddress: Address;
  };
}

export interface UserDecryptRequest extends BaseRequest {
  type: "USER_DECRYPT";
  payload: {
    handles: string[];
    contractAddress: Address;
    signedContractAddresses: Address[];
    privateKey: string;
    publicKey: string;
    signature: string;
    signerAddress: Address;
    startTimestamp: number;
    durationDays: number;
  };
}

export interface PublicDecryptRequest extends BaseRequest {
  type: "PUBLIC_DECRYPT";
  payload: {
    handles: string[];
  };
}

export interface GenerateKeypairRequest extends BaseRequest {
  type: "GENERATE_KEYPAIR";
  payload: Record<string, never>;
}

export interface CreateEIP712Request extends BaseRequest {
  type: "CREATE_EIP712";
  payload: {
    publicKey: string;
    contractAddresses: Address[];
    startTimestamp: number;
    durationDays: number;
  };
}

export interface CreateDelegatedEIP712Request extends BaseRequest {
  type: "CREATE_DELEGATED_EIP712";
  payload: {
    publicKey: string;
    contractAddresses: Address[];
    delegatorAddress: string;
    startTimestamp: number;
    durationDays: number;
  };
}

export interface DelegatedUserDecryptRequest extends BaseRequest {
  type: "DELEGATED_USER_DECRYPT";
  payload: {
    handles: string[];
    contractAddress: Address;
    signedContractAddresses: Address[];
    privateKey: string;
    publicKey: string;
    signature: string;
    delegatorAddress: Address;
    delegateAddress: Address;
    startTimestamp: number;
    durationDays: number;
  };
}

export interface RequestZKProofVerificationRequest extends BaseRequest {
  type: "REQUEST_ZK_PROOF_VERIFICATION";
  payload: {
    zkProof: ZKProofLike;
  };
}

export interface GetPublicKeyRequest extends BaseRequest {
  type: "GET_PUBLIC_KEY";
  payload: Record<string, never>;
}

export interface GetPublicParamsRequest extends BaseRequest {
  type: "GET_PUBLIC_PARAMS";
  payload: {
    bits: number;
  };
}

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

export type EncryptPayload = EncryptRequest["payload"];
export type UserDecryptPayload = UserDecryptRequest["payload"];
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

export interface EncryptResponseData {
  handles: Uint8Array[];
  inputProof: Uint8Array;
}

export interface UserDecryptResponseData {
  clearValues: Record<string, DecryptedValue>;
}

export interface PublicDecryptResponseData {
  clearValues: Record<string, bigint>;
  abiEncodedClearValues: string;
  decryptionProof: Address;
}

export interface GenerateKeypairResponseData {
  publicKey: string;
  privateKey: string;
}

export interface CreateEIP712ResponseData {
  domain: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: Address;
  };
  types: {
    UserDecryptRequestVerification: Array<{
      name: string;
      type: string;
    }>;
  };
  message: {
    publicKey: string;
    contractAddresses: string[];
    startTimestamp: bigint;
    durationDays: bigint;
    extraData: string;
  };
}

export type CreateDelegatedEIP712ResponseData = KmsDelegatedUserDecryptEIP712Type;

export interface DelegatedUserDecryptResponseData {
  clearValues: Record<string, DecryptedValue>;
}

export type RequestZKProofVerificationResponseData = InputProofBytesType;

export interface GetPublicKeyResponseData {
  result: { publicKeyId: string; publicKey: Uint8Array } | null;
}

export interface GetPublicParamsResponseData {
  result: { publicParams: Uint8Array; publicParamsId: string } | null;
}
