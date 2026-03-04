export enum FheType {
  Bool = 0,
  Uint4 = 1,
  Uint8 = 2,
  Uint16 = 3,
  Uint32 = 4,
  Uint64 = 5,
  Uint128 = 6,
  Uint160 = 7,
  Uint256 = 8,
}

export const FHE_BIT_WIDTHS: Record<FheType, number> = {
  [FheType.Bool]: 1,
  [FheType.Uint4]: 4,
  [FheType.Uint8]: 8,
  [FheType.Uint16]: 16,
  [FheType.Uint32]: 32,
  [FheType.Uint64]: 64,
  [FheType.Uint128]: 128,
  [FheType.Uint160]: 160,
  [FheType.Uint256]: 256,
};

export const HANDLE_VERSION = 0;

export const PREHANDLE_MASK = 0xffffffffffffffffffffffffffffffffffffffffff0000000000000000000000n;
