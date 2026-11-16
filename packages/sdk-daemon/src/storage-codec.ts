import { deserialize, serialize } from "node:v8";
import { invalidArgument } from "./errors.js";

const prefix = Buffer.from("ZAMA-KV\x01");
export function encodeStorage(value: unknown): Uint8Array {
  return Buffer.concat([prefix, serialize(value)]);
}
export function decodeStorage<T>(value: Uint8Array): T {
  const bytes = Buffer.from(value);
  if (!bytes.subarray(0, prefix.length).equals(prefix)) {
    throw invalidArgument("Unsupported application storage payload version.");
  }
  return deserialize(bytes.subarray(prefix.length)) as T;
}
