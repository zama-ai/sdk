import {
  BrowserProvider,
  Interface,
  hexlify,
  JsonRpcProvider,
  SigningKey,
  zeroPadValue,
  type Eip1193Provider,
  type Provider,
} from "ethers";
import { ConfigurationError, EncryptionFailedError, NotSupportedError } from "../token/errors";
import {
  cleartextPublicDecrypt,
  cleartextUserDecrypt,
  cleartextDelegatedUserDecrypt,
  type CleartextACL,
  type DecryptionSigningContext,
} from "./cleartext-decrypt";
import { CleartextExecutor } from "./cleartext-executor";
import { createCleartextEncryptedInput, type CleartextEncryptedInput } from "./cleartext-input";
import { KEYPAIR_PRIVATE_KEY_BYTES, KEYPAIR_PUBLIC_KEY_BYTES, MOCK_KEY_BYTES } from "./constants";
import { USER_DECRYPT_EIP712, DELEGATED_USER_DECRYPT_EIP712 } from "./eip712";
import type { CleartextInstanceConfig } from "./types";
import type { RelayerSDK } from "../relayer/relayer-sdk";
import type {
  Address,
  DecryptedValue,
  DelegatedUserDecryptParams,
  EIP712TypedData,
  EncryptInput,
  EncryptParams,
  EncryptResult,
  FHEKeypair,
  InputProofBytesType,
  KmsDelegatedUserDecryptEIP712Type,
  PublicDecryptResult,
  UserDecryptParams,
  ZKProofLike,
} from "../relayer/relayer-sdk.types";

const ACL_ABI = [
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
] as const;
const ACL_IFACE = new Interface(ACL_ABI);

/** EIP-712 Domain type entries for structured data signing. */
const EIP712_DOMAIN_TYPE = [
  { name: "name", type: "string" },
  { name: "version", type: "string" },
  { name: "chainId", type: "uint256" },
  { name: "verifyingContract", type: "address" },
];

/** Resolve a network config value into an ethers Provider. */
function resolveProvider(network: Eip1193Provider | string): Provider {
  if (typeof network === "string") {
    return new JsonRpcProvider(network);
  }
  return new BrowserProvider(network);
}

/**
 * Normalize a handle hex string to zero-padded 32 bytes.
 * Ensures consistent key format in result records regardless of input format.
 */
function normalizeHandle(handle: string): string {
  return zeroPadValue(handle, 32);
}

/**
 * Chain IDs where cleartext mode must never be used (values are stored in plaintext).
 * Hoodi (560048) is intentionally NOT listed here — it is a cleartext-enabled
 * development testnet with a CleartextFHEVMExecutor contract deployed.
 */
const FORBIDDEN_CHAIN_IDS = new Set([1, 11155111]); // Mainnet, Sepolia

/**
 * Extended RelayerSDK interface with the low-level `createEncryptedInput` builder.
 *
 * Implements the full {@link RelayerSDK} interface, plus exposes the fluent
 * encrypted input builder for advanced use cases.
 */
export interface CleartextInstance extends RelayerSDK {
  createEncryptedInput(contractAddress: string, userAddress: string): CleartextEncryptedInput;
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

  const provider = resolveProvider(config.network);
  const { aclContractAddress, chainId, cleartextExecutorAddress } = config;
  const coprocessorSigningKey = new SigningKey(config.coprocessorSignerPrivateKey);
  const kmsSigningKey = new SigningKey(config.kmsSignerPrivateKey);

  const decryptionSigningCtx: DecryptionSigningContext = {
    signingKey: kmsSigningKey,
    gatewayChainId: config.gatewayChainId,
    verifyingContract: config.verifyingContractAddressDecryption,
  };

  const executor = new CleartextExecutor({
    executorAddress: cleartextExecutorAddress,
    provider,
  });

  async function aclCall<T>(method: string, args: unknown[]): Promise<T> {
    const data = ACL_IFACE.encodeFunctionData(method, args);
    const result = await provider.call({ to: aclContractAddress, data });
    return ACL_IFACE.decodeFunctionResult(method, result)[0] as T;
  }

  const acl: CleartextACL = {
    isAllowedForDecryption: (handle) => aclCall<boolean>("isAllowedForDecryption", [handle]),
    persistAllowed: (handle, account) => aclCall<boolean>("persistAllowed", [handle, account]),
    isHandleDelegatedForUserDecryption: (delegator, delegate, contractAddress, handle) =>
      aclCall<boolean>("isHandleDelegatedForUserDecryption", [
        delegator,
        delegate,
        contractAddress,
        handle,
      ]),
  };

  const instance: CleartextInstance = {
    createEncryptedInput(contractAddress: string, userAddress: string) {
      return createCleartextEncryptedInput({
        aclContractAddress,
        chainId,
        contractAddress,
        userAddress,
        signingContext: {
          signingKey: coprocessorSigningKey,
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
            case "euint4":
              input.add4(n);
              break;
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

    async generateKeypair(): Promise<FHEKeypair> {
      const pub = crypto.getRandomValues(new Uint8Array(KEYPAIR_PUBLIC_KEY_BYTES));
      const priv = crypto.getRandomValues(new Uint8Array(KEYPAIR_PRIVATE_KEY_BYTES));
      return { publicKey: hexlify(pub), privateKey: hexlify(priv) };
    },

    async createEIP712(
      publicKey: string,
      contractAddresses: Address[],
      startTimestamp: number,
      durationDays: number = 7,
    ): Promise<EIP712TypedData> {
      const domain = {
        name: "Decryption",
        version: "1",
        chainId: config.gatewayChainId,
        verifyingContract: config.verifyingContractAddressDecryption as Address,
      };
      return {
        domain,
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
      };
    },

    async createDelegatedUserDecryptEIP712(
      publicKey: string,
      contractAddresses: Address[],
      delegatorAddress: string,
      startTimestamp: number,
      durationDays: number = 7,
    ): Promise<KmsDelegatedUserDecryptEIP712Type> {
      return {
        domain: {
          name: "Decryption",
          version: "1",
          chainId: config.gatewayChainId,
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
      // Convert to bigint-only (PublicDecryptResult.clearValues is Record<string, bigint>)
      const clearValues: Record<string, bigint> = {};
      for (const [h, v] of Object.entries(result.clearValues)) {
        clearValues[h] = typeof v === "boolean" ? (v ? 1n : 0n) : v;
      }
      return {
        clearValues,
        abiEncodedClearValues: result.abiEncodedClearValues,
        decryptionProof: result.decryptionProof as Address,
      };
    },

    async userDecrypt(params: UserDecryptParams): Promise<Record<string, DecryptedValue>> {
      const handleContractPairs = params.handles.map((h) => ({
        handle: normalizeHandle(h),
        contractAddress: params.contractAddress,
      }));
      return cleartextUserDecrypt(handleContractPairs, params.signerAddress, executor, acl);
    },

    async delegatedUserDecrypt(
      params: DelegatedUserDecryptParams,
    ): Promise<Record<string, DecryptedValue>> {
      const handleContractPairs = params.handles.map((h) => ({
        handle: normalizeHandle(h),
        contractAddress: params.contractAddress,
      }));
      return cleartextDelegatedUserDecrypt(
        handleContractPairs,
        params.delegatorAddress,
        params.delegateAddress,
        executor,
        acl,
      );
    },

    async getPublicKey() {
      return { publicKeyId: "mock-public-key-id", publicKey: new Uint8Array(MOCK_KEY_BYTES) };
    },

    async getPublicParams(_bits?: number) {
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
