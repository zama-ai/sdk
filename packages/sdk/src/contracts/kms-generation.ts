import type { Address } from "viem";
import { kmsGenerationAbi } from "../abi/kms-generation.abi";

/**
 * Returns the contract config to read a key's storage URLs and per-type
 * digests (`KeyType.Server` / `KeyType.Public`).
 *
 * @example
 * ```ts
 * const [urls, digests] = await publicClient.readContract(
 *   getKeyMaterialsContract(kmsGenerationAddress, keyId),
 * );
 * ```
 */
export function getKeyMaterialsContract(kmsGenerationAddress: Address, keyId: bigint) {
  return {
    address: kmsGenerationAddress,
    abi: kmsGenerationAbi,
    functionName: "getKeyMaterials",
    args: [keyId],
  } as const;
}

/**
 * Returns the contract config to read a CRS's storage URLs and digest.
 *
 * @example
 * ```ts
 * const [urls, digest] = await publicClient.readContract(
 *   getCrsMaterialsContract(kmsGenerationAddress, crsId),
 * );
 * ```
 */
export function getCrsMaterialsContract(kmsGenerationAddress: Address, crsId: bigint) {
  return {
    address: kmsGenerationAddress,
    abi: kmsGenerationAbi,
    functionName: "getCrsMaterials",
    args: [crsId],
  } as const;
}
