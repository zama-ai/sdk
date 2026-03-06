/**
 * Deterministic handle generation for the cleartext FHE backend.
 *
 * Each handle is a 32-byte value encoding a hash prefix, index, chainId,
 * FHE type identifier, and version byte — matching the on-chain layout
 * expected by the CleartextFHEVM executor.
 *
 * Uses `keccak256(encodePacked(...))` + bitwise OR for fast handle assembly.
 */

import { concat, encodePacked, Hex, keccak256, pad, toBytes, toHex } from "viem";
import { EncryptionFailedError } from "../token/errors";
import {
  BITS_TO_FHE_TYPE,
  FHE_BIT_WIDTHS,
  HANDLE_VERSION,
  PREHANDLE_MASK,
  type FheType,
} from "./constants";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RAW_CT_HASH_DOMAIN_SEPARATOR = toBytes("ZK-w_rct");
const HANDLE_HASH_DOMAIN_SEPARATOR = toBytes("ZK-w_hdl");

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ComputeCleartextHandlesParams {
  /** Plaintext values (one per encrypted slot). */
  values: bigint[];
  /** Bit-widths for each value (must be same length as `values`). */
  encryptionBits: number[];
  /** On-chain ACL contract address. */
  aclContractAddress: string;
  /** Chain ID of the target network. */
  chainId: number;
}

export interface ComputeCleartextHandlesResult {
  /** One bytes32 handle per value, hex-encoded with 0x prefix. */
  handles: string[];
  /** The mock ciphertext hashes used to derive handles. */
  mockCiphertexts: string[];
}

export interface ParsedHandle {
  hash21: string;
  index: number;
  chainId: bigint;
  fheTypeId: number;
  version: number;
}

// ---------------------------------------------------------------------------
// Core implementation
// ---------------------------------------------------------------------------

/**
 * Compute a mock ciphertext hash for a single value.
 *
 * Layout: `keccak256("ZK-w_rct" || keccak256(fheType || cleartextBytes || random32))`
 */
function computeMockCiphertext(fheType: number, cleartext: bigint, random32: Uint8Array): Hex {
  const bitWidth = FHE_BIT_WIDTHS[fheType as FheType];
  if (bitWidth === undefined) {
    throw new EncryptionFailedError(`Unknown FheType: ${fheType}`);
  }
  const byteLength = Math.ceil(bitWidth / 8);
  const clearBytes = toBytes(toHex(cleartext, { size: byteLength }));

  const inner = keccak256(
    concat([toHex(new Uint8Array([fheType])), toHex(clearBytes), toHex(random32)]),
  );
  return keccak256(concat([toHex(RAW_CT_HASH_DOMAIN_SEPARATOR), inner]));
}

/**
 * Compute a single handle using `solidityPackedKeccak256` + bitwise OR.
 *
 * Handle byte layout:
 * ```
 * [bytes 0-20]   hash prefix (from PREHANDLE_MASK)
 * [byte 21]      index
 * [bytes 22-29]  chainId (uint64 big-endian)
 * [byte 30]      fheTypeId
 * [byte 31]      version
 * ```
 */
function computeInputHandle(
  ciphertextBlob: string,
  index: number,
  fheTypeId: number,
  aclAddress: string,
  chainId: bigint,
): Hex {
  const blobHash = keccak256(
    concat([toHex(RAW_CT_HASH_DOMAIN_SEPARATOR), ciphertextBlob as `0x${string}`]),
  );

  const handleHash = keccak256(
    encodePacked(
      ["bytes", "bytes32", "uint8", "address", "uint256"],
      [
        toHex(HANDLE_HASH_DOMAIN_SEPARATOR),
        blobHash as `0x${string}`,
        index,
        aclAddress as `0x${string}`,
        chainId,
      ],
    ),
  );

  const chainId64 = chainId & 0xffff_ffff_ffff_ffffn;
  const handle =
    (BigInt(handleHash) & PREHANDLE_MASK) |
    (BigInt(index) << 80n) |
    (chainId64 << 16n) |
    (BigInt(fheTypeId) << 8n) |
    BigInt(HANDLE_VERSION);

  return toHex(handle, { size: 32 });
}

// ---------------------------------------------------------------------------
// Exported functions
// ---------------------------------------------------------------------------

/**
 * Generate deterministic bytes32 handles for a set of cleartext values.
 *
 * @throws {Error} If `values` and `encryptionBits` have different lengths.
 * @throws {Error} If an unsupported bit-width is encountered.
 */
export function computeCleartextHandles(
  params: ComputeCleartextHandlesParams,
): ComputeCleartextHandlesResult {
  const { values, encryptionBits, aclContractAddress, chainId } = params;

  if (values.length !== encryptionBits.length) {
    throw new EncryptionFailedError(
      `Length mismatch: ${values.length} values vs ${encryptionBits.length} encryptionBits`,
    );
  }
  if (values.length > 255) {
    throw new EncryptionFailedError(`Cannot generate more than 255 handles (got ${values.length})`);
  }

  // Generate per-value mock ciphertexts with individual random entropy
  const fheTypeIds = encryptionBits.map((bits) => {
    const id = BITS_TO_FHE_TYPE[bits];
    if (id === undefined) {
      throw new EncryptionFailedError(`Unsupported encryption bit-width: ${bits}`);
    }
    return id;
  });

  const random32List = values.map(() => crypto.getRandomValues(new Uint8Array(32)));
  const mockCiphertexts = values.map((value, i) =>
    computeMockCiphertext(fheTypeIds[i]!, value, random32List[i]!),
  );

  // Combine all mock ciphertexts into a single blob hash
  const ciphertextBlob = keccak256(concat(mockCiphertexts));

  const chainIdBig = BigInt(chainId);
  const handles = fheTypeIds.map((fheTypeId, i) =>
    computeInputHandle(ciphertextBlob, i, fheTypeId, aclContractAddress, chainIdBig),
  );

  return { handles, mockCiphertexts };
}

/**
 * Parse a 32-byte hex-encoded handle back into its component fields.
 * Useful for testing and debugging.
 */
export function parseHandle(handleHex: string): ParsedHandle {
  const handle = BigInt(handleHex);

  const bytes = toBytes(handleHex as `0x${string}`);
  if (bytes.length !== 32) {
    throw new EncryptionFailedError(`Expected 32 bytes, got ${bytes.length}`);
  }

  const hash21 = toHex(bytes.slice(0, 21));
  const index = Number((handle >> 80n) & 0xffn);
  const chainId = (handle >> 16n) & 0xffff_ffff_ffff_ffffn;
  const fheTypeId = Number((handle >> 8n) & 0xffn);
  const version = Number(handle & 0xffn);

  return { hash21, index, chainId, fheTypeId, version };
}
