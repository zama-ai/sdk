/**
 * Cleartext decryption functions — public and user-scoped.
 *
 * These functions read plaintext values from the {@link CleartextExecutor}
 * after verifying on-chain ACL permissions, then format the raw `bigint`
 * results into typed values (`boolean` for ebool, `bigint` for euint* and
 * eaddress).
 *
 * @module
 */

import { getBytes, hexlify, keccak256, concat, toUtf8Bytes, type SigningKey } from "ethers";
import type { CleartextExecutor } from "./cleartext-executor";
import { abiCoder, buildDomainSeparator, eip712Digest, packSignature } from "./eip712-utils";

/** Decrypted value — `boolean` for ebool, `bigint` for all other FHE types. */
type ClearValue = bigint | boolean;

/**
 * Minimal ACL contract interface needed for decrypt permission checks.
 *
 * - `isAllowedForDecryption` — used by public decrypt to verify the handle
 *   has been marked for public decryption.
 * - `persistAllowed` — used by user decrypt to verify both the user and the
 *   originating contract have permission on the handle.
 */
export interface CleartextACL {
  isAllowedForDecryption(handle: string): Promise<boolean>;
  persistAllowed(handle: string, account: string): Promise<boolean>;
}

/** EIP-712 signing context for the KMS decryption verification. */
export interface DecryptionSigningContext {
  signingKey: SigningKey;
  gatewayChainId: number;
  verifyingContract: string;
}

/** Extract fheTypeId from byte 30 of a bytes32 handle. */
function getFheTypeId(handleHex: string): number {
  return getBytes(handleHex)[30]!;
}

/** Map fheTypeId to the Solidity ABI type for encoding. */
function fheTypeToSolidity(fheTypeId: number) {
  switch (fheTypeId) {
    case 0:
      return "bool"; // ebool
    case 2:
      return "uint256"; // euint8
    case 3:
      return "uint256"; // euint16
    case 4:
      return "uint256"; // euint32
    case 5:
      return "uint256"; // euint64
    case 6:
      return "uint256"; // euint128
    case 7:
      return "address"; // eaddress
    case 8:
      return "uint256"; // euint256
    default:
      throw new Error(`Unsupported FHE type ID in cleartext mode: ${fheTypeId}`);
  }
}

/** Format a raw bigint plaintext based on the handle's FHE type. */
function formatPlaintext(value: bigint, fheTypeId: number): ClearValue {
  if (fheTypeId === 0) return value === 1n; // ebool
  // eaddress: return as bigint (matching the RelayerSDK interface which types clearValues as Record<string, bigint>)
  if (fheTypeId === 7) return value;
  return value; // euint*
}

const PUBLIC_DECRYPT_TYPEHASH = keccak256(
  toUtf8Bytes(
    "PublicDecryptVerification(bytes32[] ctHandles,bytes decryptedResult,bytes extraData)",
  ),
);

/**
 * Sign a PublicDecryptVerification struct using EIP-712.
 * Returns a 65-byte compact signature (r[32] + s[32] + v[1]).
 */
function signDecryptionProof(
  handleHexes: string[],
  abiEncodedClearValues: string,
  ctx: DecryptionSigningContext,
): Uint8Array {
  const domainSeparator = buildDomainSeparator("Decryption", ctx.gatewayChainId, ctx.verifyingContract);

  // Hash the ctHandles array: keccak256(abi.encodePacked(handles))
  const ctHandlesHash = keccak256(concat(handleHexes));

  // Hash the decryptedResult
  const decryptedResultHash = keccak256(abiEncodedClearValues);

  // Empty extraData
  const extraDataHash = keccak256("0x");

  // Build struct hash
  const structHash = keccak256(
    abiCoder.encode(
      ["bytes32", "bytes32", "bytes32", "bytes32"],
      [PUBLIC_DECRYPT_TYPEHASH, ctHandlesHash, decryptedResultHash, extraDataHash],
    ),
  );

  const digest = eip712Digest(domainSeparator, structHash);
  const sig = ctx.signingKey.sign(digest);
  return packSignature(sig);
}

/**
 * Build a decryption proof: numSigners (1 byte) + signatures (65 * numSigners).
 * No extraData appended.
 */
