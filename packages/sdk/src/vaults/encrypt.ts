import type { Address, Hex } from "viem";
import { EncryptionFailedError } from "../errors";
import type { EncryptedValue } from "../relayer/types";
import type { ZamaSDK } from "../zama-sdk";
import type { AllocationLeg, EncryptedAllocation } from "./allocation";

/** One euint64 encrypted for `contractAddress`, with the proof that binds it to `userAddress`. */
export async function encryptEuint64(
  sdk: ZamaSDK,
  value: bigint,
  contractAddress: Address,
  userAddress: Address,
): Promise<{ encryptedAmount: EncryptedValue; inputProof: Hex }> {
  const { encryptedValues, inputProof } = await sdk.encrypt({
    values: [{ value, type: "euint64" }],
    contractAddress,
    userAddress,
  });
  const [encryptedAmount] = encryptedValues;
  if (!encryptedAmount) {
    throw new EncryptionFailedError("Encryption returned no encrypted values");
  }
  return { encryptedAmount, inputProof };
}

/**
 * One FHE input per leg, bound to the router rather than the batchers or the
 * tokens: the router is the contract that verifies the proof.
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
      batcher: leg.batcher,
      token: leg.token,
      amount: encryptedValues[index] as EncryptedValue,
    })),
    inputProof,
  };
}
