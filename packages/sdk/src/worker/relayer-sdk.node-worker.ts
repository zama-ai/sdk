/**
 * Node.js worker thread for FHE operations.
 * Uses @fhevm/sdk for encryption/decryption off the main thread using node:worker_threads.
 */

import { ethers } from "ethers";
import { parentPort, type Transferable } from "node:worker_threads";
import type { EncryptValuesParameters } from "@fhevm/sdk/actions/encrypt";
import type { FheTypeName } from "../relayer/relayer-sdk.types";
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
  NodeInitRequest,
  PublicDecryptRequest,
  PublicDecryptResponseData,
  RequestZKProofVerificationRequest,
  SuccessResponse,
  UserDecryptRequest,
  UserDecryptResponseData,
  WorkerRequest,
} from "./worker.types";

if (!parentPort) {
  throw new Error("This script must be run as a worker thread");
}

const port = parentPort;

// ============================================================================
// Client state
// ============================================================================

// oxlint-disable-next-line typescript-eslint/consistent-type-imports -- dynamic import type extraction
type FhevmSdk = typeof import("@fhevm/sdk/ethers");
type FhevmClient = ReturnType<FhevmSdk["createFhevmClient"]>;
type FhevmClientInstance = Awaited<FhevmClient>;

let client: FhevmClientInstance | null = null;

function assertClient(c: FhevmClientInstance | null): asserts c is FhevmClientInstance {
  if (!c) {
    throw new Error("SDK not initialized. Call NODE_INIT first.");
  }
}

// ============================================================================
// Messaging helpers
// ============================================================================

function sendSuccess<T>(
  id: string,
  type: WorkerRequest["type"],
  data: T,
  transfer?: readonly Transferable[],
): void {
  const response: SuccessResponse<T> = { id, type, success: true, data };
  port.postMessage(response, transfer);
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
  port.postMessage(response);
}

/**
 * Extract an HTTP status code from an error, if present.
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

/**
 * Map SDK FHE type names to Solidity-style type names expected by @fhevm/sdk encryptValues.
 */
function fheTypeToSolidityType(
  fheType: FheTypeName,
): EncryptValuesParameters["values"][number]["type"] {
  switch (fheType) {
    case "ebool":
      return "bool";
    case "euint8":
      return "uint8";
    case "euint16":
      return "uint16";
    case "euint32":
      return "uint32";
    case "euint64":
      return "uint64";
    case "euint128":
      return "uint128";
    case "euint256":
      return "uint256";
    case "eaddress":
      return "address";
    default: {
      const _exhaustive: never = fheType;
      throw new Error(`Unsupported FHE type: ${String(_exhaustive)}`);
    }
  }
}

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
 * Handle NODE_INIT request - configure runtime and create FhevmClient.
 * Node worker uses singleThread: true (no SharedArrayBuffer/Atomics needed).
 */
