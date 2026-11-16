import { chains } from "./configs";
import type { FheChain } from "./types";

/**
 * Fills the `KMSGeneration` settings of a chain written by hand from the
 * built-in preset of the same deployment (same chain id and ACL), so that only
 * a custom deployment has to name its `KMSGeneration` contract.
 */
export function withPresetKeyVerification(chain: FheChain): FheChain {
  if (hasKeyVerification(chain)) {
    return chain;
  }
  const preset = chains[chain.id];
  if (preset?.aclContractAddress.toLowerCase() !== chain.aclContractAddress.toLowerCase()) {
    return chain;
  }
  const { kmsGenerationContractAddress, keyVerificationChain } = preset;
  return { ...chain, kmsGenerationContractAddress, keyVerificationChain };
}

/** Whether encryption on `chain` can check the FHE public key and CRS against a `KMSGeneration` contract. */
export function hasKeyVerification(chain: FheChain): boolean {
  return (
    chain.kmsGenerationContractAddress !== undefined || chain.keyVerificationChain !== undefined
  );
}
