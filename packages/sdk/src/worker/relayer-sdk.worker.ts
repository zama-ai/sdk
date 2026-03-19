/**
 * Web Worker for RelayerSDK FHE operations.
 * Handles CPU-intensive WASM operations off the main thread.
 */

import type { EncryptInput, RelayerSDKGlobal } from "../relayer/relayer-sdk.types";
import type { FhevmInstance, FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/bundle";
import { prefixHex, unprefixHex } from "../utils";
import type {
  CreateDelegatedEIP712Request,
  CreateDelegatedEIP712ResponseData,
  CreateEIP712Request,
  CreateEIP712ResponseData,
  DelegatedUserDecryptRequest,
  DelegatedUserDecryptResponseData,
  EncryptRequest,
  EncryptResponseData,
  ErrorResponse,
  GenerateKeypairRequest,
  GenerateKeypairResponseData,
  GetPublicKeyRequest,
  GetPublicKeyResponseData,
  GetPublicParamsRequest,
  GetPublicParamsResponseData,
  InitRequest,
  InitResponseData,
  PublicDecryptRequest,
  PublicDecryptResponseData,
  RequestZKProofVerificationRequest,
  SuccessResponse,
  UpdateCsrfRequest,
  UpdateCsrfResponseData,
  UserDecryptRequest,
  UserDecryptResponseData,
  WorkerRequest,
} from "./worker.types";

// Global SDK instance and config
let sdkInstance: FhevmInstance | null = null;
let sdkGlobal: RelayerSDKGlobal | null = null;

function unreachableFheType(_: never): never {
  throw new Error("Unsupported FHE type");
}

// Store relayer URL and CSRF token for fetch interception.
// These globals are per-worker-instance. Do NOT convert to SharedWorker
// without rearchitecting CSRF token management to be per-connection.
let relayerUrlBase = "";
let csrfTokenBase = "";

// CSRF header name (must match server expectation)
const CSRF_HEADER_NAME = "x-csrf-token";

// Mutating HTTP methods that require CSRF token (js-set-map-lookups)
const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// Web Worker global scope with SDK.
// The relayer-sdk UMD bundle is loaded via `importScripts` during init,
// which sets `self.relayerSDK`.
interface WorkerGlobalScopeWithSDK extends Worker {
  relayerSDK?: RelayerSDKGlobal;
  location: Location;
  importScripts: (...urls: string[]) => void;
}

declare const self: WorkerGlobalScopeWithSDK;

/**
 * Send a success response back to the main thread.
 * Optionally transfers ArrayBuffers for zero-copy performance.
 */
function sendSuccess<T>(
  id: string,
  type: WorkerRequest["type"],
  data: T,
  transfer?: Transferable[],
): void {
  const response: SuccessResponse<T> = {
    id,
    type,
    success: true,
    data,
  };
  return transfer ? self.postMessage(response, transfer) : self.postMessage(response);
}

/**
 * Send an error response back to the main thread.
 */
function sendError(
  id: string,
  type: WorkerRequest["type"],
  error: string,
  statusCode?: number,
): void {
  const response: ErrorResponse = {
    id,
    type,
    success: false,
    error,
  };
  if (statusCode !== undefined) {
    response.statusCode = statusCode;
  }
  self.postMessage(response);
}

// Store original fetch before we patch it with the CSRF interceptor.
const originalFetch = fetch;

/**
 * Set up fetch interceptor to add credentials and CSRF token for relayer requests.
 * Workers don't automatically include cookies, so we intercept fetch calls
 * targeting our relayer proxy to inject credentials and CSRF headers.
 */
function setupFetchInterceptor(): void {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method?.toUpperCase() ?? "GET";

    // Only intercept requests to our relayer proxy
    if (relayerUrlBase && url.startsWith(relayerUrlBase)) {
      const headers = new Headers(init?.headers);

      // Add CSRF token for mutating requests
      if (MUTATING_METHODS.has(method) && csrfTokenBase) {
        headers.set(CSRF_HEADER_NAME, csrfTokenBase);
      }

      return originalFetch(input, {
        ...init,
        headers,
        credentials: "include",
      });
    }

    // Pass through other requests unchanged
    return originalFetch(input, init);
  };
}

