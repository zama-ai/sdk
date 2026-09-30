import type { Address, Hex } from "viem";
import { EncryptionFailedError } from "../errors";
import type { EncryptedValue } from "../relayer/types";
import type { ZamaSDK } from "../zama-sdk";

export interface EncryptEuint64sParams {
  readonly values: readonly bigint[];
  readonly contractAddress: Address;
  readonly userAddress: Address;
}

/**
 * Encrypts `values` as euint64s, in order, under one input proof that only
 * `contractAddress` can verify and only for `userAddress`.
 *
 * @throws if encryption returns a different number of values. {@link EncryptionFailedError}
 */
export function encryptEuint64s(
  sdk: ZamaSDK,
  params: EncryptEuint64sParams & { readonly values: readonly [bigint] },
): Promise<{ encryptedValues: readonly [EncryptedValue]; inputProof: Hex }>;
export function encryptEuint64s(
  sdk: ZamaSDK,
  params: EncryptEuint64sParams,
): Promise<{ encryptedValues: readonly EncryptedValue[]; inputProof: Hex }>;
export async function encryptEuint64s(
  sdk: ZamaSDK,
  params: EncryptEuint64sParams,
): Promise<{ encryptedValues: readonly EncryptedValue[]; inputProof: Hex }> {
  const { encryptedValues, inputProof } = await sdk.encrypt({
    values: params.values.map((value) => ({ value, type: "euint64" as const })),
    contractAddress: params.contractAddress,
    userAddress: params.userAddress,
  });
  if (encryptedValues.length !== params.values.length) {
    throw new EncryptionFailedError(
      `Encryption returned ${encryptedValues.length} values for ${params.values.length}`,
    );
  }
  return { encryptedValues, inputProof };
}
