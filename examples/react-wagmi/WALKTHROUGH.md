# Developer Walkthrough — react-wagmi

A step-by-step guide to how this app integrates `@zama-fhe/react-sdk` using wagmi v3.

---

## Architecture at a glance

```
page.tsx                         — wallet connect, network picker, tabs, token selector
├── lib/networks.ts              — the network table: one row per chain (viem chain, FHE preset, flags)
├── lib/relayers.ts              — server-side: upstream relayer URL + API key per network
├── lib/wallet.tsx               — wallet stack: Dynamic connect dialog or wagmi injected connector, built from the table
├── lib/dynamic.ts               — Dynamic headless client: wallet catalogue and connect step
├── lib/dynamicConnector.ts      — wagmi connector over a Dynamic-authorized wallet
├── lib/zodJitless.ts            — turns off zod's eval probe, which the page CSP blocks
├── ConnectWalletDialog.tsx      — wallet picker and WalletConnect pairing
├── providers.tsx                — wallet providers + ZamaProvider config, built from the network table
│   ├── /api/networks            — which networks the server can serve (drives the picker)
│   └── /api/relayer/[network]/[...path] — Next.js proxy (keeps API keys server-side)
├── PageChrome.tsx               — connect screen, header, network picker, token selector
├── SelectedTokenPanel.tsx       — composes the cards below for the selected token
├── BalancesCard.tsx             — native / ERC-20 / confidential balance display
├── ShieldCard.tsx               — ERC-20 → confidential via `useShield`
├── TransferCard.tsx             — confidential → confidential
├── UnshieldCard.tsx             — confidential → ERC-20 (2-phase)
├── PendingUnshieldCard.tsx      — recover an interrupted unshield from IndexedDB
├── DelegateDecryptionCard.tsx   — grant another wallet the right to decrypt your balance
├── RevokeDelegationCard.tsx     — revoke that right
├── DecryptAsCard.tsx            — decrypt another wallet's balance (as a delegate)
├── MintAndShieldButton.tsx     — mint a test ERC-20 and shield it, on the Vaults tab
└── vaults/                      — the Vaults tab
    ├── VaultsTab.tsx            — the vault's tokens, the decrypt click, and the position
    ├── VaultActionCard.tsx      — the Deposit or Withdraw box: balance, form, positions
    └── PositionList.tsx         — one row per joined batch, an exhaustive switch on its state
```

---

## 1. Wiring the SDK (`providers.tsx`)

SDK 3.x uses a single Zama config object. The wagmi adapter creates the SDK signer
and provider from the app's `wagmiConfig`. Both configs are built from the network table in
`src/lib/networks.ts`, so every row is registered once: `web()` networks get the same-origin
proxy as their relayer URL, cleartext networks get `cleartext()` and no relayer at all.

```ts
// src/lib/networks.ts — one row per chain
export const networks = {
  sepolia: defineNetwork({
    label: "Sepolia",
    chain: sepolia, // viem/chains
    fhe: fheSepolia, // @zama-fhe/sdk/chains
    rpcUrl: process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL,
    transport: "relayer",
    explorerUrl: "https://eth-sepolia.blockscout.com",
    canMint: true,
    batchVault: batchVaultFromEnv(sepolia.id),
  }),
  "bnb-testnet": defineNetwork({ label: "BNB Testnet · Cleartext", transport: "cleartext", ... }),
  mainnet: defineNetwork({ label: "Ethereum", transport: "relayer", canMint: false, ... }),
  // ...
};

// src/lib/wallet.tsx — one wagmi config for both wallet stacks (see section 1a)
const chains = NETWORK_KEYS.map((key) => networks[key].chain);
const transports = Object.fromEntries(chains.map((c) => [c.id, http(c.rpcUrls.default.http[0])]));
export const wagmiConfig = createConfig({
  chains,
  transports,
  storage,
  // Dynamic: the saved wallet's connector, so wagmi can restore it. Injected: `injected()`.
  connectors,
  ssr: true,
});

// src/providers.tsx
// The relayer requires an absolute URL, so resolve the same-origin proxy at runtime.
// The SSR placeholder never issues requests.
const origin = typeof window === "undefined" ? "http://localhost" : window.location.origin;

const fheChains = NETWORK_KEYS.map((key) => {
  const { fhe, transport } = networks[key];
  return transport === "relayer" ? { ...fhe, relayerUrl: `${origin}/api/relayer/${key}` } : fhe;
});

const relayers = Object.fromEntries(
  NETWORK_KEYS.map((key) => [
    networks[key].chain.id,
    networks[key].transport === "relayer" ? web() : cleartext(),
  ]),
);

const zamaConfig = createZamaConfig({
  wagmiConfig,
  chains: fheChains,
  relayers,
  storage: indexedDBStorage,
  permitStorage: indexedDBStorage,
});
```