/**
 * Handle INIT request — load the relayer-sdk UMD bundle, initialize WASM,
 * and create the SDK instance.
 */
async function handleInit(request: InitRequest): Promise<void> {
  const { id, type, payload } = request;
  const { sdkUrl, fhevmConfig, csrfToken, thread } = payload;

  try {
    // Extract relayerUrl from config for fetch interception
    relayerUrlBase = fhevmConfig.relayerUrl ?? "";
    csrfTokenBase = csrfToken;

    // Set up fetch interceptor before loading SDK (WASM init may fetch)
    setupFetchInterceptor();

    // Load the relayer-sdk UMD bundle from the co-located asset.
    // This sets `self.relayerSDK` on the worker global scope.
    //
    // Security note: `sdkUrl` is always constructed internally by
    // worker.client.ts via `new URL(RELAYER_SDK_UMD_FILENAME, import.meta.url)`.
    // It is never user-supplied. The postMessage channel is only accessible
    // from the same origin that created this dedicated worker, so an attacker
    // would already need same-origin code execution to tamper with it.
    // CodeQL flags this as "client-side URL redirect" — this is a false positive.
    try {
      self.importScripts(sdkUrl); // CodeQL: sdkUrl is not user-controlled, see note above
    } catch (importError) {
      throw new Error(`Failed to load relayer-sdk UMD bundle via importScripts("${sdkUrl}")`, {
        cause: importError,
      });
    }

    if (!self.relayerSDK) {
      throw new Error(`relayerSDK not defined after loading "${sdkUrl}"`);
    }

    sdkGlobal = self.relayerSDK;

    // Initialize WASM (optionally with a rayon thread pool for parallel FHE ops)
    await sdkGlobal.initSDK(thread !== null && thread !== undefined ? { thread } : undefined);

    // Create SDK instance with caller-provided config
    const config: FhevmInstanceConfig = {
      ...fhevmConfig,
      batchRpcCalls: false,
    };

    sdkInstance = await sdkGlobal.createInstance(config);

    sendSuccess<InitResponseData>(id, type, { initialized: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] Init error:", message);
    sendError(id, type, message);
  }
}

/** Coerce a boolean to bigint for numeric FHE types. */
function toBigInt(value: bigint | boolean): bigint {
  return typeof value === "boolean" ? (value ? 1n : 0n) : value;
}

/**
 * Add a single typed value to the encrypted input builder.
 */
function addTypedValue(
  input: ReturnType<FhevmInstance["createEncryptedInput"]>,
  entry: EncryptInput,
): void {
  const { value, type: fheType } = entry;
  switch (fheType) {
    case "ebool":
      input.addBool(typeof value === "boolean" ? value : value !== 0n);
      break;
    case "euint8":
      input.add8(toBigInt(value));
      break;
    case "euint16":
      input.add16(toBigInt(value));
      break;
    case "euint32":
      input.add32(toBigInt(value));
      break;
    case "euint64":
      input.add64(toBigInt(value));
      break;
    case "euint128":
      input.add128(toBigInt(value));
      break;
    case "euint256":
      input.add256(toBigInt(value));
      break;
    case "eaddress":
      input.addAddress(String(value));
      break;
    default:
      unreachableFheType(fheType);
  }
}

/**
 * Handle ENCRYPT request.
 */
async function handleEncrypt(request: EncryptRequest): Promise<void> {
  const { id, type, payload } = request;
  const { values, contractAddress, userAddress } = payload;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call INIT first.");
    }

    const input = sdkInstance.createEncryptedInput(contractAddress, userAddress);

    for (const entry of values) {
      addTypedValue(input, entry);
    }

    const encrypted = await input.encrypt();

    const response: EncryptResponseData = {
      handles: encrypted.handles,
      inputProof: encrypted.inputProof,
    };

    // Transfer ArrayBuffers for zero-copy performance
    const transferList: Transferable[] = [
      encrypted.inputProof.buffer,
      ...encrypted.handles.map((h) => h.buffer),
    ];

    sendSuccess(id, type, response, transferList);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] Encrypt error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle USER_DECRYPT request.
 */
