# EIP-1193 Subscribe for ViemSigner and EthersSigner

## Problem

WagmiSigner implements `subscribe()` to auto-revoke sessions on wallet disconnect/account change. ViemSigner and EthersSigner lack this, forcing users to manually call `sdk.revokeSession()`.

## Solution

Add optional EIP-1193 provider to both signer configs. When provided, the signer implements `subscribe()` using standard EIP-1193 events (`accountsChanged`, `disconnect`).

## Design

### New type in `token.types.ts`

```ts
export interface EIP1193Provider {
  on(event: string, listener: (...args: unknown[]) => void): void;
  removeListener(event: string, listener: (...args: unknown[]) => void): void;
}
```

### ViemSigner changes

- Add optional `provider?: EIP1193Provider` to `ViemSignerConfig`
- Conditionally assign `subscribe` in constructor when provider is present
- Listen to `accountsChanged` and `disconnect` EIP-1193 events

### EthersSigner changes

- Add optional `provider?: EIP1193Provider` to `EthersSignerConfig`
- Same pattern as ViemSigner

### Event mapping (both signers)

- `accountsChanged` with empty array → `onDisconnect()`
- `accountsChanged` with different address → `onAccountChange(newAddress)`
- `disconnect` → `onDisconnect()`

### Files changed

1. `packages/sdk/src/token/token.types.ts` — add `EIP1193Provider`
2. `packages/sdk/src/viem/viem-signer.ts` — optional provider + subscribe
3. `packages/sdk/src/ethers/ethers-signer.ts` — optional provider + subscribe
4. Tests for both signers
