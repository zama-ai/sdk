import {
  Contract,
  JsonRpcProvider,
  randomBytes,
  hexlify,
  type Provider,
  type Eip1193Provider,
} from "ethers";
import type { CleartextInstanceConfig } from "./types";
import { CleartextExecutor } from "./cleartext-executor";
import { createCleartextEncryptedInput } from "./cleartext-input";
import {
  cleartextPublicDecrypt,
  cleartextUserDecrypt,
  type CleartextACL,
} from "./cleartext-decrypt";

const ACL_ABI = [
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
];

function resolveProvider(network: Eip1193Provider | string): Provider {
  if (typeof network === "string") {
    return new JsonRpcProvider(network);
  }
  return new JsonRpcProvider(network as unknown as string);
}

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
    createEncryptedInput(contractAddress: string, userAddress: string) {
      return createCleartextEncryptedInput({
        aclContractAddress,
        chainId,
        contractAddress,
        userAddress,
      });
    },

    async requestZKProofVerification(): Promise<never> {
      throw new Error(
        "requestZKProofVerification is not supported in cleartext mode. Use createEncryptedInput().encrypt() instead.",
      );
    },

    generateKeypair() {
      return {
        publicKey: hexlify(randomBytes(800)),
        privateKey: hexlify(randomBytes(1632)),
      };
    },

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

    async publicDecrypt(handles: (string | Uint8Array)[]) {
      return cleartextPublicDecrypt(handles, executor, acl);
    },

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

    getPublicKey() {
      return null;
    },
    getPublicParams() {
      return null;
    },
  };
}
