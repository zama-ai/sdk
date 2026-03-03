import { getAddress, getBytes, hexlify, AbiCoder } from "ethers";
import type { CleartextExecutor } from "./cleartext-executor";

type ClearValue = bigint | boolean | string;

/** ACL contract interface (subset needed for decrypt checks). */
export interface CleartextACL {
  isAllowedForDecryption(handle: string): Promise<boolean>;
  persistAllowed(handle: string, account: string): Promise<boolean>;
}

/** Extract fheTypeId from byte 30 of a bytes32 handle. */
function getFheTypeId(handleHex: string): number {
  return getBytes(handleHex)[30]!;
}

/** Format a raw bigint plaintext based on the handle's FHE type. */
function formatPlaintext(value: bigint, fheTypeId: number): ClearValue {
  if (fheTypeId === 0) return value === 1n; // ebool
  if (fheTypeId === 7) return getAddress("0x" + value.toString(16).padStart(40, "0")); // eaddress
  return value; // euint*
}

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
  const abiEncodedClearValues = abiCoder.encode(
    handlesHex.map(() => "uint256"),
    rawValues,
  );

  return { clearValues, abiEncodedClearValues, decryptionProof: "0x00" };
}

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
