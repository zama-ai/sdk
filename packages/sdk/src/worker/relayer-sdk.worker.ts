/**
 * Web Worker for FHE operations.
 * Uses @fhevm/sdk for encryption/decryption off the main thread.
 *
 * This worker is bundled by the host app's bundler (Vite, webpack, etc.) which
 * resolves the @fhevm/sdk imports at build time.
 */

import type { Address, Hex } from "viem";
import { createFhevmClient, setFhevmRuntimeConfig } from "@fhevm/sdk/ethers";
import {
  createKmsUserDecryptEIP712,
  createKmsDelegatedUserDecryptEIP712,
} from "@fhevm/sdk/actions/chain";
import type { EncryptMultipleReturnType } from "@fhevm/sdk/actions/encrypt";
import type { DecryptParameters } from "@fhevm/sdk/actions/decrypt";
import type {
  FhevmInstanceConfig,
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

declare const self: {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
};

// ============================================================================
// Client state
// ============================================================================

type FhevmClient = ReturnType<typeof createFhevmClient>;
// oxlint-disable-next-line typescript-eslint/no-redundant-type-constituents -- FhevmClient resolves to `any` when @fhevm/sdk is not installed locally
let client: FhevmClient | null = null;

// Store relayer URL and CSRF token for fetch interception.
// These globals are per-worker-instance. Do NOT convert to SharedWorker
// without rearchitecting CSRF token management to be per-connection.
let relayerUrlBase = "";
let csrfTokenBase = "";

// CSRF header name (must match server expectation)
const CSRF_HEADER_NAME = "x-csrf-token";

// Mutating HTTP methods that require CSRF token (js-set-map-lookups)
const MUTATING_METHODS = new Set(["POST", "PUT", "DELETE", "PATCH"]);

// ============================================================================
// Messaging
// ============================================================================

function sendSuccess<T>(
  id: string,
  type: WorkerRequest["type"],
  data: T,
  transfer?: Transferable[],
): void {
  const response: SuccessResponse<T> = { id, type, success: true, data };
  return self.postMessage(response, transfer);
}

function sendError(
  id: string,
  type: WorkerRequest["type"],
  error: string,
  statusCode?: number,
): void {
  const response: ErrorResponse = { id, type, success: false, error };
  if (statusCode !== undefined) {
    response.statusCode = statusCode;
  }
  self.postMessage(response);
}

// ============================================================================
// Helpers
// ============================================================================

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function fheTypeToSolidityType(fheType: string): string {
  if (fheType === "ebool") {
    return "bool";
  }
  if (fheType === "eaddress") {
    return "address";
  }
  return fheType.slice(1);
}

// oxlint-disable-next-line typescript-eslint/no-redundant-type-constituents -- FhevmClient resolves to `any` when @fhevm/sdk is not installed locally
function assertClient(c: FhevmClient | null): asserts c is FhevmClient {
  if (!c) {
    throw new Error("SDK not initialized. Call INIT first.");
  }
}

function configToChain(config: FhevmInstanceConfig) {
  return {
    id: config.chainId,
    fhevm: {
      contracts: {
        acl: { address: config.aclContractAddress as Address },
        inputVerifier: {
          address: config.inputVerifierContractAddress as Address,
        },
        kmsVerifier: { address: config.kmsContractAddress as Address },
      },
      relayerUrl: config.relayerUrl,
      gateway: {
        id: config.gatewayChainId,
        contracts: {
          decryption: {
            address: config.verifyingContractAddressDecryption as Address,
          },
          inputVerification: {
            address: config.verifyingContractAddressInputVerification as Address,
          },
        },
      },
    },
  };
}

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
// Fetch interceptor (CSRF)
// ============================================================================

const originalFetch = fetch;

function setupFetchInterceptor(): void {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method?.toUpperCase() ?? "GET";

    if (relayerUrlBase && url.startsWith(relayerUrlBase)) {
      const headers = new Headers(init?.headers);

      if (MUTATING_METHODS.has(method) && csrfTokenBase) {
        headers.set(CSRF_HEADER_NAME, csrfTokenBase);
      }

      return originalFetch(input, {
        ...init,
        headers,
        credentials: "include",
      });
    }

    return originalFetch(input, init);
  };
}

// ============================================================================
// Handlers
// ============================================================================

