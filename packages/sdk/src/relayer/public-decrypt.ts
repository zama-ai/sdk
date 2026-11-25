import type { Hex } from "viem";
import { DecryptionFailedError, wrapDecryptError } from "../errors";
import type { EncryptedValue, RelayerRequestOptions, RelayerSDK } from "./types";

/**
 * Publicly decrypt one uint handle, such as an unwrap amount, for an on-chain finalize call.
 *
 * @throws if the relayer returns no value, or a value that is not a uint. {@link DecryptionFailedError}
 */
export async function decryptPublicUint(
  relayer: Pick<RelayerSDK, "decryptPublicValuesWithSignatures">,
  encryptedValue: EncryptedValue,
  options: RelayerRequestOptions,
): Promise<{ value: bigint; decryptionProof: Hex }> {
  const result = await relayer
    .decryptPublicValuesWithSignatures({ encryptedValues: [encryptedValue], options })
    .catch((error: unknown) => {
      throw wrapDecryptError(error, "Public decryption failed");
    });
  const value = result.clearValues[0]?.value;
  if (typeof value !== "bigint") {
    throw new DecryptionFailedError(
      `Public decryption of ${encryptedValue} returned ${value === undefined ? "no value" : `a ${typeof value}`}, not a uint`,
    );
  }
  return { value, decryptionProof: result.checkSignaturesArgs.decryptionProof };
}
