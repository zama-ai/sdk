import { getAddress, type Address, type Hex } from "viem";
import { isConfidentialTokenValidContract } from "../contracts";
import { EncryptionFailedError } from "../errors";
import type { ZamaSDK } from "../zama-sdk";
import type { AllocationLeg, EncryptedAllocation } from "./allocation";
import { tokenWrapperRegistryContract } from "./contracts";

/** Immutable on chain, so callers may cache the answer. */
export async function readTokenWrapperRegistry(sdk: ZamaSDK, router: Address): Promise<Address> {
  return getAddress(await sdk.provider.readContract(tokenWrapperRegistryContract(router)));
}

/** Whether `registry` lists `token`, which is what the router gates a pushed transfer on. */
export async function isTokenListed(
  sdk: ZamaSDK,
  registry: Address,
  token: Address,
): Promise<boolean> {
  return sdk.provider.readContract(isConfidentialTokenValidContract(registry, getAddress(token)));
}

/**
 * One FHE input for every leg, bound to the router rather than the batchers
 * or the tokens: the router is the contract that verifies the proof.
 *
 * @throws if encryption returns a different number of values than legs. {@link EncryptionFailedError}
 */
export async function encryptAllocation(
  sdk: ZamaSDK,
  router: Address,
  holder: Address,
  legs: readonly AllocationLeg[],
): Promise<EncryptedAllocation> {
  const { encryptedValues, inputProof } = await sdk.encrypt({
    values: legs.map((leg) => ({ value: leg.amount, type: "euint64" as const })),
    contractAddress: router,
    userAddress: holder,
  });
  if (encryptedValues.length !== legs.length) {
    throw new EncryptionFailedError(
      `Encryption returned ${encryptedValues.length} values for ${legs.length} legs`,
    );
  }
  return {
    legs: legs.map((leg, index) => ({
      batcher: getAddress(leg.batcher),
      token: getAddress(leg.token),
      // Index-paired with the values submitted above, whose count was just checked.
      amount: encryptedValues[index] as Hex,
    })),
    inputProof,
  };
}
