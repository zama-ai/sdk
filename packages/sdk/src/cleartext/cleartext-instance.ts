import {
  BrowserProvider,
  Contract,
  hexlify,
  JsonRpcProvider,
  randomBytes,
  type Eip1193Provider,
  type Provider,
} from "ethers";
import {
  cleartextPublicDecrypt,
  cleartextUserDecrypt,
  type CleartextACL,
} from "./cleartext-decrypt";
import { CleartextExecutor } from "./cleartext-executor";
import { createCleartextEncryptedInput } from "./cleartext-input";
import type { CleartextInstanceConfig } from "./types";

const ACL_ABI = [
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
] as const;

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
export async function createCleartextInstance(config: CleartextInstanceConfig) {
  const provider = resolveProvider(config.network);
  const { aclContractAddress, chainId, cleartextExecutorAddress } = config;

  const executor = new CleartextExecutor({
    executorAddress: cleartextExecutorAddress,
    provider,
  });
  const aclContract = new Contract(aclContractAddress, ACL_ABI, provider);
  const isAllowedForDecryption = aclContract.getFunction("isAllowedForDecryption");
  const persistAllowed = aclContract.getFunction("persistAllowed");
  const acl: CleartextACL = {
    isAllowedForDecryption: (handle) => isAllowedForDecryption(handle),
    persistAllowed: (handle, account) => persistAllowed(handle, account),
  };

  return {
    /** Create a fluent builder for packing typed values into encrypted handles. */
    createEncryptedInput(contractAddress: string, userAddress: string) {
      return createCleartextEncryptedInput({
        aclContractAddress,
        chainId,
        contractAddress,
        userAddress,
      });
    },

    /** Not supported in cleartext mode — always throws. Use `createEncryptedInput().encrypt()`. */
    async requestZKProofVerification(): Promise<never> {
      throw new Error(
        "requestZKProofVerification is not supported in cleartext mode. Use createEncryptedInput().encrypt() instead.",
      );
    },

    /** Generate a random (non-FHE) keypair for signature flows. */
    generateKeypair() {
      return {
        publicKey: hexlify(randomBytes(800)),
        privateKey: hexlify(randomBytes(1632)),
      };
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
          name: "KMSVerifier",
          version: "1",
          chainId: BigInt(config.gatewayChainId),
          verifyingContract: config.verifyingContractAddressDecryption,
        },
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
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
          name: "KMSVerifier",
          version: "1",
          chainId: BigInt(config.gatewayChainId),
          verifyingContract: config.verifyingContractAddressDecryption,
        },
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
          ],
          DelegatedUserDecryptRequestVerification: [
            { name: "publicKey", type: "bytes" },
            { name: "contractAddresses", type: "address[]" },
            { name: "delegatorAddress", type: "address" },
            { name: "startTimestamp", type: "uint256" },
            { name: "durationDays", type: "uint256" },
            { name: "extraData", type: "bytes" },
          ],
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

    /** Decrypt handles marked for public decryption. Checks ACL permissions first. */
    async publicDecrypt(handles: (string | Uint8Array)[]) {
      return cleartextPublicDecrypt(handles, executor, acl);
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

    /** Decrypt handles on behalf of a delegator. Same ACL checks as userDecrypt. */
    async delegatedUserDecrypt(
      handleContractPairs: { handle: string | Uint8Array; contractAddress: string }[],
      _privateKey: string,
      _publicKey: string,
      _signature: string,
      _contractAddresses: string[],
      delegatorAddress: string,
      _delegateAddress: string,
      _startTimestamp: number,
      _durationDays: number,
    ) {
      return cleartextUserDecrypt(handleContractPairs, delegatorAddress, executor, acl);
    },

    /** Always `null` — no real FHE public key in cleartext mode. */
    getPublicKey() {
      return null;
    },
    /** Always `null` — no real FHE public params in cleartext mode. */
    getPublicParams() {
      return null;
    },
  };
}
