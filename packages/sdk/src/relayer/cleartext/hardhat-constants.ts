// Shared hardhat-only constants used by the cleartext preset and deploy script.
export const MOCK_INPUT_SIGNER_PK =
  "0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901";
export const MOCK_KMS_SIGNER_PK =
  "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91";

export const VERIFYING_CONTRACTS = {
  inputVerification: "0x812b06e1CDCE800494b79fFE4f925A504a9A9810",
  decryption: "0x5ffdaAB0373E62E2ea2944776209aEf29E631A64",
} as const;

export const GATEWAY_CHAIN_ID = 10_901;
