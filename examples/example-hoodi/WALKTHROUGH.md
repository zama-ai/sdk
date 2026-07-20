# Integrating Zama Confidential Tokens (ERC-7984) on Hoodi

**Audience:** Partners integrating Zama confidential tokens on the Hoodi testnet with wagmi and viem, including on-chain ACL delegation.

**What this document covers:** context and motivation, how the cleartext stack works, prerequisites, step-by-step operation walkthrough, minting instructions, environment variable reference, and troubleshooting.

**Chain:** Hoodi testnet (chainId 560048)

---

## Context

ERC-7984 is a token standard that adds **confidential balances and transfer amounts** to ERC-20 tokens. Instead of storing plaintext balances on-chain, balances are stored as encrypted handles. Only the token owner can decrypt their own balance.

The **Zama SDK** (`@zama-fhe/sdk`, `@zama-fhe/react-sdk`) handles all cryptographic operations — encryption, decryption, EIP-712 signing — behind simple React hooks (`useShield`, `useConfidentialTransfer`, `useUnshield`, `useConfidentialBalance`).

This example uses the **cleartext stack** (`cleartext()`), which is Zama's lightweight backend for chains where the full FHE co-processor is not deployed (including Hoodi). See [How the cleartext stack works](#how-the-cleartext-stack-works) below.

---

## What this example demonstrates

> Any EIP-1193 browser wallet (Rabby, Phantom…) can interact with ERC-7984 confidential tokens on Hoodi using the Zama SDK's wagmi integration and the cleartext backend — with no external relayer service and no API key.

Specifically:

1. A user connects any injected EIP-1193 wallet.
2. They can select between two tokens (USDC Mock / USDT Mock).
3. All ERC-7984 protocol operations work end-to-end: shield, transfer, unshield, balance decryption, and on-chain ACL delegation (grant, revoke, decrypt-as).

---

## Supported operations

| Operation                    | SDK API                                                      | Source file                                            | Transactions          |
| ---------------------------- | ------------------------------------------------------------ | ------------------------------------------------------ | --------------------- |
| Decrypt confidential balance | `useHasPermit` + `useGrantPermit` + `useConfidentialBalance` | `src/app/page.tsx` + `src/components/BalancesCard.tsx` | 0 (read)              |
| Shield (ERC-20 → cToken)     | `useShield`                                                  | `src/components/ShieldCard.tsx`                        | 1–3 (wrap, ± approve) |
| Confidential transfer        | `useConfidentialTransfer`                                    | `src/components/TransferCard.tsx`                      | 1                     |
| Unshield (cToken → ERC-20)   | `useUnshield`                                                | `src/components/UnshieldCard.tsx`                      | 2 (unwrap + finalize) |
| Grant decryption access      | `useDelegateDecryption`                                      | `src/components/DelegateDecryptionCard.tsx`            | 1                     |
| Revoke decryption access     | `useRevokeDelegation`                                        | `src/components/RevokeDelegationCard.tsx`              | 1                     |
| Decrypt balance as delegate  | `useDecryptBalanceAs` + `useDelegationStatus`                | `src/components/DecryptAsCard.tsx`                     | 0 (read)              |

---

## Wallet compatibility

| Wallet type                                             | Supported | Notes                                                                                              |
| ------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| EIP-1193 browser wallet EOA (Rabby, MetaMask, Phantom…) | Yes       | Must support `wallet_switchEthereumChain` / `wallet_addEthereumChain`.                             |
| Smart account (ERC-4337)                                | No        | The Zama relayer uses ECDSA (`ecrecover`) — smart account signing key differs from account address |

---

## How the cleartext stack works

The full Zama FHE stack (used on Sepolia and Mainnet) relies on:

- An **FHE co-processor** that stores encrypted ciphertexts on-chain
- A **Zama relayer** — an off-chain service that performs server-side decryption using KMS private keys

**Hoodi uses the cleartext stack.** In cleartext mode:

- Values are stored as **plaintexts** in the `CleartextFHEVMExecutor` contract on-chain (no actual FHE encryption)
- The `cleartext()` transport acts as a local relayer: it reads plaintexts directly from the executor contract and produces mock KMS signatures locally
- **No external service** is required — no relayer URL, no API key

