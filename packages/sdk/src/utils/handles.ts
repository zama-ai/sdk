import type { EncryptedValue } from "../relayer/types";
import { encryptionBitsFromFheTypeId, isFheTypeId } from "./fhe-type";

export const ZERO_ENCRYPTED_VALUE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * Check whether an encrypted value represents the zero value.
 */
export function isEncryptedValueZero(encryptedValue: string): boolean {
  return encryptedValue === ZERO_ENCRYPTED_VALUE || encryptedValue === "0x";
}

/**
 * Per-request cleartext-bit budget enforced by the KMS gateway on every
 * decryption request (`decryptValues` / `delegatedDecryptValues`). Protocol-level
 * constant, mirrors {@link MAX_CONTRACTS_PER_PERMIT}'s local duplication —
 * duplicated here (matches `@fhevm/sdk`'s own `MAX_KMS_DECRYPT_DECRYPTION_BIT_LIMIT`)
 * rather than imported since `@fhevm/sdk` only exposes the underlying FHE-type
 * table via entrypoints unsafe to import at runtime from isomorphic code.
 */
export const MAX_DECRYPTION_REQUEST_BITS = 2048;

/** Max encryption bit width among all currently-known FHE types (euint256). */
const MAX_KNOWN_ENCRYPTION_BITS = 256;

/**
 * Cleartext bit cost of decrypting a single handle, derived from its FHE
 * type (encoded at bits 8-15 of the handle — the same layout `@fhevm/sdk`'s
 * `FhevmHandle` decodes, byte 30 of the 32-byte handle).
 *
 * Falls back to {@link MAX_KNOWN_ENCRYPTION_BITS} for an unrecognized type
 * byte, or for a value that isn't parseable hex at all, instead of throwing.
 * A real on-chain handle is always well-formed with a valid type byte, so
 * this fallback only ever fires for synthetic test/placeholder handles —
 * deliberately more permissive than the relayer's own strict validation so
 * chunking stays safe without requiring every test fixture to encode a real
 * FHE handle. Do not tighten this to match relayer semantics.
 */
export function encryptionBitsForHandle(encryptedValue: EncryptedValue): number {
  let handleValue: bigint;
  try {
    handleValue = BigInt(encryptedValue);
  } catch {
    return MAX_KNOWN_ENCRYPTION_BITS;
  }
  const typeByte = Number((handleValue >> 8n) & 0xffn);
  return isFheTypeId(typeByte) ? encryptionBitsFromFheTypeId(typeByte) : MAX_KNOWN_ENCRYPTION_BITS;
}

/**
 * Split `handles` into groups whose cumulative cleartext-bit cost never
 * exceeds `maxBits`, preserving input order. Unlike {@link chunkContracts}
 * (fixed-size slices), a greedy accumulate-until-exceeded walk is required
 * since per-handle cost varies by FHE type. A handle whose own cost exceeds
 * `maxBits` still gets a solo chunk — always makes forward progress.
 */
export function chunkHandlesByBitBudget(
  handles: readonly EncryptedValue[],
  maxBits: number = MAX_DECRYPTION_REQUEST_BITS,
): EncryptedValue[][] {
  const chunks: EncryptedValue[][] = [];
  let current: EncryptedValue[] = [];
  let currentBits = 0;

  for (const handle of handles) {
    const bits = encryptionBitsForHandle(handle);
    if (current.length > 0 && currentBits + bits > maxBits) {
      chunks.push(current);
      current = [];
      currentBits = 0;
    }
    current.push(handle);
    currentBits += bits;
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks;
}