`ZamaProvider` receives the resolved config, nested inside the wallet providers:

```tsx
<WalletProviders>
  <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
</WalletProviders>
```

`storage` and `permitStorage` use the same IndexedDB-backed storage in this browser app so
the transport key pair and signed permits survive page reloads during local development.

### 1a. Wallet stack (`lib/wallet.tsx`)

`WalletProviders` picks one of two wallet stacks at build time and exposes both through the
same `useWalletConnection()` hook (`connect`, `disconnect`, `isConnecting`, `isDisconnecting`,
`connectError`). The provider tree is `WagmiProvider` > `QueryClientProvider` in both:

| `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` | `connect()`                                                     |
| ------------------------------------ | --------------------------------------------------------------- |
| set                                  | Opens the connect dialog (`components/ConnectWalletDialog.tsx`) |
| unset                                | Prompts the browser wallet through wagmi's `injected()`         |

With Dynamic, **wagmi owns the wallet session; Dynamic only connects the wallet.** Dynamic's
headless SDK (`lib/dynamic.ts`) runs connect-only — no sign-in, no embedded wallet — and
supplies the wallet catalogue, the connect step (extension prompt, WalletConnect pairing) and
each wallet's EIP-1193 provider. The dialog lists every EVM wallet in the catalogue, installed
ones first. WalletConnect shows its pairing code to copy into the wallet (the Safe web app
accepts a pasted code) or to open as a link. Going back, closing or picking another wallet
aborts the attempt, and a wallet that approves afterwards is released.

Once Dynamic authorizes a wallet, a wagmi connector of the app's own
(`lib/dynamicConnector.ts`) wraps its provider, and wagmi persists, restores and follows the
connection:

- **One connector per wallet, and it never prompts.** Its id is Dynamic's wallet provider key,
  such as `metamaskevm:browserExtension`, with no address in it. `connect()` reads the accounts
  the wallet already shares.
- **Restore reads a saved-wallet record.** wagmi only reconnects the connectors its config was
  created with, so the connector saves the wallet it connected in wagmi's storage and
  `wallet.tsx` lists that connector on load. A saved browser wallet that never announces itself
  gives up after 3 s, and a WalletConnect session that closed while the page was away leaves
  wagmi disconnected.
- **Follows the wallet.** Account and chain switches inside the wallet reach wagmi through
  Dynamic's provider events.
- **Stays on the chains a WalletConnect session approved.** Dynamic sends a WalletConnect
  wallet's requests on the chain it last recorded for it, which starts as the first network in
  the table. The connector moves that record onto a chain the session approved, keeps it in
  step with the wallet's own switches, and rejects a switch to any other chain.
- **Disconnect** removes the wallet's Dynamic account, which also ends a WalletConnect session
  (if that fails, it logs a warning and wagmi disconnects anyway). It never calls Dynamic's
  `logout()`, which strips every listener from the shared `window.ethereum`.

`src/proxy.ts` widens the Content Security Policy for Dynamic's API and WalletConnect only when
the environment ID is set.

The injected stack is what the Playwright suite runs against (`playwright.config.ts` clears
`NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`), since the dialog needs Dynamic's API. The connector has its
own spec (`e2e/dynamicConnector.spec.ts`), which runs it against a fake WalletConnect wallet.

---

## 2. Why `WagmiSigner` is different from `EthersSigner` / `ViemSigner`

The wagmi config adapter creates a `WagmiSigner` internally. It subscribes to
`watchConnection` from wagmi, so the SDK updates whenever the account or chain changes.

**Consequences:**

- **No `walletKey` / remount pattern** — `ZamaProvider` does not need to be remounted on
  wallet switch. This eliminates the `walletKey` bump and `refSeededRef` guard used in the
  ethers and viem examples.
- **No manual `eth_accounts` polling** — wagmi's store tracks the connected account;
  `page.tsx` reads it via wagmi v3's `useConnection()`.
