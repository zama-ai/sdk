# Developer Walkthrough — react-wagmi

A step-by-step guide to how this app integrates `@zama-fhe/react-sdk` using wagmi v3.

---

## Architecture at a glance

```
page.tsx                         — wallet connect (wagmi hooks), token selector, layout
├── providers.tsx                — wagmi + ZamaProvider config wiring
│   └── /api/relayer/[...path]   — Next.js proxy (keeps RELAYER_API_KEY server-side)
├── BalancesCard.tsx             — ETH / ERC-20 / confidential balance display
├── ShieldCard.tsx               — ERC-20 → confidential via `useShield`
├── TransferCard.tsx             — confidential → confidential
├── UnshieldCard.tsx             — confidential → ERC-20 (2-phase)
├── PendingUnshieldCard.tsx      — recover an interrupted unshield from IndexedDB
├── DelegateDecryptionCard.tsx   — grant another wallet the right to decrypt your balance
├── RevokeDelegationCard.tsx     — revoke that right
└── DecryptAsCard.tsx            — decrypt another wallet's balance (as a delegate)
```

---

## 1. Wiring the SDK (`providers.tsx`)

SDK 3.x uses a single Zama config object. The wagmi adapter creates the SDK signer
and provider from the app's `wagmiConfig`; `web()` creates the browser FHE relayer
transport from the configured FHE chain.

```ts
const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http(SEPOLIA_RPC_URL) },
});

const mySepolia = {
  ...fheSepolia,
  relayerUrl: "http://localhost:3000/api/relayer",
  network: SEPOLIA_RPC_URL,
} as const satisfies FheChain;

const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: { [mySepolia.id]: web() },
  storage: indexedDBStorage,
  sessionStorage: indexedDBStorage,
});
```

`ZamaProvider` receives the resolved config:

```ts
<ZamaProvider config={zamaConfig}>
```

`storage` and `sessionStorage` use the same IndexedDB-backed storage in this browser app so
credentials and wallet signatures survive page reloads during local development.

---

## 2. Why `WagmiSigner` is different from `EthersSigner` / `ViemSigner`

The wagmi config adapter creates a `WagmiSigner` internally. It subscribes to
`watchConnection` from wagmi, so the SDK updates whenever the account or chain changes.

**Consequences:**

- **No `walletKey` / remount pattern** — `ZamaProvider` does not need to be remounted on
  wallet switch. This eliminates the `walletKey` bump and `refSeededRef` guard used in the
  ethers and viem examples.
- **No manual `eth_accounts` polling** — wagmi's store tracks the connected account;
  `page.tsx` reads it via `useAccount()`.
- **No manual `eth_chainId` polling** — wagmi's `useChainId()` updates reactively when
  the user switches chains (driven by the `chainChanged` event on the injected provider).

---

## 3. Wallet connect flow (`page.tsx`)

Three screens, driven by `isConnected` and `isSepolia`:

| Screen            | Condition                  | What's shown                                      |
| ----------------- | -------------------------- | ------------------------------------------------- |
| 1 — No wallet     | `!isConnected`             | "Connect Wallet" button                           |
| 2 — Wrong network | `!isSepolia`               | "Switch to Sepolia" button (+ error if rejected)  |
| 3 — Main UI       | `isConnected && isSepolia` | Registry loading, token selector, operation cards |

Because wagmi does not auto-connect without stored connector state, the connect flow is
explicit:

```ts
const { connect, isPending: isConnecting, error: connectError } = useConnect();
const { switchChain, isPending: isSwitching } = useSwitchChain();

// Screen 1: !isConnected
connect({ connector: injected() });

// Screen 2: chainId !== SEPOLIA_CHAIN_ID
switchChain({ chainId: sepolia.id });
```

`wagmi` handles `wallet_switchEthereumChain` internally for known chains — no
`wallet_addEthereumChain` fallback is needed for Sepolia (natively known to MetaMask and
most wallets). Add an error fallback if testing with custom wallets that don't know Sepolia.

**Screen 2 is passive**: there is no `isInitializing` guard (unlike the ethers/viem examples)
because `useAccount()` is synchronous and never returns a transient loading state — wagmi's
store tracks the connection state reactively.

---

## 4. Token selection (`page.tsx`)

Registered token pairs are fetched from the on-chain `WrappersRegistry` contract via
`useListPairs`:

```ts
const {
  data: pairsData,
  isPending: isRegistryPending,
  isError: isRegistryError,
} = useListPairs({ metadata: true });
```

`metadata: true` fetches name, symbol, and decimals for both the underlying ERC-20 and the
confidential wrapper in a single call — no separate `useMetadata` calls needed.

The first valid pair is auto-selected:

```ts
useEffect(() => {
  if (validPairs.length > 0 && selectedTokenAddress === null) {
    setSelectedTokenAddress(validPairs[0].confidentialTokenAddress);
  }
}, [validPairs, selectedTokenAddress]);
```

With `WagmiSigner` (viem-based), named fields (`tokenAddress`, `confidentialTokenAddress`,
`isValid`) are directly accessible — no `normalizePair` workaround needed (unlike
`EthersSigner`, where ethers `Result` non-enumerable prototype getters require a numeric
index fallback).

**Token-dependent hooks live in the local `TokenWorkspace` component**: hooks such as `useHasPermit`,
`useConfidentialBalance`, and the ERC-20 `useReadContract` are mounted only after a registry
pair has been selected. This keeps React hook calls unconditional inside the component while
avoiding placeholder addresses such as `ZERO_ADDRESS`.

