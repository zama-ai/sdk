# SDK API Improvements Design

**Date:** 2026-02-25
**Scope:** Breaking API changes across `@zama-fhe/sdk` and `@zama-fhe/react-sdk`
**Strategy:** Clean break, no deprecation period

## 1. Terminology Unification (shield/unshield)

Rename `wrap`/`wrapETH` to `shield`/`shieldETH` on the `Token` class, React hooks, types, events, and query keys. Keep `unwrap`/`unwrapAll`/`finalizeUnwrap` unchanged (they mirror contract-level vocabulary). The high-level `unshield`/`unshieldAll` remain unchanged.

**Mapping:**

| Current                  | New                        |
| ------------------------ | -------------------------- |
| `Token.wrap()`           | `Token.shield()`           |
| `Token.wrapETH()`        | `Token.shieldETH()`        |
| `useWrap`                | `useShield`                |
| `useWrapETH`             | `useShieldETH`             |
| `WrapParams`             | `ShieldParams`             |
| `WrapETHParams`          | `ShieldETHParams`          |
| `wrapMutationOptions`    | `shieldMutationOptions`    |
| `wrapETHMutationOptions` | `shieldETHMutationOptions` |
| `UseWrapConfig`          | `UseShieldConfig`          |
| `wrap:submitted` event   | `shield:submitted` event   |
| `useWrapFee`             | `useShieldFee`             |
| `useUnwrapFee`           | `useUnshieldFee`           |

Delete the old `useShield.ts`/`useShieldETH.ts` alias files that just re-exported `useWrap`/`useWrapETH`.

## 2. Options Bags for Signer Constructors

```ts
new ViemSigner({ walletClient, publicClient }); // was: (walletClient, publicClient)
new EthersSigner({ signer }); // was: (signer)
new WagmiSigner({ config }); // was: (config)
```

## 3. Expose Missing Props on ZamaProvider

```tsx
<ZamaProvider
  relayer={relayer}
  signer={signer}
  storage={storage}
  credentialDurationDays={30}
  onEvent={(e) => analytics.track(e)}
>
```

Pass `credentialDurationDays` and `onEvent` through to `TokenSDK`.

## 4. Fix Dual Error Channel in useConfidentialBalance

Replace the `useEffect` + `useState` signer address resolution with a query:

```ts
const addressQuery = useQuery({
  queryKey: ['zama', 'signer-address'],
  queryFn: () => sdk.signer.getAddress(),
})

const balanceQuery = useQuery({
  enabled: !!addressQuery.data,
  queryKey: confidentialBalanceQueryKeys.owner(tokenAddress, addressQuery.data!),
  ...
})
```

Remove `signerError` from the return type.

## 5. batchDecryptBalances Fails Loudly by Default

```ts
type BatchDecryptErrorStrategy =
  | 'throw'
  | 'zero'
  | ((error: Error, address: Address) => bigint)

static batchDecryptBalances(tokens, {
  onError?: BatchDecryptErrorStrategy  // default: 'throw'
})
```

Default changes from silent `0n` to throwing aggregated errors.

## 6. sdk.createTokenFromWrapper() Factory

```ts
async createTokenFromWrapper(
  wrapperAddress: Address,
  coordinatorAddress: Address
): Promise<Token>
```

Creates a temporary `ReadonlyToken`, calls `discoverWrapper()`, returns `createToken(tokenAddress, wrapperAddress)`.

## 7. RelayerWeb Convenience Factories

```ts
RelayerWeb.create(chain: 'mainnet' | 'sepolia' | 'hardhat', options)
RelayerWeb.createMultiChain(chains: ChainName[], options)
```

Maps chain names to existing config objects. Full constructor remains for custom configs.

## 8. Write Operations Return { txHash, receipt }

```ts
type TransactionResult = { txHash: Hex; receipt: TransactionReceipt };
```

All `Token` write methods change from `Promise<Hex>` to `Promise<TransactionResult>`. React mutation hooks update their `data` type accordingly.

## 9. matchTokenError Utility

```ts
function matchTokenError<R>(
  error: unknown,
  handlers: Partial<Record<TokenErrorCode, (error: TokenError) => R>> & {
    _?: (error: unknown) => R;
  },
): R | undefined;
```

Dispatches by `TokenErrorCode`, falls through to `_` wildcard.

## 10. Unify Sub-path Hook Exports

Re-export all high-level hooks from `/viem`, `/ethers`, and `/wagmi` sub-paths so consumers don't need mixed imports.
