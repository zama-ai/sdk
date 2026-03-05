import {
  BrowserProvider,
  Interface,
  hexlify,
  JsonRpcProvider,
  SigningKey,
  type Eip1193Provider,
  type Provider,
} from "ethers";
import { ConfigurationError, NotSupportedError } from "../token/errors";
import {
  cleartextPublicDecrypt,
  cleartextUserDecrypt,
  cleartextDelegatedUserDecrypt,
  type CleartextACL,
  type DecryptionSigningContext,
} from "./cleartext-decrypt";
import { CleartextExecutor } from "./cleartext-executor";
import { createCleartextEncryptedInput } from "./cleartext-input";
import { KEYPAIR_PRIVATE_KEY_BYTES, KEYPAIR_PUBLIC_KEY_BYTES, MOCK_KEY_BYTES } from "./constants";
import type { CleartextInstanceConfig } from "./types";

const ACL_ABI = [
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) view returns (bool)",
] as const;
const ACL_IFACE = new Interface(ACL_ABI);

/** Resolve a network config value into an ethers Provider. */
function resolveProvider(network: Eip1193Provider | string): Provider {
  if (typeof network === "string") {
    return new JsonRpcProvider(network);
  }
  return new BrowserProvider(network);
}

/**
 * Create a cleartext FHEVM instance — the main entry point for cleartext mode.
 *
 * This factory wires together all cleartext components (executor, ACL, input
 * builder, decrypt functions) and returns an object whose API mirrors the
 * production `FhevmInstance` from `@zama-fhe/relayer-sdk`. This makes it
 * a drop-in replacement during local development and testing.
 *
 * The returned instance provides:
 * - **createEncryptedInput** — fluent builder for packing typed values into handles
 * - **publicDecrypt / userDecrypt / delegatedUserDecrypt** — ACL-checked decryption
 * - **generateKeypair** — random keypair (no real FHE keys)
 * - **createEIP712 / createDelegatedUserDecryptEIP712** — EIP-712 typed data for signing
 * - **getPublicKey / getPublicParams** — always `null` (no real FHE parameters)
 * - **requestZKProofVerification** — always throws (use `encrypt()` instead)
 *
 * @example
 * ```ts
 * import { createCleartextInstance } from "@zama-fhe/sdk/cleartext";
 * import { HardhatConfig } from "@zama-fhe/sdk/relayer";
 *
 * const instance = await createCleartextInstance(HardhatConfig);
 * const input = instance.createEncryptedInput(contractAddr, userAddr);
 * input.add64(42n);
 * const { handles, inputProof } = await input.encrypt();
 * ```
 */
/**
 * Chain IDs where cleartext mode must never be used (values are stored in plaintext).
 * Hoodi (560048) is intentionally NOT listed here — it is a cleartext-enabled
 * development testnet with a CleartextFHEVMExecutor contract deployed.
 */
const FORBIDDEN_CHAIN_IDS = new Set([1, 11155111]); // Mainnet, Sepolia