async function handleInit(request: InitRequest): Promise<void> {
  const { id, type, payload } = request;
  const { fhevmConfig, csrfToken, thread } = payload;

  try {
    relayerUrlBase = fhevmConfig.relayerUrl ?? "";
    csrfTokenBase = csrfToken;

    setupFetchInterceptor();

    setFhevmRuntimeConfig({
      numberOfThreads: thread,
    });

    const chain = configToChain(fhevmConfig);
    const network =
      typeof fhevmConfig.network === "string" ? fhevmConfig.network : "http://127.0.0.1:8545";

    const { ethers } = await import("ethers");
    const provider = new ethers.JsonRpcProvider(network);

    client = createFhevmClient({ chain, provider });
    await client.ready;

    sendSuccess<InitResponseData>(id, type, { initialized: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] Init error:", message);
    sendError(id, type, message);
  }
}

async function handleEncrypt(request: EncryptRequest): Promise<void> {
  const { id, type, payload } = request;
  const { values, contractAddress, userAddress } = payload;

  try {
    assertClient(client);

    const typedValues = values.map((v) => ({
      type: fheTypeToSolidityType(v.type),
      value:
        v.type === "ebool"
          ? typeof v.value === "boolean"
            ? v.value
            : (v.value as bigint) !== 0n
          : v.value,
    }));

    const result = (await client.encrypt({
      contractAddress: contractAddress as `0x${string}`,
      userAddress: userAddress as `0x${string}`,
      values: typedValues as unknown as Parameters<typeof client.encrypt>[0]["values"],
    })) as EncryptMultipleReturnType;

    const evs = result.externalEncryptedValues;

    const handles = (evs as unknown[]).map((ev: unknown) => {
      const obj = ev as { bytes32Hex?: string };
      return hexToBytes(obj.bytes32Hex ?? String(ev));
    });
    const inputProof = hexToBytes(String(result.inputProof));

    const response: EncryptResponseData = { handles, inputProof };
    const transferList: Transferable[] = [
      inputProof.buffer as ArrayBuffer,
      ...handles.map((h) => h.buffer as ArrayBuffer),
    ];

    sendSuccess(id, type, response, transferList);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] Encrypt error:", message);
    sendError(id, type, message);
  }
}

