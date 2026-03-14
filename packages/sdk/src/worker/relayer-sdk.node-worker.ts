/**
 * Node.js worker thread for RelayerSDK FHE operations.
 * Handles CPU-intensive WASM operations off the main thread using node:worker_threads.
 */

import type { FhevmInstance, FhevmInstanceConfig } from "@zama-fhe/relayer-sdk/node";
import { parentPort, type Transferable } from "node:worker_threads";
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
  InitResponseData,
  NodeInitRequest,
  PublicDecryptRequest,
  PublicDecryptResponseData,
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

let sdkInstance: FhevmInstance | null = null;

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

async function handleNodeInit(request: NodeInitRequest): Promise<void> {
  const { id, type, payload } = request;
  const { fhevmConfig } = payload;

  try {
    const nodeSdk = await import("@zama-fhe/relayer-sdk/node");

    const config: FhevmInstanceConfig = {
      ...fhevmConfig,
      batchRpcCalls: false,
    };

    sdkInstance = await nodeSdk.createInstance(config);

    sendSuccess<InitResponseData>(id, type, { initialized: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] Init error:", message);
    sendError(id, type, message);
  }
}

/** Coerce a boolean to bigint for numeric FHE types. */
function toBigInt(value: bigint | boolean): bigint {
  return typeof value === "boolean" ? (value ? 1n : 0n) : value;
}

async function handleEncrypt(request: EncryptRequest): Promise<void> {
  const { id, type, payload } = request;
  const { values, contractAddress, userAddress } = payload;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call NODE_INIT first.");
    }

    const input = sdkInstance.createEncryptedInput(contractAddress, userAddress);

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
          input.addAddress(String(value));
          break;
        default:
          throw new Error(`Unsupported FHE type: ${fheType}`);
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
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call NODE_INIT first.");
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
    console.error("[NodeWorker] UserDecrypt error:", message);
    sendError(id, type, message);
  }
}

async function handlePublicDecrypt(request: PublicDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call NODE_INIT first.");
    }

    const result = await sdkInstance.publicDecrypt(payload.handles);

    const response: PublicDecryptResponseData = { ...result };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] PublicDecrypt error:", message);
    sendError(id, type, message);
  }
}

function handleGenerateKeypair(request: GenerateKeypairRequest): void {
  const { id, type } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call NODE_INIT first.");
    }

    const keypair = sdkInstance.generateKeypair();

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

function handleCreateEIP712(request: CreateEIP712Request): void {
  const { id, type, payload } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call NODE_INIT first.");
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
    console.error("[NodeWorker] CreateEIP712 error:", message);
    sendError(id, type, message);
  }
}

function handleCreateDelegatedEIP712(request: CreateDelegatedEIP712Request): void {
  const { id, type, payload } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call NODE_INIT first.");
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
    console.error("[NodeWorker] CreateDelegatedEIP712 error:", message);
    sendError(id, type, message);
  }
}

async function handleDelegatedUserDecrypt(request: DelegatedUserDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call NODE_INIT first.");
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
    console.error("[NodeWorker] DelegatedUserDecrypt error:", message);
    sendError(id, type, message);
  }
}

async function handleRequestZKProofVerification(
  request: RequestZKProofVerificationRequest,
): Promise<void> {
  const { id, type, payload } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call NODE_INIT first.");
    }

    const result = await sdkInstance.requestZKProofVerification(payload.zkProof);

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

function handleGetPublicKey(request: GetPublicKeyRequest): void {
  const { id, type } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call NODE_INIT first.");
    }

    const result = sdkInstance.getPublicKey();

    const response: GetPublicKeyResponseData = { result };

    sendSuccess(id, type, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] GetPublicKey error:", message);
    sendError(id, type, message);
  }
}

function handleGetPublicParams(request: GetPublicParamsRequest): void {
  const { id, type, payload } = request;

  try {
    if (!sdkInstance) {
      throw new Error("SDK not initialized. Call NODE_INIT first.");
    }

    const result = sdkInstance.getPublicParams(
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

port.on("message", async (request: WorkerRequest) => {
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
});
