# Contract Versions

## confidential-wrapper

Source: `zama-ai/protocol-apps` @ `da4afe387420` (March 26, 2026), imported through
the Soldeer dependency alias `protocol-apps-wrapper`.

> **Deployment status:** this commit is the version **currently deployed** on testnet and mainnet
> as of the time this PR was written (April 2026). It is NOT the upcoming April 21/28 upgrade.
> The April 21 (testnet) / April 28 (mainnet) upgrade corresponds to a later commit (`93c6e7a`,
> April 7 2026) and is tracked in SDK-68 sub-tickets (SDK-69 → SDK-70 → SDK-71 → SDK-72).

Includes:

- `contracts/confidential-wrapper/contracts/extensions/ERC7984ERC20WrapperUpgradeable.sol`
- `contracts/confidential-wrapper/contracts/interfaces/IERC7984ERC20Wrapper.sol`
- `contracts/confidential-wrapper/contracts/token/ERC7984Upgradeable.sol`
- `contracts/confidential-wrapper/contracts/fhevm/ZamaEthereumConfigUpgradeable.sol`
- `contracts/confidential-wrapper/contracts/ConfidentialWrapper.sol`

Key changes at this commit vs prior local (Zaiffer fork):

- `finalizeUnwrap` first param: `bytes32 unwrapRequestId` (was `euint64 burntAmount`)
- `unwrap()` returns `bytes32` unwrapRequestId (was `void`)
- Events `UnwrapRequested` and `UnwrapFinalized` include `bytes32 indexed unwrapRequestId`
- New functions: `unwrapAmount(bytes32)` and `unwrapRequester(bytes32)`
- `emit Wrapped` removed from `wrap()` and `onTransferReceived()`
- ERC-165 interfaceId: `0xf1f4c25a` (changed: `unwrapAmount` and `unwrapRequester` selectors are now included in the XOR)
- `totalSupply()` still present (will be renamed to `inferredTotalSupply` in SDK-71)

## confidential-token-wrappers-registry

Source: `zama-ai/protocol-apps` @ `f51845b08cc2` (December 2025), imported through
the Soldeer dependency alias `protocol-apps-registry`.

Includes:

- `contracts/confidential-token-wrappers-registry/contracts/ConfidentialTokenWrappersRegistry.sol`

Replaces local `WrappersRegistry.sol` (non-upgradeable) with UUPS + Ownable2Step upgradeable registry.

Key API changes:

- `registerPair(token, cToken)` → `registerConfidentialToken(token, cToken)`
- `revokeConfidentialToken(cToken)` added
- `initialize(address owner)` initializer (UUPS proxy pattern)
