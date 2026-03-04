/**
 * Fluent builder for constructing encrypted inputs in cleartext mode.
 *
 * Accumulates typed values (bool, uint8–uint256, address) then produces
 * deterministic handles and an `InputProof` blob that the on-chain
 * `InputVerifier` contract can validate.
 *
 * @example
 * ```ts
 * const input = createCleartextEncryptedInput({
 *   aclContractAddress: "0x50157C…",
 *   chainId: 31337,
 *   contractAddress: "0xe3a910…",
 *   userAddress: "0xf39Fd6…",
 *   signingKey: { ... },
 * });
 * input.addBool(true).add64(42n);
 * const { handles, inputProof } = await input.encrypt();
 * ```
 *
 * @module
 */

import { getAddress, getBytes, SigningKey, keccak256, concat, toUtf8Bytes } from "ethers";
import { computeCleartextHandles } from "./cleartext-handles";
import { abiCoder, buildDomainSeparator, eip712Digest, packSignature } from "./eip712-utils";

/**
 * Fluent builder interface for cleartext encrypted inputs.
 *
 * Each `add*` method appends a typed value and returns `this` for chaining.
 * Call {@link encrypt} when done to produce the handles and input proof.
 *
 * Limits: max 2048 bits total, max 256 variables per input.
 */
export interface CleartextEncryptedInput {
  addBool(value: boolean | number | bigint): CleartextEncryptedInput;
  add8(value: number | bigint): CleartextEncryptedInput;
  add16(value: number | bigint): CleartextEncryptedInput;
  add32(value: number | bigint): CleartextEncryptedInput;
  add64(value: number | bigint): CleartextEncryptedInput;
  add128(value: number | bigint): CleartextEncryptedInput;
  add256(value: number | bigint): CleartextEncryptedInput;
  addAddress(value: string): CleartextEncryptedInput;
  getBits(): number[];
  encrypt(): Promise<{ handles: Uint8Array[]; inputProof: Uint8Array }>;
}

/** EIP-712 signing context for the coprocessor input verification. */
export interface InputSigningContext {
  signingKey: SigningKey;
  gatewayChainId: number;
  verifyingContract: string;
  contractAddress: string;
  userAddress: string;
  contractChainId: number;
}

const CIPHERTEXT_VERIFICATION_TYPEHASH = keccak256(
  toUtf8Bytes(
    "CiphertextVerification(bytes32[] ctHandles,address userAddress,address contractAddress,uint256 contractChainId,bytes extraData)",
  ),
);

function checkValue(value: number | bigint, bits: number): void {
  if (value == null) throw new Error("Missing value");
  const v = BigInt(value);
  if (v < 0n) {
    throw new Error(`The value must be non-negative for ${bits}bits integer.`);
  }
  const limit = bits >= 8 ? BigInt(`0x${"ff".repeat(bits / 8)}`) : BigInt(2 ** bits - 1);
  if (v > limit) {
    throw new Error(`The value exceeds the limit for ${bits}bits integer (${limit}).`);
  }
}

/** Build the extraData bytes: 32-byte padded plaintext per value (no version prefix). */
function buildExtraData(values: bigint[]): Uint8Array {
  const extraData = new Uint8Array(values.length * 32);
  for (let i = 0; i < values.length; i++) {
    const hex = values[i]!.toString(16).padStart(64, "0");
    const bytes = getBytes("0x" + hex);
    extraData.set(bytes, i * 32);
  }
  return extraData;
}

/**
 * Sign the CiphertextVerification struct using EIP-712.
 * Returns a 65-byte compact signature (r[32] + s[32] + v[1]).
 */
function signCiphertextVerification(
  handleHexes: string[],
  extraData: Uint8Array,
  ctx: InputSigningContext,
): Uint8Array {
  const domainSeparator = buildDomainSeparator("InputVerification", ctx.gatewayChainId, ctx.verifyingContract);

  // Hash the ctHandles array: keccak256(abi.encodePacked(handles))
  const ctHandlesHash = keccak256(concat(handleHexes));

  // Hash the extraData
  const extraDataHash = keccak256(extraData);

  // Build struct hash
  const structHash = keccak256(
    abiCoder.encode(
      ["bytes32", "bytes32", "address", "address", "uint256", "bytes32"],
      [
        CIPHERTEXT_VERIFICATION_TYPEHASH,
        ctHandlesHash,
        ctx.userAddress,
        ctx.contractAddress,
        ctx.contractChainId,
        extraDataHash,
      ],
    ),
  );

  const digest = eip712Digest(domainSeparator, structHash);
  const sig = ctx.signingKey.sign(digest);
  return packSignature(sig);
}

