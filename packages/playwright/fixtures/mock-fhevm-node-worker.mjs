/**
 * Mock Node.js worker for transport-layer tests.
 *
 * Supports keypair generation, EIP-712 creation, and public key/params retrieval.
 * Encrypt/decrypt operations are NOT needed here — domain-level FHE scenarios
 * are covered by the browser e2e suite.
 */
import { parentPort } from "node:worker_threads";
import { ethers } from "ethers";
import { MockFhevmInstance, FhevmMockProvider, FhevmMockProviderType } from "@fhevm/mock-utils";

if (!parentPort) {
  throw new Error("This script must be run as a worker thread");
}

const port = parentPort;

/** @type {MockFhevmInstance | null} */
let instance = null;

function send(id, type, data) {
  port.postMessage({ id, type, success: true, data });
}

function sendError(id, type, error) {
  port.postMessage({ id, type, success: false, error });
}

function remove0x(hex) {
  return hex.startsWith("0x") ? hex.slice(2) : hex;
}

function ensure0x(hex) {
  return hex.startsWith("0x") ? hex : `0x${hex}`;
}

async function handleMessage(request) {
  const { id, type } = request;
  try {
    switch (type) {
      case "NODE_INIT": {
        const { fhevmConfig } = request.payload;
        const ethersProvider = new ethers.JsonRpcProvider(fhevmConfig.network);

        // Minimal provider — forwards all RPC to anvil (no fhevm_* intercepts needed)
        const minimalProvider = {
          send: async (method, params) => ethersProvider.send(method, params ?? []),
        };

        const relayerProvider = await FhevmMockProvider.create(
          minimalProvider,
          ethersProvider,
          "anvil",
          FhevmMockProviderType.Anvil,
          fhevmConfig.chainId,
          fhevmConfig.network,
        );

        instance = await MockFhevmInstance.create(
          relayerProvider,
          ethersProvider,
          {
            chainId: fhevmConfig.chainId,
            gatewayChainId: fhevmConfig.gatewayChainId,
            aclContractAddress: fhevmConfig.aclContractAddress,
            kmsContractAddress: fhevmConfig.kmsContractAddress,
            inputVerifierContractAddress: fhevmConfig.inputVerifierContractAddress,
            verifyingContractAddressDecryption: fhevmConfig.verifyingContractAddressDecryption,
            verifyingContractAddressInputVerification:
              fhevmConfig.verifyingContractAddressInputVerification,
          },
          {
            inputVerifierProperties: {},
            kmsVerifierProperties: {},
          },
        );

        send(id, type, { initialized: true });
        break;
      }

      case "GENERATE_KEYPAIR": {
        if (!instance) throw new Error("Not initialized");
        const kp = instance.generateKeypair();
        send(id, type, {
          publicKey: ensure0x(kp.publicKey),
          privateKey: ensure0x(kp.privateKey),
        });
        break;
      }

      case "CREATE_EIP712": {
        if (!instance) throw new Error("Not initialized");
        const { publicKey, contractAddresses, startTimestamp, durationDays } = request.payload;
        const eip712 = instance.createEIP712(
          remove0x(publicKey),
          contractAddresses,
          startTimestamp,
          durationDays,
        );
        send(id, type, {
          domain: {
            name: eip712.domain.name,
            version: eip712.domain.version,
            chainId: Number(eip712.domain.chainId),
            verifyingContract: eip712.domain.verifyingContract,
          },
          types: {
            UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification.map(
              (f) => ({
                name: f.name,
                type: f.type,
              }),
            ),
          },
          message: {
            publicKey: ensure0x(eip712.message.publicKey),
            contractAddresses: [...eip712.message.contractAddresses],
            startTimestamp: BigInt(eip712.message.startTimestamp),
            durationDays: BigInt(eip712.message.durationDays),
            extraData: ensure0x(eip712.message.extraData),
          },
        });
        break;
      }

      case "CREATE_DELEGATED_EIP712": {
        if (!instance) throw new Error("Not initialized");
        const {
          publicKey: pk,
          contractAddresses: ca,
          delegatorAddress,
          startTimestamp: st,
          durationDays: dd,
        } = request.payload;
        send(
          id,
          type,
          instance.createDelegatedUserDecryptEIP712(remove0x(pk), ca, delegatorAddress, st, dd),
        );
        break;
      }

      case "GET_PUBLIC_KEY":
        send(id, type, {
          result: {
            publicKeyId: "mock-public-key-id",
            publicKey: new Uint8Array([1, 2, 3, 4]),
          },
        });
        break;

      case "GET_PUBLIC_PARAMS":
        send(id, type, {
          result: {
            publicParamsId: "mock-public-params-id",
            publicParams: new Uint8Array([5, 6, 7, 8]),
          },
        });
        break;

      default:
        sendError(id, type, `Unknown request type: ${type}`);
    }
  } catch (error) {
    sendError(id, type, error instanceof Error ? error.message : String(error));
  }
}

port.on("message", (request) => {
  handleMessage(request).catch((err) => sendError(request.id, request.type, err.message));
});
