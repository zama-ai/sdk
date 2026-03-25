import type { Hex } from "viem";
import { assertCondition } from "./assertions";

/** Normalize a un-prefixed hex payload to a 0x-prefixed `Hex` value. */
export function prefixHex(value: string): Hex {
  return (value.startsWith("0x") ? value : `0x${value}`) as Hex;
}

/** Convert a public `Hex` value back an unprefixed format. */
export function unprefixHex(value: Hex): string {
  assertCondition(value.startsWith("0x"), `Expected 0x-prefixed hex, got: ${value}`);
  return value.slice(2);
}
