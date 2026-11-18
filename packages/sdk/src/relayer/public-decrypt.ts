import type { Hex } from "viem";
import { DecryptionFailedError } from "../errors";
import type { EncryptedValue, RelayerRequestOptions, RelayerSDK } from "./types";

/** A publicly decrypted uint, with what on-chain verification needs. */
export interface DecryptPublicUintResult {
  /** The clear-text value. */
  readonly value: bigint;
  /** The clear value ABI-encoded, as passed to on-chain verification. */
  readonly abiEncodedClearValues: Hex;
  /** KMS signature proving the decryption is authentic. */
  readonly decryptionProof: Hex;
}

/**
 * Publicly decrypt one uint handle through `relayer`.
 *
 * @internal Use `sdk.decryption.decryptPublicUint`; this is for code that has only the relayer.
 * @throws if the relayer returns no value, or a value that is not a bigint. {@link DecryptionFailedError}
 */
export async function decryptPublicUint(
  relayer: Pick<RelayerSDK, "decryptPublicValuesWithSignatures">,
  encryptedValue: EncryptedValue,
  options: RelayerRequestOptions,
): Promise<DecryptPublicUintResult> {
  const result = await relayer.decryptPublicValuesWithSignatures({
    encryptedValues: [encryptedValue],
    options,
  });
  const value = result.clearValues[0]?.value;
  if (typeof value !== "bigint") {
    throw new DecryptionFailedError(
      `Public decryption of ${encryptedValue} returned ${value === undefined ? "no value" : `a ${typeof value}`}, not a uint`,
    );
  }
  return {
    value,
    abiEncodedClearValues: result.checkSignaturesArgs.abiEncodedCleartexts,
    decryptionProof: result.checkSignaturesArgs.decryptionProof,
  };
}
