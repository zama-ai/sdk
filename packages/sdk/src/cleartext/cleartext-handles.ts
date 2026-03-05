/**
 * Deterministic handle generation for the cleartext FHE backend.
 *
 * Each handle is a 32-byte value encoding a hash prefix, index, chainId,
 * FHE type identifier, and version byte — matching the on-chain layout
 * expected by the CleartextFHEVM executor.
 *
 * Uses `solidityPackedKeccak256` + bitwise OR for fast handle assembly.
 */

import {
  concat,
  getBytes,
  hexlify,
  keccak256,
  randomBytes,
  solidityPackedKeccak256,
  toBeHex,
  toUtf8Bytes,
  zeroPadValue,
} from "ethers";
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

const RAW_CT_HASH_DOMAIN_SEPARATOR = toUtf8Bytes("ZK-w_rct");
const HANDLE_HASH_DOMAIN_SEPARATOR = toUtf8Bytes("ZK-w_hdl");

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
function computeMockCiphertext(fheType: number, cleartext: bigint, random32: Uint8Array): string {
  const bitWidth = FHE_BIT_WIDTHS[fheType as FheType];
  if (bitWidth === undefined) {
    throw new Error(`Unknown FheType: ${fheType}`);
  }
  const byteLength = Math.ceil(bitWidth / 8);
  const clearBytes = getBytes(zeroPadValue(toBeHex(cleartext), byteLength));

  const inner = keccak256(concat([new Uint8Array([fheType]), clearBytes, random32]));
  return keccak256(concat([RAW_CT_HASH_DOMAIN_SEPARATOR, inner]));
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
): string {
  const blobHash = keccak256(concat([RAW_CT_HASH_DOMAIN_SEPARATOR, ciphertextBlob]));

  const handleHash = solidityPackedKeccak256(
    ["bytes", "bytes32", "uint8", "address", "uint256"],
    [HANDLE_HASH_DOMAIN_SEPARATOR, blobHash, index, aclAddress, chainId],
  );

  const chainId64 = chainId & 0xffff_ffff_ffff_ffffn;
  const handle =
    (BigInt(handleHash) & PREHANDLE_MASK) |
    (BigInt(index) << 80n) |
    (chainId64 << 16n) |
    (BigInt(fheTypeId) << 8n) |
    BigInt(HANDLE_VERSION);

  return toBeHex(handle, 32);
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
    throw new Error(`Cannot generate more than 255 handles (got ${values.length})`);
  }

  // Generate per-value mock ciphertexts with individual random entropy
  const fheTypeIds = encryptionBits.map((bits) => {
    const id = BITS_TO_FHE_TYPE[bits];
    if (id === undefined) {
      throw new Error(`Unsupported encryption bit-width: ${bits}`);
    }
    return id;
  });

  const random32List = values.map(() => randomBytes(32));
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

  const bytes = getBytes(handleHex);
  if (bytes.length !== 32) {
    throw new Error(`Expected 32 bytes, got ${bytes.length}`);
  }

  const hash21 = hexlify(bytes.slice(0, 21));
  const index = Number((handle >> 80n) & 0xffn);
  const chainId = (handle >> 16n) & 0xffff_ffff_ffff_ffffn;
  const fheTypeId = Number((handle >> 8n) & 0xffn);
  const version = Number(handle & 0xffn);

  return { hash21, index, chainId, fheTypeId, version };
}
