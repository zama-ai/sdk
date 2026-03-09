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

import type { FheTypeEncryptionBitwidth, RelayerEncryptedInput } from "@zama-fhe/relayer-sdk/web";
import { concat, getAddress, hexToBytes, keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { EncryptionFailedError, NotSupportedError } from "../token/errors";
import { computeCleartextHandles } from "./cleartext-handles";
import { abiCoder, buildDomainSeparator, eip712Digest } from "./eip712";

/** EIP-712 signing context for the coprocessor input verification. */
export interface InputSigningContext {
  signingKey: Hex;
  gatewayChainId: number;
  verifyingContract: string;
  contractAddress: string;
  userAddress: string;
  contractChainId: number;
}

const CIPHERTEXT_VERIFICATION_TYPEHASH = keccak256(
  toBytes(
    "CiphertextVerification(bytes32[] ctHandles,address userAddress,address contractAddress,uint256 contractChainId,bytes extraData)",
  ),
);

function checkValue(value: number | bigint, bits: number): void {
  if (value == null) throw new EncryptionFailedError("Missing value");
  const v = BigInt(value);
  if (v < 0n) {
    throw new EncryptionFailedError(`The value must be non-negative for ${bits}bits integer.`);
  }
  const limit = bits >= 8 ? BigInt(`0x${"ff".repeat(bits / 8)}`) : BigInt(2 ** bits - 1);
  if (v > limit) {
    throw new EncryptionFailedError(
      `The value exceeds the limit for ${bits}bits integer (${limit}).`,
    );
  }
}

/** Build the extraData bytes: 32-byte padded plaintext per value (no version prefix). */
function buildExtraData(values: bigint[]): Uint8Array {
  const extraData = new Uint8Array(values.length * 32);
  for (let i = 0; i < values.length; i++) {
    const hex = values[i]!.toString(16).padStart(64, "0");
    const bytes = hexToBytes(`0x${hex}`);
    extraData.set(bytes, i * 32);
  }
  return extraData;
}

/**
 * Sign the CiphertextVerification struct using EIP-712.
 * Returns a 65-byte compact signature (r[32] + s[32] + v[1]).
 */
async function signCiphertextVerification(
  handleHexes: Hex[],
  extraData: Uint8Array,
  ctx: InputSigningContext,
): Promise<Uint8Array> {
  const domainSeparator = buildDomainSeparator(
    "InputVerification",
    ctx.gatewayChainId,
    ctx.verifyingContract,
  );

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
  const account = privateKeyToAccount(ctx.signingKey);
  const sigHex = await account.sign({ hash: digest });
  return hexToBytes(sigHex);
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
async function buildInputProof(
  handleHexes: Hex[],
  values: bigint[],
  ctx: InputSigningContext,
): Promise<Uint8Array> {
  const numHandles = handleHexes.length;
  const extraData = buildExtraData(values);
  const signature = await signCiphertextVerification(handleHexes, extraData, ctx);

  const header = new Uint8Array([numHandles, 1]); // numHandles, numSigners=1
  const handlesBytes = new Uint8Array(numHandles * 32);
  for (let i = 0; i < numHandles; i++) {
    handlesBytes.set(hexToBytes(handleHexes[i]!), i * 32);
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
  chainId: number;
  aclContractAddress: string;
  contractAddress: string;
  userAddress: string;
  signingContext: InputSigningContext;
}): RelayerEncryptedInput {
  const { aclContractAddress, chainId, signingContext } = params;
  const bits: FheTypeEncryptionBitwidth[] = [];
  const values: bigint[] = [];
  let totalBits = 0;

  const checkLimit = (added: number): void => {
    if (totalBits + added > 2048) {
      throw new EncryptionFailedError(
        "Packing more than 2048 bits in a single input ciphertext is unsupported",
      );
    }
    if (bits.length + 1 > 255) {
      throw new EncryptionFailedError(
        "Packing more than 255 variables in a single input ciphertext is unsupported",
      );
    }
  };

  const pushValue = (value: bigint, bitWidth: FheTypeEncryptionBitwidth): void => {
    checkLimit(Math.max(2, bitWidth));
    values.push(value);
    bits.push(bitWidth);
    totalBits += Math.max(2, bitWidth);
  };

  const self: RelayerEncryptedInput = {
    addBool(value) {
      const v = BigInt(value);
      if (v !== 0n && v !== 1n) throw new EncryptionFailedError("The value must be 0 or 1.");
      pushValue(v, 2);
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
      return bits;
    },
    generateZKProof() {
      throw new NotSupportedError("ZK Proof is not supported in cleartext mode");
    },
    async encrypt() {
      if (bits.length === 0) {
        throw new EncryptionFailedError("Encrypted input must contain at least one value");
      }
      const { handles } = computeCleartextHandles({
        values,
        encryptionBits: bits,
        aclContractAddress,
        chainId,
      });
      const inputProof = await buildInputProof(handles as Hex[], values, signingContext);
      return {
        handles: handles.map((h) => hexToBytes(h as Hex)),
        inputProof,
      };
    },
  };

  return self;
}
