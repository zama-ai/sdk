export const ZERO_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * Check whether an encrypted value represents the zero value.
 */
export function isZeroHandle(encryptedValue: string): boolean {
  return encryptedValue === ZERO_HANDLE || encryptedValue === "0x";
}
