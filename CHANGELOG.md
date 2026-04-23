# Changelog

## [3.0.0-alpha.14](https://github.com/zama-ai/sdk/compare/v3.0.0-alpha.13...v3.0.0-alpha.14) (2026-04-23)

## [3.0.0-alpha.13](https://github.com/zama-ai/sdk/compare/v3.0.0-alpha.12...v3.0.0-alpha.13) (2026-04-22)

## [3.0.0-alpha.12](https://github.com/zama-ai/sdk/compare/v3.0.0-alpha.11...v3.0.0-alpha.12) (2026-04-21)

## [3.0.0](https://github.com/zama-ai/sdk/compare/v2.5.0...v3.0.0) (2026-04-22)

## [2.5.0](https://github.com/zama-ai/sdk/compare/v2.4.0...v2.5.0) (2026-04-17)

### Features

- **sdk:** support upgraded unwrap events ([#239](https://github.com/zama-ai/sdk/issues/239)) ([4f4116a]()), closes [#249]()

## [3.0.0-alpha.11](https://github.com/zama-ai/sdk/compare/v3.0.0-alpha.10...v3.0.0-alpha.11) (2026-04-21)

### Bug Fixes

- **sdk:** choose total supply method via ERC-165 ([#270](https://github.com/zama-ai/sdk/issues/270)) ([7fb55c4]())

## [3.0.0-alpha.10](https://github.com/zama-ai/sdk/compare/v3.0.0-alpha.9...v3.0.0-alpha.10) (2026-04-20)

### Bug Fixes

- **sdk:** correct legacy wrapper interface ID ([#271](https://github.com/zama-ai/sdk/issues/271)) ([f347198]())

## [3.0.0-alpha.9](https://github.com/zama-ai/sdk/compare/v3.0.0-alpha.8...v3.0.0-alpha.9) (2026-04-20)

## [3.0.0-alpha.8](https://github.com/zama-ai/sdk/compare/v3.0.0-alpha.7...v3.0.0-alpha.8) (2026-04-20)

## [3.0.0-alpha.7](https://github.com/zama-ai/sdk/compare/v3.0.0-alpha.6...v3.0.0-alpha.7) (2026-04-18)

### Bug Fixes

- align ManifestShape with actual /keyurl endpoint response ([2cde790]())

## [3.0.0-alpha.6](https://github.com/zama-ai/sdk/compare/v3.0.0-alpha.5...v3.0.0-alpha.6) (2026-04-17)

## [3.0.0-alpha.5](https://github.com/zama-ai/sdk/compare/v3.0.0-alpha.4...v3.0.0-alpha.5) (2026-04-17)

### Features

- **SDK-69:** support both old and new wrapper interfaceIds during transition ([#235](https://github.com/zama-ai/sdk/issues/235)) ([93c7d8a]())

## [3.0.0-alpha.4](https://github.com/zama-ai/sdk/compare/v3.0.0-alpha.3...v3.0.0-alpha.4) (2026-04-17)

## [3.0.0-alpha.3](https://github.com/zama-ai/sdk/compare/v3.0.0-alpha.2...v3.0.0-alpha.3) (2026-04-17)

## [3.0.0-alpha.2](https://github.com/zama-ai/sdk/compare/v3.0.0-alpha.1...v3.0.0-alpha.2) (2026-04-17)

### Features

- **sdk-61:** replace WrappersRegistry with protocol ConfidentialTokenWrappersRegistry contracts ([#229](https://github.com/zama-ai/sdk/issues/229)) ([dd4364d]())

## [3.0.0-alpha.1](https://github.com/zama-ai/sdk/compare/v2.5.0-alpha.6...v3.0.0-alpha.1) (2026-04-17)

### ⚠ BREAKING CHANGES

- The following exports are removed:
- @zama-fhe/sdk: parseActivityFeed, applyDecryptedValues, activity types
  (ActivityItem, ActivityDirection, ActivityAmount, ActivityType),
  activityFeedQueryOptions, queryKeys.activityFeed
- @zama-fhe/react-sdk: useActivityFeed

* fmt

### Code Refactoring

- remove activity feed from SDK and react-sdk ([#258](https://github.com/zama-ai/sdk/issues/258)) ([5784dba]())

## [2.5.0-alpha.6](https://github.com/zama-ai/sdk/compare/v2.5.0-alpha.5...v2.5.0-alpha.6) (2026-04-16)

### Bug Fixes

- centralize ZERO_HANDLE, use isZeroHandle checks ([#251](https://github.com/zama-ai/sdk/issues/251)) ([ffd5e3d]())

## [2.5.0-alpha.5](https://github.com/zama-ai/sdk/compare/v2.5.0-alpha.4...v2.5.0-alpha.5) (2026-04-16)

### Features

- **sdk:** add sdk.publicDecrypt() as the primitive for public decryptions ([#250](https://github.com/zama-ai/sdk/issues/250)) ([fca0c80]())

## [2.5.0-alpha.4](https://github.com/zama-ai/sdk/compare/v2.5.0-alpha.3...v2.5.0-alpha.4) (2026-04-16)

## [2.5.0-alpha.3](https://github.com/zama-ai/sdk/compare/v2.5.0-alpha.2...v2.5.0-alpha.3) (2026-04-16)

### Bug Fixes

- align example apps with scoped isAllowed checks ([#233](https://github.com/zama-ai/sdk/issues/233)) ([4f50086]())

## [2.5.0-alpha.2](https://github.com/zama-ai/sdk/compare/v2.5.0-alpha.1...v2.5.0-alpha.2) (2026-04-16)

### Features

- **sdk:** add inferred total supply contract builder ([#243](https://github.com/zama-ai/sdk/issues/243)) ([f63355f]())

## [2.5.0-alpha.1](https://github.com/zama-ai/sdk/compare/v2.4.0...v2.5.0-alpha.1) (2026-04-15)

### Features

- **sdk:** add handles and result fields to decrypt events [SDK-85] ([85dd3dc]())

### Bug Fixes

- **sdk:** address PR review comments on userDecrypt [SDK-85] ([7c36283]())

## [2.4.0](https://github.com/zama-ai/sdk/compare/v2.3.0...v2.4.0) (2026-04-13)

### Features

- **example-node-ethers:** upgrade to SDK 2.x with full ERC-7984 flows ([#170](https://github.com/zama-ai/sdk/issues/170)) ([3cdddab]())
- **example-node-viem:** upgrade to SDK 2.x with full ERC-7984 flows ([#169](https://github.com/zama-ai/sdk/issues/169)) ([950756f]())
- **react-sdk:** unify useUserDecrypt with reactive cache and auto-decrypt ([#125](https://github.com/zama-ai/sdk/issues/125)) ([9e14f69]()), closes [#176]()
- **sdk:** remove Zaiffer-specific fee and admin features (SDK-39) ([#191](https://github.com/zama-ai/sdk/issues/191)) ([d4db0ae]())

### Bug Fixes

- **sdk:** cap keypairTTL at the fhevm 365-day maximum ([#212](https://github.com/zama-ai/sdk/issues/212)) ([d11986f]())

### Reverts

- **ci:** PR [#217](https://github.com/zama-ai/sdk/issues/217) ([16301d5]())

## [2.4.0-alpha.6](https://github.com/zama-ai/sdk/compare/v2.4.0-alpha.5...v2.4.0-alpha.6) (2026-04-13)

### Features

- **react-sdk:** unify useUserDecrypt with reactive cache and auto-decrypt ([#125](https://github.com/zama-ai/sdk/issues/125)) ([9e14f69]()), closes [#176]()

## [2.4.0-alpha.5](https://github.com/zama-ai/sdk/compare/v2.4.0-alpha.4...v2.4.0-alpha.5) (2026-04-13)

## [2.4.0-alpha.4](https://github.com/zama-ai/sdk/compare/v2.4.0-alpha.3...v2.4.0-alpha.4) (2026-04-10)

### Reverts

- **ci:** PR [#217](https://github.com/zama-ai/sdk/issues/217) ([16301d5]())

## [2.4.0-alpha.3](https://github.com/zama-ai/sdk/compare/v2.4.0-alpha.2...v2.4.0-alpha.3) (2026-04-10)

## [2.4.0-alpha.2](https://github.com/zama-ai/sdk/compare/v2.4.0-alpha.1...v2.4.0-alpha.2) (2026-04-10)

### Features

- **example-node-ethers:** upgrade to SDK 2.x with full ERC-7984 flows ([#170](https://github.com/zama-ai/sdk/issues/170)) ([3cdddab]())
- **example-node-viem:** upgrade to SDK 2.x with full ERC-7984 flows ([#169](https://github.com/zama-ai/sdk/issues/169)) ([950756f]())

## [2.4.0-alpha.1](https://github.com/zama-ai/sdk/compare/v2.3.1-alpha.4...v2.4.0-alpha.1) (2026-04-09)

### Features

- **sdk:** remove Zaiffer-specific fee and admin features (SDK-39) ([#191](https://github.com/zama-ai/sdk/issues/191)) ([d4db0ae]())

## [2.3.1-alpha.4](https://github.com/zama-ai/sdk/compare/v2.3.1-alpha.3...v2.3.1-alpha.4) (2026-04-08)

## [2.3.1-alpha.3](https://github.com/zama-ai/sdk/compare/v2.3.1-alpha.2...v2.3.1-alpha.3) (2026-04-08)

### Bug Fixes

- **sdk:** cap keypairTTL at the fhevm 365-day maximum ([#212](https://github.com/zama-ai/sdk/issues/212)) ([d11986f]())

## [2.3.1-alpha.2](https://github.com/zama-ai/sdk/compare/v2.3.1-alpha.1...v2.3.1-alpha.2) (2026-04-08)

## [2.3.1-alpha.1](https://github.com/zama-ai/sdk/compare/v2.3.0...v2.3.1-alpha.1) (2026-04-07)

## [2.3.0](https://github.com/zama-ai/sdk/compare/v2.2.0...v2.3.0) (2026-04-07)

### Features

- Node+Web SDK E2E test infrastructure ([#178](https://github.com/zama-ai/sdk/issues/178)) ([09bf2f7]())
- **sdk:** align delegation API with Delegated User Decryption spec ([#135](https://github.com/zama-ai/sdk/issues/135)) ([a80ad1f]())
- **sdk:** validate balances before transfer, shield, and unshield (SDK-52) ([#147](https://github.com/zama-ai/sdk/issues/147)) ([d31ae17]()), closes [#assertConfidentialBalance]() [#waitAndFinalizeUnshield]() [#assertConfidentialBalance]() [#assertConfidentialBalance]() [#assertConfidentialBalance]()

### Bug Fixes

- align keypairTTL default with sessionTTL (30 days) ([#190](https://github.com/zama-ai/sdk/issues/190)) ([9c9791a]())
- improve error handling and code quality ([#193](https://github.com/zama-ai/sdk/issues/193)) ([87e09d6]())

## [2.3.0-alpha.4](https://github.com/zama-ai/sdk/compare/v2.3.0-alpha.3...v2.3.0-alpha.4) (2026-04-02)

### Features

- Node+Web SDK E2E test infrastructure ([#178](https://github.com/zama-ai/sdk/issues/178)) ([09bf2f7]())

## [2.3.0-alpha.3](https://github.com/zama-ai/sdk/compare/v2.3.0-alpha.2...v2.3.0-alpha.3) (2026-04-02)

### Bug Fixes

- improve error handling and code quality ([#193](https://github.com/zama-ai/sdk/issues/193)) ([87e09d6]())

## [2.3.0-alpha.2](https://github.com/zama-ai/sdk/compare/v2.3.0-alpha.1...v2.3.0-alpha.2) (2026-04-01)

### Bug Fixes

- align keypairTTL default with sessionTTL (30 days) ([#190](https://github.com/zama-ai/sdk/issues/190)) ([9c9791a]())

## [2.3.0-alpha.1](https://github.com/zama-ai/sdk/compare/v2.2.0...v2.3.0-alpha.1) (2026-03-31)

### Features

- **sdk:** align delegation API with Delegated User Decryption spec ([#135](https://github.com/zama-ai/sdk/issues/135)) ([a80ad1f]())

## [2.2.0](https://github.com/zama-ai/sdk/compare/v2.1.0...v2.2.0) (2026-03-30)

### Features

- **example-hoodi:** upgrade to SDK 2.2.0-alpha.4 + registry + ERC-7984 flows ([#179](https://github.com/zama-ai/sdk/issues/179)) ([6819c13]())
- **example-react-wagmi:** upgrade to wagmi v3 with full ERC-7984 flows (SDK-37) ([#160](https://github.com/zama-ai/sdk/issues/160)) ([a6386f8]())
- **react-ethers:** upgrade to SDK 2.1.0-alpha.2 + Sepolia + delegation flows (SDK-35) ([#148](https://github.com/zama-ai/sdk/issues/148)) ([44ce6ee]())
- **react-sdk:** improve query wrappers types ([#168](https://github.com/zama-ai/sdk/issues/168)) ([db616c7]())
- **react-viem:** upgrade to SDK 2.1.0-alpha.2 + Sepolia + delegation flows (SDK-36) ([#150](https://github.com/zama-ai/sdk/issues/150)) ([fe7dfc0]()), closes [#1]() [#4]() [#6]() [#7]() [#9]() [#10]()
- **sdk,react-sdk:** add WrappersRegistry class and on-chain registry hooks ([#116](https://github.com/zama-ai/sdk/issues/116)) ([06bc94b]()), closes [#registryTTL]() [#registryInstance]() [#registry]() [#enrichPair]() [#pairWithMetadata]()

### Bug Fixes

- rename useAllowTokens/useRevokeTokens back to useAllow/useRevoke ([#167](https://github.com/zama-ai/sdk/issues/167)) ([f9d6b1a]())
- **sdk:** add DelegationNotPropagatedError for gateway sync delay ([#177](https://github.com/zama-ai/sdk/issues/177)) ([f451fa2]())

## [2.2.0-alpha.10](https://github.com/zama-ai/sdk/compare/v2.2.0-alpha.9...v2.2.0-alpha.10) (2026-03-30)

## [2.2.0-alpha.9](https://github.com/zama-ai/sdk/compare/v2.2.0-alpha.8...v2.2.0-alpha.9) (2026-03-30)

## [2.2.0-alpha.8](https://github.com/zama-ai/sdk/compare/v2.2.0-alpha.7...v2.2.0-alpha.8) (2026-03-30)

### Features

- **example-hoodi:** upgrade to SDK 2.2.0-alpha.4 + registry + ERC-7984 flows ([#179](https://github.com/zama-ai/sdk/issues/179)) ([6819c13]())

## [2.2.0-alpha.7](https://github.com/zama-ai/sdk/compare/v2.2.0-alpha.6...v2.2.0-alpha.7) (2026-03-30)

## [2.2.0-alpha.6](https://github.com/zama-ai/sdk/compare/v2.2.0-alpha.5...v2.2.0-alpha.6) (2026-03-27)

### Bug Fixes

- **sdk:** add DelegationNotPropagatedError for gateway sync delay ([#177](https://github.com/zama-ai/sdk/issues/177)) ([f451fa2]())

## [2.2.0-alpha.5](https://github.com/zama-ai/sdk/compare/v2.2.0-alpha.4...v2.2.0-alpha.5) (2026-03-27)

### Features

- **example-react-wagmi:** upgrade to wagmi v3 with full ERC-7984 flows (SDK-37) ([#160](https://github.com/zama-ai/sdk/issues/160)) ([a6386f8]())

## [2.2.0-alpha.4](https://github.com/zama-ai/sdk/compare/v2.2.0-alpha.3...v2.2.0-alpha.4) (2026-03-27)

### Features

- **react-viem:** upgrade to SDK 2.1.0-alpha.2 + Sepolia + delegation flows (SDK-36) ([#150](https://github.com/zama-ai/sdk/issues/150)) ([fe7dfc0]()), closes [#1]() [#4]() [#6]() [#7]() [#9]() [#10]()

## [2.2.0-alpha.3](https://github.com/zama-ai/sdk/compare/v2.2.0-alpha.2...v2.2.0-alpha.3) (2026-03-27)

### Features

- **react-ethers:** upgrade to SDK 2.1.0-alpha.2 + Sepolia + delegation flows (SDK-35) ([#148](https://github.com/zama-ai/sdk/issues/148)) ([44ce6ee]())

## [2.2.0-alpha.2](https://github.com/zama-ai/sdk/compare/v2.2.0-alpha.1...v2.2.0-alpha.2) (2026-03-26)

- **wrapper-discovery:** `coordinatorAddress` has been renamed to `erc20Address` in `wrapperDiscoveryQueryOptions`, `UseWrapperDiscoveryConfig`, and `UseWrapperDiscoverySuspenseConfig`. Update call sites accordingly.
- **wrapper-discovery:** `tokenAddress` in `UseWrapperDiscoveryConfig` is now required (`Address`, not `Address | undefined`). To disable the query conditionally, pass `erc20Address: undefined` instead.
- **readonly-token:** `ReadonlyToken.discoverWrapper()` has been removed. Use `sdk.registry.getConfidentialToken(erc20Address)` or `sdk.registry.getUnderlyingToken(confidentialTokenAddress)` instead.

### Features

- **sdk,react-sdk:** add WrappersRegistry class and on-chain registry hooks ([#116](https://github.com/zama-ai/sdk/issues/116)) ([06bc94b]()), closes [#registryTTL]() [#registryInstance]() [#registry]() [#enrichPair]() [#pairWithMetadata]()

## [2.2.0-alpha.1](https://github.com/zama-ai/sdk/compare/v2.1.1-alpha.2...v2.2.0-alpha.1) (2026-03-25)

### Features

- **react-sdk:** improve query wrappers types ([#168](https://github.com/zama-ai/sdk/issues/168)) ([db616c7]())

## [2.1.1-alpha.2](https://github.com/zama-ai/sdk/compare/v2.1.1-alpha.1...v2.1.1-alpha.2) (2026-03-25)

### Bug Fixes

- rename useAllowTokens/useRevokeTokens back to useAllow/useRevoke ([#167](https://github.com/zama-ai/sdk/issues/167)) ([f9d6b1a]())

## [2.1.1-alpha.1](https://github.com/zama-ai/sdk/compare/v2.1.0...v2.1.1-alpha.1) (2026-03-25)

## [2.1.0](https://github.com/zama-ai/sdk/compare/v2.0.0...v2.1.0) (2026-03-24)

### Features

- **example-hoodi:** add on-chain ACL delegation flows (SDK-41) ([#126](https://github.com/zama-ai/sdk/issues/126)) ([2ea2349]())

### Bug Fixes

- exclude logger from web worker init payload ([#146](https://github.com/zama-ai/sdk/issues/146)) ([1b8d50f]()), closes [#145]()
- gate queries on undefined tokenAddress ([#163](https://github.com/zama-ai/sdk/issues/163)) ([5803e78]())
- **sdk:** colocate node worker with node entrypoint ([#138](https://github.com/zama-ai/sdk/issues/138)) ([294d76e]())

## [2.1.0-alpha.5](https://github.com/zama-ai/sdk/compare/v2.1.0-alpha.4...v2.1.0-alpha.5) (2026-03-24)

### Bug Fixes

- exclude logger from web worker init payload ([#146](https://github.com/zama-ai/sdk/issues/146)) ([1b8d50f]()), closes [#145]()

## [2.1.0-alpha.4](https://github.com/zama-ai/sdk/compare/v2.1.0-alpha.3...v2.1.0-alpha.4) (2026-03-24)

### Bug Fixes

- gate queries on undefined tokenAddress ([#163](https://github.com/zama-ai/sdk/issues/163)) ([5803e78]())

## [2.1.0-alpha.3](https://github.com/zama-ai/sdk/compare/v2.1.0-alpha.2...v2.1.0-alpha.3) (2026-03-24)

## [2.1.0-alpha.2](https://github.com/zama-ai/sdk/compare/v2.1.0-alpha.1...v2.1.0-alpha.2) (2026-03-20)

## [2.1.0-alpha.1](https://github.com/zama-ai/sdk/compare/v2.0.1-alpha.1...v2.1.0-alpha.1) (2026-03-20)

### Features

- **example-hoodi:** add on-chain ACL delegation flows (SDK-41) ([#126](https://github.com/zama-ai/sdk/issues/126)) ([2ea2349](https://github.com/zama-ai/sdk/commit/2ea2349dbc868c16763e1e000f3d6057e7d0a14a))

## [2.0.1-alpha.1](https://github.com/zama-ai/sdk/compare/v2.0.0...v2.0.1-alpha.1) (2026-03-20)

### Bug Fixes

- **sdk:** colocate node worker with node entrypoint ([#138](https://github.com/zama-ai/sdk/issues/138)) ([294d76e](https://github.com/zama-ai/sdk/commit/294d76eb9a753b663857e29dd7d4267dca7c3801))

## [2.0.0](https://github.com/zama-ai/sdk/compare/v1.1.0...v2.0.0) (2026-03-20)

### ⚠ BREAKING CHANGES

- useUserDecryptFlow removed, useUserDecrypt now has the
  flow hook's signature. Old low-level useUserDecrypt accepting
  UserDecryptParams is removed.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

- docs(react-sdk): fix stale JSDoc example in useEncrypt

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

- refactor(sdk,react-sdk): extract userDecryptMutationOptions and remove decryptionKeys wrapper

Move the user-decrypt orchestration logic (credential resolution, handle
grouping, relayer calls) into `userDecryptMutationOptions` in the SDK query
module so it can be shared. The react-sdk `useUserDecrypt` hook now delegates
to these options instead of reimplementing the logic inline.

Also remove the `decryptionKeys` indirection — all code now uses
`zamaQueryKeys.decryption.handle()` directly from `@zama-fhe/sdk/query`.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

- refactor(sdk,react-sdk): extract all relayer mutation options into SDK query module

Move all remaining inline relayer mutation logic from react-sdk hooks into
shared mutation option factories in `@zama-fhe/sdk/query`. Hooks now delegate
to these options instead of calling `sdk.relayer.*` directly.

New SDK mutation options:

- generateKeypairMutationOptions
- createEIP712MutationOptions
- createDelegatedUserDecryptEIP712MutationOptions
- delegatedUserDecryptMutationOptions
- publicDecryptMutationOptions
- requestZKProofVerificationMutationOptions

Also adds `onSuccess` to `MutationFactoryOptions` using TanStack Query v5's
`MutationFunctionContext` — decrypt mutations now populate the query cache via
`context.client.setQueryData()` directly in the options, removing the need for
hooks to manage cache population.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

- chore: regenerate API reports after mutation options refactor

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

### Features

- add delegated decryption support [SDK-12] ([#72](https://github.com/zama-ai/sdk/issues/72)) ([7bcaeb6](https://github.com/zama-ai/sdk/commit/7bcaeb612b3268a3b94fa71217c09b8763391735)), closes [#batchDelegationOp](https://github.com/zama-ai/sdk/issues/batchDelegationOp) [#storage](https://github.com/zama-ai/sdk/issues/storage) [#batchDecryptCore](https://github.com/zama-ai/sdk/issues/batchDecryptCore)
- **examples:** add example-hoodi — ERC-7984 demo on Hoodi testnet ([#111](https://github.com/zama-ai/sdk/issues/111)) ([438f90a](https://github.com/zama-ai/sdk/commit/438f90aff0d16056ba03d78dd20731a3ac5cb8d8))
- **sdk:** persist FHE public key and params with artifact-level revalidation ([#110](https://github.com/zama-ai/sdk/issues/110)) ([e2dd6ae](https://github.com/zama-ai/sdk/commit/e2dd6aef7af39975981fc511a4d6f649b2adf93b))

### Bug Fixes

- remove ABI re-exports from react-sdk that are no longer in sdk public API ([ad24185](https://github.com/zama-ai/sdk/commit/ad24185280469a363e293ed65249667e5333d8ff))
- **sdk:** auto-detect browser extensions and fall back to file-based worker URL ([292bd3b](https://github.com/zama-ai/sdk/commit/292bd3bacd18bdadbf04985f053c43e873b6378a))
- **sdk:** detect session expiry with 30s staleTime on isAllowed query ([#124](https://github.com/zama-ai/sdk/issues/124)) ([532fb92](https://github.com/zama-ai/sdk/commit/532fb9298a5e2ff333b7bf72cd4256b3a9db05ba))
- **sdk:** fix extension runtime fallback and revoke blob URL after worker creation ([e7c6d07](https://github.com/zama-ai/sdk/commit/e7c6d074bcbe8c0bed3565db3243fab0b52b3218))
- **sdk:** inline worker code via blob URL to eliminate Vite optimizeDeps workaround ([60f09b1](https://github.com/zama-ai/sdk/commit/60f09b1a833e98852c0abd5982ff14019dd26c04))
- **sdk:** make worker blob URL creation lazy to avoid SSR crashes ([9a9311a](https://github.com/zama-ai/sdk/commit/9a9311a6ef03420d311b4092d4fbc3d9c9a8986c))
- **sdk:** support browser extensions and lazy worker creation ([c0fcd44](https://github.com/zama-ai/sdk/commit/c0fcd44f7d8884dc4f580066f83ef5e6cd18eea4))
- **sdk:** use proper TypeScript assertion type narrowing in utility guards ([632bb80](https://github.com/zama-ai/sdk/commit/632bb80d27e6390c4effd795b0fcb29e6b4d0277))
- **test:** use forks pool for react-sdk in CI instead of default ([4eca9aa](https://github.com/zama-ai/sdk/commit/4eca9aa3df6ad8285e8d096421aa75dcf5678149))

### Performance Improvements

- reduce bundle size by inlining slim ABI fragments ([613321c](https://github.com/zama-ai/sdk/commit/613321c09eb73d560a2aeb36cf77956870e584d9))
- **test:** use vmForks locally, vmThreads in CI for both test projects ([d6f9de9](https://github.com/zama-ai/sdk/commit/d6f9de9e5d03ca4e2dab982afcd2460a0dd01f19))

### Documentation

- improve documentation for useEncrypt and useUserDecrypt ([#81](https://github.com/zama-ai/sdk/issues/81)) ([5ce5f2e](https://github.com/zama-ai/sdk/commit/5ce5f2ede175f14813b9c1c663ab7696d754d787)), closes [#114](https://github.com/zama-ai/sdk/issues/114)

## [2.0.0-alpha.4](https://github.com/zama-ai/sdk/compare/v2.0.0-alpha.3...v2.0.0-alpha.4) (2026-03-19)

### Features

- **sdk:** persist FHE public key and params with artifact-level revalidation ([#110](https://github.com/zama-ai/sdk/issues/110)) ([e2dd6ae](https://github.com/zama-ai/sdk/commit/e2dd6aef7af39975981fc511a4d6f649b2adf93b))

## [2.0.0-alpha.3](https://github.com/zama-ai/sdk/compare/v2.0.0-alpha.2...v2.0.0-alpha.3) (2026-03-19)

### Features

- **examples:** add example-hoodi — ERC-7984 demo on Hoodi testnet ([#111](https://github.com/zama-ai/sdk/issues/111)) ([438f90a](https://github.com/zama-ai/sdk/commit/438f90aff0d16056ba03d78dd20731a3ac5cb8d8))

## [2.0.0-alpha.2](https://github.com/zama-ai/sdk/compare/v2.0.0-alpha.1...v2.0.0-alpha.2) (2026-03-18)

### Bug Fixes

- **sdk:** detect session expiry with 30s staleTime on isAllowed query ([#124](https://github.com/zama-ai/sdk/issues/124)) ([532fb92](https://github.com/zama-ai/sdk/commit/532fb9298a5e2ff333b7bf72cd4256b3a9db05ba))

## [2.0.0-alpha.1](https://github.com/zama-ai/sdk/compare/v1.2.0-alpha.5...v2.0.0-alpha.1) (2026-03-18)

### ⚠ BREAKING CHANGES

- useUserDecryptFlow removed, useUserDecrypt now has the
  flow hook's signature. Old low-level useUserDecrypt accepting
  UserDecryptParams is removed.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

- docs(react-sdk): fix stale JSDoc example in useEncrypt

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

- refactor(sdk,react-sdk): extract userDecryptMutationOptions and remove decryptionKeys wrapper

Move the user-decrypt orchestration logic (credential resolution, handle
grouping, relayer calls) into `userDecryptMutationOptions` in the SDK query
module so it can be shared. The react-sdk `useUserDecrypt` hook now delegates
to these options instead of reimplementing the logic inline.

Also remove the `decryptionKeys` indirection — all code now uses
`zamaQueryKeys.decryption.handle()` directly from `@zama-fhe/sdk/query`.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

- refactor(sdk,react-sdk): extract all relayer mutation options into SDK query module

Move all remaining inline relayer mutation logic from react-sdk hooks into
shared mutation option factories in `@zama-fhe/sdk/query`. Hooks now delegate
to these options instead of calling `sdk.relayer.*` directly.

New SDK mutation options:

- generateKeypairMutationOptions
- createEIP712MutationOptions
- createDelegatedUserDecryptEIP712MutationOptions
- delegatedUserDecryptMutationOptions
- publicDecryptMutationOptions
- requestZKProofVerificationMutationOptions

Also adds `onSuccess` to `MutationFactoryOptions` using TanStack Query v5's
`MutationFunctionContext` — decrypt mutations now populate the query cache via
`context.client.setQueryData()` directly in the options, removing the need for
hooks to manage cache population.

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

- chore: regenerate API reports after mutation options refactor

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>

### Documentation

- improve documentation for useEncrypt and useUserDecrypt ([#81](https://github.com/zama-ai/sdk/issues/81)) ([5ce5f2e](https://github.com/zama-ai/sdk/commit/5ce5f2ede175f14813b9c1c663ab7696d754d787)), closes [#114](https://github.com/zama-ai/sdk/issues/114)

## [1.2.0-alpha.5](https://github.com/zama-ai/sdk/compare/v1.2.0-alpha.4...v1.2.0-alpha.5) (2026-03-18)

## [1.2.0-alpha.4](https://github.com/zama-ai/sdk/compare/v1.2.0-alpha.3...v1.2.0-alpha.4) (2026-03-18)

## [1.2.0-alpha.3](https://github.com/zama-ai/sdk/compare/v1.2.0-alpha.2...v1.2.0-alpha.3) (2026-03-17)

### Bug Fixes

- **sdk:** auto-detect browser extensions and fall back to file-based worker URL ([292bd3b](https://github.com/zama-ai/sdk/commit/292bd3bacd18bdadbf04985f053c43e873b6378a))
- **sdk:** fix extension runtime fallback and revoke blob URL after worker creation ([e7c6d07](https://github.com/zama-ai/sdk/commit/e7c6d074bcbe8c0bed3565db3243fab0b52b3218))
- **sdk:** inline worker code via blob URL to eliminate Vite optimizeDeps workaround ([60f09b1](https://github.com/zama-ai/sdk/commit/60f09b1a833e98852c0abd5982ff14019dd26c04))
- **sdk:** make worker blob URL creation lazy to avoid SSR crashes ([9a9311a](https://github.com/zama-ai/sdk/commit/9a9311a6ef03420d311b4092d4fbc3d9c9a8986c))
- **sdk:** support browser extensions and lazy worker creation ([c0fcd44](https://github.com/zama-ai/sdk/commit/c0fcd44f7d8884dc4f580066f83ef5e6cd18eea4))
- **sdk:** use proper TypeScript assertion type narrowing in utility guards ([632bb80](https://github.com/zama-ai/sdk/commit/632bb80d27e6390c4effd795b0fcb29e6b4d0277))
- **test:** use forks pool for react-sdk in CI instead of default ([4eca9aa](https://github.com/zama-ai/sdk/commit/4eca9aa3df6ad8285e8d096421aa75dcf5678149))

### Performance Improvements

- **test:** use vmForks locally, vmThreads in CI for both test projects ([d6f9de9](https://github.com/zama-ai/sdk/commit/d6f9de9e5d03ca4e2dab982afcd2460a0dd01f19))

## [1.2.0-alpha.2](https://github.com/zama-ai/sdk/compare/v1.2.0-alpha.1...v1.2.0-alpha.2) (2026-03-16)

### Bug Fixes

- remove ABI re-exports from react-sdk that are no longer in sdk public API ([ad24185](https://github.com/zama-ai/sdk/commit/ad24185280469a363e293ed65249667e5333d8ff))

### Performance Improvements

- reduce bundle size by inlining slim ABI fragments ([613321c](https://github.com/zama-ai/sdk/commit/613321c09eb73d560a2aeb36cf77956870e584d9))

## [1.2.0-alpha.1](https://github.com/zama-ai/sdk/compare/v1.1.0...v1.2.0-alpha.1) (2026-03-16)

### Features

- add delegated decryption support [SDK-12] ([#72](https://github.com/zama-ai/sdk/issues/72)) ([7bcaeb6](https://github.com/zama-ai/sdk/commit/7bcaeb612b3268a3b94fa71217c09b8763391735)), closes [#batchDelegationOp](https://github.com/zama-ai/sdk/issues/batchDelegationOp) [#storage](https://github.com/zama-ai/sdk/issues/storage) [#batchDecryptCore](https://github.com/zama-ai/sdk/issues/batchDecryptCore)

## [1.1.0](https://github.com/zama-ai/sdk/compare/v1.0.1...v1.1.0) (2026-03-13)

### Features

- add activity feed, batch transfer, and resume unshield e2e tests ([0b05774](https://github.com/zama-ai/sdk/commit/0b05774be738da6b0051238fc6f867944c8d83b2))
- add cleartext fhEVM feature ([#51](https://github.com/zama-ai/sdk/issues/51)) ([f951673](https://github.com/zama-ai/sdk/commit/f951673a86e975c06dcd41527c5401c365a7d2d5))
- add wagmi v2 compatibility shim for useConnection/getConnection ([0741649](https://github.com/zama-ai/sdk/commit/0741649d6e984de6362d024cb7e1b5ebfb6db605))
- cache decrypted balances in storage to eliminate spinner on reload ([f90d649](https://github.com/zama-ai/sdk/commit/f90d6495d28aabcd2bf5e210a9cfe741cc10de1b))
- expose WASM thread pool option for RelayerWeb [SDK-10] ([#28](https://github.com/zama-ai/sdk/issues/28)) ([11dae99](https://github.com/zama-ai/sdk/commit/11dae99a2801378aca1d36dd2be64b061b039669))
- implement 10 SDK backlog items — types, hooks, callbacks, status tracking (Vibe Kanban) ([#57](https://github.com/zama-ai/sdk/issues/57)) ([b59e222](https://github.com/zama-ai/sdk/commit/b59e222fa522c7fd0e137b9be418eb59b8a1cc55)), closes [#ensureAllowance](https://github.com/zama-ai/sdk/issues/ensureAllowance)
- **react-sdk:** audit improvements — consistent imports, optimistic shieldETH, error docs, mergeEnabled (Vibe Kanban) ([#100](https://github.com/zama-ai/sdk/issues/100)) ([d6efb4f](https://github.com/zama-ai/sdk/commit/d6efb4f76092f83078772cea463ad845c07b7f36))
- read-only signer mode & gitbook import audit ([#65](https://github.com/zama-ai/sdk/issues/65)) ([03366c2](https://github.com/zama-ai/sdk/commit/03366c265ed51e4e9fa86355196ca935a576d586))
- **sdk:** add configurable session TTL for wallet sessions [SDK-11] ([#56](https://github.com/zama-ai/sdk/issues/56)) ([f6655d0](https://github.com/zama-ai/sdk/commit/f6655d0376d20c87388db4a70653bd36e8b52c19)), closes [#hasLegacySignature](https://github.com/zama-ai/sdk/issues/hasLegacySignature)
- **sdk:** cleartext flat config refactor ([#78](https://github.com/zama-ai/sdk/issues/78)) ([b052bb9](https://github.com/zama-ai/sdk/commit/b052bb926c007c10dfccfd891a9ff995facc521d))
- session-scoped signatures & SDK API improvements [SDK-6] ([#25](https://github.com/zama-ai/sdk/issues/25)) ([116ae85](https://github.com/zama-ai/sdk/commit/116ae85a8d4c1a592563e6d5f3a1f65cabb7711f)), closes [CredentialsManager#sessionSignatures](https://github.com/zama-ai/CredentialsManager/issues/sessionSignatures) [#reSign](https://github.com/zama-ai/sdk/issues/reSign) [#storeKey](https://github.com/zama-ai/sdk/issues/storeKey) [#onEvent](https://github.com/zama-ai/sdk/issues/onEvent) [#lastChainId](https://github.com/zama-ai/sdk/issues/lastChainId) [#unsubscribeSigner](https://github.com/zama-ai/sdk/issues/unsubscribeSigner)
- **test-components:** add 11 shared form/panel components ([28a29c2](https://github.com/zama-ai/sdk/commit/28a29c2a5ad14de175b803d21f4f9c08bac1cb9f))
- **test-components:** add shared responsive sidebar nav ([ded5823](https://github.com/zama-ai/sdk/commit/ded582358c5a87cc2540d1e19a4de2f94d521e52))
- **test-components:** add token-table with framework-agnostic LinkComponent prop ([df48d0f](https://github.com/zama-ai/sdk/commit/df48d0fd717cc70d11e5b3a5bab783206fc37fb2))
- **test-components:** scaffold shared test components package ([3ff61a9](https://github.com/zama-ai/sdk/commit/3ff61a957fd8166825b797530d0c8c45255b7f39))
- **test-vite:** add React Router, Tailwind CSS, and extract pages ([8c8c2fa](https://github.com/zama-ai/sdk/commit/8c8c2fa4a518ebc48f76cf5a54ce4be67e96e7b5))
- **test-vite:** migrate to rolldown-vite ([7488eef](https://github.com/zama-ai/sdk/commit/7488eefcb0ba917e50f599d883a49e00fd1cd008))

### Bug Fixes

- add `viem` as dep of sdk, fix examples ([#74](https://github.com/zama-ai/sdk/issues/74)) ([3cf92cd](https://github.com/zama-ai/sdk/commit/3cf92cd8bb69d1188530e49fd9dbf77ab62c13da))
- address integrator friction — gas limits, worker IIFE, CDN localhost, StrictMode restart, Sepolia /v2 ([a18079c](https://github.com/zama-ai/sdk/commit/a18079c8a766db5ee9e730a8d2513ed76115315a))
- **ci:** add Vite build step before running e2e tests ([66ee3d8](https://github.com/zama-ai/sdk/commit/66ee3d8b453a23ddee374eed9ea3a0ad605f4864))
- **deps:** pin minimatch to 10.2.4 to resolve ReDoS vulnerabilities ([#69](https://github.com/zama-ai/sdk/issues/69)) ([3861748](https://github.com/zama-ai/sdk/commit/3861748d8fffd756cf76eab0dbc055f73e6181f5))
- **playwright:** drain in-flight route handlers before reverting chain state ([de35aab](https://github.com/zama-ai/sdk/commit/de35aabde4573ce91e7853dbc39cf64ee6d02620))
- **playwright:** use uniform 30s timeout for nextjs project ([d65cd82](https://github.com/zama-ai/sdk/commit/d65cd82b3120882b02f5bbf70a057635fe0f934c))
- **release:** remove registry-url to fix npm trusted publishing ([aa515ee](https://github.com/zama-ai/sdk/commit/aa515ee4329e83347049513aa1435f89d8a13df8))
- replace `< 2M` with prose in JSDoc to silence tsdoc-malformed-html-name ([2a777b4](https://github.com/zama-ai/sdk/commit/2a777b41ae140d177fe43a37072915044c1fde94))
- replace importScripts with fetch+eval in worker to fix MIME-type errors ([54dbee8](https://github.com/zama-ai/sdk/commit/54dbee8cd3d2f8dade1f4c2a66454ce6fc779a03))
- **sdk:** add /v2 path to mainnet relayer URL ([84978f1](https://github.com/zama-ai/sdk/commit/84978f1e737f60717237284b474d85c45212f7f3))
- **security:** resolve 3 high-severity Dependabot alerts ([#41](https://github.com/zama-ai/sdk/issues/41)) ([9c81b97](https://github.com/zama-ai/sdk/commit/9c81b979e2a0f312f1543604dcfd4c3299f30f3a)), closes [#3](https://github.com/zama-ai/sdk/issues/3) [#4](https://github.com/zama-ai/sdk/issues/4) [#2](https://github.com/zama-ai/sdk/issues/2)
- **security:** resolve CodeQL code scanning alerts ([#42](https://github.com/zama-ai/sdk/issues/42)) ([27d54b6](https://github.com/zama-ai/sdk/commit/27d54b6ca1148a2db114bad7748e39ac340cbd62))
- **test-components:** add non-null assertion for array index access ([7e3efec](https://github.com/zama-ai/sdk/commit/7e3efecb996536cbf2ae8500477a930c07441972))
- **test-nextjs:** correct theme.css import path in globals.css ([2b52c60](https://github.com/zama-ai/sdk/commit/2b52c602acc191c89c3748902011b28808e59050))
- **test-nextjs:** correct USDT contract address to match hardhat deployment ([3e40812](https://github.com/zama-ai/sdk/commit/3e40812f82a02ab9576cea8e76fbd822f1f74421))
- **test-nextjs:** replace CONTRACTS.confidentialToken with CONTRACTS.cUSDT ([8762b14](https://github.com/zama-ai/sdk/commit/8762b141be7d56c42130359fb53c53205e88da24))
- use real hardhat-deployed addresses, add missing transferBatcher approval ([#50](https://github.com/zama-ai/sdk/issues/50)) ([06c6428](https://github.com/zama-ai/sdk/commit/06c64286ca1e4a8b6d9cf0f3485bd530829b0eef))

### Performance Improvements

- speed up vitest by 40% ([#88](https://github.com/zama-ai/sdk/issues/88)) ([33a9b68](https://github.com/zama-ai/sdk/commit/33a9b68b6c86e2b176f78caca23c721884a1ef8b))

### Reverts

- remove premature localhost CDN validation & document balance cache ([a17f191](https://github.com/zama-ai/sdk/commit/a17f191f16155bb29d8e6bf42ce00554afe18c1b))

## [1.1.0-alpha.3](https://github.com/zama-ai/sdk/compare/v1.1.0-alpha.2...v1.1.0-alpha.3) (2026-03-12)

### Features

- **react-sdk:** audit improvements — consistent imports, optimistic shieldETH, error docs, mergeEnabled (Vibe Kanban) ([#100](https://github.com/zama-ai/sdk/issues/100)) ([d6efb4f](https://github.com/zama-ai/sdk/commit/d6efb4f76092f83078772cea463ad845c07b7f36))

## [1.1.0-alpha.2](https://github.com/zama-ai/sdk/compare/v1.1.0-alpha.1...v1.1.0-alpha.2) (2026-03-11)

## [1.1.0-alpha.1](https://github.com/zama-ai/sdk/compare/v1.0.1...v1.1.0-alpha.1) (2026-03-10)

### Features

- add activity feed, batch transfer, and resume unshield e2e tests ([0b05774](https://github.com/zama-ai/sdk/commit/0b05774be738da6b0051238fc6f867944c8d83b2))
- add cleartext fhEVM feature ([#51](https://github.com/zama-ai/sdk/issues/51)) ([f951673](https://github.com/zama-ai/sdk/commit/f951673a86e975c06dcd41527c5401c365a7d2d5))
- add wagmi v2 compatibility shim for useConnection/getConnection ([0741649](https://github.com/zama-ai/sdk/commit/0741649d6e984de6362d024cb7e1b5ebfb6db605))
- cache decrypted balances in storage to eliminate spinner on reload ([f90d649](https://github.com/zama-ai/sdk/commit/f90d6495d28aabcd2bf5e210a9cfe741cc10de1b))
- expose WASM thread pool option for RelayerWeb [SDK-10] ([#28](https://github.com/zama-ai/sdk/issues/28)) ([11dae99](https://github.com/zama-ai/sdk/commit/11dae99a2801378aca1d36dd2be64b061b039669))
- implement 10 SDK backlog items — types, hooks, callbacks, status tracking (Vibe Kanban) ([#57](https://github.com/zama-ai/sdk/issues/57)) ([b59e222](https://github.com/zama-ai/sdk/commit/b59e222fa522c7fd0e137b9be418eb59b8a1cc55)), closes [#ensureAllowance](https://github.com/zama-ai/sdk/issues/ensureAllowance)
- read-only signer mode & gitbook import audit ([#65](https://github.com/zama-ai/sdk/issues/65)) ([03366c2](https://github.com/zama-ai/sdk/commit/03366c265ed51e4e9fa86355196ca935a576d586))
- **sdk:** add configurable session TTL for wallet sessions [SDK-11] ([#56](https://github.com/zama-ai/sdk/issues/56)) ([f6655d0](https://github.com/zama-ai/sdk/commit/f6655d0376d20c87388db4a70653bd36e8b52c19)), closes [#hasLegacySignature](https://github.com/zama-ai/sdk/issues/hasLegacySignature)
- **sdk:** cleartext flat config refactor ([#78](https://github.com/zama-ai/sdk/issues/78)) ([b052bb9](https://github.com/zama-ai/sdk/commit/b052bb926c007c10dfccfd891a9ff995facc521d))
- session-scoped signatures & SDK API improvements [SDK-6] ([#25](https://github.com/zama-ai/sdk/issues/25)) ([116ae85](https://github.com/zama-ai/sdk/commit/116ae85a8d4c1a592563e6d5f3a1f65cabb7711f)), closes [CredentialsManager#sessionSignatures](https://github.com/zama-ai/CredentialsManager/issues/sessionSignatures) [#reSign](https://github.com/zama-ai/sdk/issues/reSign) [#storeKey](https://github.com/zama-ai/sdk/issues/storeKey) [#onEvent](https://github.com/zama-ai/sdk/issues/onEvent) [#lastChainId](https://github.com/zama-ai/sdk/issues/lastChainId) [#unsubscribeSigner](https://github.com/zama-ai/sdk/issues/unsubscribeSigner)
- **test-components:** add 11 shared form/panel components ([28a29c2](https://github.com/zama-ai/sdk/commit/28a29c2a5ad14de175b803d21f4f9c08bac1cb9f))
- **test-components:** add shared responsive sidebar nav ([ded5823](https://github.com/zama-ai/sdk/commit/ded582358c5a87cc2540d1e19a4de2f94d521e52))
- **test-components:** add token-table with framework-agnostic LinkComponent prop ([df48d0f](https://github.com/zama-ai/sdk/commit/df48d0fd717cc70d11e5b3a5bab783206fc37fb2))
- **test-components:** scaffold shared test components package ([3ff61a9](https://github.com/zama-ai/sdk/commit/3ff61a957fd8166825b797530d0c8c45255b7f39))
- **test-vite:** add React Router, Tailwind CSS, and extract pages ([8c8c2fa](https://github.com/zama-ai/sdk/commit/8c8c2fa4a518ebc48f76cf5a54ce4be67e96e7b5))
- **test-vite:** migrate to rolldown-vite ([7488eef](https://github.com/zama-ai/sdk/commit/7488eefcb0ba917e50f599d883a49e00fd1cd008))

### Bug Fixes

- add `viem` as dep of sdk, fix examples ([#74](https://github.com/zama-ai/sdk/issues/74)) ([3cf92cd](https://github.com/zama-ai/sdk/commit/3cf92cd8bb69d1188530e49fd9dbf77ab62c13da))
- address integrator friction — gas limits, worker IIFE, CDN localhost, StrictMode restart, Sepolia /v2 ([a18079c](https://github.com/zama-ai/sdk/commit/a18079c8a766db5ee9e730a8d2513ed76115315a))
- **ci:** add Vite build step before running e2e tests ([66ee3d8](https://github.com/zama-ai/sdk/commit/66ee3d8b453a23ddee374eed9ea3a0ad605f4864))
- **deps:** pin minimatch to 10.2.4 to resolve ReDoS vulnerabilities ([#69](https://github.com/zama-ai/sdk/issues/69)) ([3861748](https://github.com/zama-ai/sdk/commit/3861748d8fffd756cf76eab0dbc055f73e6181f5))
- **playwright:** drain in-flight route handlers before reverting chain state ([de35aab](https://github.com/zama-ai/sdk/commit/de35aabde4573ce91e7853dbc39cf64ee6d02620))
- **playwright:** use uniform 30s timeout for nextjs project ([d65cd82](https://github.com/zama-ai/sdk/commit/d65cd82b3120882b02f5bbf70a057635fe0f934c))
- **release:** remove registry-url to fix npm trusted publishing ([aa515ee](https://github.com/zama-ai/sdk/commit/aa515ee4329e83347049513aa1435f89d8a13df8))
- replace `< 2M` with prose in JSDoc to silence tsdoc-malformed-html-name ([2a777b4](https://github.com/zama-ai/sdk/commit/2a777b41ae140d177fe43a37072915044c1fde94))
- replace importScripts with fetch+eval in worker to fix MIME-type errors ([54dbee8](https://github.com/zama-ai/sdk/commit/54dbee8cd3d2f8dade1f4c2a66454ce6fc779a03))
- **sdk:** add /v2 path to mainnet relayer URL ([84978f1](https://github.com/zama-ai/sdk/commit/84978f1e737f60717237284b474d85c45212f7f3))
- **security:** resolve 3 high-severity Dependabot alerts ([#41](https://github.com/zama-ai/sdk/issues/41)) ([9c81b97](https://github.com/zama-ai/sdk/commit/9c81b979e2a0f312f1543604dcfd4c3299f30f3a)), closes [#3](https://github.com/zama-ai/sdk/issues/3) [#4](https://github.com/zama-ai/sdk/issues/4) [#2](https://github.com/zama-ai/sdk/issues/2)
- **security:** resolve CodeQL code scanning alerts ([#42](https://github.com/zama-ai/sdk/issues/42)) ([27d54b6](https://github.com/zama-ai/sdk/commit/27d54b6ca1148a2db114bad7748e39ac340cbd62))
- **test-components:** add non-null assertion for array index access ([7e3efec](https://github.com/zama-ai/sdk/commit/7e3efecb996536cbf2ae8500477a930c07441972))
- **test-nextjs:** correct theme.css import path in globals.css ([2b52c60](https://github.com/zama-ai/sdk/commit/2b52c602acc191c89c3748902011b28808e59050))
- **test-nextjs:** correct USDT contract address to match hardhat deployment ([3e40812](https://github.com/zama-ai/sdk/commit/3e40812f82a02ab9576cea8e76fbd822f1f74421))
- **test-nextjs:** replace CONTRACTS.confidentialToken with CONTRACTS.cUSDT ([8762b14](https://github.com/zama-ai/sdk/commit/8762b141be7d56c42130359fb53c53205e88da24))
- use real hardhat-deployed addresses, add missing transferBatcher approval ([#50](https://github.com/zama-ai/sdk/issues/50)) ([06c6428](https://github.com/zama-ai/sdk/commit/06c64286ca1e4a8b6d9cf0f3485bd530829b0eef))

### Performance Improvements

- speed up vitest by 40% ([#88](https://github.com/zama-ai/sdk/issues/88)) ([33a9b68](https://github.com/zama-ai/sdk/commit/33a9b68b6c86e2b176f78caca23c721884a1ef8b))

### Reverts

- remove premature localhost CDN validation & document balance cache ([a17f191](https://github.com/zama-ai/sdk/commit/a17f191f16155bb29d8e6bf42ce00554afe18c1b))

## [1.0.0-alpha.20](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.19...v1.0.0-alpha.20) (2026-03-10)

### Features

- **sdk:** cleartext flat config refactor ([#78](https://github.com/zama-ai/sdk/issues/78)) ([b052bb9](https://github.com/zama-ai/sdk/commit/b052bb926c007c10dfccfd891a9ff995facc521d))

## [1.0.0-alpha.19](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.18...v1.0.0-alpha.19) (2026-03-10)

## [1.0.0-alpha.18](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.17...v1.0.0-alpha.18) (2026-03-10)

### Performance Improvements

- speed up vitest by 40% ([#88](https://github.com/zama-ai/sdk/issues/88)) ([33a9b68](https://github.com/zama-ai/sdk/commit/33a9b68b6c86e2b176f78caca23c721884a1ef8b))

## [1.0.0-alpha.17](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.16...v1.0.0-alpha.17) (2026-03-09)

### Bug Fixes

- add `viem` as dep of sdk, fix examples ([#74](https://github.com/zama-ai/sdk/issues/74)) ([3cf92cd](https://github.com/zama-ai/sdk/commit/3cf92cd8bb69d1188530e49fd9dbf77ab62c13da))

## [1.0.1](https://github.com/zama-ai/sdk/compare/v1.0.0...v1.0.1) (2026-03-09)

### Bug Fixes

- **release:** Trigger release ([19d079a](https://github.com/zama-ai/sdk/commit/19d079ae9f108f531892151c2612b150ff505e8a))

## 1.0.0 (2026-03-09)

### Features

- add activity feed, batch transfer, and resume unshield e2e tests ([c1d95b5](https://github.com/zama-ai/sdk/commit/c1d95b517a320ee098da15b4e4c76fbb31d85f8e))
- add API key auth and mainnet support to examples ([189f6c1](https://github.com/zama-ai/sdk/commit/189f6c1b06d3dcbe82d38b4575cf0c27b24999fc))
- add CDN URL validation and simplify worker global scope typing ([b1f8362](https://github.com/zama-ai/sdk/commit/b1f8362a770f1628d589722522f55fe7604230d7))
- add cleartext fhEVM feature ([#51](https://github.com/zama-ai/sdk/issues/51)) ([24e00bf](https://github.com/zama-ai/sdk/commit/24e00bf63cc22ab390b29895a49e8e489793d6b8))
- add CredentialsLocked/Unlocked events ([dd14c06](https://github.com/zama-ai/sdk/commit/dd14c0654bffb33aa8d116d2f65aa33cb58562e1))
- add E2E test app with Playwright tests and CI pipeline ([e0b316f](https://github.com/zama-ai/sdk/commit/e0b316f4f4b2b09a6451230828bf95675446dd36))
- add E2E tests for approve, transfer-from, unshield-all, unwrap, FHE relayer, and wrapper discovery hooks ([a242d7a](https://github.com/zama-ai/sdk/commit/a242d7ac64b3ba14d379df14d0d73271301e0fd0))
- add example projects and make EthersSigner accept BrowserProvider ([2690388](https://github.com/zama-ai/sdk/commit/26903888b8cfca5f32d8ae0c8c71e91a271bc7c3))
- add GenericLogger for worker observability and improve hook docs ([10ddc15](https://github.com/zama-ai/sdk/commit/10ddc15cbdc8f06b7e83b6b506ebbee37c2c1ae3))
- add Hex type, missing hooks, DX improvements, and bug fixes ([9db28b1](https://github.com/zama-ai/sdk/commit/9db28b18bddec8648f3f02fabd692fa03e1d3015))
- add Hex type, wagmi suspense hooks, error tests, and community docs ([3c68206](https://github.com/zama-ai/sdk/commit/3c682064497d1f5bc535fd50bfac617488e741b2))
- add lazy chain ID resolution and auto re-init on chain switch ([0dca351](https://github.com/zama-ai/sdk/commit/0dca351b1168afb1d1cca6f225e7b58ad0b16392))
- add lock/unlock/isUnlocked API for session signature management ([bde2896](https://github.com/zama-ai/sdk/commit/bde289655ae93ae12703f2405e118e4f376efa4d))
- add maxConcurrency option to batch decrypt and event emission tests ([c4cfc29](https://github.com/zama-ai/sdk/commit/c4cfc29552111d158eaf870257b8bdaa22ec7b07))
- add NodeWorkerPool with least-connections scheduling ([2e9ec8c](https://github.com/zama-ai/sdk/commit/2e9ec8c4fca3f76f05965f5516bbd9ff1c8d0f1f))
- add PR coverage reporting and bump thresholds to 80% ([fd8833b](https://github.com/zama-ai/sdk/commit/fd8833b17ff6fc57a3b672ec8dd48ab6819a61a5))
- add Suspense variants for token metadata, approval, allowance, and wrapper discovery hooks ([a93b25c](https://github.com/zama-ai/sdk/commit/a93b25cacdb85dcece3b5d07d7704e724b1ff225))
- add useBalanceOf hook, security config, and fix E2E integrity check ([a072f17](https://github.com/zama-ai/sdk/commit/a072f17e67449919bd04721bb85438c0f4025093))
- add wagmi v2 compatibility shim for useConnection/getConnection ([2cc9418](https://github.com/zama-ai/sdk/commit/2cc94183dad4dde5fac53afda661bbd2b1ac3720))
- cache decrypted balances in storage to eliminate spinner on reload ([3a9ca4e](https://github.com/zama-ai/sdk/commit/3a9ca4e8cc2bca25af9f89040c60cc95ba5052fb))
- expose WASM thread pool option for RelayerWeb [SDK-10] ([#28](https://github.com/zama-ai/sdk/issues/28)) ([5f1362b](https://github.com/zama-ai/sdk/commit/5f1362bd44bfecc7b0df112290da1feba1ef8c78))
- implement 10 SDK backlog items — types, hooks, callbacks, status tracking (Vibe Kanban) ([#57](https://github.com/zama-ai/sdk/issues/57)) ([71d78f0](https://github.com/zama-ai/sdk/commit/71d78f0c3cd47181f860be5832fad356147d16bd)), closes [#ensureAllowance](https://github.com/zama-ai/sdk/issues/ensureAllowance)
- improve wallet compatibility, error handling, and SDK robustness ([5dcbe4d](https://github.com/zama-ai/sdk/commit/5dcbe4d154e7fd91b2e7acdcc0a0f1d9a9d4aaf7))
- initialize token-sdk monorepo with source packages ([d5e1180](https://github.com/zama-ai/sdk/commit/d5e1180ed8f52125d7291c2cd8ab0940cd8bc6a1))
- **react-sdk:** add query/mutation options factory exports ([f00e67e](https://github.com/zama-ai/sdk/commit/f00e67e0d6f1bbc11c85e200bf198ffbfc99c5fa))
- read-only signer mode & gitbook import audit ([#65](https://github.com/zama-ai/sdk/issues/65)) ([d3ab112](https://github.com/zama-ai/sdk/commit/d3ab1121c01e22bd2163ed0d23a3b55f47cb6b94))
- SDK API improvements [SDK-4] ([#19](https://github.com/zama-ai/sdk/issues/19)) ([7b77999](https://github.com/zama-ai/sdk/commit/7b77999347fd8ab5683450a245094c022e7a3ee7))
- **sdk:** add configurable session TTL for wallet sessions [SDK-11] ([#56](https://github.com/zama-ai/sdk/issues/56)) ([791806c](https://github.com/zama-ai/sdk/commit/791806c6878bb55357df948fb0c896e91a749850)), closes [#hasLegacySignature](https://github.com/zama-ai/sdk/issues/hasLegacySignature)
- session-scoped signatures & SDK API improvements [SDK-6] ([#25](https://github.com/zama-ai/sdk/issues/25)) ([70374b1](https://github.com/zama-ai/sdk/commit/70374b11f4396130738f9abdad7a1833609dac14)), closes [CredentialsManager#sessionSignatures](https://github.com/zama-ai/CredentialsManager/issues/sessionSignatures) [#reSign](https://github.com/zama-ai/sdk/issues/reSign) [#storeKey](https://github.com/zama-ai/sdk/issues/storeKey) [#onEvent](https://github.com/zama-ai/sdk/issues/onEvent) [#lastChainId](https://github.com/zama-ai/sdk/issues/lastChainId) [#unsubscribeSigner](https://github.com/zama-ai/sdk/issues/unsubscribeSigner)
- session-scoped signatures with re-sign flow and legacy migration ([9eeb55e](https://github.com/zama-ai/sdk/commit/9eeb55e31009c3cf8f47af43f8f881c2ba36cc52))
- **test-components:** add 11 shared form/panel components ([f3030b4](https://github.com/zama-ai/sdk/commit/f3030b40bc8c043df0c3eec0ed92023ff79a723f))
- **test-components:** add shared responsive sidebar nav ([64cefdf](https://github.com/zama-ai/sdk/commit/64cefdf12ef1b1d02e4e52333524b202ec15c3f0))
- **test-components:** add token-table with framework-agnostic LinkComponent prop ([b0bb322](https://github.com/zama-ai/sdk/commit/b0bb3223bc351a07aa724ec04439c8ab18747bbc))
- **test-components:** scaffold shared test components package ([cef03bb](https://github.com/zama-ai/sdk/commit/cef03bb83cf2606a5740adcf907e7c5b4d729b2c))
- **test-vite:** add React Router, Tailwind CSS, and extract pages ([ab749a8](https://github.com/zama-ai/sdk/commit/ab749a8b46e6b04a563567bb751a5284b7dd0c0b))
- **test-vite:** migrate to rolldown-vite ([f2a451a](https://github.com/zama-ai/sdk/commit/f2a451a1a43f3c89f8d871546357a19f3de2f349))
- **token-react-sdk:** add tsup build config and npm exports ([6658c7a](https://github.com/zama-ai/sdk/commit/6658c7a0ab76becf4e8b6d195f499a8ee365735f))
- **token-sdk:** add tsup build config and npm exports ([82e9311](https://github.com/zama-ai/sdk/commit/82e931183efbbfd1564558fe0080b75ace6d1dec))

### Bug Fixes

- address integrator friction — gas limits, worker IIFE, CDN localhost, StrictMode restart, Sepolia /v2 ([38518a1](https://github.com/zama-ai/sdk/commit/38518a12f68a3cb5890d5368f0402b920f8f3ac0))
- CI hardening, worker init dedup, mutation hooks, RelayerNode re-export ([1cfd393](https://github.com/zama-ai/sdk/commit/1cfd393a111efc8a6931e3269f32b39cf62efca8))
- **ci:** add Vite build step before running e2e tests ([bba344f](https://github.com/zama-ai/sdk/commit/bba344f4f57a1da45f604807884ca2e24c9d1277))
- **ci:** disable submodule checkout for vitest workflow to fix Dependabot PRs ([bb049b4](https://github.com/zama-ai/sdk/commit/bb049b45954c4ebfa900dccca1f71ce15238cecf))
- clear() also clears session signature, isExpired works without session ([768bef7](https://github.com/zama-ai/sdk/commit/768bef7b5d2c7b1184778f881caa16ecb0b84fc8))
- correct balanceOf log from "Confidential" to "Decrypted" ([c130a3b](https://github.com/zama-ai/sdk/commit/c130a3bae7e7eab4942571dc3d4df2ccdb9906a8))
- correct README inaccuracies — error class names, peer deps, pnpm version ([5fdebf6](https://github.com/zama-ai/sdk/commit/5fdebf6b05f2a579f8d60f69432051a4f4a23f07))
- **deps:** pin minimatch to 10.2.4 to resolve ReDoS vulnerabilities ([#69](https://github.com/zama-ai/sdk/issues/69)) ([9161806](https://github.com/zama-ai/sdk/commit/91618065e080ef309e2247c4b0d35854115c913e))
- **e2e:** increase Hardhat webServer timeout to prevent CI flake ([4ecf80b](https://github.com/zama-ai/sdk/commit/4ecf80b166b5f2802023e0acfa7db80e2f9ed642))
- **e2e:** remove explicit webServer timeouts to use Playwright defaults ([a93b1bd](https://github.com/zama-ai/sdk/commit/a93b1bd1728953aaf345a3c1b1ae19cea16465f7))
- ensure "use client" directive survives bundling with code splitting ([159f0fa](https://github.com/zama-ai/sdk/commit/159f0fa9f8bf6054b7ca22250b86fbf9543761ef))
- move prepare build to root where tsup is available ([5ca49ec](https://github.com/zama-ai/sdk/commit/5ca49ec1b9b80db980288025a676c78354675cb5))
- **playwright:** drain in-flight route handlers before reverting chain state ([d7d1fee](https://github.com/zama-ai/sdk/commit/d7d1fee69e2af7e963110218e7b1894a45fe66f7))
- **playwright:** use uniform 30s timeout for nextjs project ([b864b5e](https://github.com/zama-ai/sdk/commit/b864b5e84bd55042c1fa6a68c3e636b4d91576bf))
- preserve address case to satisfy relayer SDK checksum validation ([bb13aab](https://github.com/zama-ai/sdk/commit/bb13aab83781807e47adcfc9d0ce42a2d2908e6a))
- production hardening — strict types, security, retry logic, CI pinning ([93f627d](https://github.com/zama-ai/sdk/commit/93f627de6813e810026db70c5153cd9505371af6))
- production hardening — worker leaks, race conditions, error codes ([7fdb749](https://github.com/zama-ai/sdk/commit/7fdb7493a818f9babc0f7d2c5950f26b83b7fba2))
- production readiness — license, source maps, type safety, error handling ([8381634](https://github.com/zama-ai/sdk/commit/83816342b3137922465107298cec021b7b6e9b6c))
- race conditions, worker crash recovery, and query key stability ([5908e6e](https://github.com/zama-ai/sdk/commit/5908e6ea024ebd9842dd0759ff8d8dfb80f6f656))
- race conditions, worker init safety, and defensive hardening ([dc369de](https://github.com/zama-ai/sdk/commit/dc369de8577c8cdaadfd3ef61d1354e3059d3d1e)), closes [#worker](https://github.com/zama-ai/sdk/issues/worker)
- **react-sdk:** invalidate wagmi useBalance cache on unshield/finalize ([7af63b2](https://github.com/zama-ai/sdk/commit/7af63b2d7fafc49fb3c830b2bd978b9ae7102c4d))
- **react-sdk:** replace unsafe casts, fix fee hooks signer access, add test coverage ([6c0a13f](https://github.com/zama-ai/sdk/commit/6c0a13f86730fa2e85e84a8318cf3c8ec298ce22))
- **react-sdk:** use broad balanceOf predicate instead of address-scoped ([6488a7d](https://github.com/zama-ai/sdk/commit/6488a7d0a0cefb832809bf2a6d92ef80ca3a8fb0))
- **react-sdk:** use predicate-based wagmi balanceOf cache invalidation ([5a57077](https://github.com/zama-ai/sdk/commit/5a570772946d05224d7f353bb6ee14e831177ff0))
- relax wagmi peer dependency to >=2 for v2 compatibility ([d89aef8](https://github.com/zama-ai/sdk/commit/d89aef84eeedd9c676f45f49ba43591f2787e569))
- remove Node.js-only RelayerNode re-export from react-sdk ([8fbe902](https://github.com/zama-ai/sdk/commit/8fbe902bf8666a7363c1585b8d802d494b8d5efe))
- Remove remaining token-sdk references ([46b40b8](https://github.com/zama-ai/sdk/commit/46b40b8ab0f9cb56bb8616dc3639e289980d0534))
- replace `< 2M` with prose in JSDoc to silence tsdoc-malformed-html-name ([84a2344](https://github.com/zama-ai/sdk/commit/84a2344b82f43234d97f6c0ed83e257b29c80908))
- replace importScripts with fetch+eval in worker to fix MIME-type errors ([3e05c86](https://github.com/zama-ai/sdk/commit/3e05c86d0e137fee8bde0f5309760af607be3b0a))
- **sdk:** add /v2 path to mainnet relayer URL ([6d5f281](https://github.com/zama-ai/sdk/commit/6d5f281238e1ef8c6451ea5435560ebea7cbbd5c))
- **security:** resolve 3 high-severity Dependabot alerts ([#41](https://github.com/zama-ai/sdk/issues/41)) ([8f824c2](https://github.com/zama-ai/sdk/commit/8f824c2d932562bb98600cae73146797c5037e9e)), closes [#3](https://github.com/zama-ai/sdk/issues/3) [#4](https://github.com/zama-ai/sdk/issues/4) [#2](https://github.com/zama-ai/sdk/issues/2)
- **security:** resolve CodeQL code scanning alerts ([#42](https://github.com/zama-ai/sdk/issues/42)) ([46da756](https://github.com/zama-ai/sdk/commit/46da756873e97e36b00b7d0d1ef76315ccc3c593))
- strip EIP712Domain from signer types and re-key balance Map by original addresses ([0d0b8e4](https://github.com/zama-ai/sdk/commit/0d0b8e439adca2c72980a5525e641bec4990a224))
- **test-components:** add non-null assertion for array index access ([66d4187](https://github.com/zama-ai/sdk/commit/66d4187e6936d9e975b8cc2a94418ca295cfa720))
- **test-nextjs:** correct theme.css import path in globals.css ([cbec13f](https://github.com/zama-ai/sdk/commit/cbec13fff18801786729e7cdf26896ce84e677e1))
- **test-nextjs:** correct USDT contract address to match hardhat deployment ([48d596f](https://github.com/zama-ai/sdk/commit/48d596f412b08c865e88597d1b878fc555cefaa7))
- **test-nextjs:** replace CONTRACTS.confidentialToken with CONTRACTS.cUSDT ([012ad6f](https://github.com/zama-ai/sdk/commit/012ad6f990a1bc0a1b802c2ab8f1c577b929d537))
- type safety, error handling, and query stability improvements ([40cb140](https://github.com/zama-ai/sdk/commit/40cb14033103dbdb290e63d5380a79135dcea19c)), closes [NodeWorkerPool#dispatch](https://github.com/zama-ai/NodeWorkerPool/issues/dispatch)
- unwrap error granularity, cache reuse, and defensive hardening ([ba88c32](https://github.com/zama-ai/sdk/commit/ba88c325108d6c67309d123ee3d9d827c9776c74)), closes [#ensureAllowance](https://github.com/zama-ai/sdk/issues/ensureAllowance)
- use blob URL for worker script loading with extension fallback ([a5e3cc0](https://github.com/zama-ai/sdk/commit/a5e3cc0a0c417bb6922c146db3a0c4e8e7c9362b))
- use real hardhat-deployed addresses, add missing transferBatcher approval ([#50](https://github.com/zama-ai/sdk/issues/50)) ([5881423](https://github.com/zama-ai/sdk/commit/58814236645fddc613ac8dca703e176bd963d73c))
- use SUBMODULE_TOKEN for private submodule checkout in CI ([66cda4a](https://github.com/zama-ai/sdk/commit/66cda4a9d5434379cc346622474628550f258b5a))
- worker crash safety, concurrency guards, and query key consistency ([3259942](https://github.com/zama-ai/sdk/commit/32599426bb6985d9ae392af23bc9dc9291551363))

### Reverts

- remove premature localhost CDN validation & document balance cache ([af2ca7c](https://github.com/zama-ai/sdk/commit/af2ca7ce64a8ba775306390b5baf0252fe28ac31))

## [1.0.0-alpha.16](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.15...v1.0.0-alpha.16) (2026-03-06)

## [1.0.0-alpha.15](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.14...v1.0.0-alpha.15) (2026-03-06)

## [1.0.0-alpha.14](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.13...v1.0.0-alpha.14) (2026-03-06)

## [1.0.0-alpha.13](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.12...v1.0.0-alpha.13) (2026-03-06)

### Bug Fixes

- **deps:** pin minimatch to 10.2.4 to resolve ReDoS vulnerabilities ([#69](https://github.com/zama-ai/sdk/issues/69)) ([3861748](https://github.com/zama-ai/sdk/commit/3861748d8fffd756cf76eab0dbc055f73e6181f5))

## [1.0.0-alpha.12](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.11...v1.0.0-alpha.12) (2026-03-06)

### Features

- read-only signer mode & gitbook import audit ([#65](https://github.com/zama-ai/sdk/issues/65)) ([03366c2](https://github.com/zama-ai/sdk/commit/03366c265ed51e4e9fa86355196ca935a576d586))

## [1.0.0-alpha.11](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.10...v1.0.0-alpha.11) (2026-03-06)

### Features

- **sdk:** add configurable session TTL for wallet sessions [SDK-11] ([#56](https://github.com/zama-ai/sdk/issues/56)) ([f6655d0](https://github.com/zama-ai/sdk/commit/f6655d0376d20c87388db4a70653bd36e8b52c19)), closes [#hasLegacySignature](https://github.com/zama-ai/sdk/issues/hasLegacySignature)

## [1.0.0-alpha.10](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.9...v1.0.0-alpha.10) (2026-03-06)

### Features

- add cleartext fhEVM feature ([#51](https://github.com/zama-ai/sdk/issues/51)) ([f951673](https://github.com/zama-ai/sdk/commit/f951673a86e975c06dcd41527c5401c365a7d2d5))

## [1.0.0-alpha.9](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.8...v1.0.0-alpha.9) (2026-03-06)

### Bug Fixes

- **release:** remove registry-url to fix npm trusted publishing ([aa515ee](https://github.com/zama-ai/sdk/commit/aa515ee4329e83347049513aa1435f89d8a13df8))

## [1.0.0-alpha.8](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.7...v1.0.0-alpha.8) (2026-03-05)

### Features

- expose WASM thread pool option for RelayerWeb [SDK-10] ([#28](https://github.com/zama-ai/sdk/issues/28)) ([11dae99](https://github.com/zama-ai/sdk/commit/11dae99a2801378aca1d36dd2be64b061b039669))
- implement 10 SDK backlog items — types, hooks, callbacks, status tracking (Vibe Kanban) ([#57](https://github.com/zama-ai/sdk/issues/57)) ([b59e222](https://github.com/zama-ai/sdk/commit/b59e222fa522c7fd0e137b9be418eb59b8a1cc55)), closes [#ensureAllowance](https://github.com/zama-ai/sdk/issues/ensureAllowance)
- session-scoped signatures & SDK API improvements [SDK-6] ([#25](https://github.com/zama-ai/sdk/issues/25)) ([116ae85](https://github.com/zama-ai/sdk/commit/116ae85a8d4c1a592563e6d5f3a1f65cabb7711f)), closes [CredentialsManager#sessionSignatures](https://github.com/zama-ai/CredentialsManager/issues/sessionSignatures) [#reSign](https://github.com/zama-ai/sdk/issues/reSign) [#storeKey](https://github.com/zama-ai/sdk/issues/storeKey) [#onEvent](https://github.com/zama-ai/sdk/issues/onEvent) [#lastChainId](https://github.com/zama-ai/sdk/issues/lastChainId) [#unsubscribeSigner](https://github.com/zama-ai/sdk/issues/unsubscribeSigner)

### Bug Fixes

- use real hardhat-deployed addresses, add missing transferBatcher approval ([#50](https://github.com/zama-ai/sdk/issues/50)) ([06c6428](https://github.com/zama-ai/sdk/commit/06c64286ca1e4a8b6d9cf0f3485bd530829b0eef))

## 1.0.0-alpha.1 (2026-03-05)

### Features

- add activity feed, batch transfer, and resume unshield e2e tests ([0b05774](https://github.com/zama-ai/sdk/commit/0b05774be738da6b0051238fc6f867944c8d83b2))
- add API key auth and mainnet support to examples ([189f6c1](https://github.com/zama-ai/sdk/commit/189f6c1b06d3dcbe82d38b4575cf0c27b24999fc))
- add CDN URL validation and simplify worker global scope typing ([b1f8362](https://github.com/zama-ai/sdk/commit/b1f8362a770f1628d589722522f55fe7604230d7))
- add CredentialsLocked/Unlocked events ([dd14c06](https://github.com/zama-ai/sdk/commit/dd14c0654bffb33aa8d116d2f65aa33cb58562e1))
- add E2E test app with Playwright tests and CI pipeline ([e0b316f](https://github.com/zama-ai/sdk/commit/e0b316f4f4b2b09a6451230828bf95675446dd36))
- add E2E tests for approve, transfer-from, unshield-all, unwrap, FHE relayer, and wrapper discovery hooks ([a242d7a](https://github.com/zama-ai/sdk/commit/a242d7ac64b3ba14d379df14d0d73271301e0fd0))
- add example projects and make EthersSigner accept BrowserProvider ([2690388](https://github.com/zama-ai/sdk/commit/26903888b8cfca5f32d8ae0c8c71e91a271bc7c3))
- add GenericLogger for worker observability and improve hook docs ([10ddc15](https://github.com/zama-ai/sdk/commit/10ddc15cbdc8f06b7e83b6b506ebbee37c2c1ae3))
- add Hex type, missing hooks, DX improvements, and bug fixes ([9db28b1](https://github.com/zama-ai/sdk/commit/9db28b18bddec8648f3f02fabd692fa03e1d3015))
- add Hex type, wagmi suspense hooks, error tests, and community docs ([3c68206](https://github.com/zama-ai/sdk/commit/3c682064497d1f5bc535fd50bfac617488e741b2))
- add lazy chain ID resolution and auto re-init on chain switch ([0dca351](https://github.com/zama-ai/sdk/commit/0dca351b1168afb1d1cca6f225e7b58ad0b16392))
- add lock/unlock/isUnlocked API for session signature management ([bde2896](https://github.com/zama-ai/sdk/commit/bde289655ae93ae12703f2405e118e4f376efa4d))
- add maxConcurrency option to batch decrypt and event emission tests ([c4cfc29](https://github.com/zama-ai/sdk/commit/c4cfc29552111d158eaf870257b8bdaa22ec7b07))
- add NodeWorkerPool with least-connections scheduling ([2e9ec8c](https://github.com/zama-ai/sdk/commit/2e9ec8c4fca3f76f05965f5516bbd9ff1c8d0f1f))
- add PR coverage reporting and bump thresholds to 80% ([fd8833b](https://github.com/zama-ai/sdk/commit/fd8833b17ff6fc57a3b672ec8dd48ab6819a61a5))
- add Suspense variants for token metadata, approval, allowance, and wrapper discovery hooks ([a93b25c](https://github.com/zama-ai/sdk/commit/a93b25cacdb85dcece3b5d07d7704e724b1ff225))
- add useBalanceOf hook, security config, and fix E2E integrity check ([a072f17](https://github.com/zama-ai/sdk/commit/a072f17e67449919bd04721bb85438c0f4025093))
- add wagmi v2 compatibility shim for useConnection/getConnection ([0741649](https://github.com/zama-ai/sdk/commit/0741649d6e984de6362d024cb7e1b5ebfb6db605))
- cache decrypted balances in storage to eliminate spinner on reload ([f90d649](https://github.com/zama-ai/sdk/commit/f90d6495d28aabcd2bf5e210a9cfe741cc10de1b))
- expose WASM thread pool option for RelayerWeb [SDK-10] ([#28](https://github.com/zama-ai/sdk/issues/28)) ([11dae99](https://github.com/zama-ai/sdk/commit/11dae99a2801378aca1d36dd2be64b061b039669))
- implement 10 SDK backlog items — types, hooks, callbacks, status tracking (Vibe Kanban) ([#57](https://github.com/zama-ai/sdk/issues/57)) ([b59e222](https://github.com/zama-ai/sdk/commit/b59e222fa522c7fd0e137b9be418eb59b8a1cc55)), closes [#ensureAllowance](https://github.com/zama-ai/sdk/issues/ensureAllowance)
- improve wallet compatibility, error handling, and SDK robustness ([5dcbe4d](https://github.com/zama-ai/sdk/commit/5dcbe4d154e7fd91b2e7acdcc0a0f1d9a9d4aaf7))
- initialize token-sdk monorepo with source packages ([d5e1180](https://github.com/zama-ai/sdk/commit/d5e1180ed8f52125d7291c2cd8ab0940cd8bc6a1))
- **react-sdk:** add query/mutation options factory exports ([f00e67e](https://github.com/zama-ai/sdk/commit/f00e67e0d6f1bbc11c85e200bf198ffbfc99c5fa))
- SDK API improvements [SDK-4] ([#19](https://github.com/zama-ai/sdk/issues/19)) ([7b77999](https://github.com/zama-ai/sdk/commit/7b77999347fd8ab5683450a245094c022e7a3ee7))
- session-scoped signatures & SDK API improvements [SDK-6] ([#25](https://github.com/zama-ai/sdk/issues/25)) ([116ae85](https://github.com/zama-ai/sdk/commit/116ae85a8d4c1a592563e6d5f3a1f65cabb7711f)), closes [CredentialsManager#sessionSignatures](https://github.com/zama-ai/CredentialsManager/issues/sessionSignatures) [#reSign](https://github.com/zama-ai/sdk/issues/reSign) [#storeKey](https://github.com/zama-ai/sdk/issues/storeKey) [#onEvent](https://github.com/zama-ai/sdk/issues/onEvent) [#lastChainId](https://github.com/zama-ai/sdk/issues/lastChainId) [#unsubscribeSigner](https://github.com/zama-ai/sdk/issues/unsubscribeSigner)
- session-scoped signatures with re-sign flow and legacy migration ([9eeb55e](https://github.com/zama-ai/sdk/commit/9eeb55e31009c3cf8f47af43f8f881c2ba36cc52))
- **test-components:** add 11 shared form/panel components ([28a29c2](https://github.com/zama-ai/sdk/commit/28a29c2a5ad14de175b803d21f4f9c08bac1cb9f))
- **test-components:** add shared responsive sidebar nav ([ded5823](https://github.com/zama-ai/sdk/commit/ded582358c5a87cc2540d1e19a4de2f94d521e52))
- **test-components:** add token-table with framework-agnostic LinkComponent prop ([df48d0f](https://github.com/zama-ai/sdk/commit/df48d0fd717cc70d11e5b3a5bab783206fc37fb2))
- **test-components:** scaffold shared test components package ([3ff61a9](https://github.com/zama-ai/sdk/commit/3ff61a957fd8166825b797530d0c8c45255b7f39))
- **test-vite:** add React Router, Tailwind CSS, and extract pages ([8c8c2fa](https://github.com/zama-ai/sdk/commit/8c8c2fa4a518ebc48f76cf5a54ce4be67e96e7b5))
- **test-vite:** migrate to rolldown-vite ([7488eef](https://github.com/zama-ai/sdk/commit/7488eefcb0ba917e50f599d883a49e00fd1cd008))
- **token-react-sdk:** add tsup build config and npm exports ([6658c7a](https://github.com/zama-ai/sdk/commit/6658c7a0ab76becf4e8b6d195f499a8ee365735f))
- **token-sdk:** add tsup build config and npm exports ([82e9311](https://github.com/zama-ai/sdk/commit/82e931183efbbfd1564558fe0080b75ace6d1dec))

### Bug Fixes

- address integrator friction — gas limits, worker IIFE, CDN localhost, StrictMode restart, Sepolia /v2 ([a18079c](https://github.com/zama-ai/sdk/commit/a18079c8a766db5ee9e730a8d2513ed76115315a))
- CI hardening, worker init dedup, mutation hooks, RelayerNode re-export ([1cfd393](https://github.com/zama-ai/sdk/commit/1cfd393a111efc8a6931e3269f32b39cf62efca8))
- **ci:** add Vite build step before running e2e tests ([66ee3d8](https://github.com/zama-ai/sdk/commit/66ee3d8b453a23ddee374eed9ea3a0ad605f4864))
- **ci:** disable submodule checkout for vitest workflow to fix Dependabot PRs ([bb049b4](https://github.com/zama-ai/sdk/commit/bb049b45954c4ebfa900dccca1f71ce15238cecf))
- clear() also clears session signature, isExpired works without session ([768bef7](https://github.com/zama-ai/sdk/commit/768bef7b5d2c7b1184778f881caa16ecb0b84fc8))
- correct balanceOf log from "Confidential" to "Decrypted" ([c130a3b](https://github.com/zama-ai/sdk/commit/c130a3bae7e7eab4942571dc3d4df2ccdb9906a8))
- correct README inaccuracies — error class names, peer deps, pnpm version ([5fdebf6](https://github.com/zama-ai/sdk/commit/5fdebf6b05f2a579f8d60f69432051a4f4a23f07))
- **e2e:** increase Hardhat webServer timeout to prevent CI flake ([4ecf80b](https://github.com/zama-ai/sdk/commit/4ecf80b166b5f2802023e0acfa7db80e2f9ed642))
- **e2e:** remove explicit webServer timeouts to use Playwright defaults ([a93b1bd](https://github.com/zama-ai/sdk/commit/a93b1bd1728953aaf345a3c1b1ae19cea16465f7))
- ensure "use client" directive survives bundling with code splitting ([159f0fa](https://github.com/zama-ai/sdk/commit/159f0fa9f8bf6054b7ca22250b86fbf9543761ef))
- move prepare build to root where tsup is available ([5ca49ec](https://github.com/zama-ai/sdk/commit/5ca49ec1b9b80db980288025a676c78354675cb5))
- **playwright:** drain in-flight route handlers before reverting chain state ([de35aab](https://github.com/zama-ai/sdk/commit/de35aabde4573ce91e7853dbc39cf64ee6d02620))
- **playwright:** use uniform 30s timeout for nextjs project ([d65cd82](https://github.com/zama-ai/sdk/commit/d65cd82b3120882b02f5bbf70a057635fe0f934c))
- preserve address case to satisfy relayer SDK checksum validation ([bb13aab](https://github.com/zama-ai/sdk/commit/bb13aab83781807e47adcfc9d0ce42a2d2908e6a))
- production hardening — strict types, security, retry logic, CI pinning ([93f627d](https://github.com/zama-ai/sdk/commit/93f627de6813e810026db70c5153cd9505371af6))
- production hardening — worker leaks, race conditions, error codes ([7fdb749](https://github.com/zama-ai/sdk/commit/7fdb7493a818f9babc0f7d2c5950f26b83b7fba2))
- production readiness — license, source maps, type safety, error handling ([8381634](https://github.com/zama-ai/sdk/commit/83816342b3137922465107298cec021b7b6e9b6c))
- race conditions, worker crash recovery, and query key stability ([5908e6e](https://github.com/zama-ai/sdk/commit/5908e6ea024ebd9842dd0759ff8d8dfb80f6f656))
- race conditions, worker init safety, and defensive hardening ([dc369de](https://github.com/zama-ai/sdk/commit/dc369de8577c8cdaadfd3ef61d1354e3059d3d1e)), closes [#worker](https://github.com/zama-ai/sdk/issues/worker)
- **react-sdk:** invalidate wagmi useBalance cache on unshield/finalize ([7af63b2](https://github.com/zama-ai/sdk/commit/7af63b2d7fafc49fb3c830b2bd978b9ae7102c4d))
- **react-sdk:** replace unsafe casts, fix fee hooks signer access, add test coverage ([6c0a13f](https://github.com/zama-ai/sdk/commit/6c0a13f86730fa2e85e84a8318cf3c8ec298ce22))
- **react-sdk:** use broad balanceOf predicate instead of address-scoped ([6488a7d](https://github.com/zama-ai/sdk/commit/6488a7d0a0cefb832809bf2a6d92ef80ca3a8fb0))
- **react-sdk:** use predicate-based wagmi balanceOf cache invalidation ([5a57077](https://github.com/zama-ai/sdk/commit/5a570772946d05224d7f353bb6ee14e831177ff0))
- relax wagmi peer dependency to >=2 for v2 compatibility ([d89aef8](https://github.com/zama-ai/sdk/commit/d89aef84eeedd9c676f45f49ba43591f2787e569))
- remove Node.js-only RelayerNode re-export from react-sdk ([8fbe902](https://github.com/zama-ai/sdk/commit/8fbe902bf8666a7363c1585b8d802d494b8d5efe))
- Remove remaining token-sdk references ([46b40b8](https://github.com/zama-ai/sdk/commit/46b40b8ab0f9cb56bb8616dc3639e289980d0534))
- replace `< 2M` with prose in JSDoc to silence tsdoc-malformed-html-name ([2a777b4](https://github.com/zama-ai/sdk/commit/2a777b41ae140d177fe43a37072915044c1fde94))
- replace importScripts with fetch+eval in worker to fix MIME-type errors ([54dbee8](https://github.com/zama-ai/sdk/commit/54dbee8cd3d2f8dade1f4c2a66454ce6fc779a03))
- **sdk:** add /v2 path to mainnet relayer URL ([84978f1](https://github.com/zama-ai/sdk/commit/84978f1e737f60717237284b474d85c45212f7f3))
- **security:** resolve 3 high-severity Dependabot alerts ([#41](https://github.com/zama-ai/sdk/issues/41)) ([9c81b97](https://github.com/zama-ai/sdk/commit/9c81b979e2a0f312f1543604dcfd4c3299f30f3a)), closes [#3](https://github.com/zama-ai/sdk/issues/3) [#4](https://github.com/zama-ai/sdk/issues/4) [#2](https://github.com/zama-ai/sdk/issues/2)
- **security:** resolve CodeQL code scanning alerts ([#42](https://github.com/zama-ai/sdk/issues/42)) ([27d54b6](https://github.com/zama-ai/sdk/commit/27d54b6ca1148a2db114bad7748e39ac340cbd62))
- strip EIP712Domain from signer types and re-key balance Map by original addresses ([0d0b8e4](https://github.com/zama-ai/sdk/commit/0d0b8e439adca2c72980a5525e641bec4990a224))
- **test-components:** add non-null assertion for array index access ([7e3efec](https://github.com/zama-ai/sdk/commit/7e3efecb996536cbf2ae8500477a930c07441972))
- **test-nextjs:** correct theme.css import path in globals.css ([2b52c60](https://github.com/zama-ai/sdk/commit/2b52c602acc191c89c3748902011b28808e59050))
- **test-nextjs:** correct USDT contract address to match hardhat deployment ([3e40812](https://github.com/zama-ai/sdk/commit/3e40812f82a02ab9576cea8e76fbd822f1f74421))
- **test-nextjs:** replace CONTRACTS.confidentialToken with CONTRACTS.cUSDT ([8762b14](https://github.com/zama-ai/sdk/commit/8762b141be7d56c42130359fb53c53205e88da24))
- type safety, error handling, and query stability improvements ([40cb140](https://github.com/zama-ai/sdk/commit/40cb14033103dbdb290e63d5380a79135dcea19c)), closes [NodeWorkerPool#dispatch](https://github.com/zama-ai/NodeWorkerPool/issues/dispatch)
- unwrap error granularity, cache reuse, and defensive hardening ([ba88c32](https://github.com/zama-ai/sdk/commit/ba88c325108d6c67309d123ee3d9d827c9776c74)), closes [#ensureAllowance](https://github.com/zama-ai/sdk/issues/ensureAllowance)
- use blob URL for worker script loading with extension fallback ([a5e3cc0](https://github.com/zama-ai/sdk/commit/a5e3cc0a0c417bb6922c146db3a0c4e8e7c9362b))
- use real hardhat-deployed addresses, add missing transferBatcher approval ([#50](https://github.com/zama-ai/sdk/issues/50)) ([06c6428](https://github.com/zama-ai/sdk/commit/06c64286ca1e4a8b6d9cf0f3485bd530829b0eef))
- use SUBMODULE_TOKEN for private submodule checkout in CI ([66cda4a](https://github.com/zama-ai/sdk/commit/66cda4a9d5434379cc346622474628550f258b5a))
- worker crash safety, concurrency guards, and query key consistency ([3259942](https://github.com/zama-ai/sdk/commit/32599426bb6985d9ae392af23bc9dc9291551363))

### Reverts

- remove premature localhost CDN validation & document balance cache ([a17f191](https://github.com/zama-ai/sdk/commit/a17f191f16155bb29d8e6bf42ce00554afe18c1b))

## [1.0.0-alpha.7](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.6...v1.0.0-alpha.7) (2026-03-02)

### Bug Fixes

- **security:** resolve CodeQL code scanning alerts ([#42](https://github.com/zama-ai/sdk/issues/42)) ([96ae63f](https://github.com/zama-ai/sdk/commit/96ae63ff4b44cfa44b52acbf7fc6be31f5ef452f))

## [1.0.0-alpha.6](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.5...v1.0.0-alpha.6) (2026-03-02)

### Bug Fixes

- **security:** resolve 3 high-severity Dependabot alerts ([#41](https://github.com/zama-ai/sdk/issues/41)) ([9f29783](https://github.com/zama-ai/sdk/commit/9f29783314bfd74b4ed99f446e97d268d3cd9d00)), closes [#3](https://github.com/zama-ai/sdk/issues/3) [#4](https://github.com/zama-ai/sdk/issues/4) [#2](https://github.com/zama-ai/sdk/issues/2)

## [1.0.0-alpha.5](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.4...v1.0.0-alpha.5) (2026-03-02)

## [1.0.0-alpha.4](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.3...v1.0.0-alpha.4) (2026-03-02)

### Features

- add activity feed, batch transfer, and resume unshield e2e tests ([70efc7e](https://github.com/zama-ai/sdk/commit/70efc7ecd35e3efa08edd4d150559dc93d56aa57))
- add wagmi v2 compatibility shim for useConnection/getConnection ([c480ac4](https://github.com/zama-ai/sdk/commit/c480ac43415b2fb97fb5e5ef50645abc4f959b7b))
- cache decrypted balances in storage to eliminate spinner on reload ([63df398](https://github.com/zama-ai/sdk/commit/63df39897495a0547306070ec6f22cee23746226))
- **test-components:** add 11 shared form/panel components ([71aea3d](https://github.com/zama-ai/sdk/commit/71aea3dad0b61e328f2a4e221b4c58f7f656e63c))
- **test-components:** add shared responsive sidebar nav ([2cbdab0](https://github.com/zama-ai/sdk/commit/2cbdab05c7962068c7965ba4c8ec4368e8bbf074))
- **test-components:** add token-table with framework-agnostic LinkComponent prop ([62a89d0](https://github.com/zama-ai/sdk/commit/62a89d01604b31cb757296e389803aa8797b1acd))
- **test-components:** scaffold shared test components package ([2ed32fa](https://github.com/zama-ai/sdk/commit/2ed32fa4d1a3178786d0da9acd5d01102e7aeab8))
- **test-vite:** add React Router, Tailwind CSS, and extract pages ([e70f4ad](https://github.com/zama-ai/sdk/commit/e70f4ad60e89de429fe3f798897e30a15a737370))
- **test-vite:** migrate to rolldown-vite ([ab80bfc](https://github.com/zama-ai/sdk/commit/ab80bfcd4abf47adff5196686efb14d42cabfd39))

### Bug Fixes

- address integrator friction — gas limits, worker IIFE, CDN localhost, StrictMode restart, Sepolia /v2 ([a42d583](https://github.com/zama-ai/sdk/commit/a42d583ef745ca23af94481a83ff9347156f3df1))
- **ci:** add Vite build step before running e2e tests ([689e1d5](https://github.com/zama-ai/sdk/commit/689e1d565c2471fd26ca7521c67e42d49d930b86))
- **playwright:** drain in-flight route handlers before reverting chain state ([23cfec9](https://github.com/zama-ai/sdk/commit/23cfec996adc70083b21f870260544921e1b4f89))
- **playwright:** use uniform 30s timeout for nextjs project ([bfe96af](https://github.com/zama-ai/sdk/commit/bfe96af56d7b024a8145bc9edec52fc69359aa87))
- replace `< 2M` with prose in JSDoc to silence tsdoc-malformed-html-name ([cf4264e](https://github.com/zama-ai/sdk/commit/cf4264e35c4b6ad4a8af1800a0966fac1106b20d))
- **sdk:** add /v2 path to mainnet relayer URL ([0310d01](https://github.com/zama-ai/sdk/commit/0310d01428300f488119dc689c165a2c023e50b8))
- **test-components:** add non-null assertion for array index access ([6b9a1ff](https://github.com/zama-ai/sdk/commit/6b9a1ffe568a8956404ac14b4c182936661517c0))
- **test-nextjs:** correct theme.css import path in globals.css ([f4b8564](https://github.com/zama-ai/sdk/commit/f4b85641766e974f30f590d13c88732f8b380eb0))
- **test-nextjs:** correct USDT contract address to match hardhat deployment ([6cd96f5](https://github.com/zama-ai/sdk/commit/6cd96f5b94486e520740b0d73a64c478d6fe163a))
- **test-nextjs:** replace CONTRACTS.confidentialToken with CONTRACTS.cUSDT ([b0ab373](https://github.com/zama-ai/sdk/commit/b0ab373a30e845729d85329704c00d6cb0211b7c))

### Reverts

- remove premature localhost CDN validation & document balance cache ([2a3664c](https://github.com/zama-ai/sdk/commit/2a3664cf7879b0352cfe4b4e2852b3e14d73e227))

## [1.0.0-alpha.3](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.2...v1.0.0-alpha.3) (2026-02-27)

## [1.0.0-alpha.2](https://github.com/zama-ai/sdk/compare/v1.0.0-alpha.1...v1.0.0-alpha.2) (2026-02-27)

## 1.0.0-alpha.1 (2026-02-26)

### Features

- add API key auth and mainnet support to examples ([189f6c1](https://github.com/zama-ai/sdk/commit/189f6c1b06d3dcbe82d38b4575cf0c27b24999fc))
- add CDN URL validation and simplify worker global scope typing ([b1f8362](https://github.com/zama-ai/sdk/commit/b1f8362a770f1628d589722522f55fe7604230d7))
- add CredentialsLocked/Unlocked events ([dd14c06](https://github.com/zama-ai/sdk/commit/dd14c0654bffb33aa8d116d2f65aa33cb58562e1))
- add E2E test app with Playwright tests and CI pipeline ([e0b316f](https://github.com/zama-ai/sdk/commit/e0b316f4f4b2b09a6451230828bf95675446dd36))
- add E2E tests for approve, transfer-from, unshield-all, unwrap, FHE relayer, and wrapper discovery hooks ([a242d7a](https://github.com/zama-ai/sdk/commit/a242d7ac64b3ba14d379df14d0d73271301e0fd0))
- add example projects and make EthersSigner accept BrowserProvider ([2690388](https://github.com/zama-ai/sdk/commit/26903888b8cfca5f32d8ae0c8c71e91a271bc7c3))
- add GenericLogger for worker observability and improve hook docs ([10ddc15](https://github.com/zama-ai/sdk/commit/10ddc15cbdc8f06b7e83b6b506ebbee37c2c1ae3))
- add Hex type, missing hooks, DX improvements, and bug fixes ([9db28b1](https://github.com/zama-ai/sdk/commit/9db28b18bddec8648f3f02fabd692fa03e1d3015))
- add Hex type, wagmi suspense hooks, error tests, and community docs ([3c68206](https://github.com/zama-ai/sdk/commit/3c682064497d1f5bc535fd50bfac617488e741b2))
- add lazy chain ID resolution and auto re-init on chain switch ([0dca351](https://github.com/zama-ai/sdk/commit/0dca351b1168afb1d1cca6f225e7b58ad0b16392))
- add lock/unlock/isUnlocked API for session signature management ([bde2896](https://github.com/zama-ai/sdk/commit/bde289655ae93ae12703f2405e118e4f376efa4d))
- add maxConcurrency option to batch decrypt and event emission tests ([c4cfc29](https://github.com/zama-ai/sdk/commit/c4cfc29552111d158eaf870257b8bdaa22ec7b07))
- add NodeWorkerPool with least-connections scheduling ([2e9ec8c](https://github.com/zama-ai/sdk/commit/2e9ec8c4fca3f76f05965f5516bbd9ff1c8d0f1f))
- add PR coverage reporting and bump thresholds to 80% ([fd8833b](https://github.com/zama-ai/sdk/commit/fd8833b17ff6fc57a3b672ec8dd48ab6819a61a5))
- add Suspense variants for token metadata, approval, allowance, and wrapper discovery hooks ([a93b25c](https://github.com/zama-ai/sdk/commit/a93b25cacdb85dcece3b5d07d7704e724b1ff225))
- add useBalanceOf hook, security config, and fix E2E integrity check ([a072f17](https://github.com/zama-ai/sdk/commit/a072f17e67449919bd04721bb85438c0f4025093))
- improve wallet compatibility, error handling, and SDK robustness ([5dcbe4d](https://github.com/zama-ai/sdk/commit/5dcbe4d154e7fd91b2e7acdcc0a0f1d9a9d4aaf7))
- initialize token-sdk monorepo with source packages ([d5e1180](https://github.com/zama-ai/sdk/commit/d5e1180ed8f52125d7291c2cd8ab0940cd8bc6a1))
- **react-sdk:** add query/mutation options factory exports ([f00e67e](https://github.com/zama-ai/sdk/commit/f00e67e0d6f1bbc11c85e200bf198ffbfc99c5fa))
- SDK API improvements [SDK-4] ([#19](https://github.com/zama-ai/sdk/issues/19)) ([7b77999](https://github.com/zama-ai/sdk/commit/7b77999347fd8ab5683450a245094c022e7a3ee7))
- session-scoped signatures with re-sign flow and legacy migration ([9eeb55e](https://github.com/zama-ai/sdk/commit/9eeb55e31009c3cf8f47af43f8f881c2ba36cc52))
- **token-react-sdk:** add tsup build config and npm exports ([6658c7a](https://github.com/zama-ai/sdk/commit/6658c7a0ab76becf4e8b6d195f499a8ee365735f))
- **token-sdk:** add tsup build config and npm exports ([82e9311](https://github.com/zama-ai/sdk/commit/82e931183efbbfd1564558fe0080b75ace6d1dec))

### Bug Fixes

- CI hardening, worker init dedup, mutation hooks, RelayerNode re-export ([1cfd393](https://github.com/zama-ai/sdk/commit/1cfd393a111efc8a6931e3269f32b39cf62efca8))
- **ci:** disable submodule checkout for vitest workflow to fix Dependabot PRs ([bb049b4](https://github.com/zama-ai/sdk/commit/bb049b45954c4ebfa900dccca1f71ce15238cecf))
- clear() also clears session signature, isExpired works without session ([768bef7](https://github.com/zama-ai/sdk/commit/768bef7b5d2c7b1184778f881caa16ecb0b84fc8))
- correct balanceOf log from "Confidential" to "Decrypted" ([c130a3b](https://github.com/zama-ai/sdk/commit/c130a3bae7e7eab4942571dc3d4df2ccdb9906a8))
- correct README inaccuracies — error class names, peer deps, pnpm version ([5fdebf6](https://github.com/zama-ai/sdk/commit/5fdebf6b05f2a579f8d60f69432051a4f4a23f07))
- **e2e:** increase Hardhat webServer timeout to prevent CI flake ([4ecf80b](https://github.com/zama-ai/sdk/commit/4ecf80b166b5f2802023e0acfa7db80e2f9ed642))
- **e2e:** remove explicit webServer timeouts to use Playwright defaults ([a93b1bd](https://github.com/zama-ai/sdk/commit/a93b1bd1728953aaf345a3c1b1ae19cea16465f7))
- ensure "use client" directive survives bundling with code splitting ([159f0fa](https://github.com/zama-ai/sdk/commit/159f0fa9f8bf6054b7ca22250b86fbf9543761ef))
- move prepare build to root where tsup is available ([5ca49ec](https://github.com/zama-ai/sdk/commit/5ca49ec1b9b80db980288025a676c78354675cb5))
- preserve address case to satisfy relayer SDK checksum validation ([bb13aab](https://github.com/zama-ai/sdk/commit/bb13aab83781807e47adcfc9d0ce42a2d2908e6a))
- production hardening — strict types, security, retry logic, CI pinning ([93f627d](https://github.com/zama-ai/sdk/commit/93f627de6813e810026db70c5153cd9505371af6))
- production hardening — worker leaks, race conditions, error codes ([7fdb749](https://github.com/zama-ai/sdk/commit/7fdb7493a818f9babc0f7d2c5950f26b83b7fba2))
- production readiness — license, source maps, type safety, error handling ([8381634](https://github.com/zama-ai/sdk/commit/83816342b3137922465107298cec021b7b6e9b6c))
- race conditions, worker crash recovery, and query key stability ([5908e6e](https://github.com/zama-ai/sdk/commit/5908e6ea024ebd9842dd0759ff8d8dfb80f6f656))
- race conditions, worker init safety, and defensive hardening ([dc369de](https://github.com/zama-ai/sdk/commit/dc369de8577c8cdaadfd3ef61d1354e3059d3d1e)), closes [#worker](https://github.com/zama-ai/sdk/issues/worker)
- **react-sdk:** invalidate wagmi useBalance cache on unshield/finalize ([7af63b2](https://github.com/zama-ai/sdk/commit/7af63b2d7fafc49fb3c830b2bd978b9ae7102c4d))
- **react-sdk:** replace unsafe casts, fix fee hooks signer access, add test coverage ([6c0a13f](https://github.com/zama-ai/sdk/commit/6c0a13f86730fa2e85e84a8318cf3c8ec298ce22))
- **react-sdk:** use broad balanceOf predicate instead of address-scoped ([6488a7d](https://github.com/zama-ai/sdk/commit/6488a7d0a0cefb832809bf2a6d92ef80ca3a8fb0))
- **react-sdk:** use predicate-based wagmi balanceOf cache invalidation ([5a57077](https://github.com/zama-ai/sdk/commit/5a570772946d05224d7f353bb6ee14e831177ff0))
- relax wagmi peer dependency to >=2 for v2 compatibility ([d89aef8](https://github.com/zama-ai/sdk/commit/d89aef84eeedd9c676f45f49ba43591f2787e569))
- remove Node.js-only RelayerNode re-export from react-sdk ([8fbe902](https://github.com/zama-ai/sdk/commit/8fbe902bf8666a7363c1585b8d802d494b8d5efe))
- Remove remaining token-sdk references ([46b40b8](https://github.com/zama-ai/sdk/commit/46b40b8ab0f9cb56bb8616dc3639e289980d0534))
- replace importScripts with fetch+eval in worker to fix MIME-type errors ([a73c02e](https://github.com/zama-ai/sdk/commit/a73c02e78fc0fc790835c6c2f5250be04c679ad9))
- strip EIP712Domain from signer types and re-key balance Map by original addresses ([0d0b8e4](https://github.com/zama-ai/sdk/commit/0d0b8e439adca2c72980a5525e641bec4990a224))
- type safety, error handling, and query stability improvements ([40cb140](https://github.com/zama-ai/sdk/commit/40cb14033103dbdb290e63d5380a79135dcea19c)), closes [NodeWorkerPool#dispatch](https://github.com/zama-ai/NodeWorkerPool/issues/dispatch)
- unwrap error granularity, cache reuse, and defensive hardening ([ba88c32](https://github.com/zama-ai/sdk/commit/ba88c325108d6c67309d123ee3d9d827c9776c74)), closes [#ensureAllowance](https://github.com/zama-ai/sdk/issues/ensureAllowance)
- use blob URL for worker script loading with extension fallback ([a5e3cc0](https://github.com/zama-ai/sdk/commit/a5e3cc0a0c417bb6922c146db3a0c4e8e7c9362b))
- use SUBMODULE_TOKEN for private submodule checkout in CI ([66cda4a](https://github.com/zama-ai/sdk/commit/66cda4a9d5434379cc346622474628550f258b5a))
- worker crash safety, concurrency guards, and query key consistency ([3259942](https://github.com/zama-ai/sdk/commit/32599426bb6985d9ae392af23bc9dc9291551363))

All notable changes to this project will be documented in this file.
