/**
 * Node.js worker thread for RelayerSDK FHE operations.
 * Uses @fhevm/sdk for encryption/decryption off the main thread via node:worker_threads.
 */

/* oxlint-disable typescript-eslint/no-explicit-any -- adapter between incompatible type systems */

import type { Address, Hex } from "viem";
import { createFhevmClient, setFhevmRuntimeConfig } from "@fhevm/sdk/ethers";
import type { DecryptParameters } from "@fhevm/sdk/actions/decrypt";
import { parentPort, type Transferable } from "node:worker_threads";
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
import { ethers } from "ethers";

if (!parentPort) {
  throw new Error("This script must be run as a worker thread");
}

const port = parentPort;

type FhevmClient = ReturnType<typeof createFhevmClient>;
let client: FhevmClient | null = null;

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

function ensureClient(): FhevmClient {
  if (!client) {
    throw new Error("SDK not initialized. Call NODE_INIT first.");
  }
  return client;
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

// ============================================================================
// Handlers
// ============================================================================

async function handleNodeInit(request: NodeInitRequest): Promise<void> {
  const { id, type, payload } = request;
  const { fhevmConfig } = payload;

  try {
    setFhevmRuntimeConfig({});

    const chain = configToChain(fhevmConfig);
    const network =
      typeof fhevmConfig.network === "string" ? fhevmConfig.network : "http://127.0.0.1:8545";
    const provider = new ethers.JsonRpcProvider(network);

    client = createFhevmClient({ chain, provider });
    await client.ready;

    sendSuccess<InitResponseData>(id, type, { initialized: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] Init error:", message);
    sendError(id, type, message);
  }
}

async function handleEncrypt(request: EncryptRequest): Promise<void> {
  const { id, type, payload } = request;
  const { values, contractAddress, userAddress } = payload;

  try {
    const c = ensureClient();

    const typedValues = values.map((v) => ({
      type: fheTypeToSolidityType(v.type),
      value:
        v.type === "ebool"
          ? typeof v.value === "boolean"
            ? v.value
            : (v.value as bigint) !== 0n
          : v.value,
    }));

    const result = await c.encrypt({
      contractAddress: contractAddress as `0x${string}`,
      userAddress: userAddress as `0x${string}`,
      values: typedValues as unknown as Parameters<typeof c.encrypt>[0]["values"],
    });

    const evs =
      "externalEncryptedValues" in result
        ? result.externalEncryptedValues
        : [(result as { externalEncryptedValue: unknown }).externalEncryptedValue];

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
    console.error("[NodeWorker] Encrypt error:", message);
    sendError(id, type, message);
  }
}

async function handleUserDecrypt(request: UserDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    const c = ensureClient();

    const keypair = await c.parseE2eTransportKeypair({
      serialized: JSON.stringify({
        publicKey: payload.publicKey,
        privateKey: payload.privateKey,
      }),
    });

    const permit = await c.parseSignedDecryptionPermit({
      serialized: JSON.stringify({
        publicKey: payload.publicKey,
        contractAddresses: payload.signedContractAddresses,
        signerAddress: payload.signerAddress,
        startTimestamp: payload.startTimestamp,
        durationDays: payload.durationDays,
        signature: payload.signature,
      }),
      e2eTransportKeypair: keypair,
    });

    const encryptedValues = payload.handles.map((handle) => ({
      encryptedValue: handle,
      contractAddress: payload.contractAddress,
    }));

    const clearValues = await c.decrypt({
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
    console.error("[NodeWorker] UserDecrypt error:", message);
    sendError(id, type, message);
  }
}

async function handlePublicDecrypt(request: PublicDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    const c = ensureClient();

    const result = await c.publicDecrypt({ encryptedValues: payload.handles });

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
    console.error("[NodeWorker] PublicDecrypt error:", message);
    sendError(id, type, message);
  }
}

async function handleGenerateKeypair(request: GenerateKeypairRequest): Promise<void> {
  const { id, type } = request;

  try {
    const c = ensureClient();
    const keypair = await c.generateE2eTransportKeypair();
    const serialized = c.serializeE2eTransportKeypair({
      e2eTransportKeypair: keypair,
    });

    sendSuccess<GenerateKeypairResponseData>(id, type, {
      publicKey: serialized.publicKey as Hex,
      privateKey: serialized.privateKey as Hex,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[NodeWorker] GenerateKeypair error:", message);
    sendError(id, type, message);
  }
}

async function handleCreateEIP712(request: CreateEIP712Request): Promise<void> {
  const { id, type, payload } = request;

  try {
    const c = ensureClient();
    const { createKmsUserDecryptEIP712 } = await import(
      /* @vite-ignore */ "@fhevm/sdk/actions/chain"
    );

    const eip712 = createKmsUserDecryptEIP712(c, {
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
    console.error("[NodeWorker] CreateEIP712 error:", message);
    sendError(id, type, message);
  }
}

async function handleCreateDelegatedEIP712(request: CreateDelegatedEIP712Request): Promise<void> {
  const { id, type, payload } = request;

  try {
    const c = ensureClient();
    const { createKmsDelegatedUserDecryptEIP712 } = await import(
      /* @vite-ignore */ "@fhevm/sdk/actions/chain"
    );

    const result = createKmsDelegatedUserDecryptEIP712(c, {
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
    console.error("[NodeWorker] CreateDelegatedEIP712 error:", message);
    sendError(id, type, message);
  }
}

async function handleDelegatedUserDecrypt(request: DelegatedUserDecryptRequest): Promise<void> {
  const { id, type, payload } = request;

  try {
    const c = ensureClient();

    const keypair = await c.parseE2eTransportKeypair({
      serialized: JSON.stringify({
        publicKey: payload.publicKey,
        privateKey: payload.privateKey,
      }),
    });

    const permit = await c.parseSignedDecryptionPermit({
      serialized: JSON.stringify({
        publicKey: payload.publicKey,
        contractAddresses: payload.signedContractAddresses,
        delegatorAddress: payload.delegatorAddress,
        delegateAddress: payload.delegateAddress,
        startTimestamp: payload.startTimestamp,
        durationDays: payload.durationDays,
        signature: payload.signature,
      }),
      e2eTransportKeypair: keypair,
    });

    const encryptedValues = payload.handles.map((handle) => ({
      encryptedValue: handle,
      contractAddress: payload.contractAddress,
    }));

    const clearValues = await c.decrypt({
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
    console.error("[NodeWorker] DelegatedUserDecrypt error:", message);
    sendError(id, type, message);
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
    const c = ensureClient();
    const key = await c.fetchFheEncryptionKeyBytes?.({});

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
    console.error("[NodeWorker] GetPublicKey error:", message);
    sendError(id, type, message);
  }
}

function handleGetPublicParams(request: GetPublicParamsRequest): void {
  const { id, type } = request;
  sendSuccess<GetPublicParamsResponseData>(id, type, { result: null });
}

// ============================================================================
// Message router
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