**`isPending` vs `isLoading`**: `isPending` is used rather than `isLoading` for the registry
guard. In TanStack Query v5, `isLoading = isPending && isFetching`, which is `false` when the
query is disabled (`enabled: false`). `isPending` stays `true` until the first successful
response, correctly covering the brief period before the chain ID has been resolved
internally (during which the query is still disabled).

---

## 5. Balance reads (`page.tsx`)

ERC-20 and ETH balances use wagmi hooks backed by the `http(SEPOLIA_RPC_URL)` transport:

```ts
// ETH balance — formatted to ether automatically.
const { data: ethBalanceData, refetch: refetchEth } = useBalance({
  address,
  query: { enabled: isConnected && isSepolia },
});

// ERC-20 balance — raw bigint, formatted with formatUnits().
// TokenWorkspace only mounts once a token is selected, so the address is always real.
const { data: erc20Balance, refetch: refetchErc20 } = useReadContract({
  address: token.tokenAddress,
  abi: BALANCE_ABI,
  functionName: "balanceOf",
  args: [address],
});
```

After any operation that changes public balances, call `refreshPublicBalances()`:

```ts
const refreshPublicBalances = () => {
  void refetchErc20();
  void refetchEth();
};
```

SDK hooks such as `useShield`, `useUnshield`, `useResumeUnshield`, and
`useConfidentialTransfer` invalidate confidential-balance caches internally. The app only
manually refreshes wagmi public-balance hooks for immediate UI feedback after minting or
gas-spending operations.

---

## 6. Balance display and explicit decrypt (`page.tsx` + `BalancesCard.tsx`)

Three balances are shown:

| Balance      | Source                  | Hook / method                                                                   |
| ------------ | ----------------------- | ------------------------------------------------------------------------------- |
| ETH          | wagmi `useBalance`      | `refetchEth` from `useBalance({ address })`                                     |
| ERC-20       | wagmi `useReadContract` | `useReadContract({ address: token.tokenAddress, ... })`                         |
| Confidential | Relayer decryption      | `useConfidentialBalance({ tokenAddress: token.confidentialTokenAddress, ... })` |

**Explicit decrypt pattern**: `useConfidentialBalance` is only enabled after the user has
authorized FHE decryption via an EIP-712 wallet signature. `useHasPermit({ contractAddresses })`
checks whether cached credentials cover the currently selected token; if not, `BalancesCard`
shows a "Decrypt Balance" button rather than a balance value. This avoids blind-signing
prompts on mount.

```ts
const { data: hasPermit } = useHasPermit({
  contractAddresses: [token.confidentialTokenAddress],
});
// All registry pairs are passed at once to useGrantPermit — one signature covers all tokens,
// so switching tokens does not prompt the wallet again.
const grantPermits = useGrantPermit();
function handleDecrypt() {
  if (validPairs.length === 0) return;
  grantPermits.mutate(validPairs.map((p) => p.confidentialTokenAddress));
}
```

`useConfidentialBalance` is gated by `hasPermit`, so the first decrypt only happens after
the explicit "Decrypt Balance" click. `balance.isLoading` drives the "Decrypting…" display
in `BalancesCard`.

---

## 7. Shielding (`ShieldCard.tsx`)

Shielding uses `useShield`; the app does not read ERC-20 allowance, submit approvals, or
call wrapper contracts directly:

```ts
const shield = useShield({ tokenAddress, wrapperAddress: tokenAddress }, { onSuccess });

shield.mutate({
  amount: parsedAmount,
  approvalStrategy: "max",
  onApprovalSubmitted: () => setPhase("approve"),
  onShieldSubmitted: () => setPhase("wrap"),
});
```

`approvalStrategy: "max"` delegates the spend-cap choice to the SDK. The SDK performs the
ERC-20 balance check, allowance read, USDT-style allowance reset when needed, approval
transaction(s), shield transaction, and cache invalidation.

---

## 8. RelayerWeb proxy

The proxy route `src/app/api/relayer/[...path]/route.ts` keeps `RELAYER_API_KEY` server-side.
Set `RELAYER_URL` in `.env.local` (defaults to the public Sepolia testnet relayer if unset).
`NEXT_PUBLIC_SEPOLIA_RPC_URL` overrides the default publicnode RPC — useful to avoid rate
limiting with a private node.

---

## 9. Pending unshield recovery

Unshield is a two-phase operation: Phase 1 (unwrap tx) and Phase 2 (finalize tx).
If the user closes the tab between phases, `PendingUnshieldCard` recovers the state:

1. `onEvent` in `ZamaProvider` intercepts `ZamaSDKEvents.UnshieldPhase1Submitted` and
   calls `savePendingUnshield(indexedDBStorage, wrapperAddress, txHash)`.
2. On the next page load, `PendingUnshieldCard` reads the pending hash via
   `loadPendingUnshield(storage, tokenAddress)`.
3. Clicking "Finalize" calls `useResumeUnshield` to complete Phase 2.

The `savePendingUnshield` call in `onEvent` and the `storage` prop in `ZamaProvider`
**must always reference the same `indexedDBStorage` instance**. If you ever change the
`storage` prop, update `onEvent` to match.

---

## 10. Running locally

```bash
cd examples/react-wagmi
cp .env.example .env.local           # all values are optional — defaults work for testnet
npm install
npm run dev                          # dev server on :3000
npm run build                        # production build (must pass cleanly)
npm run typecheck                    # tsc --noEmit
npm run test:e2e                     # Playwright e2e tests (starts dev server automatically)
```
