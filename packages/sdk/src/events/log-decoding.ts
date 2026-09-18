/**
 * Primitives for decoding raw EVM logs without an ABI decoder.
 *
 * @internal
 */

import { getAddress, keccak256, toBytes, type Address, type Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";
import { prefixHex } from "../utils";

/** Hashes the canonical signature — `Joined(uint256,address,bytes32)`, not the declaration with parameter names. */
export function eventTopic(signature: string): Hex {
  return keccak256(toBytes(signature));
}

export function topicToAddress(topic: Hex): Address {
  return getAddress(prefixHex(topic.slice(-40)));
}

export function topicToBytes32(topic: Hex): EncryptedValue {
  // EVM topics are already 32-byte 0x-prefixed hex — cast directly
  return topic as EncryptedValue;
}

export function wordAt(data: Hex, index: number): string {
  // data starts with "0x", each word is 64 hex chars (32 bytes)
  const start = 2 + index * 64;
  const word = data.slice(start, start + 64);
  return word.length === 64 ? word : word.padEnd(64, "0");
}

export function wordToAddress(data: Hex, index: number): Address {
  return getAddress(prefixHex(wordAt(data, index).slice(-40)));
}

export function wordToBigInt(data: Hex, index: number): bigint {
  return BigInt("0x" + wordAt(data, index));
}

export function wordToBytes32(data: Hex, index: number): EncryptedValue {
  // wordAt returns exactly 64 hex chars — prefix and cast directly
  return prefixHex(wordAt(data, index)) as EncryptedValue;
}
