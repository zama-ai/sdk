export const ZERO_ENCRYPTED_VALUE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * Check whether an encrypted value represents the zero value.
 */
export function isEncryptedValueZero(encryptedValue: string): boolean {
  return encryptedValue === ZERO_ENCRYPTED_VALUE || encryptedValue === "0x";
}