- **No manual `eth_chainId` polling** — wagmi's `useChainId()` updates reactively when
  the user switches chains (driven by the `chainChanged` event on the injected provider).

---

## 3. Wallet connect flow (`page.tsx`)

Three screens, driven by `isConnected` and whether the wallet's chain is an enabled row of
the network table:

| Screen                  | Condition                | What's shown                                                                                                                                 |
| ----------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — No wallet           | `!isConnected`           | "Connect Wallet" button                                                                                                                      |
| 2 — Unsupported network | `!network`               | "Choose a Network" picker (+ error if the switch failed); a table row the server does not serve gets a relayer hint instead of "unsupported" |
| 3 — Main UI             | `isConnected && network` | Picker, registry loading, token selector, operation cards                                                                                    |

Which rows are _enabled_ comes from `GET /api/networks`: cleartext rows always, `relayer` rows
only when the server has an upstream relayer URL for them. That is how mainnet stays hidden
until a deployment configures `MAINNET_RELAYER_URL`.

Because wagmi does not auto-connect without stored connector state, the connect flow is
explicit. `page.tsx` never talks to a connector directly: it goes through the
`useWalletConnection()` context from `lib/wallet.tsx`, which hides whether Dynamic or the
injected connector sits behind it (section 1a):

```ts
const { connect, disconnect, isConnecting, connectError } = useWalletConnection();
const { switchChain, isPending: isSwitching } = useSwitchChain();

// Screen 1: !isConnected — opens the Dynamic dialog or prompts the injected wallet
connect();

// Screen 2 (and the picker on screen 3): the user picked a row of the table
switchChain({ chainId: networks[key].chain.id });
```

`wagmi` handles `wallet_switchEthereumChain` internally, and falls back to
`wallet_addEthereumChain` with the viem chain definition when the wallet does not know the
chain (error 4902). That covers Hoodi and Zenith, which most wallets don't ship. The RPC
override from `NEXT_PUBLIC_<NETWORK>_RPC_URL` is applied to the viem chain too, so the
"add network" prompt shows the same RPC the app uses.

Everything that depends on the active network — explorer links, the native balance label,
the Mint button, the Vaults tab's batchers — reads its row through `useNetwork()` (`src/lib/hooks.ts`)
rather than a hardcoded constant.

**Screen 2 is passive**: there is no `isInitializing` guard (unlike the ethers/viem examples)
because `useConnection()` is synchronous and never returns a transient loading state — wagmi's
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

The selection falls back to the first valid pair, so a fresh load or a network switch (which
replaces the pair list) never leaves the selector empty:

```ts
const token =
  validPairs.find((pair) => pair.confidentialTokenAddress === selectedTokenAddress) ??
  validPairs[0];
```

With `WagmiSigner` (viem-based), named fields (`tokenAddress`, `confidentialTokenAddress`,
`isValid`) are directly accessible — no `normalizePair` workaround needed (unlike
`EthersSigner`, where ethers `Result` non-enumerable prototype getters require a numeric
index fallback).

**Token-dependent hooks live in the local `SelectedTokenPanel` component**: hooks such as `useHasPermit`,
`useConfidentialBalance`, and the ERC-20 `useUnderlyingBalance` are mounted only after a registry
pair has been selected. This keeps React hook calls unconditional inside the component while
avoiding placeholder addresses such as `ZERO_ADDRESS`.

**`isPending` vs `isLoading`**: `isPending` is used rather than `isLoading` for the registry
guard. In TanStack Query v5, `isLoading = isPending && isFetching`, which is `false` when the
query is disabled (`enabled: false`). `isPending` stays `true` until the first successful
response, correctly covering the brief period before the chain ID has been resolved
internally (during which the query is still disabled).

---

## 5. Balance reads (`page.tsx`, `lib/hooks.ts`, `SelectedTokenPanel.tsx`)

Both public balances read through the connected network's `http()` transport from the network
table (overridable per network with `NEXT_PUBLIC_<NETWORK>_RPC_URL`).

The native balance in the header is a plain wagmi `useBalance`, gated on a supported network so
the header never shows a balance from a chain the app does not know:

```ts
const { data: nativeBalance } = useBalance({
  address,
  query: { enabled: isConnected && network !== undefined },
});
```

The ERC-20 balance is a TanStack query whose key includes the chain id, so a value read on one
network is never shown on another, even while the new network's token list is still loading:

