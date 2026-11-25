import type { Hex } from "viem";
import { DecryptionFailedError, wrapDecryptError } from "../errors";
import type { EncryptedValue, RelayerRequestOptions, RelayerSDK } from "./types";

/**
 * Publicly decrypt one euint64-or-wider handle, such as an unwrap amount, for an on-chain finalize call.
 *
 * @throws if public decryption fails, including when the relayer returns no bigint for `encryptedValue`. {@link DecryptionFailedError}
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
  const returnedHandle = result.checkSignaturesArgs.handlesList[0];
  if (returnedHandle?.toLowerCase() !== encryptedValue.toLowerCase()) {
    throw new DecryptionFailedError(
      `Public decryption of ${encryptedValue} returned values for ${returnedHandle ?? "no handle"}`,
    );
  }
  const value = result.clearValues[0]?.value;
  if (typeof value !== "bigint") {
    throw new DecryptionFailedError(
      `Public decryption of ${encryptedValue} returned ${value === undefined ? "no value" : `a ${typeof value}`}, not a bigint`,
    );
  }
  return { value, decryptionProof: result.checkSignaturesArgs.decryptionProof };
}
