import type { Address, Hex } from "viem";
import type { EncryptedValue } from "../relayer/types";

export const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
export const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
export const WRAPPER = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address;
export const ACL = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;
export const DELEGATOR = "0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC" as Address;
export const DELEGATE = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB" as Address;
export const VALID_ENCRYPTED_VALUE = ("0x" + "ab".repeat(32)) as EncryptedValue;
export const VALID_INPUT_PROOF = ("0x" + "cd".repeat(64)) as Hex;

export const TEST_PUBLIC_KEY = `0x${"11".repeat(32)}` as Hex;
export const TEST_PRIVATE_KEY = `0x${"22".repeat(32)}` as Hex;
export const TEST_SIGNATURE = `0x${"33".repeat(65)}` as Hex;
export const TEST_UNSIGNED_TX = "0xdeadbeef" as Hex;
export const TEST_SIGNED_TX = "0xfeedface" as Hex;
export const TEST_TX_HASH = `0x${"ab".repeat(32)}` as Hex;

export const TEST_ADDR_A = ACL;
export const TEST_ADDR_B = DELEGATE;
