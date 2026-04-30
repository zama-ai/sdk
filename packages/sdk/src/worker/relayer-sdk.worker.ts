/**
 * Web Worker for FHE operations.
 * Uses @fhevm/sdk for encryption/decryption off the main thread.
 * This worker is bundled by the host app's bundler which resolves imports at build time.
 */

import {
  createKmsDelegatedUserDecryptEip712,
  createKmsUserDecryptEip712,
} from "@fhevm/sdk/actions/chain";
import { createFhevmClient, setFhevmRuntimeConfig } from "@fhevm/sdk/viem";
import { createPublicClient, http } from "viem";
import type { FheChain } from "../chains/types";
import type {
  CreateDelegatedEIP712Request,
  CreateEIP712Request,
  DelegatedUserDecryptRequest,
  DelegatedUserDecryptResponseData,
  EncryptRequest,
  EncryptResponseData,
  ErrorResponse,
  FhevmInstanceConfig,
  GenerateKeypairRequest,
  GenerateKeypairResponseData,
  GetPublicKeyRequest,
  GetPublicKeyResponseData,
  GetPublicParamsRequest,
  GetPublicParamsResponseData,
  InitRequest,
  PublicDecryptRequest,
  PublicDecryptResponseData,
  RequestZKProofVerificationRequest,
  SuccessResponse,
  UpdateCsrfRequest,
  UserDecryptRequest,
  UserDecryptResponseData,
  WorkerRequest,
} from "./worker.types";

// ── Multi-chain client management ─────────────────────────────

type FhevmClientInstance = Awaited<ReturnType<typeof createFhevmClient>>;

const clients = new Map<number, FhevmClientInstance>();
const pending = new Map<number, Promise<FhevmClientInstance>>();
const configs = new Map<number, FheChain>();

/**
 * Convert an FhevmInstanceConfig to the chain object expected by @fhevm/sdk.
 */
function configToChain(config: FhevmInstanceConfig) {
  type Addr = `0x${string}`;
  return {
    id: config.chainId,
    fhevm: {
      contracts: {
        acl: { address: config.aclContractAddress as Addr },
        inputVerifier: {
          address: (config.inputVerifierContractAddress ?? config.aclContractAddress) as Addr,
        },
        kmsVerifier: { address: config.kmsContractAddress as Addr },
      },
      relayerUrl: config.relayerUrl,
      gateway: {
        id: config.gatewayChainId,
        contracts: {
          decryption: {
            address: config.verifyingContractAddressDecryption as Addr,
          },
          inputVerification: {
            address: (config.verifyingContractAddressInputVerification ??
              config.verifyingContractAddressDecryption) as Addr,
          },
        },
      },
    },
  };
}

/** Convert an FheChain to the FhevmInstanceConfig shape. */
function toInstanceConfig(chain: FheChain): FhevmInstanceConfig {
  const { network, ...rest } = chain;
  return {
    ...rest,
    chainId: chain.id,
    network: typeof network === "string" ? network : undefined,
  };
}

/**
 * Get or lazily create an FhevmClient for the given chain.
 */
async function getClient(chainId: number): Promise<FhevmClientInstance> {
  const existing = clients.get(chainId);
  if (existing) {
    return existing;
  }

  const inflight = pending.get(chainId);
  if (inflight) {
    return inflight;
  }

  const config = configs.get(chainId);
  if (!config) {
    throw new Error(
      `No config for chain ${chainId}. Available: [${[...configs.keys()].join(", ")}]`,
    );
  }

  const promise = Promise.try(async () => {
    const fhevmConfig = toInstanceConfig(config);
    const chain = configToChain(fhevmConfig);
    const providerUrl = fhevmConfig.networkUrl ?? fhevmConfig.relayerUrl;
    const publicClient = createPublicClient({ transport: http(providerUrl) });
    const client = createFhevmClient({ chain, publicClient });
    await client.ready;
    return client;
  })
    .then((client) => {
      clients.set(chainId, client);
      pending.delete(chainId);
      return client;
    })
    .catch((err) => {
      pending.delete(chainId);
      throw err;
    });

  pending.set(chainId, promise);
  return promise;
}

// ============================================================================
// CSRF fetch interceptor
// ============================================================================

// ── Fetch interception for relayer CSRF ─────────────────────────
// These globals are per-worker-instance. Do NOT convert to SharedWorker
// without rearchitecting CSRF token management to be per-connection.
const relayerUrls = new Set<string>();
let csrfTokenBase = "";

// CSRF header name (must match server expectation)
const CSRF_HEADER_NAME = "x-csrf-token";

// Mutating HTTP methods that require CSRF token (js-set-map-lookups)
const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// Store original fetch for use after interception
const originalFetch = fetch;

/**
 * Register relayer URLs from chain configs for fetch interception.
 */