```ts
export function useUnderlyingBalance(token, account, options) {
  const sdk = useZamaSDK();
  const { chain } = useNetwork();
  return useQuery({
    queryKey: erc20BalanceKey(chain.id, token.tokenAddress, account),
    queryFn: async ({ queryKey: [, , tokenAddress, account] }) =>
      (await sdk.provider.readContract(balanceOfContract(tokenAddress, account))) as bigint,
    enabled: options?.enabled ?? true,
  });
}
```

After any operation that changes public balances, `SelectedTokenPanel` calls
`refreshPublicBalances()`. The ERC-20 key is shared with `BalancesCard`, so invalidating it
refreshes the card without prop plumbing; the native balance is refetched by key, and the
header's copy updates because wagmi shares its query cache:

```ts
const refreshPublicBalances = () => {
  queryClient.invalidateQueries({
    queryKey: erc20BalanceKey(chain.id, token.tokenAddress, address),
  });
  void refetchNativeBalance();
};
```

SDK hooks such as `useShield`, `useUnshield`, `useResumeUnshield`, and
`useConfidentialTransfer` invalidate confidential-balance caches internally. The app only
manually refreshes the public-balance queries for immediate UI feedback after minting or
gas-spending operations.

---

## 6. Balance display and explicit decrypt (`page.tsx` + `BalancesCard.tsx`)

Three balances are shown:

| Balance          | Source                 | Hook / method                                                              |
| ---------------- | ---------------------- | -------------------------------------------------------------------------- |
| Native gas token | wagmi `useBalance`     | `useBalance({ address })`, refetched after actions                         |
| ERC-20           | `useUnderlyingBalance` | `sdk.provider.readContract(balanceOfContract(...))` keyed by chain id      |
| Confidential     | Relayer decryption     | `useConfidentialBalance({ address: token.confidentialTokenAddress, ... })` |

**Explicit decrypt pattern**: `useConfidentialBalance` is only enabled after the user has
authorized FHE decryption via an EIP-712 wallet signature. `useHasPermit({ contractAddresses })`
checks whether cached credentials cover the currently selected token; if not, `BalancesCard`
shows a "Decrypt Balance" button rather than a balance value. This avoids blind-signing
prompts on mount.

```ts
const { data: hasPermit } = useHasPermit({ contractAddresses: [token.confidentialTokenAddress] });
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
const shield = useShield({ address: tokenAddress }, { onSuccess });

shield.mutate({
  amount: parsedAmount,
  approvalStrategy: "exact",
  onApprovalSubmitted: () => setPhase("approve"),
  onShieldSubmitted: () => setPhase("wrap"),
});
```

`approvalStrategy: "exact"` approves exactly the shielded amount. The SDK still performs the
ERC-20 balance check, allowance read, USDT-style allowance reset when needed, approval
transaction(s), shield transaction, and cache invalidation.

---

## 8. Relayer proxy

The proxy route `src/app/api/relayer/[network]/[...path]/route.ts` keeps API keys server-side.
The `[network]` segment is a key of the network table; the route looks it up in
`src/lib/relayers.ts`, which maps each `relayer` network to an upstream from env
(`SEPOLIA_RELAYER_URL`, `MAINNET_RELAYER_URL`, … — bare hosts, no `/v2` suffix). Testnets
default to the public testnet relayer; mainnets have no default and are hidden until set.

The proxy fails closed and is deliberately narrow:

- unknown or unconfigured network → `404`, never a default upstream
- `Origin` not the app's own, or not in `RELAYER_PROXY_ALLOWED_ORIGINS` when that is set (it replaces the default) → `403`
- only the relayer routes `web()` calls, and their `<route>/<job id>` polling paths, are forwarded; any other path → `404`
- request bodies are never logged

`NEXT_PUBLIC_<NETWORK>_RPC_URL` overrides the default public RPC of a network — useful to
avoid rate limiting with a private node.

`ENABLED_NETWORKS` (comma-separated table keys) narrows what the server offers; a network
outside the list is neither listed by `/api/networks` nor proxied.

---

## 9. Pending unshield recovery

Unshield is a two-phase operation: Phase 1 (unwrap tx) and Phase 2 (finalize tx).
If the user closes the tab between phases, `PendingUnshieldCard` recovers the state:

1. `WrappedToken` persists the unwrap tx hash automatically once Phase 1 is mined —
   no app-level wiring needed.
2. On the next page load, `PendingUnshieldCard` reads the pending hash via
   `usePendingUnshield(tokenAddress)`.