The SDK interface is identical in both modes. From the application developer's perspective, you swap `web()` (or `node()`) for `cleartext()` and point it at the Hoodi preset config. All hooks behave the same way.

```
Full FHE stack (Sepolia / Mainnet)      Cleartext stack (Hoodi)
──────────────────────────────────      ──────────────────────────────────────
web() → external HTTP service      cleartext() → on-chain executor
  └─ FHE co-processor (on-chain)          └─ plaintexts(handle) → plaintext
  └─ KMS decryption (server-side)         └─ mock KMS signature (local)
  └─ Zama relayer API key required        └─ No API key, no external service
```

---

## Architecture at a glance

```
User (browser wallet)
  │
  ▼
page.tsx — useShield / useConfidentialTransfer / useUnshield / useConfidentialBalance
  │
  ▼
@zama-fhe/react-sdk (React hooks + ZamaProvider)
  │
  ▼
@zama-fhe/react-sdk/wagmi  ← createConfig({ wagmiConfig, chains, relayers })
  ├─ reads → viem HTTP transport(HOODI_RPC_URL)
  ├─ writes + EIP-712 signing → active wagmi injected connection
  └─ cleartext() → the Hoodi SDK chain preset
       └─ reads plaintexts from CleartextFHEVMExecutor (on-chain, Hoodi)
       └─ produces mock KMS signatures locally (no external call)
```

**Reads vs writes:** wagmi's viem HTTP transport handles reads through `HOODI_RPC_URL`; writes and EIP-712 signing use the active injected connector. The Zama wagmi adapter consumes that same connection.

**Wallet-switch lifecycle:** wagmi owns account and chain subscriptions. The UI reads them with wagmi v3's `useConnection`; connection and switching use the mutation functions returned by `useConnect` and `useSwitchChain`. No manual `accountsChanged` or `chainChanged` listeners—or forced `ZamaProvider` remounts—are needed. Permits persist in IndexedDB.

---

## Prerequisites

### 1. Browser wallet

