import type {
  Hex,
  FhevmInstanceConfig,
  InputProofBytesType,
  KmsDelegatedUserDecryptEIP712Type,
  ZKProofLike,
} from "../relayer/relayer-sdk.types";

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

interface BaseRequest {
  id: string;
  type: WorkerRequestType;
}

export interface InitRequest extends BaseRequest {
  type: "INIT";
  payload: {
    cdnUrl: string;
    fhevmConfig: FhevmInstanceConfig;
    csrfToken: string;
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
    values: bigint[];
    contractAddress: Hex;
    userAddress: Hex;
  };
}

export interface UserDecryptRequest extends BaseRequest {
  type: "USER_DECRYPT";
  payload: {
    handles: string[];
    contractAddress: Hex;
    signedContractAddresses: Hex[];
    privateKey: string;
    publicKey: string;
    signature: string;
    signerAddress: Hex;
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
    contractAddresses: Hex[];
    startTimestamp: number;
    durationDays: number;
  };
}

export interface CreateDelegatedEIP712Request extends BaseRequest {
  type: "CREATE_DELEGATED_EIP712";
  payload: {
    publicKey: string;
    contractAddresses: Hex[];
    delegatorAddress: string;
    startTimestamp: number;
    durationDays: number;
  };
}

export interface DelegatedUserDecryptRequest extends BaseRequest {
  type: "DELEGATED_USER_DECRYPT";
  payload: {
    handles: string[];
    contractAddress: Hex;
    signedContractAddresses: Hex[];
    privateKey: string;
    publicKey: string;
    signature: string;
    delegatorAddress: Hex;
    delegateAddress: Hex;
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
  clearValues: Record<string, bigint>;
}

export interface PublicDecryptResponseData {
  clearValues: Record<string, bigint>;
  abiEncodedClearValues: string;
  decryptionProof: Hex;
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
    verifyingContract: Hex;
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
  clearValues: Record<string, bigint>;
}

export type RequestZKProofVerificationResponseData = InputProofBytesType;

export interface GetPublicKeyResponseData {
  result: { publicKeyId: string; publicKey: Uint8Array } | null;
}

export interface GetPublicParamsResponseData {
  result: { publicParams: Uint8Array; publicParamsId: string } | null;
}
