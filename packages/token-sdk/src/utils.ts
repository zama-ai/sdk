import type { Address } from "./relayer/relayer-sdk.types";

/** Convert a Uint8Array to a hex string prefixed with `0x`. */
export function toHex(bytes: Uint8Array): Address {
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `0x${hex}` as Address;
}