Install any EIP-1193 browser wallet (e.g. [Rabby](https://rabby.io), [Phantom](https://phantom.com)) and create or import an account. The app automatically adds the Hoodi network when you connect.

If you prefer to add Hoodi manually:

| Field           | Value                              |
| --------------- | ---------------------------------- |
| Network name    | Hoodi                              |
| RPC URL         | `https://rpc.hoodi.ethpandaops.io` |
| Chain ID        | 560048                             |
| Currency symbol | ETH                                |
| Block explorer  | `https://hoodi.etherscan.io`       |

### 2. Hoodi ETH (gas)

All on-chain operations require Hoodi ETH. Aim for at least **0.01 ETH** before starting — shield and unshield each involve multiple transactions.

Recommended faucets:

- [hoodi-faucet.pk910.de](https://hoodi-faucet.pk910.de) — proof-of-work faucet, unlimited
- [faucet.quicknode.com](https://faucet.quicknode.com/ethereum/hoodi) — requires QuickNode account

### 3. Test tokens

Both `USDC Mock` and `USDT Mock` have a permissionless `mint(address to, uint256 amount)` function. See [Minting test tokens](#minting-test-tokens) below.

---

## Hoodi contract addresses

| Token     | ERC-20 address                               | ERC-7984 address (cToken / wrapper)          |
| --------- | -------------------------------------------- | -------------------------------------------- |
| USDC Mock | `0x51a63b5621D78dE54D2F4D098A23a5A69e76F30b` | `0x2dEBbe0487Ef921dF4457F9E36eD05Be2df1AC75` |
| USDT Mock | `0x7740F913dC24D4F9e1A72531372c3170452B2F87` | `0x7B1d59BbCD291DAA59cb6C8C5Bc04de1Afc4Aba1` |

Registry (DeploymentCoordinator): `0x1807aE2f693F8530DFB126D0eF98F2F2518F292f`

All contracts verified on [hoodi.etherscan.io](https://hoodi.etherscan.io).

> Token pairs are loaded dynamically from the on-chain WrappersRegistry (`0x1807aE2f693F8530DFB126D0eF98F2F2518F292f`) at runtime — `src/app/page.tsx` no longer contains a hardcoded `TOKENS` constant. If contracts are redeployed, the registry should be updated; the app will pick up the new addresses automatically.

---

## Minting test tokens

### Via the app

Click the **Mint** button next to the ERC-20 balance. This mints 10 whole tokens directly to your connected wallet using the token's `mint(address, uint256)` function.

### Via Etherscan

1. Go to the ERC-20 contract on [hoodi.etherscan.io](https://hoodi.etherscan.io) (e.g., `0x51a63b...` for USDC Mock).
2. Click the **Contract** tab → **Write Contract**.
3. Click **Connect to Web3** and connect your wallet.
4. Find the `mint` function, enter your wallet address and the desired amount in raw units (e.g., `10000000` for 10 USDC Mock, which has 6 decimals).
5. Click **Write** and confirm in your wallet.

### Via code

```ts
import { parseUnits } from "viem";
import { useConnection, useWriteContract } from "wagmi";

const mintAbi = [
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const { address } = useConnection();
const { mutate: writeContract } = useWriteContract();

writeContract({
  address: "0x51a63b5621D78dE54D2F4D098A23a5A69e76F30b",
  abi: mintAbi,
  functionName: "mint",
  args: [address!, parseUnits("10", 6)],
});
```

---

## Step-by-step walkthrough

### Step 1 — Connect wallet

Open the app at [http://localhost:3000](http://localhost:3000) and click **Connect Wallet**.

The app calls `eth_requestAccounts` to connect, then `wallet_switchEthereumChain` (or `wallet_addEthereumChain` if Hoodi is not yet known to the wallet) to switch to Hoodi (chainId 560048 / `0x88bb0`). No further setup is needed.

Once connected, your wallet address and ETH balance appear at the top of the page.

If you switch to a different network after connecting, the app shows a full-page **Hoodi Network Required** screen with a **Switch to Hoodi** button. All operation buttons are disabled until you switch back.

### Step 2 — Select a token

Use the **Token** dropdown to select between available tokens. Token pairs are loaded from the on-chain **WrappersRegistry** via `useListPairs({ metadata: true })` — no hardcoded addresses needed. The registry address for Hoodi (`0x1807aE2f693F8530DFB126D0eF98F2F2518F292f`) is resolved automatically from the connected chain ID. Name, symbol, and decimal precision are included in the registry response.

### Step 3 — Mint tokens (if needed)

If your ERC-20 balance shows `0`, click **Mint** next to the ERC-20 balance, or use one of the manual methods above. The button mints 10 whole tokens to your wallet and refreshes the balance automatically.

### Step 4 — Check your balances

Two balances are displayed:

- **ERC-20 balance** — your public on-chain balance of the underlying token. Read via a standard `balanceOf` call.
- **Confidential balance** — your confidential cToken balance, read via `useConfidentialBalance`. The SDK reads the encrypted handle on-chain (Phase 1), then decrypts it via `cleartext()` (Phase 2).

**Explicit decrypt pattern:** the confidential balance is not queried until you explicitly authorize FHE decryption. The Balances card shows a **Decrypt Balance** button instead of a balance value until you sign. This avoids blind EIP-712 prompts on mount.

Click **Decrypt Balance** and approve the EIP-712 signature in your wallet. A single signature covers all registered tokens — switching tokens will not prompt again. The credential is cached in IndexedDB (30-day TTL) and reused for all subsequent decryptions.

If you have never shielded any tokens, the confidential balance shows **—** after decryption — this is expected, as there is no encrypted balance to read yet.

### Step 5 — Shield (ERC-20 → cToken)

Enter a human-readable amount (e.g., `1.5`) and click **Shield**. This converts public ERC-20 tokens into confidential cTokens.

The app delegates the entire approve + wrap flow to `useShield` — it does not read ERC-20 allowances, submit approvals, or call wrapper contracts directly. With `approvalStrategy: "exact"` the SDK approves exactly the shielded amount, performing a USDT-style allowance reset first when an existing non-zero allowance would block the approval. The number of wallet confirmations depends on the underlying token and current allowance:

| Situation                                          | Transactions                              | Confirmations |
| -------------------------------------------------- | ----------------------------------------- | ------------- |
| Allowance already covers the amount                | `wrap` only                               | 1             |
| No existing allowance (or zero)                    | `approve(amount)` → `wrap`                | 2             |
| Non-zero allowance insufficient — USDT-style token | `approve(0)` → `approve(amount)` → `wrap` | 3 _(rare)_    |

The button shows **Shielding… (approving)** during approval and **Shielding… (wrapping)** once the approval is confirmed. Gas fees on Hoodi are effectively zero. The ERC-20 balance refreshes automatically on success.

### Step 6 — Confidential transfer

Enter a **recipient address** and an **amount**, then click **Transfer**. This sends cTokens to another address with the amount hidden on-chain.

The operation has two phases:

1. **FHE encryption** — the amount is encrypted locally by the SDK. The button shows **Encrypting…** during this phase (no wallet interaction).
2. **Transaction submission** — the encrypted transfer is sent on-chain. The button shows **Submitting…** and one wallet confirmation is required.

### Step 7 — Unshield (cToken → ERC-20)

Enter an amount and click **Unshield**. This converts cTokens back into public ERC-20 tokens.

Unshield is a two-phase operation:

1. **Unwrap** — a transaction that burns the cTokens and emits an `UnwrapRequested` event containing the encrypted amount handle. The button shows **Unshielding… (1/2)**. One wallet confirmation.
2. **Finalize** — the `cleartext()` decrypts the amount locally (no external call, no wallet prompt), then submits a `finalizeUnwrap` transaction that releases the ERC-20 tokens. The button shows **Unshielding… (2/2)**. One wallet confirmation.

Both phases complete within seconds on Hoodi. The ERC-20 balance refreshes automatically on success.

**Tab close resilience:** if you close the tab after Phase 1 completes but before Phase 2 starts, the pending unshield is saved in IndexedDB. A **Pending Unshield** card will appear when you reopen the app, allowing you to resume finalization.

### Step 8 — Verify updated balances

After each operation, balances refresh automatically. All three operations (shield, transfer, unshield) invalidate the same set of queries: the ERC-20 balance, the ETH balance, and the confidential handle. The ERC-20 balance changes after shield and unshield (when tokens cross the public/confidential boundary). The confidential balance re-decrypts after all three — shield, transfer, and unshield each modify the encrypted handle on-chain.

---

## Delegation walkthrough

The three delegation cards are located below the core operation cards. They require **two separate wallets** — one acting as the token owner (delegator) and one as the delegate.

### Step 9 — Grant decryption access (owner wallet)

In the **Grant Decryption Access** card, enter the delegate's wallet address. By default, access is permanent (the **No expiration** checkbox is checked). To set a time limit, uncheck it and pick a date and time — the SDK sends `MAX_UINT64` on-chain for permanent delegations, or the expiry timestamp otherwise. **The ACL contract requires the expiry to be at least 1 hour in the future** (`expirationDate >= block.timestamp + 1 hours`); shorter values will revert on-chain.

Click **Grant Access** and confirm the transaction in your wallet. One transaction is submitted to the on-chain ACL contract.

### Step 10 — Decrypt balance as delegate (delegate wallet)

Switch to the delegate wallet (or open a second browser profile with the delegate account). In the **Decrypt Balance On Behalf Of** card, enter the owner's wallet address.

As soon as a valid address is entered, a live **delegation status** indicator appears:

- **✓ Delegated · Permanent** — delegation is active and has no expiry.
- **✓ Delegated · \<date\>** — delegation is active until the shown date.
- **No active delegation for this token** — no delegation exists; go back to Step 9.

Click **Decrypt Balance** to decrypt the owner's confidential balance. The result is displayed in token units.

> **Cache behaviour:** decrypted values are cached locally in IndexedDB, keyed by the on-chain encrypted handle. If the owner's balance does not change between two decrypt calls, the second call returns the cached value without re-checking the ACL — this is intentional. See [Troubleshooting](#troubleshooting) for details.

### Step 11 — Revoke decryption access (owner wallet)

Switch back to the owner wallet. In the **Revoke Decryption Access** card, enter the delegate's address and click **Revoke Access**. One transaction is submitted. After confirmation, the delegation is removed from the on-chain ACL.

> **Revocation and caching:** if the delegate calls Decrypt Balance again immediately after revocation and the owner's balance has not changed, the cached plaintext is returned — no new ACL check occurs. Revocation takes full effect for the delegate as soon as the owner's balance changes (any shield, transfer, or unshield), which produces a new on-chain handle and invalidates the cache entry.

---

## SDK integration details

### Providers setup

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ZamaProvider } from "@zama-fhe/react-sdk";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { cleartext, indexedDBStorage } from "@zama-fhe/sdk";
import { hoodi as fheHoodi } from "@zama-fhe/sdk/chains";
import { createConfig, http, WagmiProvider } from "wagmi";
import { hoodi } from "wagmi/chains";
import { injected } from "wagmi/connectors/injected";

const wagmiConfig = createConfig({
  chains: [hoodi],
  connectors: [injected()],
  transports: { [hoodi.id]: http(HOODI_RPC_URL) },
});
const zamaHoodi = { ...fheHoodi, network: HOODI_RPC_URL } as const;
const zamaConfig = createZamaConfig({
  wagmiConfig,
  chains: [zamaHoodi],
  relayers: { [zamaHoodi.id]: cleartext() },
  storage: indexedDBStorage,
  permitStorage: indexedDBStorage,
});

<WagmiProvider config={wagmiConfig}>
  <QueryClientProvider client={queryClient}>
    <ZamaProvider config={zamaConfig}>{children}</ZamaProvider>
  </QueryClientProvider>
</WagmiProvider>;
```

### Hook usage

```tsx
import { parseUnits } from "viem";
import {
  useShield,
  useListPairs,
  useHasPermit,
  useGrantPermit,
  useConfidentialTransfer,
  useUnshield,
  useConfidentialBalance,
} from "@zama-fhe/react-sdk";

// Fetch all valid token pairs from the on-chain WrappersRegistry.
// Registry address is resolved automatically from the chain via DefaultRegistryAddresses.
// metadata: true fetches name/symbol/decimals for both tokens in each pair.
const { data: pairsData } = useListPairs({ metadata: true });
const pair = pairsData?.items?.[0]; // or find by confidentialTokenAddress

// Addresses and metadata from the registry response — no hardcoded values needed.
const cTokenAddress = pair?.confidentialTokenAddress;
const erc20Address = pair?.tokenAddress;
const cTokenDecimals = pair?.confidential.decimals ?? 0;
const erc20Decimals = pair?.underlying.decimals ?? 0;

// Explicit decrypt pattern: check credentials before enabling the balance display.
// useHasPermit returns true only when cached credentials cover the selected token.
const { data: hasPermit } = useHasPermit(
  { contractAddresses: cTokenAddress ? [cTokenAddress] : [] },
  { enabled: Boolean(cTokenAddress) },
);

// useGrantPermit triggers the EIP-712 wallet signature that authorizes decryption.
// Pass all confidential token addresses at once — a single signature covers all tokens.
const grantPermits = useGrantPermit();
function handleDecrypt() {
  const addresses = pairsData?.items?.map((p) => p.confidentialTokenAddress) ?? [];
  if (addresses.length > 0) grantPermits.mutate(addresses);
}

const transfer = useConfidentialTransfer({ address: cTokenAddress });
const unshield = useUnshield(cTokenAddress);

// Pass enabled: false until the user has authorized decrypt (hasPermit).
// This prevents the hook from firing an EIP-712 prompt on mount.
const balance = useConfidentialBalance(
  // `account` (the balance holder) is optional — it defaults to the connected signer.
  // page.tsx passes it explicitly; omit it for the connected wallet's own balance.
  { address: cTokenAddress ?? "0x0000000000000000000000000000000000000000" },
  { enabled: !!hasPermit && !!cTokenAddress },
);

// Shield: useShield owns the entire approve + wrap flow — the app does not read ERC-20
// allowances, submit approvals, or call wrapper contracts. approvalStrategy "exact" approves
// exactly the shielded amount; the SDK performs the USDT-style allowance reset when an
// existing non-zero allowance would otherwise block the approval, and routes through ERC-1363
// transferAndCall when the underlying ERC-20 supports it.
const shield = useShield({ address: cTokenAddress });
shield.mutate({
  amount: parseUnits("10", erc20Decimals),
  approvalStrategy: "exact",
  onApprovalSubmitted: () => setPhase("approve"),
  onShieldSubmitted: () => setPhase("wrap"),
});

// Transfer: FHE encryption (local) + 1 transaction.
// Amount is in confidential token units — use cTokenDecimals.
// onEncryptComplete fires when encryption is done, before the tx is submitted.
transfer.mutate({
  to: "0xRecipient",
  amount: parseUnits("5", cTokenDecimals),
  onEncryptComplete: () => setStep(2),
});

// Unshield: 2 transactions (unwrap + finalizeUnwrap).
// Amount is in confidential token units — use cTokenDecimals.
// onFinalizing fires between the two transactions — use it to update the progress UI.
unshield.mutate({ amount: parseUnits("2", cTokenDecimals), onFinalizing: () => setStep(2) });
```

### Delegation hooks

```tsx
import {
  useDelegateDecryption,
  useRevokeDelegation,
  useDelegationStatus,
  useDecryptBalanceAs,
} from "@zama-fhe/react-sdk";
import { DelegationNotFoundError, DelegationExpiredError } from "@zama-fhe/sdk";

// Grant decryption access — 1 transaction.
// expirationDate: undefined → SDK sends MAX_UINT64 on-chain (permanent delegation).
const delegate = useDelegateDecryption(cTokenAddress);
// Permanent delegation (no expiry):
delegate.mutate({ delegateAddress: "0xDelegate" });
// With expiry (must be at least 1 hour in the future):
delegate.mutate({ delegateAddress: "0xDelegate", expirationDate: new Date("2027-01-01") });

// Revoke decryption access — 1 transaction.
const revoke = useRevokeDelegation(cTokenAddress);
revoke.mutate({ delegateAddress: "0xDelegate" });

// Query delegation status — fires automatically when both addresses are valid.
// Pass undefined for either address to disable the query (useful before the user
// has entered an address).
const { data: status } = useDelegationStatus({
  contractAddress: cTokenAddress,
  delegatorAddress: "0xOwner", // the wallet that granted the delegation
  delegateAddress: "0xDelegate", // the wallet that received it (usually the connected wallet)
});
// status?.isActive          → boolean
// status?.expiryTimestamp   → bigint (MAX_UINT64 for permanent delegations)

// Decrypt owner's balance as a delegate — 0 transactions (read + local cache).
// Throws DelegationNotFoundError / DelegationExpiredError if the ACL check fails.
// Note: useDecryptBalanceAs, useDelegateDecryption, and useRevokeDelegation all take a
// positional tokenAddress as their first argument.
const decryptAs = useDecryptBalanceAs(cTokenAddress);
decryptAs.mutate({ delegatorAddress: "0xOwner" });
// decryptAs.data → bigint (raw balance)

// Typed error handling:
if (decryptAs.error instanceof DelegationNotFoundError) {
  /* no delegation */
}
if (decryptAs.error instanceof DelegationExpiredError) {
  /* expired */
}
```

---

## Environment variables

| Variable                    | Required | Default                            | Description                                                                    |
| --------------------------- | -------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_HOODI_RPC_URL` | No       | `https://rpc.hoodi.ethpandaops.io` | Override the Hoodi RPC endpoint. Infura: `https://hoodi.infura.io/v3/YOUR_KEY` |

Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_HOODI_RPC_URL` if you want to use a private RPC endpoint. Leaving the value empty is safe — the app falls back to the public endpoint automatically.

---

## Troubleshooting

| Symptom                                                   | Likely cause                                                                                                                                             | Fix                                                                                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "No wallet found" on connect                              | No EIP-1193 wallet extension installed                                                                                                                   | Install an EIP-1193 browser wallet ([Rabby](https://rabby.io) recommended; MetaMask or Phantom also work)                                                                                                                                                                                                                                                             |
| Phantom shows a multi-chain connect dialog                | Phantom's generic picker — app auto-selects Phantom's Ethereum provider                                                                                  | Proceed normally; only Ethereum accounts are used. For a cleaner experience use [Rabby](https://rabby.io)                                                                                                                                                                                                                                                             |
| Stuck on "Connect Wallet" after clicking                  | Wallet popup was dismissed or blocked                                                                                                                    | Open your wallet manually and approve the connection request                                                                                                                                                                                                                                                                                                          |
| Network switch fails with error                           | Wallet cannot reach the Hoodi RPC                                                                                                                        | Check `NEXT_PUBLIC_HOODI_RPC_URL`; try the default `https://rpc.hoodi.ethpandaops.io`                                                                                                                                                                                                                                                                                 |
| Wrong network screen appears                              | Wallet switched away from Hoodi                                                                                                                          | Click **Switch to Hoodi** to switch back to Hoodi                                                                                                                                                                                                                                                                                                                     |
| ERC-20 balance shows `—`                                  | Not yet connected or query pending                                                                                                                       | Wait for the connection to complete                                                                                                                                                                                                                                                                                                                                   |
| ERC-20 balance shows `0`                                  | Tokens not yet minted                                                                                                                                    | Click the **Mint** button or use one of the methods in [Minting test tokens](#minting-test-tokens)                                                                                                                                                                                                                                                                    |
| Confidential balance shows `—` immediately after connect  | No shielded balance yet — no encrypted handle to read                                                                                                    | Shield some tokens first; the balance will display once there is something to decrypt                                                                                                                                                                                                                                                                                 |
| "Decrypting…" stays indefinitely                          | Wallet EIP-712 signature request was missed (small notification badge)                                                                                   | Open your wallet and approve the pending signature request; balance will update immediately                                                                                                                                                                                                                                                                           |
| Asked to sign an EIP-712 message after each action        | Permit not yet cached (first use — expected)                                                                                                             | Approve once — subsequent decryptions reuse the IndexedDB-persisted permit (30-day TTL). Sharing one `IndexedDBStorage` instance for `storage` and `permitStorage` is safe (the SDK namespaces the keys internally); if the prompt still recurs every time, check that both point at a storage backend that actually persists across page loads (see Providers setup) |
| Shield fails right after the approval transaction         | The approval reverted or was rejected before the wrap step                                                                                               | Retry — useShield re-reads the allowance and re-approves only if needed                                                                                                                                                                                                                                                                                               |
| Shield fails after a recent transfer or other operation   | Pending transaction in the mempool caused a nonce conflict                                                                                               | Wait for all pending transactions to confirm, then retry                                                                                                                                                                                                                                                                                                              |
| Shield stuck on "Shielding… (approving)"                  | Ran out of Hoodi ETH after the approval transaction                                                                                                      | Top up your wallet with Hoodi ETH and try again                                                                                                                                                                                                                                                                                                                       |
| Shield completes but balances unchanged                   | Decimal mismatch — wrong number of decimals used to parse the amount                                                                                     | Ensure the amount input uses the ERC-20 contract's decimals (not the ERC-7984 token's); decimals are available as `pair.underlying.decimals` and `pair.confidential.decimals` from `useListPairs`                                                                                                                                                                     |
| "nonce too low: next nonce X, tx nonce Y"                 | The wallet or Hoodi RPC observed a stale nonce                                                                                                             | Retry the transaction. The injected connector submits transactions through the wallet; if you build transactions yourself, ensure the nonce comes from the same node that receives `eth_sendTransaction` rather than a load-balanced read RPC                                                                                                                         |
| "Transaction reverted" on any operation                   | Insufficient token balance, or wrong network                                                                                                             | Verify you are on Hoodi (chainId 560048) and have sufficient tokens                                                                                                                                                                                                                                                                                                   |
| Unshield shows "Unshielding… (2/2)" for longer than usual | Finalize phase waiting for the Phase 2 receipt                                                                                                           | Normal on Hoodi — the public RPC can be slow; the app polls receipt via the wallet's node for consistency                                                                                                                                                                                                                                                             |
| Pending unshield card appears on reload                   | Tab was closed between Phase 1 and Phase 2 of an unshield                                                                                                | Click **Finalize** in the Pending Unshield card to complete the operation and receive your ERC-20 tokens                                                                                                                                                                                                                                                              |
| Amounts displayed as very large or very small numbers     | Raw units displayed without decimal conversion                                                                                                           | Always use `formatUnits(balance, decimals)` for display and `parseUnits(input, decimals)` for input; decimals are available from `pair.underlying.decimals` / `pair.confidential.decimals` via `useListPairs`                                                                                                                                                         |
| Delegate can still decrypt after revocation               | Expected behavior — decrypted values are cached in IndexedDB keyed by `(token, owner, handle)`; the cache is served without re-checking the on-chain ACL | This is by design: the SDK uses the on-chain encrypted handle as the cache key (no TTL). Revocation takes effect for the delegate as soon as the owner's balance changes (via shield, transfer, or unshield), which produces a new handle and automatically invalidates the cache entry. Until then, the previously decrypted value is still accessible locally.      |
| Grant Access reverts with `ExpirationDateBeforeOneHour`   | Expiration date is less than 1 hour in the future (ACL contract requirement)                                                                             | Set the expiry to at least 1 hour from now. The contract compares against `block.timestamp` (UTC), not your local clock — account for any clock skew. A future SDK release will validate this client-side before submitting the transaction.                                                                                                                          |
| Grant Access reverts with `SenderCannotBeDelegate`        | Attempted to delegate decryption access to your own address                                                                                              | Enter a different wallet address. The ACL contract does not allow self-delegation. A future SDK release will validate this client-side before submitting the transaction.                                                                                                                                                                                             |
| Revoke Access reverts with `NotDelegatedYet`              | No active delegation exists for the entered address and token                                                                                            | Verify the delegate address is correct and that a grant was previously confirmed on-chain for the selected token. A future SDK release will validate this client-side before submitting the transaction.                                                                                                                                                              |

---

## Running tests

This example ships with a Playwright e2e test suite. Tests run against the real Next.js dev server with a mocked EIP-1193 browser wallet — no real wallet, no on-chain transactions required.

```bash
# Install deps (first time only)
npm install

# Run all tests — starts the dev server automatically
npm run test:e2e

# Interactive mode — watch each test run step-by-step in the browser
npx playwright test --ui

# Single file
npx playwright test e2e/connect.spec.ts
```

Covered flows: connect screen (no wallet, install error, page title, auto-detect, click-to-connect), wrong-network screen (display, chain ID, back-to-Hoodi transition), main UI (all cards rendered, connected address, ETH balance, token selector, registry empty state, balance display, token switching, pending unshield absence, mint button state), delegation section (section labels, buttons disabled before address entry, Grant Access and Revoke Access enabled after valid address entry).

Tests run automatically on CI for every pull request that touches `examples/example-hoodi/`.

---

## Going further

- **Additional tokens** — register new ERC-7984 pairs in the on-chain WrappersRegistry at `0x1807aE2f693F8530DFB126D0eF98F2F2518F292f`. The app picks them up automatically via `useListPairs` on the next load — no code change required.
- **Production use** — replace `cleartext()` with `web()` (browser) or `node()` (server) when targeting a chain with the full FHE co-processor (Sepolia, Mainnet).
- **Batch balance decryption** — for multiple tokens, use `useConfidentialBalances` (batch hook) to decrypt all balances in a single relayer call.
- **Optimistic balance updates** — for `useConfidentialTransfer`, pass `optimistic: true` to immediately update the cached confidential balance while the transaction confirms, then roll back automatically on error. Improves perceived responsiveness in production UIs.

---

## Tech stack

| Package                 | Version            | Role                                                                                                                                                                                                                             |
| ----------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@zama-fhe/sdk`         | see `package.json` | FHE core — `cleartext()`, chain presets, contract builders                                                                                                                                                                       |
| `@zama-fhe/react-sdk`   | see `package.json` | React hooks — `useListPairs`, `useHasPermit`, `useGrantPermit`, `useConfidentialTransfer`, `useUnshield`, `useConfidentialBalance`, `useDelegateDecryption`, `useRevokeDelegation`, `useDelegationStatus`, `useDecryptBalanceAs` |
| `wagmi`                 | ^3.7.1             | Injected-wallet and chain lifecycle                                                                                                                                                                                              |
| `viem`                  | ^2.55.0            | EVM types, encoding, and utilities                                                                                                                                                                                               |
| `@tanstack/react-query` | ^5.90.0            | Async state management                                                                                                                                                                                                           |
| `next`                  | ^16.0.0            | React framework (App Router)                                                                                                                                                                                                     |
| **Chain**               | Hoodi testnet      | chainId 560048                                                                                                                                                                                                                   |
