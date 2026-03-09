import { HardhatConfig } from "../relayer-utils";

export const HANDLE_VERSION = 0;

export const PREHANDLE_MASK = 0xffffffffffffffffffffffffffffffffffffffffff0000000000000000000000n;

// Constants used for instanciation of the cleartext FHEVM instance.
export const MOCK_INPUT_SIGNER_PK =
  "0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901";
export const MOCK_KMS_SIGNER_PK =
  "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91";

export const VERIFYING_CONTRACTS = {
  inputVerification: HardhatConfig.verifyingContractAddressInputVerification,
  decryption: HardhatConfig.verifyingContractAddressDecryption,
} as const;

export const GATEWAY_CHAIN_ID = 10_901;
