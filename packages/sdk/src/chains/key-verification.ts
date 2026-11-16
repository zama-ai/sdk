import { chains } from "./configs";
import type { FheChain } from "./types";

/**
 * Matches a chain's `KMSGeneration` settings to its deployment, by the built-in
 * preset with the same chain id:
 * - same ACL, settings unset: takes the preset's, so a hand-written definition
 *   of a known deployment needs none;
 * - another ACL, settings equal to the preset's: drops them, as they come from
 *   spreading the preset and name the preset's deployment, not this one.
 */
export function withPresetKeyVerification(chain: FheChain): FheChain {
  const preset = chains[chain.id];
  if (preset === undefined) {
    return chain;
  }
  if (preset.aclContractAddress.toLowerCase() === chain.aclContractAddress.toLowerCase()) {
    return hasKeyVerification(chain)
      ? chain
      : {
          ...chain,
          kmsGenerationContractAddress: preset.kmsGenerationContractAddress,
          keyVerificationChain: preset.keyVerificationChain,
        };
  }
  const spreadFromPreset =
    chain.kmsGenerationContractAddress === preset.kmsGenerationContractAddress &&
    chain.keyVerificationChain === preset.keyVerificationChain;
  return spreadFromPreset
    ? { ...chain, kmsGenerationContractAddress: undefined, keyVerificationChain: undefined }
    : chain;
}

/** Whether encryption on `chain` can check the FHE public key and CRS against a `KMSGeneration` contract. */
export function hasKeyVerification(chain: FheChain): boolean {
  return (chain.keyVerificationChain ?? chain).kmsGenerationContractAddress !== undefined;
}
