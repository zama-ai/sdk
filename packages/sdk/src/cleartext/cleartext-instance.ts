import {
  createPublicClient,
  custom,
  EIP1193Provider,
  hexToBigInt,
  http,
  parseAbi,
  toHex,
  type Hex,
  type PublicClient,
} from "viem";
import type {
  Address,
  ClearValueType,
  EncryptInput,
  EncryptParams,
  EncryptResult,
  FhevmInstance,
  HandleContractPair,
  InputProofBytesType,
  KeypairType,
  KmsDelegatedUserDecryptEIP712Type,
  KmsUserDecryptEIP712Type,
  PublicDecryptResult,
  ZKProofLike,
} from "../relayer/relayer-sdk.types";
import { ConfigurationError, EncryptionFailedError, NotSupportedError } from "../token/errors";
import { convertToBigIntRecord } from "../utils/convert";
import {
  cleartextDelegatedUserDecrypt,
  cleartextPublicDecrypt,
  cleartextUserDecrypt,
  type CleartextACL,
  type DecryptionSigningContext,
} from "./cleartext-user-decrypt";
import { CleartextExecutor } from "./cleartext-executor";
import { createCleartextEncryptedInput } from "./cleartext-encrypted-input";
import { KEYPAIR_PRIVATE_KEY_BYTES, KEYPAIR_PUBLIC_KEY_BYTES, MOCK_KEY_BYTES } from "./constants";
import { DELEGATED_USER_DECRYPT_EIP712, USER_DECRYPT_EIP712 } from "./eip712";
import type { CleartextInstanceConfig } from "./types";

const ACL_ABI = parseAbi([
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
]);

/** EIP-712 Domain type entries for structured data signing. */
const EIP712_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

/** Validate that a private key is a well-formed 0x-prefixed 32-byte hex string. */
function validatePrivateKey(key: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new TypeError(
      `Invalid private key: expected 0x-prefixed 32-byte hex string, got "${key.slice(0, 10)}..."`,
    );
  }
  return key as Hex;
}

/** Resolve a network config value into a viem PublicClient. */
function resolveClient(network: EIP1193Provider | string): PublicClient {
  if (typeof network === "string") {
    return createPublicClient({ transport: http(network) });
  }
  return createPublicClient({ transport: custom(network) });
}

/**
 * Normalize a handle hex string to zero-padded 32 bytes.
 * Ensures consistent key format in result records regardless of input format.
 */
function normalizeHandle(handle: string): Hex {
  return toHex(hexToBigInt(handle as Hex), { size: 32 });
}

/**
 * Chain IDs where cleartext mode must never be used (values are stored in plaintext).
 * Hoodi (560048) is intentionally NOT listed here — it is a cleartext-enabled
 * development testnet with a CleartextFHEVMExecutor contract deployed.
 */
const FORBIDDEN_CHAIN_IDS = new Set([1, 11155111]); // Mainnet, Sepolia

/**
 * Cleartext instance interface extending {@link FhevmInstance}.
 *
 * Method signatures intentionally differ from the base `FhevmInstance`
 * (async wrappers, params-object style) so that `RelayerCleartext` can
 * delegate uniformly. The implementation is assigned via type assertion.
 */
export interface CleartextInstance extends Omit<FhevmInstance, "config"> {
  encrypt(params: EncryptParams): Promise<EncryptResult>;
  terminate(): void;
}

/**
 * Create a cleartext FHEVM instance — the main entry point for cleartext mode.
 *
 * This factory wires together all cleartext components (executor, ACL, input
 * builder, decrypt functions) and returns an object that implements the
 * {@link RelayerSDK} interface. This makes it a drop-in replacement during
 * local development and testing.
 *
 * @example
 * ```ts
 * import { createCleartextInstance } from "@zama-fhe/sdk/cleartext";
 * import { HardhatConfig } from "@zama-fhe/sdk/relayer";
 *
 * const instance = await createCleartextInstance(HardhatConfig);
 * const { handles, inputProof } = await instance.encrypt({
 *   contractAddress: "0x...",
 *   userAddress: "0x...",
 *   values: [{ type: "euint64", value: 42n }],
 * });
 * ```
 */
