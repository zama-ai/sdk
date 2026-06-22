# Contract Versions

## confidential-wrapper

Source: `zama-ai/protocol-apps` @ `71611c624ddc` (no release tags exist —
`main` is the deployment), imported through the Soldeer dependency alias
`protocol-apps-wrapper`.

This pin matches `ConfidentialWrapperV3`, which is the version live on both
mainnet and Sepolia.

Includes:

- `contracts/confidential-wrapper/contracts/ConfidentialWrapper.sol` (V1 base)
- `contracts/confidential-wrapper/contracts/upgrades/ConfidentialWrapperV2.sol`
- `contracts/confidential-wrapper/contracts/upgrades/ConfidentialWrapperV3.sol`
- `contracts/confidential-wrapper/contracts/extensions/ERC7984ERC20WrapperUpgradeable.sol`
- `contracts/confidential-wrapper/contracts/interfaces/IERC7984ERC20Wrapper.sol`
- `contracts/confidential-wrapper/contracts/token/ERC7984Upgradeable.sol`
- `contracts/confidential-wrapper/contracts/fhevm/ZamaEthereumConfigUpgradeable.sol`

### V1 base / V2 properties (inherited by V3)

- `finalizeUnwrap` first param: `bytes32 unwrapRequestId`
- `unwrap()` returns `bytes32 unwrapRequestId`
- Events `UnwrapRequested` and `UnwrapFinalized` include `bytes32 indexed unwrapRequestId`
- Functions `unwrapAmount(bytes32)` and `unwrapRequester(bytes32)` available
- `wrap()` and `onTransferReceived()` emit `Wrap(address indexed to, uint256 roundedAmount, euint64 encryptedWrappedAmount)`
- ERC-165 interfaceId: `0x1f1c62b2`
- Plaintext supply accessor named `inferredTotalSupply()`

### V3 denylist surface (added in protocol-apps#175)

Owner-controlled denylist preventing blocked addresses from participating in
confidential transfers, wraps, and unwraps.

Functions:

- `reinitializeV3(address[] blockedUsers, bytes4 underlyingDenyListSelector, bool hasUnderlyingDenyListSelector_)` — seeds the denylist on upgrade from V2
- `blockUser(address user)` — owner only
- `unblockUser(address user)` — owner only
- `isBlocked(address user) → bool`
- `getUnderlyingDenyListSelector() → (bool isSet, bytes4 selector)`

Events:

- `UserBlocked(address indexed user)`
- `UserUnblocked(address indexed user)`

Errors:

- `BlockedUser(address user)`
- `UserAlreadyBlocked(address user)`
- `UserAlreadyUnblocked(address user)`
- `UnderlyingDenyListCallFailed()`
- `InvalidUnderlyingDenyListResponse()`
- `UnderlyingDenyListedAddress(address user)`

The test harness (`script/Deploy.s.sol`) deploys `ConfidentialWrapperV3` as the
implementation and calls `reinitializeV3([], bytes4(0), false)` on each proxy,
so SDK tests touching the denylist surface have something to run against.

## confidential-token-wrappers-registry

Source: `zama-ai/protocol-apps` @ `0647c5fd9e41`, imported through
the Soldeer dependency alias `protocol-apps-registry`.

Includes:

- `contracts/confidential-token-wrappers-registry/contracts/ConfidentialTokenWrappersRegistry.sol`

UUPS + Ownable2Step upgradeable registry. Public API:

- `registerConfidentialToken(tokenAddress, confidentialTokenAddress)`
- `revokeConfidentialToken(cToken)`
- `initialize(address initialOwner)` (UUPS proxy initializer)