3. Clicking "Finalize" calls `useResumeUnshield` to complete Phase 2, which clears the
   pending state automatically on success.

---

## 10. Confidential vault deposits and withdrawals (Vaults tab)

A vault deposit or withdrawal does not settle when its transaction is mined. The amount joins
a batch, the batch is sent to the vault, and the user claims the result once it settles. The
Vaults tab shows each of those steps, following the
[Building a vault UI](../../docs/gitbook/src/guides/vaults/building-a-ui.md) guide.

- **Group.** `src/lib/vaults.ts` builds the vault with `defineVaultGroup`: a group of one, so
  a join has a single leg and lands in a single batch. `VaultsTab.tsx` reads the vault's asset
  and share from the deposit batcher, so the only configuration is the two batcher addresses (the
  `batchVault` field of the Sepolia row in `src/lib/networks.ts`).
- **Pinned chain.** Reads go to the group's `chainId`, and the write hooks throw
  `ChainMismatchError` when the wallet is on another chain instead of sending the transaction
  there.
- **Decrypt on click.** One `useGrantPermit` call covers both tokens and both batchers, so the
  position card's "Decrypt balances" button is the only signature the tab asks for.
- **Send.** `useDeposit` and `useRedeem` return the batch the join landed in. The button
  explains why it is disabled (a paused batcher from `useOpenBatches`, no amount, above balance),
  and `onJoinSubmitted` tells "confirm in your wallet" from "waiting for the transaction".
- **Joined batches.** The app needs each batch to read and act on it later, so
  `src/lib/vaults.ts` keeps them in localStorage, with the bigint batch ids stored as strings. A
  claim or a quit removes the batch.
- **One row per batch.** `useBatch` reads a batch with the fields its state has and the
  `actions` it allows now, and `PositionList.tsx` switches on `state` exhaustively: cancel
  while pending, settle a late batch with `useFinalize`, claim a finalized one with `useClaim`,
  take a canceled amount back with `useQuit`.

---

## 11. Running locally

```bash
cd examples/react-wagmi
cp .env.example .env.local           # all values are optional — defaults work for testnet
npm install
npm run dev                          # dev server on :3004
npm run build                        # production build (must pass cleanly)
npm run typecheck                    # tsc --noEmit
npm run test:e2e                     # Playwright e2e tests (starts its own dev server; port 3004 must be free)
CI=1 npm run test:e2e                # same suite against a production build, as CI runs it
```

---

## 12. Security headers (`src/proxy.ts`, `next.config.ts`)

`src/proxy.ts` runs before every page render and sets a Content Security Policy with a
fresh nonce. Next.js reads the nonce from the request's `Content-Security-Policy` header
and stamps it on every script it emits, so the policy can forbid inline scripts outright.
That only works for pages rendered per request, which is why `layout.tsx` exports
`dynamic = "force-dynamic"`.

The directives that are specific to this app:

- `connect-src`: this origin (the proxy, `/api/networks`, WASM and worker files), the
  RPC origin of every network in the table (the SDK probes the wallet's chain on connect,
  served or not), the storage each relayer's `keyurl` points the browser at for the FHE
  public key and CRS (the public testnet bucket is built in; `CSP_CONNECT_SRC` for any other
  relayer, each entry checked to be an origin when `relayers.ts` loads at boot), and `data:`
  URLs (the FHE runtime compiles its WASM from one).
- `script-src 'wasm-unsafe-eval'` and `worker-src 'self' blob:`: what the FHE runtime
  needs to compile WASM and spawn its thread pool. See the SDK's security model docs.
- `'unsafe-eval'` and inline styles are allowed under `next dev` only.

The policy covers the page and the workers it spawns. The SDK's encrypt worker is loaded
from `/_next/static`, which the proxy matcher skips, so it runs with no policy of its own,
but the SDK downloads the FHE key on the page thread and hands the bytes to the worker, so
the key-storage entries are needed for any encryption at all.

`next.config.ts` adds the static headers (`nosniff`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`, HSTS) and fills `NEXT_PUBLIC_COMMIT_SHA` from Vercel's
`VERCEL_GIT_COMMIT_SHA`, which the footer (`SiteFooter` in `PageChrome.tsx`) links next to
the source repository. The mainnet banner (`MainnetBanner`) renders when the wallet's
chain has no `testnet` flag in viem.
