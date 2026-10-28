# Developer Walkthrough — react-wagmi

A step-by-step guide to how this app integrates `@zama-fhe/react-sdk` using wagmi v3.

---

## Architecture at a glance

```
page.tsx                         — wallet connect (wagmi hooks), network picker, token selector
├── lib/networks.ts              — the network table: one row per chain (viem chain, FHE preset, flags)
├── lib/relayers.ts              — server-side: upstream relayer URL + API key per network
├── providers.tsx                — wagmi + ZamaProvider config, built from the network table
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
└── DecryptAsCard.tsx            — decrypt another wallet's balance (as a delegate)
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
    vault: { address, confidentialToken },
  }),
  "bnb-testnet": defineNetwork({ label: "BNB Testnet · Cleartext", transport: "cleartext", ... }),
  mainnet: defineNetwork({ label: "Ethereum", transport: "relayer", canMint: false, ... }),
  // ...
};

// src/providers.tsx
const chains = NETWORK_KEYS.map((key) => networks[key].chain);
const wagmiConfig = createConfig({
  chains,
  connectors: [injected()],
  transports: Object.fromEntries(chains.map((c) => [c.id, http(c.rpcUrls.default.http[0])])),
});

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

`ZamaProvider` receives the resolved config:

```ts
<ZamaProvider config={zamaConfig}>
```

`storage` and `permitStorage` use the same IndexedDB-backed storage in this browser app so
the transport key pair and signed permits survive page reloads during local development.

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
explicit:

```ts
const { connect, isPending: isConnecting, error: connectError } = useConnect();
const { switchChain, isPending: isSwitching } = useSwitchChain();

// Screen 1: !isConnected
connect({ connector: injected() });

// Screen 2 (and the picker on screen 3): the user picked a row of the table
switchChain({ chainId: networks[key].chain.id });
```

`wagmi` handles `wallet_switchEthereumChain` internally, and falls back to
`wallet_addEthereumChain` with the viem chain definition when the wallet does not know the
chain (error 4902). That covers Hoodi and Zenith, which most wallets don't ship. The RPC
override from `NEXT_PUBLIC_<NETWORK>_RPC_URL` is applied to the viem chain too, so the
"add network" prompt shows the same RPC the app uses.

Everything that depends on the active network — explorer links, the native balance label,
the Mint button, the vault demo — reads its row through `useNetwork()` (`src/lib/hooks.ts`)
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

| Balance      | Source                  | Hook / method                                                              |
| ------------ | ----------------------- | -------------------------------------------------------------------------- |
| ETH          | wagmi `useBalance`      | `refetchEth` from `useBalance({ address })`                                |
| ERC-20       | wagmi `useReadContract` | `useReadContract({ address: token.tokenAddress, ... })`                    |
| Confidential | Relayer decryption      | `useConfidentialBalance({ address: token.confidentialTokenAddress, ... })` |

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
- `Origin` not the app's own (or `RELAYER_PROXY_ALLOWED_ORIGINS`) → `403`
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

## 10. Deposit into a reacting contract (`confidentialTransferAndCall`)

The `Reacting contract — ConfidentialVault` section demonstrates the ERC-7984
`confidentialTransferAndCall` pattern: a confidential transfer that also invokes the
recipient contract's `onConfidentialTransferReceived` hook **in the same transaction**, so
value moves and the receiver reacts atomically — no two-step transfer-then-notify race.

The receiver is a minimal confidential escrow, [`contracts/src/ConfidentialVault.sol`](../../contracts/src/ConfidentialVault.sol),
deployed on Sepolia and bound to one confidential token (cUSDC). The cards only render when
that token is selected on Sepolia: the binding is the `vault` field of the Sepolia row in
`src/lib/networks.ts`, configurable via `NEXT_PUBLIC_VAULT_ADDRESS` and
`NEXT_PUBLIC_VAULT_CONFIDENTIAL_TOKEN`. Deploy your own with
[`contracts/script/DeployVault.s.sol`](../../contracts/script/DeployVault.s.sol).

**Deposit (`VaultDepositCard.tsx`).** The `data` payload carries a real domain message — the
beneficiary to credit — not an opaque blob. The contract decodes and routes the credit on it:

```ts
const deposit = useConfidentialTransferAndCall({ address: tokenAddress }, { onSuccess });

// The vault decodes `data` as the beneficiary address to credit.
const data = encodeAbiParameters([{ type: "address" }], [beneficiary]);
deposit.mutate({ to: vaultAddress, amount: parsedAmount, data });
```

**Position + withdraw (`VaultPositionCard.tsx`).** The vault stores an `euint64` share per
beneficiary and grants that beneficiary FHE decrypt rights. Reading the position needs a
permit scoped to the **vault** address — distinct from the confidential-token permits the main
page grants:

```ts
const { data: handle } = useReadContract({
  address: vaultAddress,
  abi: VAULT_ABI,
  functionName: "sharesOf",
  args: [connectedAddress],
});

await grantPermit.mutateAsync([vaultAddress]); // permit scoped to the vault
const shares = useDecryptValues([{ encryptedValue: handle, contractAddress: vaultAddress }]);
```

Withdraw calls the vault's `withdraw()` directly (`signer.writeContract`) — it is a custom
contract method, not part of the `Token` surface. The vault transfers the caller's full
confidential balance back via `confidentialTransfer`.

> Depositing with `beneficiary == address(0)` makes the vault return an encrypted `false` from
> the hook, and the token **refunds the transfer atomically** — a useful safety property of the
> receiver-callback pattern.

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
  served or not), the storage the relayer's `keyurl` points the
  browser at for the FHE public key and CRS (`CSP_CONNECT_SRC`, since the relayer owns that
  address and the app does not hardcode it), and `data:` URLs (the FHE runtime compiles its
  WASM from one).
- `script-src 'wasm-unsafe-eval'` and `worker-src 'self' blob:`: what the FHE runtime
  needs to compile WASM and spawn its thread pool. See the SDK's security model docs.
- `'unsafe-eval'` and inline styles are allowed under `next dev` only.

The policy covers the page and the workers it spawns. The SDK's encrypt worker is loaded
from `/_next/static`, which the proxy matcher skips, so it runs with no policy of its own
and its key download is not subject to `connect-src`. The key-storage entries matter when
encryption falls back to the page.

`next.config.ts` adds the static headers (`nosniff`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy`, HSTS) and fills `NEXT_PUBLIC_COMMIT_SHA` from Vercel's
`VERCEL_GIT_COMMIT_SHA`, which the footer (`SiteFooter` in `PageChrome.tsx`) links next to
the source repository. The mainnet banner (`MainnetBanner`) renders when the wallet's
chain has no `testnet` flag in viem.
