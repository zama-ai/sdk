import { ConfigurationError } from "../errors";
import { chains } from "./configs";
import type { FheChain } from "./types";

/** A chain with a preset's id and ACL is that preset's deployment, so it inherits its `keyVerification`. */
export function withPresetKeyVerification(chain: FheChain): FheChain {
  const preset: FheChain | undefined = chains[chain.id];
  if (
    chain.keyVerification !== undefined ||
    preset === undefined ||
    preset.aclContractAddress.toLowerCase() !== chain.aclContractAddress.toLowerCase()
  ) {
    return chain;
  }
  return { ...chain, keyVerification: preset.keyVerification };
}

export function keyVerificationChain(chain: FheChain): FheChain | undefined {
  const keyVerification = chain.keyVerification;
  return keyVerification !== undefined && "chain" in keyVerification
    ? keyVerification.chain
    : undefined;
}

/** Throws `ConfigurationError` when a non-cleartext `chain` has no `KMSGeneration` contract to verify its FHE key against. */
export function assertKeyVerification(chain: FheChain): void {
  const holder = keyVerificationChain(chain) ?? chain;
  if (holder.keyVerification !== undefined && "contract" in holder.keyVerification) {
    return;
  }
  throw new ConfigurationError(
    `Chain ${chain.id} has no KMSGeneration contract to check the FHE public key and CRS against. ` +
      `Set keyVerification on its FheChain: { contract } on an Ethereum host chain, or { chain } with ` +
      `the Ethereum chain that holds it on other host chains.`,
  );
}
