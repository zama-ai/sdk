import { ethers } from "ethers";
import { CLEARTEXT_EXECUTOR_BYTECODE } from "./bytecode";
import { MOCK_KMS_SIGNER_PK } from "./constants";
import { KMS_DECRYPTION_EIP712, USER_DECRYPT_EIP712 } from "./eip712";
import { CleartextEncryptedInput } from "./encrypted-input";
import type { CleartextMockConfig } from "./types";

const EIP1967_IMPLEMENTATION_SLOT =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

export const ACL_ABI = [
  "function persistAllowed(bytes32 handle, address account) view returns (bool)",
  "function isAllowedForDecryption(bytes32 handle) view returns (bool)",
] as const;

export const EXECUTOR_ABI = ["function plaintexts(bytes32 handle) view returns (uint256)"] as const;

const ACL_INTERFACE = new ethers.Interface(ACL_ABI);
const EXECUTOR_INTERFACE = new ethers.Interface(EXECUTOR_ABI);

type HandleContractPair = {
  handle: string;
  contractAddress: string;
};

type RpcLike = Pick<ethers.JsonRpcProvider, "send">;

export class CleartextMockFhevm {
  readonly #provider: RpcLike;
  readonly #config: CleartextMockConfig;

  private constructor(provider: RpcLike, config: CleartextMockConfig) {
    this.#provider = provider;
    this.#config = config;
  }

  static async create(provider: RpcLike, config: CleartextMockConfig): Promise<CleartextMockFhevm> {
    const rawSlot = (await provider.send("eth_getStorageAt", [
      config.executorProxyAddress,
      EIP1967_IMPLEMENTATION_SLOT,
      "latest",
    ])) as string;

    const implementationAddress = ethers.getAddress(ethers.dataSlice(rawSlot, 12));

    // If the EIP-1967 slot is empty (e.g. bytecode injected directly at the
    // deterministic address via hardhat_setCode rather than a UUPS proxy),
    // patch the executor address itself.
    const target =
      implementationAddress === ethers.ZeroAddress
        ? config.executorProxyAddress
        : implementationAddress;

    await provider.send("hardhat_setCode", [target, CLEARTEXT_EXECUTOR_BYTECODE]);

    return new CleartextMockFhevm(provider, config);
  }

  generateKeypair(): { publicKey: string; privateKey: string } {
    const publicKey = ethers.hexlify(ethers.randomBytes(32));
    let privateKey = ethers.hexlify(ethers.randomBytes(32));

    while (privateKey === publicKey) {
      privateKey = ethers.hexlify(ethers.randomBytes(32));
    }

    return { publicKey, privateKey };
  }

  createEIP712(
    publicKey: string,
    contractAddresses: string[],
    startTimestamp: number,
    durationDays: number,
  ) {
    return {
      domain: USER_DECRYPT_EIP712.domain(
        this.#config.chainId,
        this.#config.verifyingContractAddressDecryption,
      ),
      types: USER_DECRYPT_EIP712.types,
      primaryType: "UserDecryptRequestVerification",
      message: {
        publicKey,
        contractAddresses,
        startTimestamp: BigInt(startTimestamp),
        durationDays: BigInt(durationDays),
        extraData: "0x00",
      },
    };
  }

  createEncryptedInput(contractAddress: string, userAddress: string): CleartextEncryptedInput {
    return new CleartextEncryptedInput(contractAddress, userAddress, this.#config);
  }

  async userDecrypt(
    handleContractPairs: HandleContractPair[],
    _privateKey: string,
    _publicKey: string,
    _signature: string,
    _signedContractAddresses: string[],
    signerAddress: string,
    _startTimestamp: number,
    _durationDays: number,
  ): Promise<Record<string, bigint>> {
    const normalizedSignerAddress = ethers.getAddress(signerAddress);
    const normalizedHandles = handleContractPairs.map((pair) =>
      ethers.toBeHex(ethers.toBigInt(pair.handle), 32),
    );

    const allowedResults = await Promise.all(
      normalizedHandles.map((handle) => this.#persistAllowed(handle, normalizedSignerAddress)),
    );
    const unauthorizedIndex = allowedResults.findIndex((isAllowed) => !isAllowed);
    if (unauthorizedIndex !== -1) {
      throw new Error(
        `Handle ${normalizedHandles[unauthorizedIndex]!} is not authorized for user decrypt`,
      );
    }

    const values = await Promise.all(
      normalizedHandles.map((handle) => this.#readPlaintext(handle)),
    );

    return Object.fromEntries(
      normalizedHandles.map((handle, index) => [handle, values[index]!]),
    ) as Record<string, bigint>;
  }

  async publicDecrypt(handles: string[]): Promise<{
    clearValues: Record<string, bigint>;
    abiEncodedClearValues: string;
    decryptionProof: string;
  }> {
    const normalizedHandles = handles.map((handle) => ethers.toBeHex(ethers.toBigInt(handle), 32));

    const allowedResults = await Promise.all(
      normalizedHandles.map((handle) => this.#isAllowedForDecryption(handle)),
    );
    const unauthorizedIndex = allowedResults.findIndex((isAllowed) => !isAllowed);
    if (unauthorizedIndex !== -1) {
      throw new Error(
        `Handle ${normalizedHandles[unauthorizedIndex]!} is not allowed for public decryption`,
      );
    }

    const orderedValues = await Promise.all(
      normalizedHandles.map((handle) => this.#readPlaintext(handle)),
    );
    const clearValues = Object.fromEntries(
      normalizedHandles.map((handle, index) => [handle, orderedValues[index]!]),
    ) as Record<string, bigint>;

    const abiEncodedClearValues = ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256[]"],
      [orderedValues],
    );

    const kmsSigner = new ethers.Wallet(MOCK_KMS_SIGNER_PK);
    const signature = await kmsSigner.signTypedData(
      KMS_DECRYPTION_EIP712.domain(
        this.#config.gatewayChainId,
        this.#config.verifyingContractAddressDecryption,
      ),
      KMS_DECRYPTION_EIP712.types,
      {
        ctHandles: normalizedHandles,
        decryptedResult: abiEncodedClearValues,
        extraData: "0x",
      },
    );

    const decryptionProof = ethers.hexlify(
      ethers.concat([new Uint8Array([1]), ethers.getBytes(signature)]),
    );

    return {
      clearValues,
      abiEncodedClearValues,
      decryptionProof,
    };
  }

  async #persistAllowed(handle: string, account: string): Promise<boolean> {
    const data = ACL_INTERFACE.encodeFunctionData("persistAllowed", [handle, account]);
    const result = await this.#ethCall(this.#config.aclAddress, data);
    return ACL_INTERFACE.decodeFunctionResult("persistAllowed", result)[0];
  }

  async #isAllowedForDecryption(handle: string): Promise<boolean> {
    const data = ACL_INTERFACE.encodeFunctionData("isAllowedForDecryption", [handle]);
    const result = await this.#ethCall(this.#config.aclAddress, data);
    return ACL_INTERFACE.decodeFunctionResult("isAllowedForDecryption", result)[0];
  }

  async #readPlaintext(handle: string): Promise<bigint> {
    const data = EXECUTOR_INTERFACE.encodeFunctionData("plaintexts", [handle]);
    const result = await this.#ethCall(this.#config.executorProxyAddress, data);
    return EXECUTOR_INTERFACE.decodeFunctionResult("plaintexts", result)[0];
  }

  async #ethCall(to: string, data: string): Promise<string> {
    return (await this.#provider.send("eth_call", [{ to, data }, "latest"])) as string;
  }
}
