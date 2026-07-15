import type { Address, PublicClient } from "viem";
import { hexToBytes } from "viem";
import { shake256 } from "@noble/hashes/sha3.js";
import { getCrsMaterialsContract, getKeyMaterialsContract } from "../contracts/kms-generation";
import { KeyDigestMismatchError, KeyDigestVerificationFailedError } from "../errors/key-digest";

// KeyType enum order in IKMSGeneration.sol: Server = 0, Public = 1.
const KMS_GENERATION_KEY_TYPE_PUBLIC = 1;

// 8-byte ASCII domain separators, matching kms-core's hashing.rs (via
// fhevm-engine/host-listener's digest.rs): digest = SHAKE256(dsep || bytes),
// truncated to 32 bytes. Same DSEP for both key types (Server and Public).
const DSEP_KEY = new TextEncoder().encode("PDAT_KEY");
const DSEP_CRS = new TextEncoder().encode("PDAT_CRS");

function digest(dsep: Uint8Array, bytes: Uint8Array): Uint8Array {
  const input = new Uint8Array(dsep.length + bytes.length);
  input.set(dsep, 0);
  input.set(bytes, dsep.length);
  return shake256(input, { dkLen: 32 });
}

function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Parses an opaque relayer `dataId` (a `keyId`/`crsId`, forward-compatible with
 * older relayers that still return a non-numeric placeholder) into the
 * `uint256` `KMSGeneration` expects.
 */
function parseOnChainId(dataId: string, label: "key" | "CRS"): bigint {
  try {
    return BigInt(dataId);
  } catch (cause) {
    throw new KeyDigestVerificationFailedError(
      `Cannot verify ${label} digest: dataId "${dataId}" is not a valid on-chain id.`,
      { cause },
    );
  }
}

/**
 * Verifies downloaded FHE public-key and CRS bytes against the on-chain
 * digest recorded by `KMSGeneration`, for the exact `keyId`/`crsId` the
 * relayer served (`publicKeyBytes.id` / `crsBytes.id`).
 *
 * This is an **integrity** check (do these bytes match what the KMS actually
 * produced for this id?), not a **freshness** check (is this the currently
 * active key?) — the latter is out of scope here.
 *
 * @throws {KeyDigestVerificationFailedError} if the on-chain read fails (RPC
 * error, or the id doesn't exist on-chain yet) — retryable, not a security
 * finding.
 * @throws {KeyDigestMismatchError} if the read succeeds and the computed
 * digest doesn't match — terminal, never silently ignored.
 */
export async function verifyFheEncryptionKeyDigest(
  publicClient: PublicClient,
  kmsGenerationAddress: Address,
  keyBytes: {
    readonly publicKeyBytes: { readonly id: string; readonly bytes: Uint8Array };
    readonly crsBytes: { readonly id: string; readonly bytes: Uint8Array };
  },
): Promise<void> {
  const keyId = parseOnChainId(keyBytes.publicKeyBytes.id, "key");
  const crsId = parseOnChainId(keyBytes.crsBytes.id, "CRS");

  let keyMaterials, crsMaterials;
  try {
    [keyMaterials, crsMaterials] = await Promise.all([
      publicClient.readContract(getKeyMaterialsContract(kmsGenerationAddress, keyId)),
      publicClient.readContract(getCrsMaterialsContract(kmsGenerationAddress, crsId)),
    ]);
  } catch (cause) {
    throw new KeyDigestVerificationFailedError(
      `Failed to read key/CRS materials from KMSGeneration at ${kmsGenerationAddress} for keyId=${keyId.toString()}, crsId=${crsId.toString()}.`,
      { cause },
    );
  }

  const [, keyDigests] = keyMaterials;
  const publicKeyDigest = keyDigests.find((d) => d.keyType === KMS_GENERATION_KEY_TYPE_PUBLIC);
  if (publicKeyDigest === undefined) {
    throw new KeyDigestVerificationFailedError(
      `KMSGeneration has no Public key digest recorded for keyId=${keyId.toString()}.`,
    );
  }

  const computedKeyDigest = digest(DSEP_KEY, keyBytes.publicKeyBytes.bytes);
  if (!bytesEqual(computedKeyDigest, hexToBytes(publicKeyDigest.digest))) {
    throw new KeyDigestMismatchError(
      `Downloaded FHE public key bytes (keyId=${keyId.toString()}) don't match the on-chain KMSGeneration digest.`,
    );
  }

  const [, crsDigest] = crsMaterials;
  const computedCrsDigest = digest(DSEP_CRS, keyBytes.crsBytes.bytes);
  if (!bytesEqual(computedCrsDigest, hexToBytes(crsDigest))) {
    throw new KeyDigestMismatchError(
      `Downloaded CRS bytes (crsId=${crsId.toString()}) don't match the on-chain KMSGeneration digest.`,
    );
  }
}