export function createCleartextInstance(config: CleartextInstanceConfig): CleartextInstance {
  if (FORBIDDEN_CHAIN_IDS.has(config.chainId)) {
    throw new ConfigurationError(
      `Cleartext mode is not allowed on chain ${config.chainId}. ` +
        `Cleartext stores values in plaintext — use RelayerWeb or RelayerNode for fhevm networks.`,
    );
  }

  const client = resolveClient(config.network);
  const { aclContractAddress, chainId, cleartextExecutorAddress } = config;
  const coprocessorPrivateKey = validatePrivateKey(config.coprocessorSignerPrivateKey);
  const kmsPrivateKey = validatePrivateKey(config.kmsSignerPrivateKey);

  const decryptionSigningCtx: DecryptionSigningContext = {
    privateKey: kmsPrivateKey,
    gatewayChainId: config.gatewayChainId,
    verifyingContract: config.verifyingContractAddressDecryption,
  };

  const executor = new CleartextExecutor({
    executorAddress: cleartextExecutorAddress as Hex,
    client,
  });

  const acl: CleartextACL = {
    isAllowedForDecryption: (handle) =>
      client.readContract({
        address: aclContractAddress as Hex,
        abi: ACL_ABI,
        functionName: "isAllowedForDecryption",
        args: [handle as Hex],
      }),
    persistAllowed: (handle, account) =>
      client.readContract({
        address: aclContractAddress as Hex,
        abi: ACL_ABI,
        functionName: "persistAllowed",
        args: [handle as Hex, account as Hex],
      }),
    isHandleDelegatedForUserDecryption: (delegator, delegate, contractAddress, handle) =>
      client.readContract({
        address: aclContractAddress as Hex,
        abi: ACL_ABI,
        functionName: "isHandleDelegatedForUserDecryption",
        args: [delegator as Hex, delegate as Hex, contractAddress as Hex, handle as Hex],
      }),
  };

  // Cast needed: CleartextInstance extends FhevmInstance (sync, positional args)
  // but we implement async wrappers with params objects for RelayerCleartext delegation.
  const instance: CleartextInstance = {
    createEncryptedInput(contractAddress: string, userAddress: string) {
      return createCleartextEncryptedInput({
        aclContractAddress,
        chainId,
        contractAddress,
        userAddress,
        signingContext: {
          signingKey: coprocessorPrivateKey,
          gatewayChainId: config.gatewayChainId,
          verifyingContract: config.verifyingContractAddressInputVerification,
          contractAddress,
          userAddress,
          contractChainId: chainId,
        },
      });
    },

    async encrypt(params: EncryptParams): Promise<EncryptResult> {
      const input = instance.createEncryptedInput(params.contractAddress, params.userAddress);
      for (const entry of params.values) {
        const { value, type } = entry as EncryptInput;
        if (type === "ebool") {
          input.addBool(value);
        } else if (type === "eaddress") {
          input.addAddress(String(value));
        } else {
          const n = typeof value === "boolean" ? BigInt(value) : value;
          switch (type) {
            case "euint8":
              input.add8(n);
              break;
            case "euint16":
              input.add16(n);
              break;
            case "euint32":
              input.add32(n);
              break;
            case "euint64":
              input.add64(n);
              break;
            case "euint128":
              input.add128(n);
              break;
            case "euint256":
              input.add256(n);
              break;
            default:
              throw new EncryptionFailedError(`Unsupported FHE type: ${type as string}`);
          }
        }
      }
      return input.encrypt();
    },

    async requestZKProofVerification(_zkProof: ZKProofLike): Promise<InputProofBytesType> {
      throw new NotSupportedError(
        "requestZKProofVerification is not supported in cleartext mode. Use encrypt() instead.",
      );
    },

    generateKeypair(): KeypairType<string> {
      const pub = crypto.getRandomValues(new Uint8Array(KEYPAIR_PUBLIC_KEY_BYTES));
      const priv = crypto.getRandomValues(new Uint8Array(KEYPAIR_PRIVATE_KEY_BYTES));
      return { publicKey: toHex(pub), privateKey: toHex(priv) };
    },

    createEIP712(
      publicKey: string,
      contractAddresses: string[],
      startTimestamp: number,
      durationDays: number,
    ): KmsUserDecryptEIP712Type {
      return {
        domain: {
          name: "Decryption",
          version: "1",
          chainId: BigInt(config.chainId),
          verifyingContract: config.verifyingContractAddressDecryption as Address,
        },
        types: {
          EIP712Domain: EIP712_DOMAIN_TYPE,
          UserDecryptRequestVerification: [
            ...USER_DECRYPT_EIP712.types.UserDecryptRequestVerification,
          ],
        },
        primaryType: "UserDecryptRequestVerification",
        message: {
          publicKey,
          contractAddresses,
          startTimestamp: BigInt(startTimestamp),
          durationDays: BigInt(durationDays),
          extraData: "0x00",
        },
      } as unknown as KmsUserDecryptEIP712Type;
    },

    createDelegatedUserDecryptEIP712(
      publicKey: string,
      contractAddresses: Address[],
      delegatorAddress: string,
      startTimestamp: number,
      durationDays: number = 7,
    ): KmsDelegatedUserDecryptEIP712Type {
      return {
        domain: {
          name: "Decryption",
          version: "1",
          chainId: BigInt(config.chainId),
          verifyingContract: config.verifyingContractAddressDecryption,
        },
        types: {
          EIP712Domain: EIP712_DOMAIN_TYPE,
          DelegatedUserDecryptRequestVerification: [
            ...DELEGATED_USER_DECRYPT_EIP712.types.DelegatedUserDecryptRequestVerification,
          ],
        },
        primaryType: "DelegatedUserDecryptRequestVerification",
        message: {
          publicKey,
          contractAddresses,
          delegatorAddress,
          startTimestamp: BigInt(startTimestamp),
          durationDays: BigInt(durationDays),
          extraData: "0x00",
        },
      } as unknown as KmsDelegatedUserDecryptEIP712Type;
    },

    async publicDecrypt(handles: string[]): Promise<PublicDecryptResult> {
      const normalized = handles.map(normalizeHandle);
      const result = await cleartextPublicDecrypt(normalized, executor, acl, decryptionSigningCtx);
      return {
        clearValues: convertToBigIntRecord(result.clearValues),
        abiEncodedClearValues: result.abiEncodedClearValues as Hex,
        decryptionProof: result.decryptionProof as Hex,
      };
    },

    async userDecrypt(
      handleContractPairs: HandleContractPair[],
      _privateKey: string,
      _publicKey: string,
      _signature: string,
      _contractAddresses: string[],
      userAddress: string,
      _startTimestamp: number,
      _durationDays: number,
    ): Promise<Record<string, ClearValueType>> {
      return cleartextUserDecrypt(handleContractPairs, userAddress, executor, acl);
    },

    async delegatedUserDecrypt(
      handleContractPairs: HandleContractPair[],
      _privateKey: string,
      _publicKey: string,
      _signature: string,
      _contractAddresses: string[],
      delegatorAddress: string,
      delegateAddress: string,
      _startTimestamp: number,
      _durationDays: number,
    ): Promise<Record<string, ClearValueType>> {
      return cleartextDelegatedUserDecrypt(
        handleContractPairs,
        delegatorAddress,
        delegateAddress,
        executor,
        acl,
      );
    },

    getPublicKey() {
      return { publicKeyId: "mock-public-key-id", publicKey: new Uint8Array(MOCK_KEY_BYTES) };
    },

    getPublicParams(_bits?: number) {
      return {
        publicParamsId: "mock-public-params-id",
        publicParams: new Uint8Array(MOCK_KEY_BYTES),
      };
    },

    terminate() {
      // No resources to release in cleartext mode.
    },
  };

  return instance;
}
