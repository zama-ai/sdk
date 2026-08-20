# Developer Walkthrough — react-viem

A step-by-step guide to how this app integrates `@zama-fhe/react-sdk` using viem v2.

---

## Architecture at a glance

```
page.tsx                         — wallet connect, token selector, layout
├── providers.tsx                — SDK createConfig + ZamaProvider wiring
│   └── /api/relayer/[...path]   — Next.js proxy (keeps RELAYER_API_KEY server-side)
├── BalancesCard.tsx             — ETH / ERC-20 / confidential balance display
├── ShieldCard.tsx               — ERC-20 → confidential via useShield
├── TransferCard.tsx             — confidential → confidential
├── UnshieldCard.tsx             — confidential → ERC-20 (2-phase)
├── PendingUnshieldCard.tsx      — recover an interrupted unshield from IndexedDB
├── DelegateDecryptionCard.tsx   — grant another wallet the right to decrypt your balance
├── RevokeDelegationCard.tsx     — revoke that right
└── DecryptAsCard.tsx            — decrypt another wallet's balance (as a delegate)
```

---

## 1. Wiring the SDK (`providers.tsx`)

`ZamaProvider` takes one SDK config object. The app builds it with a read provider,
an optional signer, a chain preset, storage, permit storage, and a browser relayer
factory.

```ts
const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC_URL) });
const provider = new ViemProvider({ publicClient });
// The relayer requires an absolute URL, so resolve the same-origin proxy at runtime.
// The SSR placeholder never issues requests.
const relayerProxyUrl =
  typeof window === "undefined"
    ? "http://localhost/api/relayer"
    : `${window.location.origin}/api/relayer`;

const zamaSepolia = {
  ...fheSepolia,
  relayerUrl: relayerProxyUrl,
  network: SEPOLIA_RPC_URL,
} as const;

const walletClient = createWalletClient({ account, chain: sepolia, transport: custom(ethereum) });
const signer = ethereum ? new ViemSigner({ walletClient, ethereum }) : undefined;

const zamaConfig = createConfig({
  chains: [zamaSepolia],
  provider,
  signer,
  storage: indexedDBStorage,
  permitStorage: permitDBStorage,
  relayers: { [zamaSepolia.id]: web() },
  onEvent,
});
```

`ZamaProvider` receives only the config:

```ts
<ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
```

`storage` and `permitStorage` use separate IndexedDB databases here for clarity, but sharing
one instance is safe — the SDK namespaces the keys internally.

### Relayer proxy (`/api/relayer/[...path]/route.ts`)

`relayerUrl` must be an **absolute** URL. The SDK validates it with `new URL(relayerUrl)` — no base argument — so a bare path like `/api/relayer` is rejected before any request is made. Deriving it from `window.location.origin` at runtime keeps the app working on whatever port or host it happens to be served from.

```
Browser → http://localhost:3003/api/relayer/v2/keyurl
                   ↓
Next.js API route → RELAYER_URL/v2/keyurl  (+ x-api-key header if set)
                   ↓
                 https://relayer.testnet.zama.org/v2/keyurl
```

The `v2/` prefix comes from the SDK, not from the proxy.

The proxy defaults to the public Sepolia testnet relayer. No `RELAYER_URL` or `RELAYER_API_KEY` is required for testnet.

### Wallet reactivity

Unlike `EthersSigner`, `ViemSigner` does **not** infer the account from the EIP-1193 provider at call time — it reads `walletClient.account`, which must be set at construction. This requires two viem-specific additions vs. a plain ethers integration:

**1. `walletKey` bump on page load**

```ts
// In the eth_accounts seed (providers.tsx):
(ethereum.request({ method: "eth_accounts" }) as Promise<string[]>).then((accounts) => {
  liveAccountsRef.current = accounts;
  refSeededRef.current = true;
  // Bump walletKey so signer is recreated with the correct account address.
  // Without this, a wallet already connected on page load would get a signer with no
  // account, and all write operations would throw "WalletClient has no account".
  if (accounts.length > 0) setWalletKey((k) => k + 1);
});
```

