/**
 * Web Worker for RelayerSDK FHE operations.
 * Handles CPU-intensive WASM operations off the main thread.
 */

import type { EncryptInput, RelayerSDKGlobal } from "../relayer/relayer-sdk.types";
import type { FhevmInstance, FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/bundle";
import { prefixHex, unprefixHex } from "../utils";
import { getBrowserExtensionRuntime } from "./browser-extension";
import type {
  AddChainRequest,
  CreateDelegatedEIP712Request,
  CreateEIP712Request,
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
  PublicDecryptRequest,
  PublicDecryptResponseData,
  RemoveChainRequest,
  RequestZKProofVerificationRequest,
  SuccessResponse,
  UpdateCsrfRequest,
  UserDecryptRequest,
  UserDecryptResponseData,
  WorkerRequest,
} from "./worker.types";

// ── Multi-chain instance management ─────────────────────────────
const instances = new Map<number, FhevmInstance>();
const pending = new Map<number, Promise<FhevmInstance>>();
const configs = new Map<number, FhevmInstanceConfig>();

let sdkGlobal: RelayerSDKGlobal | null = null;

/**
 * Get or lazily create an FhevmInstance for the given chain.
 */
async function getInstance(chainId: number): Promise<FhevmInstance> {
  const existing = instances.get(chainId);
  if (existing) {return existing;}

  const inflight = pending.get(chainId);
  if (inflight) {return inflight;}

  const config = configs.get(chainId);
  if (!config) {
    throw new Error(
      `No config for chain ${chainId}. Available: [${[...configs.keys()].join(", ")}]`,
    );
  }

  if (!sdkGlobal) {
    throw new Error("Relayer SDK is not initialized. Call INIT first.");
  }

  const promise = sdkGlobal
    .createInstance({ ...config, batchRpcCalls: false })
    .then((instance) => {
      instances.set(chainId, instance);
      pending.delete(chainId);
      return instance;
    })
    .catch((err) => {
      pending.delete(chainId);
      throw err;
    });

  pending.set(chainId, promise);
  return promise;
}

function unreachableFheType(_: never): never {
  throw new Error("Unsupported FHE type");
}

// ── Fetch interception for relayer CSRF ─────────────────────────
// These globals are per-worker-instance. Do NOT convert to SharedWorker
// without rearchitecting CSRF token management to be per-connection.
const relayerUrls = new Set<string>();
let csrfTokenBase = "";

// CSRF header name (must match server expectation)
const CSRF_HEADER_NAME = "x-csrf-token";

// Mutating HTTP methods that require CSRF token (js-set-map-lookups)
const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

/**
 * Register relayer URLs from chain configs for fetch interception.
 */
function registerRelayerUrls(chainConfigs: FhevmInstanceConfig[]): void {
  for (const c of chainConfigs) {
    if (c.relayerUrl) {relayerUrls.add(c.relayerUrl);}
  }
}

// Web Worker global scope with SDK
interface WorkerGlobalScopeWithSDK extends Worker {
  relayerSDK?: RelayerSDKGlobal;
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

// Store original fetch for use in SDK loading
const originalFetch = fetch;

// ── CDN URL validation ───────────────────────────────────────

/** Allowed CDN hostnames for loading the relayer SDK script. */
const ALLOWED_CDN_HOSTS = new Set<string>(["cdn.zama.org"]);

/**
 * Validate the CDN URL supplied by the caller.
 * Ensures only HTTPS URLs from approved hosts are used when loading
 * SDK code into the worker.
 */
function validateCdnUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("Invalid CDN URL");
  }

  if (url.protocol !== "https:") {
    throw new Error("CDN URL must use https");
  }

  if (!ALLOWED_CDN_HOSTS.has(url.hostname)) {
    throw new Error(`CDN URL host is not allowed: ${url.hostname}`);
  }

  return url.toString();
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

/**
 * Verify a fetched script's SHA-384 hash matches the expected integrity value.
 */
async function verifyIntegrity(content: string, expectedHash: string): Promise<void> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest("SHA-384", encoder.encode(content));
  const hashHex = [...new Uint8Array(hashBuffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (hashHex !== expectedHash) {
    throw new Error(`CDN integrity check failed: expected SHA-384 ${expectedHash}, got ${hashHex}`);
  }
}

/**
 * Load SDK script from CDN.
 * Uses two strategies depending on the environment:
 * - **Web apps (default):** fetch + blob URL + importScripts. Avoids MIME-type
 *   rejections (some CDNs serve .cjs as `application/node`) and CSP
 *   `unsafe-eval` violations.
 * - **Browser extensions (Chrome/Firefox/Safari):** importScripts directly.
 *   Blob URLs are blocked by extension CSP, but the CDN must be allowed
 *   in the extension's manifest CSP.
 *
 * Integrity is always verified when a hash is provided, regardless of strategy.
 */
async function fetchScript(cdnUrl: string): Promise<string> {
  const response = await originalFetch(cdnUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch SDK: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function loadSdkScript(cdnUrl: string, integrity?: string): Promise<void> {
  // Validate CDN URL immediately before any script loading (defense-in-depth).
  const validatedUrl = validateCdnUrl(cdnUrl);

  if (getBrowserExtensionRuntime()) {
    // Extensions: blob: URLs are forbidden. Use importScripts directly —
    // the CDN origin must be allowed in the extension's CSP manifest.
    if (integrity) {
      await verifyIntegrity(await fetchScript(validatedUrl), integrity);
    }
    return self.importScripts(validatedUrl);
  }

  // Web apps: fetch + blob URL avoids MIME-type and eval CSP issues.
  const scriptContent = await fetchScript(validatedUrl);

  if (integrity) {
    await verifyIntegrity(scriptContent, integrity);
  }

  const blob = new Blob([scriptContent], { type: "application/javascript" });
  const blobUrl = URL.createObjectURL(blob);
  try {
    self.importScripts(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/**
 * Handle INIT request - load SDK WASM and register chain configs (instances are lazy).
 */
async function handleInit(request: InitRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    if (payload.env !== "web") {
      throw new Error(`Web worker received unexpected env: ${payload.env}`);
    }

    const { cdnUrl, csrfToken, integrity, thread } = payload;

    csrfTokenBase = csrfToken;
    setupFetchInterceptor();
    await loadSdkScript(cdnUrl, integrity);

    if (!self.relayerSDK) {
      throw new Error("Failed to load relayerSDK from CDN");
    }

    sdkGlobal = self.relayerSDK;
    await sdkGlobal.initSDK(thread !== null && thread !== undefined ? { thread } : undefined);

    // Register chain configs for lazy init
    registerRelayerUrls(payload.chains);
    for (const chain of payload.chains) {
      configs.set(chain.chainId, chain);
    }

    sendSuccess(id, type, { initialized: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] Init error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle ADD_CHAIN request - register a new chain config for lazy instance creation.
 */
function handleAddChain(request: AddChainRequest): void {
  const { id, type, payload } = request;
  try {
    if (payload.env === "web" && payload.csrfToken) {
      csrfTokenBase = payload.csrfToken;
    }
    const { config } = payload;
    if (config.relayerUrl) {relayerUrls.add(config.relayerUrl);}
    configs.set(config.chainId, config);
    sendSuccess(id, type, { added: true, chainId: config.chainId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendError(id, type, message);
  }
}

/**
 * Handle REMOVE_CHAIN request - remove a chain's config and cached instance.
 */
function handleRemoveChain(request: RemoveChainRequest): void {
  const { id, type, payload } = request;
  configs.delete(payload.chainId);
  instances.delete(payload.chainId);
  pending.delete(payload.chainId);
  sendSuccess(id, type, { removed: true, chainId: payload.chainId });
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
      input.addAddress(value);
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
    const instance = await getInstance(payload.chainId);

    const input = instance.createEncryptedInput(contractAddress, userAddress);

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
    const instance = await getInstance(payload.chainId);

    const handleContractPairs = payload.handles.map((handle) => ({
      handle,
      contractAddress: payload.contractAddress,
    }));

    const result = await instance.userDecrypt(
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
    const instance = await getInstance(payload.chainId);

    const result = await instance.publicDecrypt(payload.handles);

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
async function handleGenerateKeypair(request: GenerateKeypairRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    const instance = await getInstance(payload.chainId);

    const keypair = instance.generateKeypair();

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
async function handleCreateEIP712(request: CreateEIP712Request): Promise<void> {
  const { id, type, payload } = request;

  try {
    const instance = await getInstance(payload.chainId);

    const eip712 = instance.createEIP712(
      unprefixHex(payload.publicKey),
      payload.contractAddresses,
      payload.startTimestamp,
      payload.durationDays,
    );

    sendSuccess(id, type, eip712);
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
    const instance = await getInstance(payload.chainId);

    const result = instance.createDelegatedUserDecryptEIP712(
      unprefixHex(payload.publicKey),
      payload.contractAddresses,
      payload.delegatorAddress,
      payload.startTimestamp,
      payload.durationDays,
    );

    sendSuccess(id, type, result);
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
    const instance = await getInstance(payload.chainId);

    const handleContractPairs = payload.handles.map((handle) => ({
      handle,
      contractAddress: payload.contractAddress,
    }));

    const result = await instance.delegatedUserDecrypt(
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
    const instance = await getInstance(payload.chainId);

    const result = await instance.requestZKProofVerification(payload.zkProof);

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
async function handleGetPublicKey(request: GetPublicKeyRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    const instance = await getInstance(payload.chainId);

    const result = instance.getPublicKey();

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
async function handleGetPublicParams(request: GetPublicParamsRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    const instance = await getInstance(payload.chainId);

    const result = instance.getPublicParams(
      // oxlint-disable-next-line typescript-eslint/consistent-type-imports -- SDK loaded dynamically via CDN
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
  sendSuccess(id, type, { updated: true });
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
      case "ADD_CHAIN":
        handleAddChain(request);
        break;
      case "REMOVE_CHAIN":
        handleRemoveChain(request);
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
        await handleGetPublicParams(request);
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
