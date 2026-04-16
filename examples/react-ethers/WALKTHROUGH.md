# Developer Walkthrough — react-ethers

A step-by-step guide to how this app integrates `@zama-fhe/react-sdk` using ethers v6.

---

## Architecture at a glance

```
page.tsx                         — wallet connect, token selector, layout
├── providers.tsx                — ZamaProvider + EthersSigner + RelayerWeb wiring
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
// Signer — wraps an EIP-1193 window.ethereum provider.
// Recreated on wallet switch (walletKey pattern) so EthersSigner is always bound to the
// correct account. See §"Wallet reactivity" below.
// When no wallet is installed, a stub provider is used so hooks don't throw on mount —
// all SDK operations are gated behind address/isSepolia guards in page.tsx.
const signer = useMemo(() => {
  const ethereum = getEthereumProvider();
  const provider = ethereum ?? {
    request: async () => {
      throw new Error("No wallet");
    },
    on: () => {},
    removeListener: () => {},
  };
  return new EthersSigner({ ethereum: provider as any });
}, [walletKey]);

// Relayer — browser FHE worker loaded from CDN.
// Routes through the local /api/relayer Next.js proxy so RELAYER_API_KEY stays server-side.
// SepoliaConfig provides the chain parameters and contract addresses.
// relayerUrl is overridden to point at the proxy; network is the RPC endpoint for reads.
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

`EthersSigner` is stateless — it reads the current account from the provider each time. However, `ZamaProvider` stores session state (EIP-712 signatures) that is account-specific. To avoid cross-account state leaks, the provider is remounted on wallet switch:

```ts
const [walletKey, setWalletKey] = useState(0);