The `walletKey` is also bumped on `accountsChanged` (wallet switch) for the same reason. `refSeededRef` guards against spurious events fired by some wallets before `eth_accounts` resolves.

**2. `getAddress()` checksum normalization**

```ts
const rawAddress = liveAccountsRef.current[0];
const account = rawAddress ? (getAddress(rawAddress) as Address) : undefined;
const walletClient = createWalletClient({
  ...(account ? { account } : {}),
  chain: sepolia,
  transport: custom(ethereum),
});
```

`eth_accounts` returns lowercase addresses. Lowercase addresses can cause relayer address validation failures — `getAddress()` from viem normalizes to EIP-55 checksummed format before the address is bound to the wallet client, preventing this.

---

## 2. Wallet connect (`page.tsx`)

Four screens, driven by `isInitializing`, `address`, and `isSepolia` state:

| Screen            | Condition               | What's shown                                          |
| ----------------- | ----------------------- | ----------------------------------------------------- |
| 0 — Initializing  | `isInitializing`        | Blank (prevents flash of Screen 1 on remount)         |
| 1 — No wallet     | `!address`              | "Connect Wallet" button                               |
| 2 — Wrong network | `address && !isSepolia` | "Switch to Sepolia" button (+ error if rejected)      |
| 3 — Main UI       | `address && isSepolia`  | Registry loading, token selector, all operation cards |

Screen 0 covers the brief re-initialization that follows a `ZamaProvider` remount. Without
it, the UI flashes "Connect Wallet" for one render cycle even though the wallet is connected.

`wallet_switchEthereumChain` is called on one explicit user action only: clicking "Switch to
Sepolia" on Screen 2. If the wallet does not know Sepolia (error code 4902),
`wallet_addEthereumChain` is called as a fallback. Errors from `wallet_switchEthereumChain`
(including 4001 user rejection) are intentionally swallowed — `eth_chainId` is re-read in a
`finally` block to determine the actual outcome. If the chain is still wrong after the
attempt, a "Could not switch" message is shown. The `chainChanged` event also updates the UI
when the user switches in their wallet directly.

---

## 3. Token selection (`page.tsx`)

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

With viem contract reads, named fields (`tokenAddress`, `confidentialTokenAddress`, `isValid`)
are directly accessible — no `normalizePair` workaround needed (unlike `EthersSigner`, where
ethers `Result` non-enumerable prototype getters require a numeric index fallback).

The token-dependent hooks live inside `SelectedTokenPanel`, which only renders after a real
registry pair is selected. This keeps SDK hooks from mounting against placeholder token
addresses while still following React's rules of hooks.

Inside `SelectedTokenPanel`, `actionsDisabled` is `!isSepolia`; the component is only mounted
after a real token pair exists.

**`isPending` vs `isLoading`**: In TanStack Query v5, `isLoading = isPending && isFetching`,
which is `false` when the query is disabled (`enabled: false`). `isPending` stays `true`
until the first successful response, correctly covering the period before the chain ID is
resolved internally (during which the query is still disabled).

---

## 4. Shield (`ShieldCard.tsx`)

```ts
const shield = useShield({ address: tokenAddress }, { onSuccess });
shield.mutate({
  amount: parsedAmount,
  approvalStrategy: "exact",
  onApprovalSubmitted: () => setPhase("approve"),
  onShieldSubmitted: () => setPhase("submit"),
});
```

`useShield` owns the full shield flow. The SDK detects whether the underlying ERC-20 supports
ERC-1363 and chooses `transferAndCall` or `approve` + `wrap` automatically. The app does not
read allowances, send approval transactions, or choose a route itself.

`approvalStrategy: "exact"` only affects the `approve` + `wrap` path. It approves exactly the
shielded amount; ERC-1363-routed tokens ignore the option because no separate approval is
required.

---

## 5. Confidential Transfer (`TransferCard.tsx`)

```ts
const transfer = useConfidentialTransfer({ address: tokenAddress }, { onSuccess });
transfer.mutate({ to: recipient, amount: parsedAmount, onEncryptComplete: () => setStep(2) });
```

