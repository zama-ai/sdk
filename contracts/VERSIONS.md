# Contract Versions

## confidential-wrapper

Source: `zama-ai/protocol-apps` @ `3bd308fb7cb1`, imported through
the Soldeer dependency alias `protocol-apps-wrapper`.

This commit reflects the post-mainnet-upgrade state (upgrade rolled out in May 2026).

Includes:

- `contracts/confidential-wrapper/contracts/extensions/ERC7984ERC20WrapperUpgradeable.sol`
- `contracts/confidential-wrapper/contracts/interfaces/IERC7984ERC20Wrapper.sol`
- `contracts/confidential-wrapper/contracts/token/ERC7984Upgradeable.sol`
- `contracts/confidential-wrapper/contracts/fhevm/ZamaEthereumConfigUpgradeable.sol`
- `contracts/confidential-wrapper/contracts/ConfidentialWrapper.sol`

Key properties of this version:

- `finalizeUnwrap` first param: `bytes32 unwrapRequestId`
- `unwrap()` returns `bytes32 unwrapRequestId`
- Events `UnwrapRequested` and `UnwrapFinalized` include `bytes32 indexed unwrapRequestId`
- Functions `unwrapAmount(bytes32)` and `unwrapRequester(bytes32)` available
- `wrap()` and `onTransferReceived()` do not emit `Wrapped`
- ERC-165 interfaceId: `0x1f1c62b2`
- Plaintext supply accessor renamed to `inferredTotalSupply()`

## confidential-token-wrappers-registry

Source: `zama-ai/protocol-apps` @ `0647c5fd9e41`, imported through
the Soldeer dependency alias `protocol-apps-registry`.

Includes:

- `contracts/confidential-token-wrappers-registry/contracts/ConfidentialTokenWrappersRegistry.sol`

UUPS + Ownable2Step upgradeable registry. Public API:

- `registerConfidentialToken(token, cToken)`
- `revokeConfidentialToken(cToken)`
- `initialize(address owner)` (UUPS proxy initializer)
