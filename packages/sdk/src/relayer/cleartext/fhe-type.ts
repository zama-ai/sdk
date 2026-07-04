// Pure FHE-type utilities for the off-chain cleartext relayer — zero WASM
// dependency. Bridges between the on-chain handle type-id (byte 30 of a handle)
// and the SDK's Solidity-style value-type names (`bool` / `uint*` / `address`)
// that the new `@fhevm/sdk` interface speaks.

export type FheTypeId = 0 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/** SDK value-type name as used by `EncryptInput` / `TypedValue`. */
export type ValueTypeName =
  | "bool"
  | "uint8"
  | "uint16"
  | "uint32"
  | "uint64"
  | "uint128"
  | "uint256"
  | "address";

const ValueTypeNameToId: Record<ValueTypeName, FheTypeId> = {
  bool: 0,
  uint8: 2,
  uint16: 3,
  uint32: 4,
  uint64: 5,
  uint128: 6,
  address: 7,
  uint256: 8,
};

const FheTypeIdToValueTypeName: Record<FheTypeId, ValueTypeName> = {
  0: "bool",
  2: "uint8",
  3: "uint16",
  4: "uint32",
  5: "uint64",
  6: "uint128",
  7: "address",
  8: "uint256",
};

const FheTypeIdToEncryptionBits: Record<FheTypeId, number> = {
  0: 2,
  2: 8,
  3: 16,
  4: 32,
  5: 64,
  6: 128,
  7: 160,
  8: 256,
};

export function isFheTypeId(value: number): value is FheTypeId {
  return value in FheTypeIdToValueTypeName;
}

export function isValueTypeName(value: unknown): value is ValueTypeName {
  return typeof value === "string" && value in ValueTypeNameToId;
}

export function fheTypeIdFromValueTypeName(name: string): FheTypeId {
  if (!isValueTypeName(name)) {
    throw new Error(`Unsupported FHE type '${name}'`);
  }
  return ValueTypeNameToId[name];
}

export function valueTypeNameFromFheTypeId(id: number): ValueTypeName {
  if (!isFheTypeId(id)) {
    throw new Error(`Invalid FHE type id '${id}'`);
  }
  return FheTypeIdToValueTypeName[id];
}

export function encryptionBitsFromFheTypeId(id: number): number {
  if (!isFheTypeId(id)) {
    throw new Error(`Invalid FHE type id '${id}'`);
  }
  return FheTypeIdToEncryptionBits[id];
}
