import { bytesToHex, getAddress, hexToBytes } from "viem";
import {
  ConfigurationError,
  type FheChainAuth,
  type Address,
  type ClearValue as SdkClearValue,
  type EncryptedValue,
  type WalletAccount as SdkWalletAccount,
} from "@zama-fhe/sdk";
import type {
  ChainAuth,
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
export function integer(value: string): bigint {
  let parsed: bigint | undefined;
  try {
    parsed = BigInt(value);
  } catch {
    parsed = undefined;
  }
  if (parsed === undefined || parsed.toString() !== value) {
    throw invalidArgument("Encryption integers must use canonical decimal encoding.");
  }
  return parsed;
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

export function chainAuth(value: ChainAuth): FheChainAuth {
  switch (value.credential?.$case) {
    case "bearerToken":
      return { __type: "BearerToken", token: value.credential.bearerToken };
    case "apiKeyHeader":
      return {
        __type: "ApiKeyHeader",
        ...defined({ header: value.credential.apiKeyHeader.name }),
        value: value.credential.apiKeyHeader.value,
      };
    case "apiKeyCookie":
      return {
        __type: "ApiKeyCookie",
        ...defined({ cookie: value.credential.apiKeyCookie.name }),
        value: value.credential.apiKeyCookie.value,
      };
    default:
      throw new ConfigurationError("Chain authentication requires a credential.");
  }
}

export function decodeOptional<T, R>(value: T | undefined, decode: (value: T) => R): R | undefined {
  return value === undefined ? undefined : decode(value);
}

export function defined<T extends object>(value: T): Partial<T> {
  const result: Partial<T> = { ...value };
  for (const key in result) {
    if (result[key] === undefined) {
      delete result[key];
    }
  }
  return result;
}
