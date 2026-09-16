import { bytesToHex, getAddress, hexToBytes } from "viem";
import type {
  Address,
  ClearValue as SdkClearValue,
  EncryptedValue,
  WalletAccount as SdkWalletAccount,
} from "@zama-fhe/sdk";
import type {
  ClearEntry,
  ClearValue,
  EncryptedInput,
  WalletAccount,
} from "./generated/zama/sdk/v1alpha1/sidecar.js";
import { invalidArgument } from "./errors.js";

export function address(value: Uint8Array): Address {
  if (value.length !== 20) {
    throw invalidArgument("Address must contain 20 bytes.");
  }
  return getAddress(bytesToHex(value));
}
export function walletAccount(value: WalletAccount | undefined): SdkWalletAccount | undefined {
  if (!value) {
    return undefined;
  }
  const chainId = safeInteger(value.chainId, "Chain ID");
  return { address: address(value.address), chainId };
}
export function input(value: EncryptedInput) {
  return {
    encryptedValue: encryptedValue(value.encryptedValue),
    contractAddress: address(value.contractAddress),
  };
}
export function bytes(value: `0x${string}`): Buffer {
  return Buffer.from(hexToBytes(value));
}
export function clearValue(value: SdkClearValue | number): ClearValue {
  switch (typeof value) {
    case "bigint":
      return { value: { $case: "bigintValue", bigintValue: value.toString() } };
    case "number":
      return {
        value: { $case: "numberValue", numberValue: unsignedInteger(value, "Clear value") },
      };
    case "boolean":
      return { value: { $case: "boolValue", boolValue: value } };
    case "string":
      return { value: { $case: "stringValue", stringValue: value } };
    case "undefined":
      return { value: { $case: "undefinedValue", undefinedValue: {} } };
    default:
      throw new TypeError("Unsupported SDK clear value.");
  }
}
export function entries(values: Record<EncryptedValue, SdkClearValue>): ClearEntry[] {
  return Object.entries(values).map(([handle, value]) => ({
    encryptedValue: bytes(handle as EncryptedValue),
    value: clearValue(value),
  }));
}
export function json(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}

export function safeInteger(value: bigint, name: string): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 0) {
    throw invalidArgument(`${name} exceeds the unsigned safe integer range.`);
  }
  return result;
}
export function unsignedInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw invalidArgument(`${name} must be an unsigned 32-bit integer.`);
  }
  return value;
}

export function encryptedValue(value: Uint8Array): EncryptedValue {
  if (value.length !== 32) {
    throw invalidArgument("Encrypted value must contain 32 bytes.");
  }
  return bytesToHex(value);
}