async function handleUserDecrypt(request: UserDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call INIT first.");
    }

    const handleContractPairs = payload.handles.map((handle) => ({
      handle,
      contractAddress: payload.contractAddress,
    }));

    const result = await sdkInstance.userDecrypt(
      handleContractPairs,
      unprefixHex(payload.privateKey),
      unprefixHex(payload.publicKey),
      payload.signature,
      payload.signedContractAddresses,
      payload.signerAddress,
      payload.startTimestamp,
      payload.durationDays,
    );

    const response: UserDecryptResponseData = { clearValues: result };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = extractHttpStatus(error);
    console.error("[Worker] UserDecrypt error:", message);
    sendError(id, type, message, statusCode);
  }
}

/**
 * Extract an HTTP status code from an error, if present.
 * Relayer SDK errors may carry a `status` or `statusCode` property.
 */
function extractHttpStatus(error: unknown): number | undefined {
  if (error === null || error === undefined || typeof error !== "object") {
    return undefined;
  }
  const e = error as Record<string, unknown>;
  if (typeof e.statusCode === "number") {
    return e.statusCode;
  }
  if (typeof e.status === "number") {
    return e.status;
  }
  // Check nested cause
  if (e.cause !== null && e.cause !== undefined && typeof e.cause === "object") {
    const cause = e.cause as Record<string, unknown>;
    if (typeof cause.statusCode === "number") {
      return cause.statusCode;
    }
    if (typeof cause.status === "number") {
      return cause.status;
    }
  }
  return undefined;
}

/**
 * Handle PUBLIC_DECRYPT request.
 */
async function handlePublicDecrypt(request: PublicDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call INIT first.");
    }

    const result = await sdkInstance.publicDecrypt(payload.handles);

    const response: PublicDecryptResponseData = { ...result };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] PublicDecrypt error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle GENERATE_KEYPAIR request.
 */
function handleGenerateKeypair(request: GenerateKeypairRequest): void {
  const { id, type } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call INIT first.");
    }

    const keypair = sdkInstance.generateKeypair();

    const response: GenerateKeypairResponseData = {
      publicKey: prefixHex(keypair.publicKey),
      privateKey: prefixHex(keypair.privateKey),
    };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] GenerateKeypair error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle CREATE_EIP712 request.
 */
function handleCreateEIP712(request: CreateEIP712Request): void {
  const { id, type, payload } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call INIT first.");
    }

    const eip712 = sdkInstance.createEIP712(
      unprefixHex(payload.publicKey),
      payload.contractAddresses,
      payload.startTimestamp,
      payload.durationDays,
    );

    const response: CreateEIP712ResponseData = {
      domain: {
        name: eip712.domain.name,
        version: eip712.domain.version,
        chainId: Number(eip712.domain.chainId),
        verifyingContract: eip712.domain.verifyingContract,
      },
      types: {
        UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification.map(
          (field) => ({
            name: field.name,
            type: field.type,
          }),
        ),
      },
      message: {
        publicKey: prefixHex(eip712.message.publicKey),
        contractAddresses: [...eip712.message.contractAddresses],
        startTimestamp: BigInt(eip712.message.startTimestamp),
        durationDays: BigInt(eip712.message.durationDays),
        extraData: prefixHex(eip712.message.extraData),
      },
    };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] CreateEIP712 error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle CREATE_DELEGATED_EIP712 request.
 */
function handleCreateDelegatedEIP712(request: CreateDelegatedEIP712Request): void {
  const { id, type, payload } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call INIT first.");
    }

    const result = sdkInstance.createDelegatedUserDecryptEIP712(
      unprefixHex(payload.publicKey),
      payload.contractAddresses,
      payload.delegatorAddress,
      payload.startTimestamp,
      payload.durationDays,
    );

    sendSuccess<CreateDelegatedEIP712ResponseData>(id, type, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] CreateDelegatedEIP712 error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle DELEGATED_USER_DECRYPT request.
 */
