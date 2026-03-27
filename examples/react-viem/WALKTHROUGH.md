# Developer Walkthrough — react-viem

A step-by-step guide to how this app integrates `@zama-fhe/react-sdk` using viem v2.

---

## Architecture at a glance

```
page.tsx                         — wallet connect, token selector, layout
├── providers.tsx                — ZamaProvider + ViemSigner + RelayerWeb wiring
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
// Signer — wraps viem clients for read/write operations.
// publicClient is always created (needed for reads even without a wallet).
// walletClient is only created when window.ethereum is available.
// Recreated on wallet switch (walletKey pattern) so ViemSigner is always bound to the
// correct account.
//
// NOTE: This is a simplified illustration. ViemSigner requires walletClient.account to be
// set at construction time (viem does not infer it at call time like ethers does).
// The actual implementation normalizes the address with getAddress() and bumps walletKey
// after the initial eth_accounts seed. See §"Wallet reactivity" for the full details.
const signer = useMemo(() => {
  const ethereum = getEthereumProvider();
  const publicClient = createPublicClient({ chain: sepolia, transport: http(SEPOLIA_RPC_URL) });
  if (!ethereum) {
    return new ViemSigner({ publicClient }); // read-only when no wallet installed
  }
  const walletClient = createWalletClient({ chain: sepolia, transport: custom(ethereum) });
  return new ViemSigner({ walletClient, publicClient });
}, [walletKey]);

// Relayer — browser FHE worker loaded from CDN.
// Routes through the local /api/relayer Next.js proxy so RELAYER_API_KEY stays server-side.
// SepoliaConfig provides the chain parameters and contract addresses.
// relayerUrl is overridden to point at the proxy; network is the RPC endpoint for reads.
// getChainId reads window.ethereum directly (not via walletClient closure, which would be
// stale after walletKey remounts).
const relayer = useMemo(
  () =>
    new RelayerWeb({
      getChainId: async () => {
        const ethereum = getEthereumProvider();
        if (!ethereum) return SepoliaConfig.chainId;
        const hex = (await ethereum.request({ method: "eth_chainId" })) as string;
        return parseInt(hex, 16);
      },
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
  signer={signer}
  relayer={relayer}
  storage={indexedDBStorage}          // "CredentialStore" — encrypted keypair
  sessionStorage={sessionDBStorage}   // "SessionStore"    — EIP-712 session signatures
>
```

They must be **separate** databases. Both use the same internal key — if shared, the session entry overwrites the encrypted keypair, forcing the user to re-sign on every decrypt.

### Relayer proxy (`/api/relayer/[...path]/route.ts`)

`RelayerWeb` runs in a Web Worker loaded from CDN. Workers require absolute URLs, so the proxy URL is constructed with `window.location.origin`:

```
Browser Worker → http://localhost:3000/api/relayer/keyurl
                   ↓
Next.js API route → RELAYER_URL/keyurl  (+ x-api-key header if set)
                   ↓
                 https://relayer.testnet.zama.org/v2/keyurl
```

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
| 2 — Wrong network | `address && !isSepolia` | Passive message: "Switch to Sepolia in your wallet"   |
| 3 — Main UI       | `address && isSepolia`  | Registry loading, token selector, all operation cards |

Screen 0 covers the brief re-initialization that follows a `ZamaProvider` remount. Without
it, the UI flashes "Connect Wallet" for one render cycle even though the wallet is connected.

**Screen 2 is passive** — there is no "Switch to Sepolia" button calling
`wallet_switchEthereumChain`. The `chainChanged` event listener updates `chainId` state
automatically when the user switches in their wallet. Calling `wallet_switchEthereumChain`
with a `wallet_addEthereumChain` fallback is not done here: it adds boilerplate without
improving the testnet developer experience.

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

With `ViemSigner` (viem-based), named fields (`tokenAddress`, `confidentialTokenAddress`,
`isValid`) are directly accessible — no `normalizePair` workaround needed (unlike
`EthersSigner`, where ethers `Result` non-enumerable prototype getters require a numeric
index fallback).

