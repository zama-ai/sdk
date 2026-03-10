# Table of contents

[Introduction](README.md)

## Getting Started

- [Quick Start](tutorials/quick-start.md)
- [First Confidential dApp](tutorials/first-confidential-dapp.md)

## Guides

- [Configuration](guides/configuration.md)
- [Authentication](guides/authentication.md)
- [Shield Tokens](guides/shield-tokens.md)
- [Transfer Privately](guides/transfer-privately.md)
- [Unshield Tokens](guides/unshield-tokens.md)
- [Check Balances](guides/check-balances.md)
- [Handle Errors](guides/handle-errors.md)
- [Activity Feeds](guides/activity-feeds.md)
- [Node.js Backend](guides/node-js-backend.md)
- [Web Extensions](guides/web-extensions.md)
- [Local Development](guides/local-development.md)
- [Next.js SSR](guides/nextjs-ssr.md)
- [Operator Approvals](guides/operator-approvals.md)

## SDK Reference

- [ZamaSDK](reference/sdk/ZamaSDK.md)
- [Token](reference/sdk/Token.md)
- [ReadonlyToken](reference/sdk/ReadonlyToken.md)
- [RelayerWeb](reference/sdk/RelayerWeb.md)
- [RelayerNode](reference/sdk/RelayerNode.md)
- [RelayerCleartext](reference/sdk/RelayerCleartext.md)

### Signers

- [ViemSigner](reference/sdk/ViemSigner.md)
- [EthersSigner](reference/sdk/EthersSigner.md)
- [WagmiSigner](reference/sdk/WagmiSigner.md)
- [GenericSigner](reference/sdk/GenericSigner.md)
- [GenericStorage](reference/sdk/GenericStorage.md)

### Other

- [Errors](reference/sdk/errors.md)
- [Contract Builders](reference/sdk/contract-builders.md)
- [Event Decoders](reference/sdk/event-decoders.md)
- [Network Presets](reference/sdk/network-presets.md)

## React Reference

- [ZamaProvider](reference/react/ZamaProvider.md)

### Balance Hooks

- [useConfidentialBalance](reference/react/useConfidentialBalance.md)
- [useConfidentialBalances](reference/react/useConfidentialBalances.md)

### Transfer Hooks

- [useConfidentialTransfer](reference/react/useConfidentialTransfer.md)
- [useConfidentialTransferFrom](reference/react/useConfidentialTransferFrom.md)

### Shield Hooks

- [useShield](reference/react/useShield.md)
- [useShieldETH](reference/react/useShieldETH.md)

### Unshield Hooks

- [useUnshield](reference/react/useUnshield.md)
- [useUnshieldAll](reference/react/useUnshieldAll.md)
- [useResumeUnshield](reference/react/useResumeUnshield.md)

### Low-level Unwrap

- [useUnwrap](reference/react/useUnwrap.md)
- [useUnwrapAll](reference/react/useUnwrapAll.md)
- [useFinalizeUnwrap](reference/react/useFinalizeUnwrap.md)

### Auth Hooks

- [useAllow](reference/react/useAllow.md)
- [useIsAllowed](reference/react/useIsAllowed.md)
- [useRevoke](reference/react/useRevoke.md)
- [useRevokeSession](reference/react/useRevokeSession.md)

### Approval Hooks

- [useConfidentialApprove](reference/react/useConfidentialApprove.md)
- [useConfidentialIsApproved](reference/react/useConfidentialIsApproved.md)
- [useUnderlyingAllowance](reference/react/useUnderlyingAllowance.md)

### Discovery

- [useWrapperDiscovery](reference/react/useWrapperDiscovery.md)
- [useMetadata](reference/react/useMetadata.md)

### Activity

- [useActivityFeed](reference/react/useActivityFeed.md)

### Fees

- [useShieldFee](reference/react/useShieldFee.md)
- [useUnshieldFee](reference/react/useUnshieldFee.md)
- [useBatchTransferFee](reference/react/useBatchTransferFee.md)
- [useFeeRecipient](reference/react/useFeeRecipient.md)

### SDK Access

- [useZamaSDK](reference/react/useZamaSDK.md)
- [useToken](reference/react/useToken.md)
- [useReadonlyToken](reference/react/useReadonlyToken.md)

### Low-level FHE

- [useEncrypt](reference/react/useEncrypt.md)
- [useUserDecrypt](reference/react/useUserDecrypt.md)
- [useGenerateKeypair](reference/react/useGenerateKeypair.md)

### Cache

- [Query Keys](reference/react/query-keys.md)

## Concepts

- [Session Model](concepts/session-model.md)
- [Two-Phase Polling](concepts/two-phase-polling.md)
- [Security Model](concepts/security-model.md)