async function handleDelegatedUserDecrypt(request: DelegatedUserDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call INIT first.");
    }

    const handleContractPairs = payload.handles.map((handle) => ({
      handle,
      contractAddress: payload.contractAddress,
    }));

    const result = await sdkInstance.delegatedUserDecrypt(
      handleContractPairs,
      unprefixHex(payload.privateKey),
      unprefixHex(payload.publicKey),
      payload.signature,
      payload.signedContractAddresses,
      payload.delegatorAddress,
      payload.delegateAddress,
      payload.startTimestamp,
      payload.durationDays,
    );

    const response: DelegatedUserDecryptResponseData = { clearValues: result };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = extractHttpStatus(error);
    console.error("[Worker] DelegatedUserDecrypt error:", message);
    sendError(id, type, message, statusCode);
  }
}

/**
 * Handle REQUEST_ZK_PROOF_VERIFICATION request.
 */
async function handleRequestZKProofVerification(
  request: RequestZKProofVerificationRequest,
): Promise<void> {
  const { id, type, payload } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call INIT first.");
    }

    const result = await sdkInstance.requestZKProofVerification(payload.zkProof);

    // Transfer ArrayBuffers for zero-copy performance
    const transferList: Transferable[] = [
      result.inputProof.buffer,
      ...result.handles.map((h) => h.buffer),
    ];

    sendSuccess(id, type, result, transferList);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] RequestZKProofVerification error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle GET_PUBLIC_KEY request.
 */
function handleGetPublicKey(request: GetPublicKeyRequest): void {
  const { id, type } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call INIT first.");
    }

    const result = sdkInstance.getPublicKey();

    const response: GetPublicKeyResponseData = { result };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] GetPublicKey error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle GET_PUBLIC_PARAMS request.
 */
function handleGetPublicParams(request: GetPublicParamsRequest): void {
  const { id, type, payload } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call INIT first.");
    }

    const result = sdkInstance.getPublicParams(
      // oxlint-disable-next-line typescript-eslint/consistent-type-imports
      payload.bits as keyof import("@zama-fhe/relayer-sdk/bundle").PublicParams<Uint8Array>,
    );

    const response: GetPublicParamsResponseData = { result };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] GetPublicParams error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle UPDATE_CSRF request - update the stored CSRF token.
 */
function handleUpdateCsrf(request: UpdateCsrfRequest): void {
  const { id, type, payload } = request;
  csrfTokenBase = payload.csrfToken;
  sendSuccess<UpdateCsrfResponseData>(id, type, { updated: true });
}

/**
 * Main message handler.
 */
self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    switch (request.type) {
      case "INIT":
        await handleInit(request);
        break;
      case "UPDATE_CSRF":
        handleUpdateCsrf(request);
        break;
      case "ENCRYPT":
        await handleEncrypt(request);
        break;
      case "USER_DECRYPT":
        await handleUserDecrypt(request);
        break;
      case "PUBLIC_DECRYPT":
        await handlePublicDecrypt(request);
        break;
      case "GENERATE_KEYPAIR":
        handleGenerateKeypair(request);
        break;
      case "CREATE_EIP712":
        handleCreateEIP712(request);
        break;
      case "CREATE_DELEGATED_EIP712":
        handleCreateDelegatedEIP712(request);
        break;
      case "DELEGATED_USER_DECRYPT":
        await handleDelegatedUserDecrypt(request);
        break;
      case "REQUEST_ZK_PROOF_VERIFICATION":
        await handleRequestZKProofVerification(request);
        break;
      case "GET_PUBLIC_KEY":
        handleGetPublicKey(request);
        break;
      case "GET_PUBLIC_PARAMS":
        handleGetPublicParams(request);
        break;
      default: {
        const unknownType = (request as WorkerRequest).type;
        console.error("[Worker] Unknown request type:", unknownType);
        sendError(
          request?.id ?? "unknown",
          unknownType ?? ("UNKNOWN" as WorkerRequest["type"]),
          `Unknown worker request type: ${unknownType}`,
        );
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendError(
      request?.id ?? "unknown",
      request?.type ?? ("UNKNOWN" as WorkerRequest["type"]),
      message,
    );
  }
};
