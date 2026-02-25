# Migration Guide

## Migration from `wrap`/`wrapETH`

The `wrap` and `wrapETH` methods on `Token` have been renamed to `shield` and `shieldETH`. The `TokenSDK` class is now `ZamaSDK`, and `TokenError` is now `ZamaError`.

| Before                                      | After                     |
| ------------------------------------------- | ------------------------- |
| `new TokenSDK(...)`                         | `new ZamaSDK(...)`        |
| `token.wrap(amount)`                        | `token.shield(amount)`    |
| `token.wrapETH(amount)`                     | `token.shieldETH(amount)` |
| `TokenError`                                | `ZamaError`               |
| `useWrap(...)` (react-sdk provider hook)    | `useShield(...)`          |
| `useWrapETH(...)` (react-sdk provider hook) | `useShieldETH(...)`       |

### TransactionResult return type

Write methods now return `TransactionResult` (`{ txHash, receipt }`) instead of a bare transaction hash.

```ts
interface TransactionResult {
  txHash: Hex;
  receipt: TransactionReceipt;
}
```

### Contract call builders

The low-level contract call builders (`wrapContract`, `wrapETHContract`) and library-adapter hooks (`useShield`/`useShieldETH` in viem/ethers/wagmi sub-paths) retain the on-chain naming since they map directly to smart contract functions.
