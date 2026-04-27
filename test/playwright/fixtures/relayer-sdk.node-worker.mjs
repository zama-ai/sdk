/**
 * Mock Node.js worker using @fhevm/mock-utils MockFhevmInstance.
 *
 * Replaces the real WASM worker so RelayerNode works against local anvil
 * with proper handle generation, ACL verification, and decrypt support.
 *
 * Matches the multichain worker protocol: INIT receives chains[],
 * instances are created lazily per chainId.
 */
import { parentPort } from "node:worker_threads";
import { ethers } from "ethers";
import { MockFhevmInstance, FhevmMockProvider, FhevmMockProviderType } from "@fhevm/mock-utils";

if (!parentPort) {
  throw new Error("This script must be run as a worker thread");
}

const port = parentPort;

const configs = new Map();
const instances = new Map();
const pending = new Map();

async function createInstance(chainConfig) {
  const rpcUrl = chainConfig.network;
  const ethersProvider = new ethers.JsonRpcProvider(rpcUrl);
  const relayerProvider = await FhevmMockProvider.create(
    { send: (method, params) => ethersProvider.send(method, params ?? []) },
    ethersProvider,
    "anvil",
    FhevmMockProviderType.Anvil,
    chainConfig.id,
    rpcUrl,
  );
  const config = {
    chainId: chainConfig.id,
    gatewayChainId: chainConfig.gatewayChainId,
    aclContractAddress: chainConfig.aclContractAddress,
    kmsContractAddress: chainConfig.kmsContractAddress,
    inputVerifierContractAddress: chainConfig.inputVerifierContractAddress,
    verifyingContractAddressDecryption: chainConfig.verifyingContractAddressDecryption,
    verifyingContractAddressInputVerification:
      chainConfig.verifyingContractAddressInputVerification,
  };
  return MockFhevmInstance.create(relayerProvider, ethersProvider, config, {
    inputVerifierProperties: {},
    kmsVerifierProperties: {},
  });
}

