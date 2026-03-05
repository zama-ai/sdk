import { concat, getAddress, keccak256, pad, toBytes, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { FHE_BIT_WIDTHS, FheType } from "./constants";
import { INPUT_VERIFICATION_EIP712 } from "./eip712";
import { computeInputHandle, computeMockCiphertext } from "./handle";
import { MOCK_INPUT_SIGNER_PK } from "./constants";
import type { CleartextConfig } from "./types";

const INPUT_SIGNER = privateKeyToAccount(MOCK_INPUT_SIGNER_PK as `0x${string}`);

type AddedValue = {
  fheType: FheType;
  value: bigint;
};

export class CleartextEncryptedInput {
  readonly #contractAddress: string;
  readonly #userAddress: string;
  readonly #config: CleartextConfig;
  readonly #values: AddedValue[] = [];

  constructor(contractAddress: string, userAddress: string, config: CleartextConfig) {
    this.#contractAddress = getAddress(contractAddress);
    this.#userAddress = getAddress(userAddress);
    this.#config = config;
  }

  #addValue(fheType: FheType, value: bigint): this {
    if (value < 0n) {
      throw new Error("Only non-negative cleartext values are supported");
    }

    const bitWidth = FHE_BIT_WIDTHS[fheType];
    const maxValue = (1n << BigInt(bitWidth)) - 1n;
    if (value > maxValue) {
      throw new Error(`Value ${value} exceeds max ${maxValue} for FheType ${fheType}`);
    }

    this.#values.push({ fheType, value });
    return this;
  }

  addBool(value: boolean | bigint): this {
    const normalized = typeof value === "boolean" ? (value ? 1n : 0n) : value;
    if (normalized !== 0n && normalized !== 1n) {
      throw new Error("Bool value must be 0, 1, true, or false");
    }
    return this.#addValue(FheType.Bool, normalized);
  }

  add4(value: bigint): this {
    return this.#addValue(FheType.Uint4, value);
  }

  add8(value: bigint): this {
    return this.#addValue(FheType.Uint8, value);
  }

  add16(value: bigint): this {
    return this.#addValue(FheType.Uint16, value);
  }

  add32(value: bigint): this {
    return this.#addValue(FheType.Uint32, value);
  }

  add64(value: bigint): this {
    return this.#addValue(FheType.Uint64, value);
  }

  add128(value: bigint): this {
    return this.#addValue(FheType.Uint128, value);
  }

  addAddress(value: string): this {
    return this.#addValue(FheType.Uint160, BigInt(getAddress(value)));
  }

  add256(value: bigint): this {
    return this.#addValue(FheType.Uint256, value);
  }

  async encrypt(): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> {
    const random32List = this.#values.map(() => crypto.getRandomValues(new Uint8Array(32)));

    const mockCiphertexts = this.#values.map(({ fheType, value }, index) =>
      computeMockCiphertext(fheType, value, random32List[index]!),
    );

    const ciphertextParts = mockCiphertexts.map((ciphertext) => ciphertext as `0x${string}`);
    const ciphertextBlob = keccak256(ciphertextParts.length > 0 ? concat(ciphertextParts) : "0x");

    const handles = this.#values.map(({ fheType }, index) =>
      computeInputHandle(
        ciphertextBlob,
        index,
        fheType,
        this.#config.contracts.acl,
        this.#config.chainId,
      ),
    );

    const cleartextParts = this.#values.map(({ value }) => pad(toHex(value), { size: 32 }));
    const cleartextBytes: `0x${string}` = cleartextParts.length > 0 ? concat(cleartextParts) : "0x";

    const signature = await INPUT_SIGNER.signTypedData({
      domain: INPUT_VERIFICATION_EIP712.domain(
        this.#config.gatewayChainId,
        this.#config.contracts.verifyingInputVerifier,
      ),
      types: {
        CiphertextVerification: [...INPUT_VERIFICATION_EIP712.types.CiphertextVerification],
      },
      primaryType: "CiphertextVerification",
      message: {
        ctHandles: handles as `0x${string}`[],
        userAddress: this.#userAddress as `0x${string}`,
        contractAddress: this.#contractAddress as `0x${string}`,
        contractChainId: this.#config.chainId,
        extraData: cleartextBytes,
      },
    });

    const inputProof = toBytes(
      concat([
        toHex(new Uint8Array([handles.length])),
        toHex(new Uint8Array([1])),
        ...handles.map((handle) => handle as `0x${string}`),
        signature,
        cleartextBytes,
      ]),
    );

    return {
      handles: handles.map((handle) => toBytes(handle as `0x${string}`)),
      inputProof,
    };
  }
}
