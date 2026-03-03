export const FHEVM_ADDRESSES = {
  acl: "0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D",
  executor: "0xe3a9105a3a932253A70F126eb1E3b589C643dD24",
  inputVerifier: "0x36772142b74871f255CbD7A3e89B401d3e45825f",
  kmsVerifier: "0x901F8942346f7AB3a01F6D7613119Bca447Bb030",
} as const;

export const VERIFYING_CONTRACTS = {
  inputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  decryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
} as const;

export const GATEWAY_CHAIN_ID = 10_901;

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