function buildDecryptionProof(
  handleHexes: string[],
  abiEncodedClearValues: string,
  ctx: DecryptionSigningContext,
): Uint8Array {
  const signature = signDecryptionProof(handleHexes, abiEncodedClearValues, ctx);
  const proof = new Uint8Array(1 + 65);
  proof[0] = 1; // numSigners = 1
  proof.set(signature, 1);
  return proof;
}

/**
 * Decrypt handles that have been marked for public decryption.
 *
 * Verifies each handle via `acl.isAllowedForDecryption`, then reads raw
 * plaintext values from the executor and returns:
 * - `clearValues` — formatted per FHE type (bool / address / bigint)
 * - `abiEncodedClearValues` — Solidity ABI encoding of the values
 * - `decryptionProof` — EIP-712 signed proof for on-chain verification
 *
 * @throws {Error} If any handle is not allowed for public decryption.
 */
export async function cleartextPublicDecrypt(
  handles: (Uint8Array | string)[],
  executor: CleartextExecutor,
  acl: CleartextACL,
  decryptionSigningCtx: DecryptionSigningContext,
): Promise<{
  clearValues: Record<string, ClearValue>;
  abiEncodedClearValues: string;
  decryptionProof: string;
}> {
  const handlesHex = handles.map((h) => (typeof h === "string" ? h : hexlify(h)));
  const fheTypes = handlesHex.map((h) => getFheTypeId(h));

  // Check ACL permissions in parallel
  await Promise.all(
    handlesHex.map(async (h) => {
      if (!(await acl.isAllowedForDecryption(h))) {
        throw new Error(`Handle ${h} is not allowed for decryption`);
      }
    }),
  );

  const rawValues = await executor.getPlaintexts(handlesHex);

  const clearValues: Record<string, ClearValue> = {};
  handlesHex.forEach((h, i) => {
    clearValues[h] = formatPlaintext(rawValues[i]!, fheTypes[i]!);
  });

  const abiTypes = fheTypes.map((t) => fheTypeToSolidity(t));
  const abiValues = handlesHex.map((_, i) => {
    const fheType = fheTypes[i]!;
    if (fheType === 0) return rawValues[i]! === 1n; // bool
    if (fheType === 7) return "0x" + rawValues[i]!.toString(16).padStart(40, "0"); // address
    return rawValues[i]!;
  });
  const abiEncodedClearValues = abiCoder.encode(abiTypes, abiValues);

  const proofBytes = buildDecryptionProof(handlesHex, abiEncodedClearValues, decryptionSigningCtx);
  const decryptionProof = hexlify(proofBytes);

  return { clearValues, abiEncodedClearValues, decryptionProof };
}

/**
 * Decrypt handles scoped to a specific user.
 *
 * Verifies that both the user and the originating contract have
 * `persistAllowed` permission for each handle, then reads and formats
 * the plaintext values.
 *
 * @throws {Error} If the user or contract is not authorized for any handle.
 */
export async function cleartextUserDecrypt(
  handleContractPairs: { handle: Uint8Array | string; contractAddress: string }[],
  userAddress: string,
  executor: CleartextExecutor,
  acl: CleartextACL,
): Promise<Record<string, ClearValue>> {
  const handlesHex = handleContractPairs.map((p) =>
    typeof p.handle === "string" ? p.handle : hexlify(p.handle),
  );

  const fheTypes = handlesHex.map((h) => getFheTypeId(h));

  // Check ACL: both user and contract must have persistAllowed (parallel across handles and checks)
  await Promise.all(
    handlesHex.flatMap((h, i) => {
      const contract = handleContractPairs[i]!.contractAddress;
      return [
        acl.persistAllowed(h, userAddress).then((ok) => {
          if (!ok) throw new Error(`User ${userAddress} is not authorized to decrypt handle ${h}`);
        }),
        acl.persistAllowed(h, contract).then((ok) => {
          if (!ok) throw new Error(`Contract ${contract} is not authorized to decrypt handle ${h}`);
        }),
      ];
    }),
  );

  const rawValues = await executor.getPlaintexts(handlesHex);

  const results: Record<string, ClearValue> = {};
  handlesHex.forEach((h, i) => {
    results[h] = formatPlaintext(rawValues[i]!, fheTypes[i]!);
  });

  return results;
}
