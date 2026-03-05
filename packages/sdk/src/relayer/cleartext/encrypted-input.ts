import { ethers } from "ethers";
import { FHE_BIT_WIDTHS, FheType } from "./constants";
import { INPUT_VERIFICATION_EIP712 } from "./eip712";
import { computeInputHandle, computeMockCiphertext } from "./handle";
import { MOCK_INPUT_SIGNER_PK } from "./constants";
import type { CleartextConfig } from "./types";

const INPUT_VERIFICATION_TYPES: Record<string, ethers.TypedDataField[]> = {
  CiphertextVerification: INPUT_VERIFICATION_EIP712.types
    .CiphertextVerification as ethers.TypedDataField[],
};
const INPUT_SIGNER = new ethers.Wallet(MOCK_INPUT_SIGNER_PK);

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
    this.#contractAddress = ethers.getAddress(contractAddress);
    this.#userAddress = ethers.getAddress(userAddress);
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
    return this.#addValue(FheType.Uint160, BigInt(ethers.getAddress(value)));
  }

  add256(value: bigint): this {
    return this.#addValue(FheType.Uint256, value);
  }

  async encrypt(): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }> {
    const random32List = this.#values.map(() => ethers.randomBytes(32));

    const mockCiphertexts = this.#values.map(({ fheType, value }, index) =>
      computeMockCiphertext(fheType, value, random32List[index]!),
    );

    const ciphertextBlob = ethers.keccak256(
      ethers.concat(mockCiphertexts.map((ciphertext) => ethers.getBytes(ciphertext))),
    );

    const handles = this.#values.map(({ fheType }, index) =>
      computeInputHandle(
        ciphertextBlob,
        index,
        fheType,
        this.#config.contracts.acl,
        this.#config.chainId,
      ),
    );

    const cleartextBytes = ethers.concat(
      this.#values.map(({ value }) =>
        ethers.getBytes(ethers.zeroPadValue(ethers.toBeHex(value), 32)),
      ),
    );

    const signature = await INPUT_SIGNER.signTypedData(
      INPUT_VERIFICATION_EIP712.domain(
        this.#config.gatewayChainId,
        this.#config.contracts.verifyingInputVerifier,
      ),
      INPUT_VERIFICATION_TYPES,
      {
        ctHandles: handles,
        userAddress: this.#userAddress,
        contractAddress: this.#contractAddress,
        contractChainId: this.#config.chainId,
        extraData: cleartextBytes,
      },
    );

    const inputProof = ethers.getBytes(
      ethers.concat([
        new Uint8Array([handles.length]),
        new Uint8Array([1]),
        ...handles.map((handle) => ethers.getBytes(handle)),
        ethers.getBytes(signature),
        cleartextBytes,
      ]),
    );

    return {
      handles: handles.map((handle) => ethers.getBytes(handle)),
      inputProof,
    };
  }
}
