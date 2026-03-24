# Developer Walkthrough — react-wagmi

A step-by-step guide to how this app integrates `@zama-fhe/react-sdk` using wagmi v3.

---

## Architecture at a glance

```
page.tsx                         — wallet connect (wagmi hooks), token selector, layout
├── providers.tsx                — ZamaProvider + WagmiSigner + RelayerWeb wiring
│   └── /api/relayer/[...path]   — Next.js proxy (keeps RELAYER_API_KEY server-side)
├── BalancesCard.tsx             — ETH / ERC-20 / confidential balance display
├── ShieldCard.tsx               — ERC-20 → confidential (with manual approval flow)
├── TransferCard.tsx             — confidential → confidential
├── UnshieldCard.tsx             — confidential → ERC-20 (2-phase)
├── PendingUnshieldCard.tsx      — recover an interrupted unshield from IndexedDB
├── DelegateDecryptionCard.tsx   — grant another wallet the right to decrypt your balance
├── RevokeDelegationCard.tsx     — revoke that right
└── DecryptAsCard.tsx            — decrypt another wallet's balance (as a delegate)
```

---

## 1. Wiring the SDK (`providers.tsx`)

Three objects are required: a `signer`, a `relayer`, and a `storage`.

```ts
// wagmiConfig and signer are created at module level (outside the component) because:
// - createConfig does not access window at construction time (transports are lazy).
// - WagmiSigner wraps the config directly — no SSR issue at construction.
// - providers.tsx is wrapped in next/dynamic ssr:false, so this module is never
//   evaluated server-side.
// Both are stable references — recreating them on re-render would reset wagmi's state.
const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: { [sepolia.id]: http(SEPOLIA_RPC_URL) },
});
const signer = new WagmiSigner({ config: wagmiConfig });

// RelayerWeb must be in useMemo because it accesses window.location.origin at construction.
const relayer = useMemo(
  () =>
    new RelayerWeb({
      getChainId: () => signer.getChainId(),
      transports: {
        [SepoliaConfig.chainId]: {
          ...SepoliaConfig,
          relayerUrl: `${window.location.origin}/api/relayer`,
          network: SEPOLIA_RPC_URL,
        },
      },
    }),
  [],
);
```

`ZamaProvider` takes two separate IndexedDB instances:

```ts
<ZamaProvider
  relayer={relayer}
  storage={indexedDBStorage}          // "CredentialStore" — encrypted keypair
  sessionStorage={sessionDBStorage}   // "SessionStore"    — EIP-712 session signatures
  signer={signer}
>
```

Both use the same internal key. Sharing one database instance would cause the session entry
to overwrite the encrypted keypair, forcing re-signing on every balance decrypt.

---

## 2. Why `WagmiSigner` is different from `EthersSigner` / `ViemSigner`

`WagmiSigner` has a `subscribe({ onAccountChange, onChainChange, onDisconnect })` method
backed by `watchConnection` from wagmi. The SDK uses this internally to update its state
whenever the account or chain changes.

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

---

## 4. Balance reads

ERC-20 and ETH balances use wagmi hooks backed by the `http(SEPOLIA_RPC_URL)` transport:

```ts
// ETH balance — formatted to ether automatically.
const { data: ethBalanceData, refetch: refetchEth } = useBalance({
  address,
  query: { enabled: isConnected && isSepolia },
});

// ERC-20 balance — raw bigint, formatted with formatUnits().
const { data: erc20Balance, refetch: refetchErc20 } = useReadContract({
  address: token.erc20,
  abi: BALANCE_ABI,
  functionName: "balanceOf",
  args: [address as Address],
  query: { enabled: isConnected && isSepolia },
});
```

After any operation that changes balances, call `refreshBalances()`:

```ts
function refreshBalances() {
  void refetchErc20();
  void refetchEth();
  // SDK confidential handle is in a separate TanStack Query cache — must invalidate
  // to trigger re-decryption after shield / unshield / transfer.
  queryClient.invalidateQueries({
    queryKey: zamaQueryKeys.confidentialHandle.token(token.confidential),
  });
}
```

---

## 5. RelayerWeb proxy

The proxy route `src/app/api/relayer/[...path]/route.ts` keeps `RELAYER_API_KEY` server-side.
Set `RELAYER_URL` in `.env.local` (defaults to the public Sepolia testnet relayer if unset).
`NEXT_PUBLIC_SEPOLIA_RPC_URL` overrides the default publicnode RPC — useful to avoid rate
limiting with a private node.

---

## 6. Pending unshield recovery

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

## 7. Running locally

```bash
cd examples/react-wagmi
cp .env.example .env.local           # all values are optional — defaults work for testnet
npm install
npm run dev                          # dev server on :3000
npm run build                        # production build (must pass cleanly)
npm run typecheck                    # tsc --noEmit
npm run test:e2e                     # Playwright e2e tests (starts dev server automatically)
```
