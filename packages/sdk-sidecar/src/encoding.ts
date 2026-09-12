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
  const chainId = Number(value.chainId);
  if (!Number.isSafeInteger(chainId)) {
    throw invalidArgument("Chain ID exceeds safe integer range.");
  }
  return { address: address(value.address), chainId };
}
export function input(value: EncryptedInput) {
  return {
    encryptedValue: bytesToHex(value.encryptedValue),
    contractAddress: address(value.contractAddress),
  };
}
export function bytes(value: `0x${string}`): Buffer {
  return Buffer.from(hexToBytes(value));
}
export function clearValue(value: SdkClearValue): ClearValue {
  switch (typeof value) {
    case "bigint":
      return { value: { $case: "bigintValue", bigintValue: value.toString() } };
    case "number":
      return { value: { $case: "numberValue", numberValue: value } };
    case "boolean":
      return { value: { $case: "boolValue", boolValue: value } };
    case "string":
      return { value: { $case: "stringValue", stringValue: value } };
    case "undefined":
      return { value: { $case: "undefinedValue", undefinedValue: true } };
    default:
      throw new TypeError("Unsupported SDK clear value.");
  }
}
export function entries(values: Record<EncryptedValue, SdkClearValue>): ClearEntry[] {
  return Object.entries(values).map(([encryptedValue, value]) => ({
    encryptedValue: bytes(encryptedValue as EncryptedValue),
    value: clearValue(value),
  }));
}
export function json(value: unknown): string {
  return JSON.stringify(value, (_, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  );
}
