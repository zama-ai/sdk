import type { Address, FheType } from "./relayer-sdk.types";

/**
 * Decode a raw decrypted bigint into the appropriate JavaScript type
 * based on the FHE type that was originally encrypted.
 *
 * @param value - Raw decrypted bigint from the relayer.
 * @param type - The FHE type of the encrypted value.
 * @returns The decoded value: `boolean` for `"bool"`, `Address` for `"address"`, `bigint` otherwise.
 */
export function decodeDecryptedValue(value: bigint, type: "bool"): boolean;
export function decodeDecryptedValue(value: bigint, type: "address"): Address;
export function decodeDecryptedValue(value: bigint, type: FheType): bigint | boolean | Address;
export function decodeDecryptedValue(value: bigint, type: FheType): bigint | boolean | Address {
  switch (type) {
    case "bool":
      return value !== 0n;
    case "address":
      return `0x${value.toString(16).padStart(40, "0")}` as Address;
    default:
      return value;
  }
}