async function handleUserDecrypt(request: UserDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    assertClient(client);

    const keypair = await client.parseE2eTransportKeypair({
      serialized: JSON.stringify({
        publicKey: payload.publicKey,
        privateKey: payload.privateKey,
      }),
    });

    const permit = await client.parseSignedDecryptionPermit({
      serialized: JSON.stringify({
        publicKey: payload.publicKey,
        contractAddresses: payload.signedContractAddresses,
        signerAddress: payload.signerAddress,
        startTimestamp: payload.startTimestamp,
        durationDays: payload.durationDays,
        signature: payload.signature,
        eip712: payload.eip712,
      }),
      e2eTransportKeypair: keypair,
    });

    const encryptedValues = payload.handles.map((handle) => ({
      encryptedValue: handle,
      contractAddress: payload.contractAddress,
    }));

    const clearValues = await client.decrypt({
      e2eTransportKeypair: keypair,
      encryptedValues,
      signedPermit: permit,
    } as unknown as DecryptParameters);

    const result: Record<string, unknown> = {};
    for (let i = 0; i < payload.handles.length; i++) {
      const handle = payload.handles[i];
      const cv = (clearValues as unknown[])[i] as { value: unknown } | undefined;
      if (handle !== undefined && cv !== undefined) {
        result[handle] = cv.value;
      }
    }

    sendSuccess<UserDecryptResponseData>(id, type, {
      clearValues: result as UserDecryptResponseData["clearValues"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = extractHttpStatus(error);
    console.error("[Worker] UserDecrypt error:", message);
    sendError(id, type, message, statusCode);
  }
}

async function handlePublicDecrypt(request: PublicDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    assertClient(client);

    const result = await client.publicDecrypt({ encryptedValues: payload.handles });

    const clearValues: Record<string, unknown> = {};
    for (let i = 0; i < payload.handles.length; i++) {
      const handle = payload.handles[i];
      const cv = (result.orderedClearValues as unknown[])[i] as { value: unknown } | undefined;
      if (handle !== undefined && cv !== undefined) {
        clearValues[handle] = cv.value;
      }
    }

    sendSuccess<PublicDecryptResponseData>(id, type, {
      clearValues: clearValues as PublicDecryptResponseData["clearValues"],
      abiEncodedClearValues: result.orderedAbiEncodedClearValues as Hex,
      decryptionProof: result.decryptionProof as Hex,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] PublicDecrypt error:", message);
    sendError(id, type, message);
  }
}

async function handleGenerateKeypair(request: GenerateKeypairRequest): Promise<void> {
  const { id, type } = request;

  try {
    assertClient(client);
    const keypair = await client.generateE2eTransportKeypair();
    const serialized = client.serializeE2eTransportKeypair({
      e2eTransportKeypair: keypair,
    });

    sendSuccess<GenerateKeypairResponseData>(id, type, {
      publicKey: serialized.publicKey as Hex,
      privateKey: serialized.privateKey as Hex,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] GenerateKeypair error:", message);
    sendError(id, type, message);
  }
}

async function handleCreateEIP712(request: CreateEIP712Request): Promise<void> {
  const { id, type, payload } = request;

  try {
    assertClient(client);

    const eip712 = createKmsUserDecryptEIP712(client, {
      publicKey: payload.publicKey,
      contractAddresses: payload.contractAddresses,
      startTimestamp: payload.startTimestamp,
      durationDays: payload.durationDays,
      extraData: "0x00",
    });

    sendSuccess<CreateEIP712ResponseData>(id, type, {
      domain: {
        name: String(eip712.domain.name),
        version: String(eip712.domain.version),
        chainId: Number(eip712.domain.chainId),
        verifyingContract: String(eip712.domain.verifyingContract) as Address,
      },
      types: {
        UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification.map(
          (field: { name: string; type: string }) => ({
            name: field.name,
            type: field.type,
          }),
        ),
      },
      message: {
        publicKey: payload.publicKey,
        contractAddresses: payload.contractAddresses as Address[],
        startTimestamp: BigInt(payload.startTimestamp),
        durationDays: BigInt(payload.durationDays),
        extraData: "0x00" as Hex,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] CreateEIP712 error:", message);
    sendError(id, type, message);
  }
}

async function handleCreateDelegatedEIP712(request: CreateDelegatedEIP712Request): Promise<void> {
  const { id, type, payload } = request;

  try {
    assertClient(client);

    const result = createKmsDelegatedUserDecryptEIP712(client, {
      publicKey: payload.publicKey,
      contractAddresses: payload.contractAddresses,
      delegatorAddress: payload.delegatorAddress,
      startTimestamp: payload.startTimestamp,
      durationDays: payload.durationDays,
      extraData: "0x00",
    });

    sendSuccess<CreateDelegatedEIP712ResponseData>(id, type, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] CreateDelegatedEIP712 error:", message);
    sendError(id, type, message);
  }
}

async function handleDelegatedUserDecrypt(request: DelegatedUserDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    assertClient(client);

    const keypair = await client.parseE2eTransportKeypair({
      serialized: JSON.stringify({
        publicKey: payload.publicKey,
        privateKey: payload.privateKey,
      }),
    });

    const permit = await client.parseSignedDecryptionPermit({
      serialized: JSON.stringify({
        publicKey: payload.publicKey,
        contractAddresses: payload.signedContractAddresses,
        delegatorAddress: payload.delegatorAddress,
        delegateAddress: payload.delegateAddress,
        startTimestamp: payload.startTimestamp,
        durationDays: payload.durationDays,
        signature: payload.signature,
        eip712: payload.eip712,
      }),
      e2eTransportKeypair: keypair,
    });

    const encryptedValues = payload.handles.map((handle) => ({
      encryptedValue: handle,
      contractAddress: payload.contractAddress,
    }));

    const clearValues = await client.decrypt({
      e2eTransportKeypair: keypair,
      encryptedValues,
      signedPermit: permit,
    } as unknown as DecryptParameters);

    const result: Record<string, unknown> = {};
    for (let i = 0; i < payload.handles.length; i++) {
      const handle = payload.handles[i];
      const cv = (clearValues as unknown[])[i] as { value: unknown } | undefined;
      if (handle !== undefined && cv !== undefined) {
        result[handle] = cv.value;
      }
    }

    sendSuccess<DelegatedUserDecryptResponseData>(id, type, {
      clearValues: result as DelegatedUserDecryptResponseData["clearValues"],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = extractHttpStatus(error);
    console.error("[Worker] DelegatedUserDecrypt error:", message);
    sendError(id, type, message, statusCode);
  }
}

async function handleRequestZKProofVerification(
  request: RequestZKProofVerificationRequest,
): Promise<void> {
  const { id, type } = request;
  sendError(id, type, "ZK proof verification is built into encrypt() in @fhevm/sdk");
}

async function handleGetPublicKey(request: GetPublicKeyRequest): Promise<void> {
  const { id, type } = request;

  try {
    assertClient(client);
    const key = await client.fetchFheEncryptionKeyBytes?.({});

    sendSuccess<GetPublicKeyResponseData>(id, type, {
      result: key
        ? {
            publicKeyId: "fhe-encryption-key",
            publicKey: new Uint8Array(key.publicKeyBytes.bytes),
          }
        : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[Worker] GetPublicKey error:", message);
    sendError(id, type, message);
  }
}

function handleGetPublicParams(request: GetPublicParamsRequest): void {
  const { id, type } = request;
  sendSuccess<GetPublicParamsResponseData>(id, type, { result: null });
}

function handleUpdateCsrf(request: UpdateCsrfRequest): void {
  const { id, type, payload } = request;
  csrfTokenBase = payload.csrfToken;
  sendSuccess<UpdateCsrfResponseData>(id, type, { updated: true });
}

// ============================================================================
// Message router
// ============================================================================

async function handleMessage(request: WorkerRequest): Promise<void> {
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
    sendError(request.id, request.type, message);
  }
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  void handleMessage(event.data);
};