function registerRelayerUrls(chainConfigs: FheChain[]): void {
  for (const c of chainConfigs) {
    if (c.relayerUrl) {
      relayerUrls.add(c.relayerUrl);
    }
  }
}

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
    const matchesRelayer =
      relayerUrls.size > 0 && [...relayerUrls].some((base) => url.startsWith(base));

    if (matchesRelayer) {
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

// ============================================================================
// Messaging helpers
// ============================================================================

declare const self: Worker;

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

// ============================================================================
// Conversion helpers
// ============================================================================

/**
 * Convert a hex string (0x-prefixed) to a Uint8Array.
 */
function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    bytes[i / 2] = parseInt(cleaned.substring(i, i + 2), 16);
  }
  return bytes;
}

// ============================================================================
// Handlers
// ============================================================================

/**
 * Handle INIT request - configure runtime and register chain configs (instances are lazy).
 */
async function handleInit(request: InitRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    if (payload.env !== "web") {
      throw new Error(`Web worker received unexpected env: ${payload.env}`);
    }

    const { csrfToken, thread } = payload;

    csrfTokenBase = csrfToken;
    setupFetchInterceptor();

    // Configure WASM runtime (thread count)
    setFhevmRuntimeConfig(
      thread !== null && thread !== undefined ? { numberOfThreads: thread } : {},
    );

    // Register chain configs for lazy init
    registerRelayerUrls(payload.chains);
    for (const chain of payload.chains) {
      configs.set(chain.id, chain);
    }

    sendSuccess(id, type, { initialized: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] Init error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle ENCRYPT request.
 */
async function handleEncrypt(request: EncryptRequest): Promise<void> {
  const { id, type, payload } = request;
  const { values, contractAddress, userAddress } = payload;

  try {
    const client = await getClient(payload.chainId);

    const encrypted = await client.encryptValues({
      values,
      contractAddress,
      userAddress,
    });

    // Convert branded hex strings to Uint8Array for structured-clone transfer.
    const handles = encrypted.encryptedValues.map(hexToBytes);
    const inputProof = hexToBytes(encrypted.inputProof);

    const response: EncryptResponseData = {
      handles,
      inputProof,
    };

    // Transfer ArrayBuffers for zero-copy performance
    const transferList: Transferable[] = [inputProof.buffer, ...handles.map((h) => h.buffer)];

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
    const client = await getClient(payload.chainId);

    // 1. Parse transport keypair
    const transportKeypair = await client.parseTransportKeypair(payload);

    // 2. Parse signed decryption permit
    const signedPermit = await client.parseSignedDecryptionPermit({
      serializedPermit: {
        signerAddress: payload.signerAddress,
        signature: payload.signature,
        eip712: payload.eip712,
      },
      transportKeypair,
    });

    // 3. Decrypt (permit is a union — the SDK dispatches based on isDelegated)
    const decryptedValues = await client.decryptValues({
      transportKeypair,
      signedPermit,
      encryptedValues: payload.handles,
      contractAddress: payload.contractAddress,
    });

    // 4. Map results: clearValues is TypedValue[] -> Record<Handle, value>
    const clearValues: UserDecryptResponseData["clearValues"] = {};
    for (let i = 0; i < payload.handles.length; i++) {
      const handle = payload.handles[i];
      const cv = decryptedValues[i];
      if (handle !== undefined && cv !== undefined) {
        clearValues[handle] = cv.value;
      }
    }

    const response: UserDecryptResponseData = {
      clearValues,
    };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = extractHttpStatus(error);
    console.error("[Worker] UserDecrypt error:", message);
    sendError(id, type, message, statusCode);
  }
}

/**
 * Handle DELEGATED_USER_DECRYPT request.
 */
async function handleDelegatedUserDecrypt(request: DelegatedUserDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    const client = await getClient(payload.chainId);

    // 1. Parse transport keypair
    const transportKeypair = await client.parseTransportKeypair({
      privateKey: payload.privateKey,
      publicKey: payload.publicKey,
    });

    // 2. Parse signed decryption permit (delegated)
    const signedPermit = await client.parseSignedDecryptionPermit({
      serializedPermit: {
        signerAddress: payload.delegatorAddress,
        signature: payload.signature,
        eip712: payload.eip712,
      },
      transportKeypair,
    });

    // 3. Decrypt (permit is a union — the SDK dispatches based on isDelegated)
    const decryptedValues = await client.decryptValues({
      transportKeypair,
      signedPermit,
      encryptedValues: payload.handles,
      contractAddress: payload.contractAddress,
    });

    // 4. Map results
    const clearValues: DelegatedUserDecryptResponseData["clearValues"] = {};
    for (let i = 0; i < payload.handles.length; i++) {
      const handle = payload.handles[i];
      const cv = decryptedValues[i];
      if (handle !== undefined && cv !== undefined) {
        clearValues[handle] = cv.value;
      }
    }

    const response: DelegatedUserDecryptResponseData = {
      clearValues,
    };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = extractHttpStatus(error);
    console.error("[Worker] DelegatedUserDecrypt error:", message);
    sendError(id, type, message, statusCode);
  }
}

/**
 * Handle PUBLIC_DECRYPT request.
 */
async function handlePublicDecrypt(request: PublicDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    const client = await getClient(payload.chainId);

    const result = await client.readPublicValuesWithSignatures({
      encryptedValues: payload.handles,
    });

    // Map clearValues from TypedValue[] to Record<Handle, ClearValue>
    const clearValues: PublicDecryptResponseData["clearValues"] = {};
    for (let i = 0; i < payload.handles.length; i++) {
      const handle = payload.handles[i];
      const cv = result.clearValues[i];
      if (handle !== undefined && cv !== undefined) {
        clearValues[handle] = cv.value;
      }
    }

    const response: PublicDecryptResponseData = {
      clearValues,
      abiEncodedClearValues: result.checkSignaturesArgs.abiEncodedCleartexts,
      decryptionProof: result.checkSignaturesArgs.decryptionProof,
    };

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
async function handleGenerateKeypair(request: GenerateKeypairRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    const client = await getClient(payload.chainId);

    const keypair = await client.generateTransportKeypair();
    const serialized = client.serializeTransportKeypair({
      transportKeypair: keypair,
    });

    const response: GenerateKeypairResponseData = {
      publicKey: serialized.publicKey,
      privateKey: serialized.privateKey,
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
async function handleCreateEIP712(request: CreateEIP712Request): Promise<void> {
  const { id, type, payload } = request;

  try {
    const client = await getClient(payload.chainId);

    const response = createKmsUserDecryptEip712(client, {
      publicKey: payload.publicKey,
      contractAddresses: payload.contractAddresses,
      startTimestamp: payload.startTimestamp,
      durationDays: payload.durationDays,
      extraData: "0x",
    });

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
async function handleCreateDelegatedEIP712(request: CreateDelegatedEIP712Request): Promise<void> {
  const { id, type, payload } = request;

  try {
    const client = await getClient(payload.chainId);

    const response = createKmsDelegatedUserDecryptEip712(client, {
      publicKey: payload.publicKey,
      contractAddresses: payload.contractAddresses,
      delegatorAddress: payload.delegatorAddress,
      startTimestamp: payload.startTimestamp,
      durationDays: payload.durationDays,
      extraData: "0x",
    });

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] CreateDelegatedEIP712 error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle REQUEST_ZK_PROOF_VERIFICATION request.
 * ZK proof verification is built into encrypt() in @fhevm/sdk — no separate call needed.
 */
async function handleRequestZKProofVerification(
  request: RequestZKProofVerificationRequest,
): Promise<void> {
  const { id, type } = request;
  sendError(
    id,
    type,
    "ZK proof verification is built into encrypt() in @fhevm/sdk. Use ENCRYPT instead.",
  );
}

/**
 * Handle GET_PUBLIC_KEY request.
 */
async function handleGetPublicKey(request: GetPublicKeyRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    const client = await getClient(payload.chainId);

    const keyData = await client.fetchFheEncryptionKeyBytes();

    const response: GetPublicKeyResponseData = {
      result: keyData
        ? {
            publicKeyId: keyData.publicKeyBytes.id,
            publicKey: keyData.publicKeyBytes.bytes,
          }
        : null,
    };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] GetPublicKey error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle GET_PUBLIC_PARAMS request.
 * Public params are no longer exposed by @fhevm/sdk.
 */
function handleGetPublicParams(request: GetPublicParamsRequest): void {
  const { id, type } = request;
  const response: GetPublicParamsResponseData = { result: null };
  sendSuccess(id, type, response);
}

/**
 * Handle UPDATE_CSRF request - update the stored CSRF token.
 */
function handleUpdateCsrf(request: UpdateCsrfRequest): void {
  const { id, type, payload } = request;
  csrfTokenBase = payload.csrfToken;
  sendSuccess(id, type, { updated: true });
}

// ============================================================================
// Main message handler
// ============================================================================

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
        await handleGenerateKeypair(request);
        break;
      case "CREATE_EIP712":
        await handleCreateEIP712(request);
        break;
      case "CREATE_DELEGATED_EIP712":
        await handleCreateDelegatedEIP712(request);
        break;
      case "DELEGATED_USER_DECRYPT":
        await handleDelegatedUserDecrypt(request);
        break;
      case "REQUEST_ZK_PROOF_VERIFICATION":
        await handleRequestZKProofVerification(request);
        break;
      case "GET_PUBLIC_KEY":
        await handleGetPublicKey(request);
        break;
      case "GET_PUBLIC_PARAMS":
        handleGetPublicParams(request);
        break;
      default:
        console.error("[Worker] Unknown request type:", (request as WorkerRequest).type);
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