Two phases: encrypting the amount locally (step 1), then submitting the transaction (step 2). `onEncryptComplete` fires between them so the UI can update the button label.

---

## 6. Unshield (`UnshieldCard.tsx`)

```ts
const unshield = useUnshield(tokenAddress, { onSuccess });
```

For ERC-7984 tokens the wrapper IS the token, so `tokenAddress === wrapperAddress`.

Unshield is a 2-phase on-chain operation:

- **Phase 1**: Submit the unwrap transaction. `onFinalizing` fires when Phase 1 is mined and Phase 2 is about to start.
- **Phase 2**: Finalization transaction.

The SDK persists the pending state automatically after Phase 1 is mined, so it survives a tab close between Phase 1 completion and Phase 2 completion. See §"Pending unshield" below.

---

## 7. Pending unshield recovery (`PendingUnshieldCard.tsx`)

If the user closes the tab between Phase 1 and Phase 2, the pending state is persisted in IndexedDB automatically by `WrappedToken`. On next load:

```ts
const { data: pendingTxHash } = usePendingUnshield(tokenAddress);
// → non-null: show a "Finalize" button
const resume = useResumeUnshield(tokenAddress, { onSuccess });
resume.mutate({ unwrapTxHash: pendingTxHash });
```

`usePendingUnshield` and the unshield/resume mutations share a query key, so finalizing automatically clears the pending state — no manual save/load/clear wiring needed.

---

## 8. Delegation

Three cards cover the full delegation lifecycle.

### Grant access (`DelegateDecryptionCard.tsx`)

```ts
const delegate = useDelegateDecryption(tokenAddress, { onSuccess });
delegate.mutate({
  delegateAddress,
  expirationDate: noExpiry ? undefined : new Date(expirationInput),
  // undefined → SDK sends PERMANENT_DELEGATION on-chain (permanent, no expiry)
});
```

The ACL contract enforces a minimum expiry of **1 hour** from now. Anything shorter is rejected at the UI level before the wallet is prompted.

### Revoke access (`RevokeDelegationCard.tsx`)

```ts
const revoke = useRevokeDelegation(tokenAddress, { onSuccess });
revoke.mutate({ delegateAddress });
```

### Decrypt on behalf of (`DecryptAsCard.tsx`)

Shows a live delegation status indicator as the user types the owner address:

```ts
const delegationStatus = useDelegationStatus({
  contractAddress: tokenAddress,
  delegatorAddress: ownerAddress, // the owner who granted access
  delegateAddress: connectedAddress, // us
});
```

Then decrypts:

```ts
const decryptAs = useDecryptBalanceAs(tokenAddress);
decryptAs.mutate({ delegatorAddress: ownerAddress });
```

Note: `useDecryptBalanceAs`, `useDelegateDecryption`, and `useRevokeDelegation` all take a positional `tokenAddress` as their first argument. `DelegationNotFoundError` and `DelegationExpiredError` from `@zama-fhe/sdk` are used to show user-friendly error messages.

---

## 9. Balance display and explicit decrypt (`page.tsx` + `BalancesCard.tsx`)

Three balances are shown:

| Balance      | Source                            | Hook / method                                                                            |
| ------------ | --------------------------------- | ---------------------------------------------------------------------------------------- |
| ETH          | Direct RPC (`createPublicClient`) | `useQuery` → `rpcClient.getBalance({ address })`                                         |
| ERC-20       | SDK read provider                 | `useQuery` → `sdk.provider.readContract(balanceOfContract(token.tokenAddress, address))` |
| Confidential | Relayer decryption                | `useConfidentialBalance({ address: token.confidentialTokenAddress, account: address })`  |

**Explicit decrypt pattern**: `useConfidentialBalance` is only enabled after the user has
authorized FHE decryption via an EIP-712 wallet signature. `useHasPermit({ contractAddresses })`
checks whether cached credentials cover the currently selected token; if not, `BalancesCard`
shows a "Decrypt Balance" button rather than a balance value. This avoids blind-signing
prompts on mount.

