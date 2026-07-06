import type { ClearValue } from "@zama-fhe/sdk";

/**
 * `ClearValue` can be a `bigint`, `boolean`, or address `string` (matching
 * the FHE type of whatever was decrypted). `JSON.stringify` can't round-trip
 * `bigint` on its own, so every store that persists a `ClearValue` tags it
 * with its runtime type first.
 */
type SerializedClearValue =
  | { kind: "bigint"; value: string }
  | { kind: "boolean"; value: boolean }
  | { kind: "string"; value: string };

export function serializeClearValue(value: ClearValue): SerializedClearValue {
  if (typeof value === "bigint") return { kind: "bigint", value: value.toString() };
  if (typeof value === "boolean") return { kind: "boolean", value };
  return { kind: "string", value };
}

export function deserializeClearValue(serialized: SerializedClearValue): ClearValue {
  if (serialized.kind === "bigint") return BigInt(serialized.value);
  if (serialized.kind === "boolean") return serialized.value;
  return serialized.value;
}