export function createCleartextInstance(config: CleartextInstanceConfig) {
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

  return {
    /** Create a fluent builder for packing typed values into encrypted handles. */
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

    /** Not supported in cleartext mode — always throws. Use `createEncryptedInput().encrypt()`. */
    async requestZKProofVerification(): Promise<never> {
      throw new NotSupportedError(
        "requestZKProofVerification is not supported in cleartext mode. Use createEncryptedInput().encrypt() instead.",
      );
    },

    /** Generate a random (non-FHE) keypair for signature flows. */
    generateKeypair() {
      const pub = crypto.getRandomValues(new Uint8Array(KEYPAIR_PUBLIC_KEY_BYTES));
      const priv = crypto.getRandomValues(new Uint8Array(KEYPAIR_PRIVATE_KEY_BYTES));
      return { publicKey: hexlify(pub), privateKey: hexlify(priv) };
    },

    /** Build EIP-712 typed data for a user decrypt request signature. */
    createEIP712(
      publicKey: string,
      contractAddresses: string[],
      startTimestamp: number,
      durationDays: number,
    ) {
      return {
        domain: {
          name: "Decryption" as const,
          version: "1" as const,
          chainId: BigInt(config.gatewayChainId),
          verifyingContract: config.verifyingContractAddressDecryption,
        },
        primaryType: "UserDecryptRequestVerification" as const,
        types: {
          UserDecryptRequestVerification: [
            { name: "publicKey", type: "bytes" },
            { name: "contractAddresses", type: "address[]" },
            { name: "startTimestamp", type: "uint256" },
            { name: "durationDays", type: "uint256" },
            { name: "extraData", type: "bytes" },
          ],
        },
        message: {
          publicKey,
          contractAddresses,
          startTimestamp: BigInt(startTimestamp),
          durationDays: BigInt(durationDays),
          extraData: "0x00",
        },
      };
    },

    /** Build EIP-712 typed data for a delegated user decrypt request signature. */
    createDelegatedUserDecryptEIP712(
      publicKey: string,
      contractAddresses: string[],
      delegatorAddress: string,
      startTimestamp: number,
      durationDays: number,
    ) {
      return {
        domain: {
          name: "Decryption" as const,
          version: "1" as const,
          chainId: BigInt(config.gatewayChainId),
          verifyingContract: config.verifyingContractAddressDecryption,
        },
        primaryType: "DelegatedUserDecryptRequestVerification" as const,
        types: {
          DelegatedUserDecryptRequestVerification: [
            { name: "publicKey", type: "bytes" },
            { name: "contractAddresses", type: "address[]" },
            { name: "delegatorAddress", type: "address" },
            { name: "startTimestamp", type: "uint256" },
            { name: "durationDays", type: "uint256" },
            { name: "extraData", type: "bytes" },
          ] as const,
        },
        message: {
          publicKey,
          contractAddresses,
          delegatorAddress,
          startTimestamp: BigInt(startTimestamp),
          durationDays: BigInt(durationDays),
          extraData: "0x00",
        },
      };
    },

    /** Decrypt handles marked for public decryption. Checks ACL permissions and reads plaintexts in parallel. */
    async publicDecrypt(handles: (string | Uint8Array)[]) {
      return cleartextPublicDecrypt(handles, executor, acl, decryptionSigningCtx);
    },

    /** Decrypt handles for a specific user. Verifies user + contract ACL permissions. */
    async userDecrypt(
      handles: { handle: string | Uint8Array; contractAddress: string }[],
      _privateKey: string,
      _publicKey: string,
      _signature: string,
      _contractAddresses: string[],
      userAddress: string,
      _startTimestamp: number,
      _durationDays: number,
    ) {
      return cleartextUserDecrypt(handles, userAddress, executor, acl);
    },

    /**
     * Decrypt handles on behalf of a delegator. ACL checks use the delegation
     * check (`isHandleDelegatedForUserDecryption`) to verify that the delegator
     * has granted the delegate access to each handle.
     */
    async delegatedUserDecrypt(
      handleContractPairs: { handle: string | Uint8Array; contractAddress: string }[],
      _privateKey: string,
      _publicKey: string,
      _signature: string,
      _contractAddresses: string[],
      delegatorAddress: string,
      delegateAddress: string,
      _startTimestamp: number,
      _durationDays: number,
    ) {
      return cleartextDelegatedUserDecrypt(
        handleContractPairs,
        delegatorAddress,
        delegateAddress,
        executor,
        acl,
      );
    },

    /** Returns mock public key data in cleartext mode. */
    getPublicKey() {
      return { publicKeyId: "mock-public-key-id", publicKey: new Uint8Array(MOCK_KEY_BYTES) };
    },

    /** Returns mock public params data in cleartext mode. */
    getPublicParams() {
      return {
        publicParamsId: "mock-public-params-id",
        publicParams: new Uint8Array(MOCK_KEY_BYTES),
      };
    },
  };
}
