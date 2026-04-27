/**
 * Node.js worker thread for RelayerSDK FHE operations.
 * Handles CPU-intensive WASM operations off the main thread using node:worker_threads.
 */

import type { FhevmInstance, FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/node";
import { parentPort, type Transferable } from "node:worker_threads";
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
  UserDecryptRequest,
  UserDecryptResponseData,
  WorkerRequest,
} from "./worker.types";
import { prefixHex, unprefixHex } from "../utils";

if (!parentPort) {
  throw new Error("This script must be run as a worker thread");
}

const port = parentPort;

// ── Multi-chain instance management ─────────────────────────────
const instances = new Map<number, FhevmInstance>();
const pending = new Map<number, Promise<FhevmInstance>>();
const configs = new Map<number, FhevmInstanceConfig>();

/**
 * Get or lazily create an FhevmInstance for the given chain.
 */
async function getInstance(chainId: number): Promise<FhevmInstance> {
  const existing = instances.get(chainId);
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

  const promise = (async () => {
    const nodeSdk = await import("@zama-fhe/relayer-sdk/node");
    return nodeSdk.createInstance({ ...config, batchRpcCalls: false });
  })()
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

function sendSuccess<T>(
  id: string,
  type: WorkerRequest["type"],
  data: T,
  transfer?: readonly Transferable[],
): void {
  const response: SuccessResponse<T> = { id, type, success: true, data };
  port.postMessage(response, transfer);
}

function sendError(id: string, type: WorkerRequest["type"], error: string): void {
  const response: ErrorResponse = { id, type, success: false, error };
  port.postMessage(response);
}

/**
 * Handle INIT request - register chain configs (instances are lazy).
 */
async function handleInit(request: InitRequest): Promise<void> {
  const { id, type, payload } = request;
  try {
    for (const chain of payload.chains) {
      configs.set(chain.chainId, chain);
    }
    sendSuccess(id, type, { initialized: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] Init error:", message);
    sendError(id, type, message);
  }
}

/**
 * Handle ADD_CHAIN request - register a new chain config for lazy instance creation.
 */
function handleAddChain(request: AddChainRequest): void {
  const { id, type, payload } = request;
  try {
    const { config } = payload;
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

function unreachableFheType(_: never): never {
  throw new Error("Unsupported FHE type");
}

async function handleEncrypt(request: EncryptRequest): Promise<void> {
  const { id, type, payload } = request;
  const { values, contractAddress, userAddress } = payload;

  try {
    const instance = await getInstance(payload.chainId);

    const input = instance.createEncryptedInput(contractAddress, userAddress);

    for (const entry of values) {
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

    const encrypted = await input.encrypt();

    const response: EncryptResponseData = {
      handles: encrypted.handles,
      inputProof: encrypted.inputProof,
    };

    const transferList: Transferable[] = [
      encrypted.inputProof.buffer as ArrayBuffer,
      ...encrypted.handles.map((h) => h.buffer as ArrayBuffer),
    ];

    sendSuccess(id, type, response, transferList);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] Encrypt error:", message);
    sendError(id, type, message);
  }
}

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
    console.error("[NodeWorker] UserDecrypt error:", message);
    sendError(id, type, message);
  }
}

async function handlePublicDecrypt(request: PublicDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    const instance = await getInstance(payload.chainId);

    const result = await instance.publicDecrypt(payload.handles);

    const response: PublicDecryptResponseData = { ...result };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] PublicDecrypt error:", message);
    sendError(id, type, message);
  }
}

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
    console.error("[NodeWorker] GenerateKeypair error:", message);
    sendError(id, type, message);
  }
}

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
    console.error("[NodeWorker] CreateEIP712 error:", message);
    sendError(id, type, message);
  }
}

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
    console.error("[NodeWorker] CreateDelegatedEIP712 error:", message);
    sendError(id, type, message);
  }
}

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
    console.error("[NodeWorker] DelegatedUserDecrypt error:", message);
    sendError(id, type, message);
  }
}

async function handleRequestZKProofVerification(
  request: RequestZKProofVerificationRequest,
): Promise<void> {
  const { id, type, payload } = request;

  try {
    const instance = await getInstance(payload.chainId);

    const result = await instance.requestZKProofVerification(payload.zkProof);

    const transferList: Transferable[] = [
      result.inputProof.buffer as ArrayBuffer,
      ...result.handles.map((h) => h.buffer as ArrayBuffer),
    ];

    sendSuccess(id, type, result, transferList);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] RequestZKProofVerification error:", message);
    sendError(id, type, message);
  }
}

async function handleGetPublicKey(request: GetPublicKeyRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    const instance = await getInstance(payload.chainId);

    const result = instance.getPublicKey();

    const response: GetPublicKeyResponseData = { result };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] GetPublicKey error:", message);
    sendError(id, type, message);
  }
}

async function handleGetPublicParams(request: GetPublicParamsRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    const instance = await getInstance(payload.chainId);

    const result = instance.getPublicParams(
      // oxlint-disable-next-line typescript-eslint/consistent-type-imports -- SDK loaded dynamically
      payload.bits as keyof import("@zama-fhe/relayer-sdk/node").PublicParams<Uint8Array>,
    );

    const response: GetPublicParamsResponseData = { result };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] GetPublicParams error:", message);
    sendError(id, type, message);
  }
}

async function handleMessage(request: WorkerRequest): Promise<void> {
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
        console.error("[NodeWorker] Unknown request type:", request.type);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendError(request.id, request.type, message);
  }
}

port.on("message", (request: WorkerRequest) => {
  void handleMessage(request);
});