```ts
const { data: hasPermit } = useHasPermit({ contractAddresses: [token.confidentialTokenAddress] });
// All registry pairs are passed at once — one signature covers all tokens,
// so switching tokens does not prompt the wallet again.
const grantPermits = useGrantPermit();
function handleDecrypt() {
  if (validPairs.length === 0) return;
  grantPermits.mutate(validPairs.map((p) => p.confidentialTokenAddress));
}
```

`useConfidentialBalance` returns a standard TanStack Query result. The app uses
`balance.isLoading || balance.isFetching` to drive the "Decrypting…" display in
`BalancesCard`.

Token-dependent balance and authorization hooks are inside `SelectedTokenPanel`, so
`useConfidentialBalance` always receives a real token address plus an explicit owner account.

### Mint

The "Mint" button in `BalancesCard` calls a `useMutation` in `page.tsx` that sends 10 tokens to the connected address on the underlying ERC-20 contract (test tokens only). The mutation returns the `txHash`, which is forwarded to `BalancesCard` as `mintTxHash` to display a success link. Errors are surfaced via `mintError`. Mint state is reset on wallet account change via a `useEffect` in `page.tsx`.

---

## 10. Amounts

All user inputs are parsed with:

```ts
// src/lib/parseAmount.ts
parseAmount(value, decimals); // wraps viem's parseUnits — returns 0n on invalid or empty input
// (viem's parseUnits itself throws on invalid input; parseAmount catches that and returns 0n)
```

And displayed with:

```ts
formatUnits(balance, decimals); // from "viem"
```

Never use raw `BigInt(string)` for token amounts — it ignores decimal precision.

---

## 11. viem-specific notes

### `parseAbi()` is required for human-readable ABI strings

viem does **not** auto-parse human-readable ABI strings like ethers.js does. Passing a raw string array to `writeContract` / `readContract` silently fails because viem's `encodeFunctionData` cannot traverse the string to find the function selector:

```ts
// ✗ Wrong — viem cannot use raw strings
const MINT_ABI = ["function mint(address to, uint256 amount)"];

// ✓ Correct — parseAbi converts to the ABI object format viem expects
import { parseAbi } from "viem";
const MINT_ABI = parseAbi(["function mint(address to, uint256 amount)"]);
```

Ethers.js parses human-readable ABI strings automatically, so this difference is only apparent when porting from an ethers integration.

### `||` not `??` for `NEXT_PUBLIC_*` env vars

Next.js replaces unset `NEXT_PUBLIC_*` variables with an **empty string** at build time, not `undefined`. The nullish coalescing operator (`??`) treats `""` as a valid value and would use it as the RPC URL, causing a runtime `UrlRequiredError`:

```ts
// ✗ Wrong — empty string passes through ?? and becomes the RPC URL
export const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL ?? SEPOLIA_RPC_DEFAULT;

// ✓ Correct — || treats empty string as falsy and falls back to the default
export const SEPOLIA_RPC_URL = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL || SEPOLIA_RPC_DEFAULT;
```

---

## 12. E2E tests

Tests use Playwright with a mock EIP-1193 provider injected via `page.addInitScript` (see
`e2e/fixtures.ts`). No wallet extension or real network is needed.

- `mockWallet` — injects `window.ethereum` with configurable `eth_accounts`,
  `eth_requestAccounts`, and `eth_chainId`; exposes `window.__emitChainChanged(chainId)`
  and `window.__emitAccountsChanged(accounts)` to simulate wallet events
- `mockRpc` — intercepts Sepolia RPC HTTP calls; routes `eth_call` by contract address and
  function selector to return ABI-encoded registry data (`useListPairs`) and token metadata;
  accepts `{ emptyRegistry: true }` to simulate a registry with no valid pairs
- `page` override — aborts all `/api/relayer/**` requests for every test; no real network
  calls to the Zama relayer in CI

**Why `mockRpc` intercepts `eth_call` (not `mockWallet`)**: `ViemProvider` routes SDK contract
reads (registry, metadata, balances) through its `publicClient` HTTP transport — not through
`window.ethereum`. Mocking registry data must be done in the HTTP route interceptor
(`mockRpc`), not in `injectMockWallet`.

```bash
npm run test:e2e   # starts dev server and runs all specs
```