/**
 * Build an InputProof from handles, plaintext values, and a coprocessor signature.
 *
 * Layout:
 *   [byte 0]     numHandles
 *   [byte 1]     numSigners (1 for cleartext)
 *   [32*n bytes] handles
 *   [65*m bytes] signatures
 *   [remaining]  extraData: 32-byte padded plaintext per value
 */
function buildInputProof(
  handleHexes: string[],
  values: bigint[],
  ctx: InputSigningContext,
): Uint8Array {
  const numHandles = handleHexes.length;
  const extraData = buildExtraData(values);
  const signature = signCiphertextVerification(handleHexes, extraData, ctx);

  const header = new Uint8Array([numHandles, 1]); // numHandles, numSigners=1
  const handlesBytes = new Uint8Array(numHandles * 32);
  for (let i = 0; i < numHandles; i++) {
    handlesBytes.set(getBytes(handleHexes[i]!), i * 32);
  }

  const result = new Uint8Array(
    header.length + handlesBytes.length + signature.length + extraData.length,
  );
  result.set(header, 0);
  result.set(handlesBytes, header.length);
  result.set(signature, header.length + handlesBytes.length);
  result.set(extraData, header.length + handlesBytes.length + signature.length);
  return result;
}

/**
 * Create a new cleartext encrypted input builder.
 *
 * @param params.aclContractAddress - ACL contract address (used for handle derivation)
 * @param params.chainId - Target chain ID (embedded in handle bytes 22-29)
 * @param params.contractAddress - Contract that will consume the encrypted input
 * @param params.userAddress - User address submitting the transaction
 * @param params.signingContext - EIP-712 signing context for coprocessor verification
 */
export function createCleartextEncryptedInput(params: {
  aclContractAddress: string;
  chainId: number;
  contractAddress: string;
  userAddress: string;
  signingContext: InputSigningContext;
}): CleartextEncryptedInput {
  const { aclContractAddress, chainId, signingContext } = params;
  const bits: number[] = [];
  const values: bigint[] = [];
  let totalBits = 0;

  const checkLimit = (added: number): void => {
    if (totalBits + added > 2048) {
      throw new Error("Packing more than 2048 bits in a single input ciphertext is unsupported");
    }
    if (bits.length + 1 > 255) {
      throw new Error(
        "Packing more than 255 variables in a single input ciphertext is unsupported",
      );
    }
  };

  const pushValue = (value: bigint, bitWidth: number): void => {
    checkLimit(Math.max(2, bitWidth));
    values.push(value);
    bits.push(bitWidth);
    totalBits += Math.max(2, bitWidth);
  };

  const self: CleartextEncryptedInput = {
    addBool(value) {
      const v = Number(value);
      if (!Number.isInteger(v) || v < 0 || v > 1) throw new Error("The value must be 0 or 1.");
      pushValue(BigInt(v), 2);
      return self;
    },
    add8(value) {
      checkValue(value, 8);
      pushValue(BigInt(value), 8);
      return self;
    },
    add16(value) {
      checkValue(value, 16);
      pushValue(BigInt(value), 16);
      return self;
    },
    add32(value) {
      checkValue(value, 32);
      pushValue(BigInt(value), 32);
      return self;
    },
    add64(value) {
      checkValue(value, 64);
      pushValue(BigInt(value), 64);
      return self;
    },
    add128(value) {
      checkValue(value, 128);
      pushValue(BigInt(value), 128);
      return self;
    },
    add256(value) {
      checkValue(value, 256);
      pushValue(BigInt(value), 256);
      return self;
    },
    addAddress(value) {
      const checksummed = getAddress(value); // throws if not valid address
      pushValue(BigInt(checksummed), 160);
      return self;
    },
    getBits() {
      return [...bits];
    },
    async encrypt() {
      if (bits.length === 0) throw new Error("Encrypted input must contain at least one value");
      const { handles } = computeCleartextHandles({
        values,
        encryptionBits: bits,
        aclContractAddress,
        chainId,
      });
      const inputProof = buildInputProof(handles, values, signingContext);
      return {
        handles: handles.map((h) => getBytes(h)),
        inputProof,
      };
    },
  };

  return self;
}
