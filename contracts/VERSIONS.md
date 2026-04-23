# Contract Versions

## confidential-wrapper

Source: `zama-ai/protocol-apps` @ `da4afe387420`, imported through
the Soldeer dependency alias `protocol-apps-wrapper`.

> **Deployment status:** this commit is the version currently deployed on testnet and mainnet.
> It is NOT the upcoming upgrade.
> The upcoming upgrade — rolling out first on testnet, then on mainnet — corresponds
> to the official protocol-apps wrapper reference commit
> `b06eb263d64c788a27b6bc1baf46b7547f7ec594`.

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
- ERC-165 interfaceId: `0xd04584ba`
- `totalSupply()` still present (will be renamed to `inferredTotalSupply`)

## confidential-token-wrappers-registry

Source: `zama-ai/protocol-apps` @ `f51845b08cc2`, imported through
the Soldeer dependency alias `protocol-apps-registry`.

Includes:

- `contracts/confidential-token-wrappers-registry/contracts/ConfidentialTokenWrappersRegistry.sol`

Replaces local `WrappersRegistry.sol` (non-upgradeable) with UUPS + Ownable2Step upgradeable registry.

Key API changes:

- `registerPair(token, cToken)` → `registerConfidentialToken(token, cToken)`
- `revokeConfidentialToken(cToken)` added
- `initialize(address owner)` initializer (UUPS proxy pattern)
