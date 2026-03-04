/**
 * Deterministic handle generation for the cleartext FHE backend.
 *
 * Each handle is a 32-byte value encoding a hash prefix, index, chainId,
 * FHE type identifier, and version byte — matching the on-chain layout
 * expected by the CleartextFHEVM executor.
 */

import {
  keccak256,
  AbiCoder,
  concat,
  toBeHex,
  zeroPadValue,
  getBytes,
  hexlify,
  randomBytes,
} from "ethers";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Domain separator for raw ciphertext hashing. */
const RAW_CT_HASH_DOMAIN_SEPARATOR = "ZK-w_rct";

/** Domain separator for handle hashing. */
const HANDLE_HASH_DOMAIN_SEPARATOR = "ZK-w_hdl";

/** Current handle version byte. */
const HANDLE_VERSION = 0;

/**
 * Maps encryption bit-width to the on-chain FHE type identifier.
 *
 * | bits | type      | id |
 * |------|-----------|----|
 * |    2 | ebool     |  0 |
 * |    8 | euint8    |  2 |
 * |   16 | euint16   |  3 |
 * |   32 | euint32   |  4 |
 * |   64 | euint64   |  5 |
 * |  128 | euint128  |  6 |
 * |  160 | eaddress  |  7 |
 * |  256 | euint256  |  8 |
 */
export const BITS_TO_FHE_TYPE: Record<number, number> = {
  2: 0,
  8: 2,
  16: 3,
  32: 4,
  64: 5,
  128: 6,
  160: 7,
  256: 8,
};

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
  /** The fake ciphertext blob used to derive the blob hash. */
  fakeCiphertext: Uint8Array;
}

export interface ParsedHandle {
  hash21: string;
  index: number;
  chainId: bigint;
  fheTypeId: number;
  version: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const abiCoder = AbiCoder.defaultAbiCoder();

/**
 * Convert an ASCII string to a hex-encoded string (0x-prefixed).
 * Avoids TextEncoder which may produce non-standard Uint8Array in some environments.
 */
function asciiToHex(str: string): string {
  let hex = "0x";
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Encode a chainId as an 8-byte big-endian hex string.
 */
function chainIdHex(chainId: number): string {
  return zeroPadValue(toBeHex(chainId), 8);
}

// ---------------------------------------------------------------------------
// Core implementation
// ---------------------------------------------------------------------------

/**
 * Build a fake ciphertext blob from the plaintext values.
 *
 * Layout: `"CLEARTEXT" || nonce(32) || ABI.encode(uint256[])(values)`
 *
 * The 32-byte random nonce ensures that encrypting the same value twice
 * produces different handles — matching production FHE behavior where
 * entropy injection prevents handle collisions across users.
 */
function buildFakeCiphertext(values: bigint[]): Uint8Array {
  const prefix = asciiToHex("CLEARTEXT");
  const nonce = randomBytes(32);
  const encoded = abiCoder.encode(["uint256[]"], [values]);
  return getBytes(concat([prefix, nonce, encoded]));
}

/**
 * Compute a single handle.
 *
 * ```
 * [bytes 0-20]   hash21  = keccak256("ZK-w_hdl" + blobHash + index + aclAddr + chainId)[0:21]
 * [byte 21]      index   (position within the encrypted input: 0, 1, 2, …)
 * [bytes 22-29]  chainId (uint64 big-endian)
 * [byte 30]      fheTypeId
 * [byte 31]      version (0)
 * ```
 */
function computeSingleHandle(
  blobHash: string,
  index: number,
  aclContractAddress: string,
  chainId: number,
  fheTypeId: number,
): Uint8Array {
  const chainHex = chainIdHex(chainId);

  // hash input = domain || blobHash || index(1 byte) || aclAddr(20 bytes) || chainId(8 bytes)
  const indexHex = hexlify(Uint8Array.from([index]));
  const hashInput = concat([
    asciiToHex(HANDLE_HASH_DOMAIN_SEPARATOR),
    blobHash,
    indexHex,
    aclContractAddress,
    chainHex,
  ]);
  const fullHash = getBytes(keccak256(hashInput));

  // Assemble the 32-byte handle
  const handle = new Uint8Array(32);
  // bytes 0-20: first 21 bytes of hash
  handle.set(fullHash.slice(0, 21), 0);
  // byte 21: index
  handle[21] = index;
  // bytes 22-29: chainId big-endian
  handle.set(getBytes(chainHex), 22);
  // byte 30: fheTypeId
  handle[30] = fheTypeId;
  // byte 31: version
  handle[31] = HANDLE_VERSION;

  return handle;
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
    throw new Error(
      `Length mismatch: ${values.length} values vs ${encryptionBits.length} encryptionBits`,
    );
  }

  const fakeCiphertext = buildFakeCiphertext(values);
  const blobHash = keccak256(concat([asciiToHex(RAW_CT_HASH_DOMAIN_SEPARATOR), fakeCiphertext]));

  const handles: string[] = values.map((_, i) => {
    const bits = encryptionBits[i]!;
    const fheTypeId = BITS_TO_FHE_TYPE[bits];
    if (fheTypeId === undefined) {
      throw new Error(`Unsupported encryption bit-width: ${bits}`);
    }
    return hexlify(computeSingleHandle(blobHash, i, aclContractAddress, chainId, fheTypeId));
  });

  return { handles, fakeCiphertext };
}

/**
 * Parse a 32-byte hex-encoded handle back into its component fields.
 * Useful for testing and debugging.
 */
export function parseHandle(handleHex: string): ParsedHandle {
  const bytes = getBytes(handleHex);
  if (bytes.length !== 32) {
    throw new Error(`Expected 32 bytes, got ${bytes.length}`);
  }

  // bytes 0-20: hash21 (21 bytes)
  const hash21 = hexlify(bytes.slice(0, 21));

  // byte 21: index
  const index = bytes[21]!;

  // bytes 22-29: chainId (uint64 big-endian)
  let chainId = 0n;
  for (let i = 22; i < 30; i++) {
    chainId = (chainId << 8n) | BigInt(bytes[i]!);
  }

  // byte 30: fheTypeId
  const fheTypeId = bytes[30]!;

  // byte 31: version
  const version = bytes[31]!;

  return { hash21, index, chainId, fheTypeId, version };
}
