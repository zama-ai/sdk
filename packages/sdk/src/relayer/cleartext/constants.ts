export const MOCK_INPUT_SIGNER_PK =
  "0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901";
export const MOCK_KMS_SIGNER_PK =
  "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91";

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
