/**
 * Cleartext decryption functions — public and user-scoped.
 *
 * These functions read plaintext values from the {@link CleartextExecutor}
 * after verifying on-chain ACL permissions, then format the raw `bigint`
 * results into typed values (`boolean` for ebool, checksummed address string
 * for eaddress, `bigint` for euint*).
 *
 * @module
 */

import { getAddress, getBytes, hexlify, AbiCoder } from "ethers";
import type { CleartextExecutor } from "./cleartext-executor";

/** Decrypted value — type depends on the FHE type of the handle. */
type ClearValue = bigint | boolean | string;

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

/** Extract fheTypeId from byte 30 of a bytes32 handle. */
function getFheTypeId(handleHex: string): number {
  return getBytes(handleHex)[30]!;
}

/** Map fheTypeId to the Solidity ABI type for encoding. */
function fheTypeToSolidity(fheTypeId: number) {
  if (fheTypeId === 0) return "bool";
  if (fheTypeId === 7) return "address";
  return "uint256";
}

/** Format a raw bigint plaintext based on the handle's FHE type. */
function formatPlaintext(value: bigint, fheTypeId: number): ClearValue {
  if (fheTypeId === 0) return value === 1n; // ebool
  if (fheTypeId === 7) return getAddress("0x" + value.toString(16).padStart(40, "0")); // eaddress
  return value; // euint*
}

/**
 * Decrypt handles that have been marked for public decryption.
 *
 * Verifies each handle via `acl.isAllowedForDecryption`, then reads raw
 * plaintext values from the executor and returns:
 * - `clearValues` — formatted per FHE type (bool / address / bigint)
 * - `abiEncodedClearValues` — Solidity ABI encoding of the values
 * - `decryptionProof` — always `"0x00"` in cleartext mode (no real proof)
 *
 * @throws {Error} If any handle is not allowed for public decryption.
 */
export async function cleartextPublicDecrypt(
  handles: (Uint8Array | string)[],
  executor: CleartextExecutor,
  acl: CleartextACL,
): Promise<{
  clearValues: Record<string, ClearValue>;
  abiEncodedClearValues: string;
  decryptionProof: string;
}> {
  const handlesHex = handles.map((h) => (typeof h === "string" ? h : hexlify(h)));

  // Check ACL permissions
  for (const h of handlesHex) {
    if (!(await acl.isAllowedForDecryption(h))) {
      throw new Error(`Handle ${h} is not allowed for decryption`);
    }
  }

  const rawValues = await executor.getPlaintexts(handlesHex);

  const clearValues: Record<string, ClearValue> = {};
  handlesHex.forEach((h, i) => {
    clearValues[h] = formatPlaintext(rawValues[i]!, getFheTypeId(h));
  });

  const abiCoder = AbiCoder.defaultAbiCoder();
  const abiTypes = handlesHex.map((h) => fheTypeToSolidity(getFheTypeId(h)));
  const abiValues = handlesHex.map((h, i) => {
    const fheType = getFheTypeId(h);
    if (fheType === 0) return rawValues[i]! === 1n; // bool
    if (fheType === 7) return "0x" + rawValues[i]!.toString(16).padStart(40, "0"); // address
    return rawValues[i]!;
  });
  const abiEncodedClearValues = abiCoder.encode(abiTypes, abiValues);

  return { clearValues, abiEncodedClearValues, decryptionProof: "0x00" };
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

  // Check ACL: both user and contract must have persistAllowed
  for (let i = 0; i < handlesHex.length; i++) {
    const h = handlesHex[i]!;
    const contract = handleContractPairs[i]!.contractAddress;
    if (!(await acl.persistAllowed(h, userAddress))) {
      throw new Error(`User ${userAddress} is not authorized to decrypt handle ${h}`);
    }
    if (!(await acl.persistAllowed(h, contract))) {
      throw new Error(`Contract ${contract} is not authorized to decrypt handle ${h}`);
    }
  }

  const rawValues = await executor.getPlaintexts(handlesHex);

  const results: Record<string, ClearValue> = {};
  handlesHex.forEach((h, i) => {
    results[h] = formatPlaintext(rawValues[i]!, getFheTypeId(h));
  });

  return results;
}