**`ZERO_ADDRESS` placeholder**: SDK hooks cannot be called conditionally (React rules of
hooks). While no pair is selected, `ZERO_ADDRESS` is passed with `enabled: false`, so no
actual RPC call is made.

**`actionsDisabled`** is `!isSepolia || !token` — `token` is only defined once the registry
has resolved and a pair has been selected (metadata is implicitly available at that point).

**`isPending` vs `isLoading`**: In TanStack Query v5, `isLoading = isPending && isFetching`,
which is `false` when the query is disabled (`enabled: false`). `isPending` stays `true`
until the first successful response, correctly covering the period before the chain ID is
resolved internally (during which the query is still disabled).

---

## 4. Shield (`ShieldCard.tsx`)

```ts
const token = sdk.createToken(tokenAddress); // ERC-7984 wrapper
return token.shield(amount, { approvalStrategy: "skip" });
```

Approval is handled manually before calling `shield` so the UI can show a 2-step progress indicator.
The spend cap is set to the full ERC-20 balance (not the exact shield amount) to avoid re-approval on subsequent shields within the cap.

**Why the USDT reset path exists**

USDT (and some forks, including the USDT Mock token used here) implement a front-running guard from the original Tether contract: `approve(spender, newAmount)` reverts when the current allowance is already non-zero. The ERC-20 spec allows this, but it is not the OpenZeppelin default.

Detection: `eth_estimateGas` on the overwrite call reverts before the wallet is prompted. The component catches that and falls back to `approve(0)` → `approve(fullBalance)` (two wallet confirmations). User rejections (`UserRejectedRequestError` from `"viem"`) re-throw immediately — no silent fallback to the reset path when the user said no.

Flow:

1. `currentAllowance === 0` → `approve(fullBalance)` — one confirmation, works for all token types.
2. `currentAllowance > 0 && < amount` → try `approve(fullBalance)` directly:
   - Succeeds → standard token, one confirmation.
   - `estimateGas` reverts → USDT-style token → `approve(0)` then `approve(fullBalance)`, two confirmations.
3. Call `token.shield(amount, { approvalStrategy: "skip" })` — SDK skips its own approval.

---

## 5. Confidential Transfer (`TransferCard.tsx`)

```ts
const transfer = useConfidentialTransfer({ tokenAddress }, { onSuccess });
transfer.mutate({
  to: recipient,
  amount: parsedAmount,
  callbacks: { onEncryptComplete: () => setStep(2) },
});
```

Two phases: encrypting the amount locally (step 1), then submitting the transaction (step 2). `onEncryptComplete` fires between them so the UI can update the button label.

---

## 6. Unshield (`UnshieldCard.tsx`)

```ts
const unshield = useUnshield({ tokenAddress, wrapperAddress: tokenAddress }, { onSuccess });
```

For ERC-7984 tokens the wrapper IS the token, so `tokenAddress === wrapperAddress`.

Unshield is a 2-phase on-chain operation:

- **Phase 1**: Submit the unwrap transaction. `onFinalizing` fires when Phase 1 is mined and Phase 2 is about to start.
- **Phase 2**: Finalization transaction.

`ZamaSDKEvents.UnshieldPhase1Submitted` fires right after Phase 1 is submitted (before mining). The app uses `setActiveUnshieldToken` + `savePendingUnshield` to persist the pending state so it survives a tab close between phases. See §"Pending unshield" below.

---

## 7. Pending unshield recovery (`PendingUnshieldCard.tsx`)

If the user closes the tab between Phase 1 and Phase 2, the pending state is persisted in IndexedDB. On next load:

```ts
const pendingTxHash = await loadPendingUnshield(storage, tokenAddress);
// → non-null: show a "Finalize" button
const resume = useResumeUnshield({ tokenAddress, wrapperAddress: tokenAddress }, { onSuccess });
resume.mutate({ unwrapTxHash: pendingTxHash });
```

The `activeUnshield.ts` module-level bridge is needed because `ZamaSDKEvents.UnshieldPhase1Submitted` (fired in `providers.tsx`) carries only the txHash — not the token address. The bridge associates them:

