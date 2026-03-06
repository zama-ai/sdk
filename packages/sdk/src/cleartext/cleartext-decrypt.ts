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

import { hexlify, keccak256, concat, toUtf8Bytes, type SigningKey } from "ethers";
import { DecryptionFailedError } from "../token/errors";
import type { CleartextExecutor } from "./cleartext-executor";
import { abiCoder, buildDomainSeparator, eip712Digest, packSignature } from "./eip712";
import { FheType } from "./constants";

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
  isHandleDelegatedForUserDecryption(
    delegator: string,
    delegate: string,
    contractAddress: string,
    handle: string,
  ): Promise<boolean>;
}

/** EIP-712 signing context for the KMS decryption verification. */
export interface DecryptionSigningContext {
  signingKey: SigningKey;
  gatewayChainId: number;
  verifyingContract: string;
}

/** Extract fheTypeId from byte 30 of a bytes32 handle (chars 62-63 of 0x-prefixed hex). */
function getFheTypeId(handleHex: string): number {
  return parseInt(handleHex.slice(62, 64), 16);
}

/** Map fheTypeId to the Solidity ABI type for encoding. */
function fheTypeToSolidity(fheTypeId: number) {
  switch (fheTypeId) {
    case FheType.Bool:
      return "bool"; // ebool
    case FheType.Uint4:
      return "uint256"; // euint4
    case FheType.Uint8:
      return "uint256"; // euint8
    case FheType.Uint16:
      return "uint256"; // euint16
    case FheType.Uint32:
      return "uint256"; // euint32
    case FheType.Uint64:
      return "uint256"; // euint64
    case FheType.Uint128:
      return "uint256"; // euint128
    case FheType.Uint160:
      return "address"; // eaddress
    case FheType.Uint256:
      return "uint256"; // euint256
    default:
      throw new Error(`Unsupported FHE type ID in cleartext mode: ${fheTypeId}`);
  }
}

/** Format a raw bigint plaintext based on the handle's FHE type. */
function formatPlaintext(value: bigint, fheTypeId: number): ClearValue {
  if (fheTypeId === FheType.Bool) return value === 1n; // ebool
  // eaddress: return as bigint (matching the RelayerSDK interface which types clearValues as Record<string, bigint>)
  if (fheTypeId === FheType.Uint160) return value;
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
  const domainSeparator = buildDomainSeparator(
    "Decryption",
    ctx.gatewayChainId,
    ctx.verifyingContract,
  );

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
 * **Note:** ACL checks and plaintext reads are separate RPC calls, unlike the
 * production coprocessor which performs them atomically inside a TEE. This
 * TOCTOU gap is acceptable for development/testing but means access-control
 * revocation tests may not perfectly match production timing.
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

  // ACL checks and plaintext reads are independent — run in parallel
  const [rawValues] = await Promise.all([
    executor.getPlaintexts(handlesHex),
    ...handlesHex.map(async (h) => {
      if (!(await acl.isAllowedForDecryption(h))) {
        throw new DecryptionFailedError(`Handle ${h} is not allowed for decryption`);
      }
    }),
  ]);

  const clearValues: Record<string, ClearValue> = {};
  handlesHex.forEach((h, i) => {
    clearValues[h] = formatPlaintext(rawValues[i]!, fheTypes[i]!);
  });

  const abiTypes = fheTypes.map((t) => fheTypeToSolidity(t));
  const abiValues = handlesHex.map((_, i) => {
    const fheType = fheTypes[i]!;
    if (fheType === FheType.Bool) return rawValues[i]! === 1n; // bool
    if (fheType === FheType.Uint160) return "0x" + rawValues[i]!.toString(16).padStart(40, "0"); // address
    return rawValues[i]!;
  });
  const abiEncodedClearValues = abiCoder.encode(abiTypes, abiValues);

  const proofBytes = buildDecryptionProof(handlesHex, abiEncodedClearValues, decryptionSigningCtx);
  const decryptionProof = hexlify(proofBytes);

  return { clearValues, abiEncodedClearValues, decryptionProof };
}

/**
 * Decrypt handles on behalf of a delegator via delegation ACL.
 *
 * Verifies that each handle has been delegated for user decryption using
 * `acl.isHandleDelegatedForUserDecryption`, then reads and formats
 * the plaintext values.
 *
 * @throws {Error} If any handle is not delegated for user decryption.
 */
export async function cleartextDelegatedUserDecrypt(
  handleContractPairs: { handle: Uint8Array | string; contractAddress: string }[],
  delegatorAddress: string,
  delegateAddress: string,
  executor: CleartextExecutor,
  acl: CleartextACL,
): Promise<Record<string, ClearValue>> {
  const handlesHex = handleContractPairs.map((p) =>
    typeof p.handle === "string" ? p.handle : hexlify(p.handle),
  );

  const fheTypes = handlesHex.map((h) => getFheTypeId(h));

  // ACL checks and plaintext reads are independent — run in parallel
  const [rawValues] = await Promise.all([
    executor.getPlaintexts(handlesHex),
    ...handlesHex.map(async (h, i) => {
      const contract = handleContractPairs[i]!.contractAddress;
      if (
        !(await acl.isHandleDelegatedForUserDecryption(
          delegatorAddress,
          delegateAddress,
          contract,
          h,
        ))
      ) {
        throw new DecryptionFailedError(
          `Handle ${h} is not delegated for user decryption (delegator=${delegatorAddress}, delegate=${delegateAddress}, contract=${contract})`,
        );
      }
    }),
  ]);

  const results: Record<string, ClearValue> = {};
  handlesHex.forEach((h, i) => {
    results[h] = formatPlaintext(rawValues[i]!, fheTypes[i]!);
  });

  return results;
}

/**
 * Decrypt handles scoped to a specific user.
 *
 * Verifies that both the user and the originating contract have
 * `persistAllowed` permission for each handle, then reads and formats
 * the plaintext values.
 *
 * **Note:** See {@link cleartextPublicDecrypt} for the TOCTOU caveat on
 * non-atomic ACL checks vs plaintext reads.
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

  // ACL checks and plaintext reads are independent — run in parallel
  const [rawValues] = await Promise.all([
    executor.getPlaintexts(handlesHex),
    ...handlesHex.flatMap((h, i) => {
      const contract = handleContractPairs[i]!.contractAddress;
      return [
        acl.persistAllowed(h, userAddress).then((ok) => {
          if (!ok)
            throw new DecryptionFailedError(
              `User ${userAddress} is not authorized to decrypt handle ${h}`,
            );
        }),
        acl.persistAllowed(h, contract).then((ok) => {
          if (!ok)
            throw new DecryptionFailedError(
              `Contract ${contract} is not authorized to decrypt handle ${h}`,
            );
        }),
      ];
    }),
  ]);

  const results: Record<string, ClearValue> = {};
  handlesHex.forEach((h, i) => {
    results[h] = formatPlaintext(rawValues[i]!, fheTypes[i]!);
  });

  return results;
}