async function handleNodeInit(request: NodeInitRequest): Promise<void> {
  const { id, type, payload } = request;
  const { fhevmConfig } = payload;

  try {
    const { createFhevmClient, setFhevmRuntimeConfig } = await import("@fhevm/sdk/ethers");

    // Node worker runs single-threaded (no SharedArrayBuffer support needed)
    setFhevmRuntimeConfig({ singleThread: true });

    const chain = configToChain(fhevmConfig);
    const providerUrl = fhevmConfig.networkUrl ?? fhevmConfig.relayerUrl;
    const provider = new ethers.JsonRpcProvider(providerUrl);

    client = createFhevmClient({ chain, provider });
    await client.ready;

    sendSuccess(id, type, { initialized: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] Init error:", message);
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
    assertClient(client);

    const mappedValues = values.map((entry) => ({
      value: entry.value as never,
      type: fheTypeToSolidityType(entry.type),
    }));

    const encrypted = await client.encryptValues({
      values: mappedValues,
      contractAddress,
      userAddress,
    });

    const handles = encrypted.encryptedValues.map(hexToBytes);
    const inputProof = hexToBytes(encrypted.inputProof);

    const response: EncryptResponseData = { handles, inputProof };

    const transferList: Transferable[] = [
      inputProof.buffer as ArrayBuffer,
      ...handles.map((h) => h.buffer as ArrayBuffer),
    ];

    sendSuccess(id, type, response, transferList);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] Encrypt error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle USER_DECRYPT request.
 */
async function handleUserDecrypt(request: UserDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    assertClient(client);

    // 1. Parse transport keypair
    const keypair = await client.parseTransportKeypair({
      serialized: {
        publicKey: payload.publicKey,
        privateKey: payload.privateKey,
      },
    });

    // 2. Parse signed decryption permit
    const permit = await client.parseSignedDecryptionPermit({
      serialized: {
        publicKey: payload.publicKey,
        contractAddresses: payload.signedContractAddresses,
        signerAddress: payload.signerAddress,
        startTimestamp: payload.startTimestamp,
        durationDays: payload.durationDays,
        signature: payload.signature,
        eip712: payload.eip712,
      },
      transportKeypair: keypair,
    });

    // 3. Decrypt (permit is a union — the SDK dispatches based on isDelegated)
    const clearValues = await client.decryptValues({
      transportKeypair: keypair,
      encryptedValues: payload.handles,
      contractAddress: payload.contractAddress,
      signedPermit: permit as never,
    });

    // 4. Map results: clearValues is TypedValue[] -> Record<Handle, value>
    const mapped: UserDecryptResponseData["clearValues"] = {};
    for (let i = 0; i < payload.handles.length; i++) {
      const handle = payload.handles[i];
      const cv = clearValues[i];
      if (handle !== undefined && cv !== undefined) {
        mapped[handle] = cv.value;
      }
    }

    const response: UserDecryptResponseData = {
      clearValues: mapped,
    };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const statusCode = extractHttpStatus(error);
    console.error("[NodeWorker] UserDecrypt error:", message);
    sendError(id, type, message, statusCode);
  }
}

/**
 * Handle DELEGATED_USER_DECRYPT request.
 */
async function handleDelegatedUserDecrypt(request: DelegatedUserDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    assertClient(client);

    // 1. Parse transport keypair
    const keypair = await client.parseTransportKeypair({
      serialized: {
        publicKey: payload.publicKey,
        privateKey: payload.privateKey,
      },
    });

    // 2. Parse signed decryption permit (delegated)
    const permit = await client.parseSignedDecryptionPermit({
      serialized: {
        publicKey: payload.publicKey,
        contractAddresses: payload.signedContractAddresses,
        signerAddress: payload.delegatorAddress,
        startTimestamp: payload.startTimestamp,
        durationDays: payload.durationDays,
        signature: payload.signature,
        eip712: payload.eip712,
      },
      transportKeypair: keypair,
    });

    // 3. Decrypt (permit is a union — the SDK dispatches based on isDelegated)
    const decryptedValues = await client.decryptValues({
      transportKeypair: keypair,
      encryptedValues: payload.handles,
      contractAddress: payload.contractAddress,
      signedPermit: permit as never,
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
    console.error("[NodeWorker] DelegatedUserDecrypt error:", message);
    sendError(id, type, message, statusCode);
  }
}

/**
 * Handle PUBLIC_DECRYPT request.
 */
async function handlePublicDecrypt(request: PublicDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    assertClient(client);

    const result = await client.readPublicValuesWithSignatures({
      encryptedValues: payload.handles,
    });

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
    console.error("[NodeWorker] PublicDecrypt error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle GENERATE_KEYPAIR request.
 */
async function handleGenerateKeypair(request: GenerateKeypairRequest): Promise<void> {
  const { id, type } = request;

  try {
    assertClient(client);

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
    console.error("[NodeWorker] GenerateKeypair error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle CREATE_EIP712 request.
 */
async function handleCreateEIP712(request: CreateEIP712Request): Promise<void> {
  const { id, type, payload } = request;

  try {
    assertClient(client);

    const { createKmsUserDecryptEIP712 } = await import("@fhevm/sdk/actions/chain");
    const response = createKmsUserDecryptEIP712(client, {
      publicKey: payload.publicKey,
      contractAddresses: payload.contractAddresses,
      startTimestamp: payload.startTimestamp,
      durationDays: payload.durationDays,
      extraData: "0x",
    });

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] CreateEIP712 error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle CREATE_DELEGATED_EIP712 request.
 */
async function handleCreateDelegatedEIP712(request: CreateDelegatedEIP712Request): Promise<void> {
  const { id, type, payload } = request;

  try {
    assertClient(client);

    const { createKmsDelegatedUserDecryptEip712 } = await import("@fhevm/sdk/actions/chain");
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
    console.error("[NodeWorker] CreateDelegatedEIP712 error:", message);
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
  const { id, type } = request;

  try {
    assertClient(client);

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
    console.error("[NodeWorker] GetPublicKey error:", message);
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

// ============================================================================
// Main message handler
// ============================================================================

async function handleMessage(request: WorkerRequest): Promise<void> {
  try {
    switch (request.type) {
      case "NODE_INIT":
        await handleNodeInit(request);
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
        console.error("[NodeWorker] Unknown request type:", (request as WorkerRequest).type);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendError(
      request?.id ?? "unknown",
      request?.type ?? ("UNKNOWN" as WorkerRequest["type"]),
      message,
    );
  }
}

port.on("message", (request: WorkerRequest) => {
  void handleMessage(request);
});
