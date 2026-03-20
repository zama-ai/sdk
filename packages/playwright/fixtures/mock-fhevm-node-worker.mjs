/**
 * Mock Node.js worker using @fhevm/mock-utils.
 *
 * Uses MockFhevmInstance + MockCoprocessor to handle the full FHE lifecycle:
 * encrypt → on-chain input proof → decrypt. The custom RPC methods
 * (fhevm_relayer_v1_input_proof, fhevm_getClearText, etc.) are intercepted
 * in the provider's send function, matching what @fhevm/hardhat-plugin does.
 */
import { parentPort } from "node:worker_threads";
import { ethers } from "ethers";
import {
  MockFhevmInstance,
  MockCoprocessor,
  FhevmMockProvider,
  FhevmMockProviderType,
  FhevmDBMap,
  FhevmHandle,
  constants,
  relayer,
  utils,
} from "@fhevm/mock-utils";

if (!parentPort) {
  throw new Error("This script must be run as a worker thread");
}

const port = parentPort;

/** @type {MockFhevmInstance | null} */
let instance = null;
/** @type {MockCoprocessor | null} */
let coprocessor = null;
/** @type {number} */
let chainId = 0;
/** @type {string} */
let aclAddress = "";
/** @type {string} */
let gatewayDecryptionAddress = "";

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
        chainId = fhevmConfig.chainId;
        aclAddress = fhevmConfig.aclContractAddress;
        gatewayDecryptionAddress = fhevmConfig.verifyingContractAddressDecryption;

        const ethersProvider = new ethers.JsonRpcProvider(fhevmConfig.network);

        // Create coprocessor signer from the same key used in deploy-local.sh
        const coprocessorSignerWallet = new ethers.Wallet(
          "0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901",
          ethersProvider,
        );

        // Create MockCoprocessor with initialized DB
        const db = new FhevmDBMap();
        const blockNumber = await ethersProvider.getBlockNumber();
        db.init(blockNumber);

        // CleartextFHEVMExecutor address — hardcoded for hardhat local deployment
        const executorAddress = "0xe3a9105a3a932253A70F126eb1E3b589C643dD24";
        coprocessor = await MockCoprocessor.create(ethersProvider, {
          coprocessorContractAddress: executorAddress,
          coprocessorSigners: [coprocessorSignerWallet],
          inputVerifierContractAddress: fhevmConfig.inputVerifierContractAddress,
          db,
        });

        // Create provider that intercepts fhevm_* RPC calls
        const minimalProvider = {
          send: async (method, params) => {
            // Handle fhevm-specific RPC methods
            switch (method) {
              case relayer.RELAYER_V1_INPUT_PROOF: {
                const payload = params[0];
                relayer.assertIsMockRelayerV1InputProofPayload(payload);
                const contractChainId = utils.toUIntNumber(
                  payload.contractChainId,
                  "contractChainId",
                );

                const handlesBytes32List = FhevmHandle.computeHandles(
                  ethers.getBytes(payload.ciphertextWithInputVerification),
                  payload.mockData.fhevmTypes,
                  payload.mockData.aclContractAddress,
                  contractChainId,
                  constants.FHEVM_HANDLE_VERSION,
                );

                const response = await coprocessor.computeCoprocessorSignatures(
                  handlesBytes32List,
                  contractChainId,
                  payload.contractAddress,
                  payload.userAddress,
                  payload.extraData,
                );

                // Insert cleartext values into mock DB
                for (let i = 0; i < response.handles.length; i++) {
                  await coprocessor.insertHandleBytes32(
                    utils.ensurePrefix(response.handles[i], "0x"),
                    payload.mockData.clearTextValuesBigIntHex[i],
                    payload.mockData.metadatas[i],
                  );
                }

                return response;
              }

              case relayer.FHEVM_GET_CLEAR_TEXT: {
                // Read plaintexts directly from CleartextFHEVMExecutor on-chain
                const handleList = params[0];
                const executorContract = new ethers.Contract(
                  executorAddress,
                  ["function plaintexts(bytes32 handle) view returns (uint256)"],
                  ethersProvider,
                );
                const results = await Promise.all(
                  handleList.map(async (h) => {
                    const hex = utils.ensurePrefix(h, "0x");
                    const val = await executorContract.plaintexts(hex);
                    return ethers.toBeHex(val, 32);
                  }),
                );
                return results;
              }

              case relayer.RELAYER_V1_USER_DECRYPT:
              case relayer.RELAYER_V1_DELEGATED_USER_DECRYPT: {
                // Read plaintexts from on-chain executor
                const payload = params[0];
                const handleBytes32HexList = payload.handleContractPairs.map((h) =>
                  ethers.toBeHex(ethers.toBigInt(h.handle), 32),
                );
                const executorForDecrypt = new ethers.Contract(
                  executorAddress,
                  ["function plaintexts(bytes32 handle) view returns (uint256)"],
                  ethersProvider,
                );
                const clearTextHexList = await Promise.all(
                  handleBytes32HexList.map(async (h) => {
                    const val = await executorForDecrypt.plaintexts(h);
                    return ethers.toBeHex(val, 32);
                  }),
                );
                return {
                  payload: { decrypted_values: clearTextHexList },
                  signature: ethers.ZeroHash,
                };
              }

              case relayer.RELAYER_V1_PUBLIC_DECRYPT: {
                const payload = params[0];
                const executorForPD = new ethers.Contract(
                  executorAddress,
                  ["function plaintexts(bytes32 handle) view returns (uint256)"],
                  ethersProvider,
                );
                const clearValues = await Promise.all(
                  payload.ciphertextHandles.map(async (h) => {
                    const val = await executorForPD.plaintexts(h);
                    return ethers.toBeHex(val, 32);
                  }),
                );
                return {
                  decrypted_value: clearValues[0] ?? "0x",
                  signatures: ["0x" + "00".repeat(65)],
                };
              }

              default:
                // Forward to real anvil RPC
                return ethersProvider.send(method, params ?? []);
            }
          },
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

      case "ENCRYPT": {
        if (!instance) throw new Error("Not initialized");
        const { values, contractAddress, userAddress } = request.payload;
        const input = instance.createEncryptedInput(contractAddress, userAddress);
        for (const entry of values) {
          switch (entry.type) {
            case "ebool":
              input.addBool(typeof entry.value === "boolean" ? entry.value : entry.value !== 0n);
              break;
            case "euint8":
              input.add8(typeof entry.value === "boolean" ? (entry.value ? 1n : 0n) : entry.value);
              break;
            case "euint16":
              input.add16(typeof entry.value === "boolean" ? (entry.value ? 1n : 0n) : entry.value);
              break;
            case "euint32":
              input.add32(typeof entry.value === "boolean" ? (entry.value ? 1n : 0n) : entry.value);
              break;
            case "euint64":
              input.add64(typeof entry.value === "boolean" ? (entry.value ? 1n : 0n) : entry.value);
              break;
            case "euint128":
              input.add128(
                typeof entry.value === "boolean" ? (entry.value ? 1n : 0n) : entry.value,
              );
              break;
            case "euint256":
              input.add256(
                typeof entry.value === "boolean" ? (entry.value ? 1n : 0n) : entry.value,
              );
              break;
            case "eaddress":
              input.addAddress(String(entry.value));
              break;
            default:
              throw new Error(`Unsupported FHE type: ${entry.type}`);
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
        if (!instance) throw new Error("Not initialized");
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
        if (!instance) throw new Error("Not initialized");
        await coprocessor.awaitCoprocessor();
        const pdResult = await instance.publicDecrypt(request.payload.handles);
        send(id, type, pdResult);
        break;
      }

      case "DELEGATED_USER_DECRYPT": {
        if (!instance) throw new Error("Not initialized");
        await coprocessor.awaitCoprocessor();
        const dp = request.payload;
        const dpPairs = dp.handles.map((handle) => ({
          handle,
          contractAddress: dp.contractAddress,
        }));
        const dudResult = await instance.delegatedUserDecrypt(
          dpPairs,
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

      case "REQUEST_ZK_PROOF_VERIFICATION":
        throw new Error("Not implemented in mock worker");

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