```
UnshieldCard: setActiveUnshieldToken(tokenAddress) → mutate()
providers.tsx onEvent: getActiveUnshieldToken() → savePendingUnshield(storage, wrapperAddress, txHash)
```

---

## 8. Delegation

Three cards cover the full delegation lifecycle.

### Grant access (`DelegateDecryptionCard.tsx`)

```ts
const delegate = useDelegateDecryption({ tokenAddress }, { onSuccess });
delegate.mutate({
  delegateAddress,
  expirationDate: noExpiry ? undefined : new Date(expirationInput),
  // undefined → SDK sends PERMANENT_DELEGATION on-chain (permanent, no expiry)
});
```

The ACL contract enforces a minimum expiry of **1 hour** from now. Anything shorter is rejected at the UI level before the wallet is prompted.

### Revoke access (`RevokeDelegationCard.tsx`)

```ts
const revoke = useRevokeDelegation({ tokenAddress }, { onSuccess });
revoke.mutate({ delegateAddress });
```

### Decrypt on behalf of (`DecryptAsCard.tsx`)

Shows a live delegation status indicator as the user types the owner address:

```ts
const delegationStatus = useDelegationStatus({
  tokenAddress,
  delegatorAddress: ownerAddress, // the owner who granted access
  delegateAddress: connectedAddress, // us
});
```

Then decrypts:

```ts
const decryptAs = useDecryptBalanceAs(tokenAddress);
decryptAs.mutate({ delegatorAddress: ownerAddress });
```

Note: `useDecryptBalanceAs` takes a positional `tokenAddress` (unlike `useDelegateDecryption` / `useRevokeDelegation` which use a config object). `DelegationNotFoundError` and `DelegationExpiredError` from `@zama-fhe/sdk` are used to show user-friendly error messages.

---

## 9. Balance display and explicit decrypt (`page.tsx` + `BalancesCard.tsx`)

Three balances are shown:

| Balance      | Source                            | Hook / method                                                                               |
| ------------ | --------------------------------- | ------------------------------------------------------------------------------------------- |
| ETH          | Direct RPC (`createPublicClient`) | `useQuery` → `rpcClient.getBalance({ address })`                                            |
| ERC-20       | Direct RPC via SDK signer         | `useQuery` → `sdk.signer.readContract(balanceOfContract(token.tokenAddress, ...))`          |
| Confidential | Relayer decryption                | `useConfidentialBalance({ tokenAddress: token?.confidentialTokenAddress ?? ZERO_ADDRESS })` |

**Explicit decrypt pattern**: `useConfidentialBalance` is only enabled after the user has
authorized FHE decryption via an EIP-712 wallet signature. `useIsAllowed()` checks whether
credentials are already cached; if not, `BalancesCard` shows a "Decrypt Balance" button
rather than a balance value. This avoids blind-signing prompts on mount.

```ts
const { data: isAllowed } = useIsAllowed();
// All registry pairs are passed at once — one signature covers all tokens,
// so switching tokens does not prompt the wallet again.
const allowTokens = useAllow();
function handleDecrypt() {
  if (validPairs.length === 0) return;
  allowTokens.mutate(validPairs.map((p) => p.confidentialTokenAddress));
}
```

`useConfidentialBalance` has two loading phases:

- `balance.handleQuery.isLoading` — fetching the encrypted handle from chain
- `balance.isLoading` — decrypting it via the relayer

Both are OR'd to drive the "Decrypting…" display in `BalancesCard`.

**`actionsDisabled`** is `!isSepolia || !token` — `token` is only defined once the registry
has resolved and a pair has been selected (decimals and symbol are implicitly available).

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

**Why `mockRpc` intercepts `eth_call` (not `mockWallet`)**: `ViemSigner` routes all contract
reads (registry, metadata, balances) through its `publicClient` HTTP transport — not through
`window.ethereum`. Mocking registry data must be done in the HTTP route interceptor
(`mockRpc`), not in `injectMockWallet`. This is the opposite of `EthersSigner`, where
`BrowserProvider` routes reads through `window.ethereum`.

```bash
npm run test:e2e   # starts dev server and runs all specs
```
