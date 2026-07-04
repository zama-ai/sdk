// Constants for the off-chain cleartext relayer.
//
// The two mock signer keys below are the deterministic defaults registered by
// the `forge-fhevm` Foundry library's `DeployFHEVMHost` script
// (`KMS_SIGNER_PRIVATE_KEY_0` / `COPROCESSOR_SIGNER_PRIVATE_KEY_0`). Using the
// same keys keeps the mock input proofs and public-decrypt proofs verifiable
// on-chain against a partner's forge-fhevm deployment.

export const HANDLE_VERSION = 0;

export const PREHANDLE_MASK = 0xffffffffffffffffffffffffffffffffffffffffff0000000000000000000000n;

export const MOCK_INPUT_SIGNER_PK =
  "0x7ec8ada6642fc4ccfb7729bc29c17cf8d21b61abd5642d1db992c0b8672ab901" as const;
export const MOCK_KMS_SIGNER_PK =
  "0x388b7680e4e1afa06efbfd45cdd1fe39f3c6af381df6555a19661f283b97de91" as const;
