// Copied from @zama-fhe/relayer-sdk/src/sdk/FheType.ts
// Pure utility functions with zero WASM dependency.
// Adapted to use simple errors instead of RelayerErrorBase hierarchy.

////////////////////////////////////////////////////////////////////////////////
// Types (from types/primitives.d.ts)
////////////////////////////////////////////////////////////////////////////////

export interface FheTypeNameToIdMap {
  ebool: 0;
  //euint4: 1; deprecated
  euint8: 2;
  euint16: 3;
  euint32: 4;
  euint64: 5;
  euint128: 6;
  eaddress: 7;
  euint256: 8;
}

export interface FheTypeIdToNameMap {
  0: "ebool";
  //1: 'euint4'; deprecated
  2: "euint8";
  3: "euint16";
  4: "euint32";
  5: "euint64";
  6: "euint128";
  7: "eaddress";
  8: "euint256";
}

export interface FheTypeEncryptionBitwidthToIdMap {
  2: FheTypeNameToIdMap["ebool"];
  8: FheTypeNameToIdMap["euint8"];
  16: FheTypeNameToIdMap["euint16"];
  32: FheTypeNameToIdMap["euint32"];
  64: FheTypeNameToIdMap["euint64"];
  128: FheTypeNameToIdMap["euint128"];
  160: FheTypeNameToIdMap["eaddress"];
  256: FheTypeNameToIdMap["euint256"];
}

export type FheTypeIdToEncryptionBitwidthMap = {
  [K in keyof FheTypeEncryptionBitwidthToIdMap as FheTypeEncryptionBitwidthToIdMap[K]]: K;
};

type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type FheTypeName = Prettify<keyof FheTypeNameToIdMap>;
export type FheTypeId = Prettify<keyof FheTypeIdToNameMap>;
export type EncryptionBits = Prettify<keyof FheTypeEncryptionBitwidthToIdMap>;

////////////////////////////////////////////////////////////////////////////////
// Lookup Maps
////////////////////////////////////////////////////////////////////////////////

const MINIMUM_ENCRYPTION_BIT_WIDTH = 2;

const FheTypeNameToId: FheTypeNameToIdMap = {
  ebool: 0,
  //euint4: 1, deprecated
  euint8: 2,
  euint16: 3,
  euint32: 4,
  euint64: 5,
  euint128: 6,
  eaddress: 7,
  euint256: 8,
} as const;

const FheTypeIdToName: FheTypeIdToNameMap = {
  0: "ebool",
  //1: 'euint4', deprecated
  2: "euint8",
  3: "euint16",
  4: "euint32",
  5: "euint64",
  6: "euint128",
  7: "eaddress",
  8: "euint256",
} as const;

const FheTypeIdToEncryptionBitwidth: FheTypeIdToEncryptionBitwidthMap = {
  0: 2,
  //1:?, euint4 deprecated
  2: 8,
  3: 16,
  4: 32,
  5: 64,
  6: 128,
  7: 160,
  8: 256,
} as const;

const EncryptionBitwidthToFheTypeId: FheTypeEncryptionBitwidthToIdMap = {
  2: 0,
  8: 2,
  16: 3,
  32: 4,
  64: 5,
  128: 6,
  160: 7,
  256: 8,
} as const;

Object.freeze(FheTypeNameToId);
Object.freeze(FheTypeIdToName);
Object.freeze(FheTypeIdToEncryptionBitwidth);
Object.freeze(EncryptionBitwidthToFheTypeId);

////////////////////////////////////////////////////////////////////////////////
// Type Guards
////////////////////////////////////////////////////////////////////////////////

export function isFheTypeId(value: unknown): value is FheTypeId {
  switch (value as FheTypeId) {
    case 0:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
    case 8:
      return true;
    default:
      return false;
  }
}

export function isFheTypeName(value: unknown): value is FheTypeName {
  if (typeof value !== "string") {
    return false;
  }
  return value in FheTypeNameToId;
}

export function isEncryptionBits(value: unknown): value is EncryptionBits {
  if (typeof value !== "number") {
    return false;
  }
  return value in EncryptionBitwidthToFheTypeId;
}

////////////////////////////////////////////////////////////////////////////////
// Converters
////////////////////////////////////////////////////////////////////////////////

export function fheTypeIdFromEncryptionBits(bitwidth: number): FheTypeId {
  if (!isEncryptionBits(bitwidth)) {
    throw new Error(`Invalid encryption bits ${bitwidth}`);
  }
  return EncryptionBitwidthToFheTypeId[bitwidth];
}

export function fheTypeIdFromName(name: string): FheTypeId {
  if (!isFheTypeName(name)) {
    throw new Error(`Invalid FheType name '${name}'`);
  }
  return FheTypeNameToId[name];
}

export function fheTypeNameFromId(id: number): FheTypeName {
  if (!isFheTypeId(id)) {
    throw new Error(`Invalid FheType id '${id}'`);
  }
  return FheTypeIdToName[id];
}

export function encryptionBitsFromFheTypeId(typeId: number): EncryptionBits {
  if (!isFheTypeId(typeId)) {
    throw new Error(`Invalid FheType id '${typeId}'`);
  }
  const bw = FheTypeIdToEncryptionBitwidth[typeId];
  if (bw < MINIMUM_ENCRYPTION_BIT_WIDTH) {
    throw new Error(
      `Invalid FheType encryption bit width: ${bw}. Minimum is ${MINIMUM_ENCRYPTION_BIT_WIDTH} bits.`,
    );
  }
  return bw;
}

export function encryptionBitsFromFheTypeName(name: string): EncryptionBits {
  if (!isFheTypeName(name)) {
    throw new Error(`Invalid FheType name '${name}'`);
  }
  const bw = FheTypeIdToEncryptionBitwidth[FheTypeNameToId[name]];
  if (bw < MINIMUM_ENCRYPTION_BIT_WIDTH) {
    throw new Error(
      `Invalid FheType encryption bit width: ${bw}. Minimum is ${MINIMUM_ENCRYPTION_BIT_WIDTH} bits.`,
    );
  }
  return bw;
}
