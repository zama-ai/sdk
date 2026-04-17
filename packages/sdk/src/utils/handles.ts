export const ZERO_HANDLE =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * Check whether a handle represents the zero value.
 */
export function isZeroHandle(handle: string): boolean {
  return handle === ZERO_HANDLE || handle === "0x";
}