async function getInstance(chainId) {
  let inst = instances.get(chainId);
  if (inst) {
    return inst;
  }
  let p = pending.get(chainId);
  if (p) {
    return p;
  }
  const config = configs.get(chainId);
  if (!config) {
    throw new Error(
      `No config for chain ${chainId}. Available: [${[...configs.keys()].join(", ")}]`,
    );
  }
  p = createInstance(config)
    .then((i) => {
      instances.set(chainId, i);
      pending.delete(chainId);
      return i;
    })
    .catch((err) => {
      pending.delete(chainId);
      throw err;
    });
  pending.set(chainId, p);
  return p;
}

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
      case "INIT": {
        const { chains } = request.payload;
        for (const chain of chains) {
          configs.set(chain.id, chain);
        }
        send(id, type, { initialized: true });
        break;
      }

      case "ADD_CHAIN": {
        const { config } = request.payload;
        configs.set(config.id, config);
        send(id, type, { added: true, chainId: config.id });
        break;
      }

      case "REMOVE_CHAIN": {
        const { chainId } = request.payload;
        configs.delete(chainId);
        instances.delete(chainId);
        pending.delete(chainId);
        send(id, type, { removed: true, chainId });
        break;
      }

      case "GENERATE_KEYPAIR": {
        const instance = await getInstance(request.payload.chainId);
        const kp = instance.generateKeypair();
        send(id, type, {
          publicKey: ensure0x(kp.publicKey),
          privateKey: ensure0x(kp.privateKey),
        });
        break;
      }

      case "CREATE_EIP712": {
        const instance = await getInstance(request.payload.chainId);
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

      case "ENCRYPT": {
        const instance = await getInstance(request.payload.chainId);
        const { values, contractAddress, userAddress } = request.payload;
        const input = instance.createEncryptedInput(contractAddress, userAddress);

        for (const entry of values) {
          const { value, type: fheType } = entry;
          switch (fheType) {
            case "ebool":
              input.addBool(typeof value === "boolean" ? value : value !== 0n);
              break;
            case "euint8":
              input.add8(typeof value === "boolean" ? (value ? 1n : 0n) : value);
              break;
            case "euint16":
              input.add16(typeof value === "boolean" ? (value ? 1n : 0n) : value);
              break;
            case "euint32":
              input.add32(typeof value === "boolean" ? (value ? 1n : 0n) : value);
              break;
            case "euint64":
              input.add64(typeof value === "boolean" ? (value ? 1n : 0n) : value);
              break;
            case "euint128":
              input.add128(typeof value === "boolean" ? (value ? 1n : 0n) : value);
              break;
            case "euint256":
              input.add256(typeof value === "boolean" ? (value ? 1n : 0n) : value);
              break;
            case "eaddress":
              input.addAddress(String(value));
              break;
            default:
              throw new Error(`Unsupported FHE type: ${fheType}`);
          }
        }

        const encrypted = await input.encrypt();
        send(id, type, {
          handles: encrypted.handles,
          inputProof: encrypted.inputProof,
        });
        break;
      }

      case "USER_DECRYPT": {
        const instance = await getInstance(request.payload.chainId);
        const p = request.payload;
        const handleContractPairs = p.handles.map((handle) => ({
          handle,
          contractAddress: p.contractAddress,
        }));
        const result = await instance.userDecrypt(
          handleContractPairs,
          remove0x(p.privateKey),
          remove0x(p.publicKey),
          p.signature,
          p.signedContractAddresses,
          p.signerAddress,
          p.startTimestamp,
          p.durationDays,
        );
        send(id, type, { clearValues: result });
        break;
      }

      case "PUBLIC_DECRYPT": {
        const instance = await getInstance(request.payload.chainId);
        const pdResult = await instance.publicDecrypt(request.payload.handles);
        send(id, type, pdResult);
        break;
      }

      case "DELEGATED_USER_DECRYPT": {
        const instance = await getInstance(request.payload.chainId);
        const dp = request.payload;
        const dpHandleContractPairs = dp.handles.map((handle) => ({
          handle,
          contractAddress: dp.contractAddress,
        }));
        const dudResult = await instance.delegatedUserDecrypt(
          dpHandleContractPairs,
          remove0x(dp.privateKey),
          remove0x(dp.publicKey),
          dp.signature,
          dp.signedContractAddresses,
          dp.delegatorAddress,
          dp.delegateAddress,
          dp.startTimestamp,
          dp.durationDays,
        );
        send(id, type, { clearValues: dudResult });
        break;
      }

      case "CREATE_DELEGATED_EIP712": {
        const instance = await getInstance(request.payload.chainId);
        const {
          publicKey: pk,
          contractAddresses: ca,
          delegatorAddress,
          startTimestamp: st,
          durationDays: dd,
        } = request.payload;
        const delResult = instance.createDelegatedUserDecryptEIP712(
          remove0x(pk),
          ca,
          delegatorAddress,
          st,
          dd,
        );
        send(id, type, delResult);
        break;
      }

      case "GET_PUBLIC_KEY": {
        send(id, type, {
          result: {
            publicKeyId: "mock-public-key-id",
            publicKey: new Uint8Array([1, 2, 3, 4]),
          },
        });
        break;
      }

      case "GET_PUBLIC_PARAMS": {
        send(id, type, {
          result: {
            publicParamsId: "mock-public-params-id",
            publicParams: new Uint8Array([5, 6, 7, 8]),
          },
        });
        break;
      }

      case "REQUEST_ZK_PROOF_VERIFICATION": {
        throw new Error("Not implemented in mock worker");
      }

      default:
        sendError(id, type, `Unknown request type: ${type}`);
    }
  } catch (error) {
    sendError(id, type, error instanceof Error ? error.message : String(error));
  }
}

port.on("message", (msg) => void handleMessage(msg));