// On accountsChanged: bump walletKey → ZamaProvider remounts with a fresh EthersSigner.
// refSeededRef guards against spurious events fired by some wallets before
// eth_accounts resolves on page load.
```

---

## 2. Wallet connect (`page.tsx`)

Four screens, driven by `isInitializing`, `address`, and `chainId` state:

| Screen            | Condition               | What's shown                                     |
| ----------------- | ----------------------- | ------------------------------------------------ |
| 0 — Initializing  | `isInitializing`        | Blank (prevents flash of Screen 1 on remount)    |
| 1 — No wallet     | `!address`              | "Connect Wallet" button                          |
| 2 — Wrong network | `address && !isSepolia` | "Switch to Sepolia" button (+ error if rejected) |
| 3 — Main UI       | `address && isSepolia`  | All operation cards                              |

Screen 0 covers the brief re-initialization that follows a ZamaProvider remount (wallet switch or chain change). Without it, the UI flashes "Connect Wallet" for one render cycle even though the wallet is still connected.

`wallet_switchEthereumChain` is called on two explicit user actions only: clicking "Switch to Sepolia" on Screen 2, or during the connect flow. There is no automatic switch on page load. If the wallet does not know Sepolia (error code 4902), `wallet_addEthereumChain` is called as a fallback. If the user rejects the switch, the screen stays on Screen 2 and shows a "Could not switch" message. The `chainChanged` event updates the UI automatically when the user switches in their wallet.

---

## 3. Token selection (`page.tsx`)

Registered token pairs are fetched from the on-chain `WrappersRegistry` contract via `useListPairs`:

```ts
const { data: pairsData, isPending: isRegistryPending } = useListPairs({ metadata: true });
```

`metadata: true` fetches name, symbol, and decimals for both the underlying ERC-20 and the confidential wrapper in a single call — no separate `useMetadata` calls needed. The first valid pair is auto-selected:

```ts
useEffect(() => {
  if (validPairs.length > 0 && selectedTokenAddress === null) {
    setSelectedTokenAddress(validPairs[0].confidentialTokenAddress);
  }
}, [validPairs, selectedTokenAddress]);
```

**EthersSigner compat (`normalizePair`)**: `useListPairs` returns objects that may have spread an ethers `Result`. `Result` named fields (`tokenAddress`, `confidentialTokenAddress`, `isValid`) are non-enumerable prototype getters — they survive direct access but are lost after a spread. `normalizePair` reads named fields first and falls back to numeric index access (`t[0]`, `t[1]`, `t[2]`) for the ethers case. This is an ethers v6 interop quirk; viem does not require the fallback.

**`actionsDisabled`** is `!isSepolia || !token` — `token` is only defined once the registry has resolved and a pair has been selected (so metadata is implicitly available).

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

Detection: `eth_estimateGas` on the overwrite call reverts before the wallet is prompted. The component catches that and falls back to `approve(0)` → `approve(fullBalance)` (two wallet confirmations). User rejections (`ACTION_REJECTED`) re-throw immediately — no silent fallback to the reset path when the user said no.

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

`ZamaSDKEvents.UnshieldPhase1Submitted` fires **after Phase 1 is mined** (the SDK awaits the receipt before emitting). The app uses `setActiveUnshieldToken` + `savePendingUnshield` to persist the pending state so it survives a tab close between Phase 1 completion and Phase 2 completion. See §"Pending unshield" below.

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

## 9. Balance display (`page.tsx` + `BalancesCard.tsx`)

Three balances are shown:

| Balance      | Source                         | Hook / method                                                  |
| ------------ | ------------------------------ | -------------------------------------------------------------- |
| ETH          | Direct RPC (`JsonRpcProvider`) | `useQuery` → `rpcProvider.getBalance()`                        |
| ERC-20       | Direct RPC via SDK signer      | `useQuery` → `sdk.signer.readContract(balanceOfContract(...))` |
| Confidential | Relayer decryption             | `useConfidentialBalance({ tokenAddress })`                     |

**Explicit decrypt pattern**: `useConfidentialBalance` is only enabled after the user has authorized FHE decryption via an EIP-712 wallet signature (`useIsAllowed({ contractAddresses })` → `useAllow()`). Until then, `BalancesCard` shows a "Decrypt Balance" button rather than a balance value. This avoids blind-signing prompts on mount.

```ts
const { data: isAllowed } = useIsAllowed({
  contractAddresses: token ? [token.confidentialTokenAddress] : [],
  query: { enabled: Boolean(token) },
});
// In BalancesCard: shows "Decrypt Balance" button when !isAllowed,
// otherwise shows the balance (or "Decrypting…" while loading).
```

`useConfidentialBalance` returns a standard React Query result. `balance.isLoading` covers
both fetching the on-chain handle and decrypting it via the relayer in a single unified query,
driving the "Decrypting…" display in `BalancesCard`.

---

## 10. Amounts

All user inputs are parsed with:

```ts
// src/lib/parseAmount.ts
parseAmount(value, decimals); // wraps ethers' parseUnits — returns 0n on invalid or empty input
// (ethers' parseUnits itself throws on invalid input; parseAmount catches that and returns 0n)
```

And displayed with:

```ts
formatUnits(balance, decimals); // ethers v6
```

Never use raw `BigInt(string)` for token amounts — it ignores decimal precision.

---

## 11. Notes

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

Tests use Playwright with a mock EIP-1193 provider injected via `page.addInitScript` (see `e2e/fixtures.ts`). No wallet extension or real network is needed.

- `mockWallet` — injects `window.ethereum` with configurable `eth_accounts`, `eth_requestAccounts`, and `eth_chainId`; exposes `window.__emitChainChanged(chainId)` to simulate wallet network switches
- `mockRpc` — intercepts Sepolia RPC calls, returns static responses; `eth_call → "0x"` so `useMetadata` fails gracefully and `actionsDisabled` stays true
- `_autoMockRelayer` — Playwright `auto` fixture (applied to every test automatically) that aborts all `/api/relayer/**` requests; no real network calls to the Zama relayer in CI

```bash
npm run test:e2e   # starts dev server and runs all specs
```
