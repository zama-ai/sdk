# Integrating Zama Confidential Tokens (ERC-7984) on Hoodi

**Audience:** Partners integrating Zama confidential tokens on the Hoodi testnet (ethers-based stack).

**What this document covers:** context and motivation, how the cleartext stack works, prerequisites, step-by-step operation walkthrough, minting instructions, environment variable reference, and troubleshooting.

**Chain:** Hoodi testnet (chainId 560048)

---

## Context

ERC-7984 is a token standard that adds **confidential balances and transfer amounts** to ERC-20 tokens. Instead of storing plaintext balances on-chain, balances are stored as encrypted handles. Only the token owner can decrypt their own balance.

The **Zama SDK** (`@zama-fhe/sdk`, `@zama-fhe/react-sdk`) handles all cryptographic operations — encryption, decryption, EIP-712 signing — behind simple React hooks (`useShield`, `useConfidentialTransfer`, `useUnshield`, `useConfidentialBalance`).

This example uses the **cleartext stack** (`RelayerCleartext`), which is Zama's lightweight backend for chains where the full FHE co-processor is not deployed (including Hoodi). See [How the cleartext stack works](#how-the-cleartext-stack-works) below.

---

## What this example demonstrates

> Any EIP-1193 browser wallet (Rabby, Phantom…) can interact with ERC-7984 confidential tokens on Hoodi using the Zama SDK's ethers integration and the cleartext backend — with no external relayer service and no API key.

Specifically:

1. A user connects any injected EIP-1193 wallet.
2. They can select between two tokens (USDT Mock / Test Token).
3. All four ERC-7984 protocol operations work end-to-end.

---

## Supported operations

| Operation                    | SDK hook                  | Transactions          |
| ---------------------------- | ------------------------- | --------------------- |
| Decrypt confidential balance | `useConfidentialBalance`  | 0 (read)              |
| Shield (ERC-20 → cToken)     | `useShield`               | 2 (approve + wrap)    |
| Confidential transfer        | `useConfidentialTransfer` | 1                     |
| Unshield (cToken → ERC-20)   | `useUnshield`             | 2 (unwrap + finalize) |

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
- The `RelayerCleartext` class acts as a local relayer: it reads plaintexts directly from the executor contract and produces mock KMS signatures locally
- **No external service** is required — no relayer URL, no API key

The SDK interface is identical in both modes. From the application developer's perspective, you swap `RelayerWeb` (or `RelayerNode`) for `RelayerCleartext` and point it at the Hoodi preset config. All hooks behave the same way.

```
Full FHE stack (Sepolia / Mainnet)      Cleartext stack (Hoodi)
──────────────────────────────────      ──────────────────────────────────────
RelayerWeb → external HTTP service      RelayerCleartext → on-chain executor
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
@zama-fhe/sdk (ZamaSDK)
  ├─ EthersSigner   → hybrid EIP-1193 provider
  │    ├─ reads     → JsonRpcProvider(HOODI_RPC_URL) — direct, fast receipt polling
  │    └─ writes    → injected wallet (signing, account management)
  └─ RelayerCleartext → hoodiCleartextConfig
       └─ reads plaintexts from CleartextFHEVMExecutor (on-chain, Hoodi)
       └─ produces mock KMS signatures locally (no external call)
```

**Hybrid EIP-1193 provider:** read-only RPC calls (e.g. `eth_call`, `eth_getTransactionReceipt`) are routed to a direct `JsonRpcProvider` pointed at the Hoodi RPC. Wallet-specific calls (account management, signing) go through the injected wallet. This ensures receipt polling is fast and reliable — the wallet's own RPC endpoint can lag by up to a minute on Hoodi testnet.

**Wallet-switch lifecycle:** on every account change, `ZamaProvider` remounts with a fresh `EthersSigner` so the new account's address is used immediately. An EIP-712 session credential is cached in IndexedDB (`sessionStorage={indexedDBStorage}`) so it survives remounts without prompting the user again.

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

Both `USDTMock` and `Test Token` have a permissionless `mint(address to, uint256 amount)` function. See [Minting test tokens](#minting-test-tokens) below.

---

## Hoodi contract addresses

| Token      | ERC-20 address                               | ERC-7984 address (cToken / wrapper)          |
| ---------- | -------------------------------------------- | -------------------------------------------- |
| USDT Mock  | `0x51a63b5621D78dE54D2F4D098A23a5A69e76F30b` | `0x2dEBbe0487Ef921dF4457F9E36eD05Be2df1AC75` |
| Test Token | `0x7740F913dC24D4F9e1A72531372c3170452B2F87` | `0x7B1d59BbCD291DAA59cb6C8C5Bc04de1Afc4Aba1` |

Registry (DeploymentCoordinator): `0x1807aE2f693F8530DFB126D0eF98F2F2518F292f`

All contracts verified on [hoodi.etherscan.io](https://hoodi.etherscan.io).

---

## Minting test tokens

### Via the app

Click the **Mint** button next to the ERC-20 balance. This mints 10 whole tokens directly to your connected wallet using the token's `mint(address, uint256)` function.

### Via Etherscan

1. Go to the ERC-20 contract on [hoodi.etherscan.io](https://hoodi.etherscan.io) (e.g., `0x51a63b...` for USDT Mock).
2. Click the **Contract** tab → **Write Contract**.
3. Click **Connect to Web3** and connect your wallet.
4. Find the `mint` function, enter your wallet address and the desired amount in raw units (e.g., `10000000` for 10 USDT Mock, which has 6 decimals).
5. Click **Write** and confirm in your wallet.

### Via code

```ts
import { Contract, BrowserProvider, parseUnits } from "ethers";

const MINT_ABI = ["function mint(address to, uint256 amount)"];
const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Amounts are raw integers: use parseUnits to convert from human-readable values.
// USDT Mock has 6 decimals — 10 USDT = parseUnits("10", 6) = 10_000_000n
const usdtMock = new Contract("0x51a63b5621D78dE54D2F4D098A23a5A69e76F30b", MINT_ABI, signer);
await usdtMock.mint(await signer.getAddress(), parseUnits("10", 6));

// Test Token — verify its decimals on Etherscan or via useMetadata before minting.
const testToken = new Contract("0x7740F913dC24D4F9e1A72531372c3170452B2F87", MINT_ABI, signer);
await testToken.mint(
  await signer.getAddress(),
  parseUnits("10", 6 /* replace with actual decimals */),
);
```

---

## Step-by-step walkthrough

### Step 1 — Connect wallet

Open the app at [http://localhost:3000](http://localhost:3000) and click **Connect Wallet**.

The app calls `eth_requestAccounts` to connect, then `wallet_switchEthereumChain` (or `wallet_addEthereumChain` if Hoodi is not yet known to the wallet) to switch to Hoodi (chainId 560048 / `0x88bb0`). No further setup is needed.

Once connected, your wallet address and ETH balance appear at the top of the page.

If you switch to a different network after connecting, the app shows a full-page **Hoodi Network Required** screen with a **Switch to Hoodi** button. All operation buttons are disabled until you switch back.

### Step 2 — Select a token

Use the **Token** dropdown to select between **USDT Mock** and **Test Token**. The token name, symbol, and decimal precision are loaded from the chain via `useMetadata` (called once for the ERC-7984 wrapper and once for the underlying ERC-20).

### Step 3 — Mint tokens (if needed)

If your ERC-20 balance shows `0`, click **Mint** next to the ERC-20 balance, or use one of the manual methods above. The button mints 10 whole tokens to your wallet and refreshes the balance automatically.

### Step 4 — Check your balances

Two balances are displayed:

- **ERC-20 balance** — your public on-chain balance of the underlying token (e.g., USDTMock). Read via a standard `balanceOf` call.
- **Confidential balance** — your confidential cToken balance, read via `useConfidentialBalance`. The SDK reads the encrypted handle on-chain (Phase 1), then decrypts it via `RelayerCleartext` (Phase 2).

If you have never shielded any tokens, the confidential balance shows **—** — this is expected, as there is no encrypted balance to read yet.

On **first use** (or after clearing browser data), your wallet will request a one-time **EIP-712 session signature** to authorise the SDK to decrypt your balance. This credential is cached in IndexedDB (30-day TTL by default) and reused for all subsequent decryptions — you will not be prompted again until the session expires or you clear your browser storage.

### Step 5 — Shield (ERC-20 → cToken)

Enter a human-readable amount (e.g., `1.5`) and click **Shield**. This converts public ERC-20 tokens into confidential cTokens.

Under the hood, the SDK sequences two transactions automatically:

1. ERC-20 `approve` — authorises the wrapper contract to spend your tokens. The button shows **Shielding… (1/2)** immediately from the moment you click, while the approval is being processed.
2. `wrap` — locks the ERC-20 in the wrapper and mints the equivalent cToken amount. The button switches to **Shielding… (2/2)** once the approval is submitted — the SDK mines it automatically, then sends the wrap transaction.

Both transactions require wallet confirmation. Gas fees on Hoodi are effectively zero. The ERC-20 balance refreshes automatically on success.

### Step 6 — Confidential transfer

Enter a **recipient address** and an **amount**, then click **Transfer**. This sends cTokens to another address with the amount hidden on-chain.

The operation has two phases:

1. **FHE encryption** — the amount is encrypted locally by the SDK. The button shows **Encrypting…** during this phase (no wallet interaction).
2. **Transaction submission** — the encrypted transfer is sent on-chain. The button shows **Submitting…** and one wallet confirmation is required.

### Step 7 — Unshield (cToken → ERC-20)

Enter an amount and click **Unshield**. This converts cTokens back into public ERC-20 tokens.

Unshield is a two-phase operation:

1. **Unwrap** — a transaction that burns the cTokens and emits an `UnwrapRequested` event containing the encrypted amount handle. The button shows **Unshielding… (1/2)**. One wallet confirmation.
2. **Finalize** — the `RelayerCleartext` decrypts the amount locally (no external call, no wallet prompt), then submits a `finalizeUnwrap` transaction that releases the ERC-20 tokens. The button shows **Unshielding… (2/2)**. One wallet confirmation.

Both phases complete within seconds on Hoodi. The ERC-20 balance refreshes automatically on success.

**Tab close resilience:** if you close the tab after Phase 1 completes but before Phase 2 starts, the pending unshield is saved in IndexedDB. A **Pending Unshield** card will appear when you reopen the app, allowing you to resume finalization.

### Step 8 — Verify updated balances

After each operation, balances refresh automatically. The ERC-20 balance is re-fetched after shield and unshield. The confidential balance re-decrypts once the underlying handle changes on-chain.

---

## SDK integration details

### Providers setup

```tsx
// src/providers.tsx
import { RelayerCleartext, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { ZamaProvider, indexedDBStorage } from "@zama-fhe/react-sdk";
import { HOODI_RPC_URL } from "@/lib/config"; // process.env.NEXT_PUBLIC_HOODI_RPC_URL || fallback

// Route read-only RPC calls to a direct JsonRpcProvider for fast receipt polling.
// Wallet calls (signing, account management) are forwarded to the injected wallet.
// See providers.tsx for the full implementation (includes wallet-switch handling).
const hybridEthereum = createHybridEthereum(window.ethereum);
const signer = new EthersSigner({ ethereum: hybridEthereum });

// hoodiCleartextConfig contains the chainId, executor address, and ACL address for Hoodi.
// Override `network` to use a custom RPC endpoint.
const relayer = new RelayerCleartext({ ...hoodiCleartextConfig, network: HOODI_RPC_URL });

<ZamaProvider
  relayer={relayer}
  signer={signer}
  storage={indexedDBStorage}
  sessionStorage={indexedDBStorage} // persist EIP-712 session credentials across page reloads
>
  ...
</ZamaProvider>;
```

### Hook usage

```tsx
import { parseUnits } from "ethers";
import {
  useShield,
  useConfidentialTransfer,
  useUnshield,
  useConfidentialBalance,
  useMetadata,
} from "@zama-fhe/react-sdk";

// For ERC-7984 tokens: tokenAddress === wrapperAddress (same contract).
// The ERC-20 underlying address is separate — used for balance display and shield amounts.
const cTokenAddress = "0x..."; // ERC-7984 wrapper contract address
const erc20Address = "0x..."; // Underlying ERC-20 contract address

// Fetch decimal precision for each contract — they may differ.
// Use erc20Decimals for shield (amounts are in ERC-20 units).
// Use cTokenDecimals for transfer and unshield (amounts are in confidential token units).
const { data: cTokenMetadata } = useMetadata(cTokenAddress);
const { data: erc20Metadata } = useMetadata(erc20Address);
const cTokenDecimals = cTokenMetadata?.decimals ?? 0;
const erc20Decimals = erc20Metadata?.decimals ?? 0;

const shield = useShield({ tokenAddress: cTokenAddress, wrapperAddress: cTokenAddress });
const transfer = useConfidentialTransfer({ tokenAddress: cTokenAddress });
const unshield = useUnshield({ tokenAddress: cTokenAddress, wrapperAddress: cTokenAddress });
const balance = useConfidentialBalance({ tokenAddress: cTokenAddress });

// Shield: 2 transactions (approve + wrap).
// Amount is in ERC-20 units — use erc20Decimals to parse human-readable input.
// onApprovalSubmitted fires between the two transactions — use it to update the progress UI.
shield.mutate({
  amount: parseUnits("10", erc20Decimals),
  callbacks: { onApprovalSubmitted: () => setStep(2) },
});

// Transfer: FHE encryption (local) + 1 transaction.
// Amount is in confidential token units — use cTokenDecimals.
// onEncryptComplete fires when encryption is done, before the tx is submitted.
transfer.mutate({
  to: "0xRecipient",
  amount: parseUnits("5", cTokenDecimals),
  callbacks: { onEncryptComplete: () => setStep(2) },
});

// Unshield: 2 transactions (unwrap + finalizeUnwrap).
// Amount is in confidential token units — use cTokenDecimals.
// onFinalizing fires between the two transactions — use it to update the progress UI.
unshield.mutate({
  amount: parseUnits("2", cTokenDecimals),
  callbacks: { onFinalizing: () => setStep(2) },
});
```

---

## Environment variables

| Variable                    | Required | Default                            | Description                                                                    |
| --------------------------- | -------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_HOODI_RPC_URL` | No       | `https://rpc.hoodi.ethpandaops.io` | Override the Hoodi RPC endpoint. Infura: `https://hoodi.infura.io/v3/YOUR_KEY` |

Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_HOODI_RPC_URL` if you want to use a private RPC endpoint. Leaving the value empty is safe — the app falls back to the public endpoint automatically.

---

## Troubleshooting

| Symptom                                                   | Likely cause                                                            | Fix                                                                                                                                   |
| --------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| "No wallet found" on connect                              | No EIP-1193 wallet extension installed                                  | Install an EIP-1193 browser wallet ([Rabby](https://rabby.io) recommended; MetaMask or Phantom also work)                             |
| Phantom shows a multi-chain connect dialog                | Phantom's generic picker — app auto-selects Phantom's Ethereum provider | Proceed normally; only Ethereum accounts are used. For a cleaner experience use [Rabby](https://rabby.io)                             |
| Stuck on "Connect Wallet" after clicking                  | Wallet popup was dismissed or blocked                                   | Open your wallet manually and approve the connection request                                                                          |
| Network switch fails with error                           | Wallet cannot reach the Hoodi RPC                                       | Check `NEXT_PUBLIC_HOODI_RPC_URL`; try the default `https://rpc.hoodi.ethpandaops.io`                                                 |
| Wrong network screen appears                              | Wallet switched away from Hoodi                                         | Click **Switch to Hoodi** to switch back to Hoodi                                                                                     |
| ERC-20 balance shows `—`                                  | Not yet connected or query pending                                      | Wait for the connection to complete                                                                                                   |
| ERC-20 balance shows `0`                                  | Tokens not yet minted                                                   | Click the **Mint** button or use one of the methods in [Minting test tokens](#minting-test-tokens)                                    |
| Confidential balance shows `—` immediately after connect  | No shielded balance yet — no encrypted handle to read                   | Shield some tokens first; the balance will display once there is something to decrypt                                                 |
| "Decrypting…" stays indefinitely                          | Wallet EIP-712 signature request was missed (small notification badge)  | Open your wallet and approve the pending signature request; balance will update immediately                                           |
| Asked to sign an EIP-712 message after each action        | Session not yet cached, or session expired (default TTL: 30 days)       | Approve the signing request once; subsequent decryptions reuse the cached session automatically                                       |
| Shield fails immediately after approving spend cap        | Approval transaction not yet confirmed on Hoodi when wrap was attempted | Wait for the approval confirmation and retry — the app detects this and shows a hint                                                  |
| Shield fails after a recent transfer or other operation   | Pending transaction in the mempool caused a nonce conflict              | Wait for all pending transactions to confirm, then retry                                                                              |
| Shield stuck on "Shielding… (1/2)"                        | Ran out of Hoodi ETH after the approval transaction                     | Top up your wallet with Hoodi ETH and try again                                                                                       |
| Shield completes but balances unchanged                   | Decimal mismatch — wrong number of decimals used to parse the amount    | Ensure the amount input uses the ERC-20 contract's decimals (not the ERC-7984 token's); call `useMetadata` on both contracts          |
| "Transaction reverted" on any operation                   | Insufficient token balance, or wrong network                            | Verify you are on Hoodi (chainId 560048) and have sufficient tokens                                                                   |
| Unshield shows "Unshielding… (2/2)" for longer than usual | Finalize phase waiting for the unwrap receipt                           | Normal — wait for both wallet confirmations; the app polls via the direct Hoodi RPC for speed                                         |
| Pending unshield card appears on reload                   | Tab was closed between Phase 1 and Phase 2 of an unshield               | Click **Finalize** in the Pending Unshield card to complete the operation and receive your ERC-20 tokens                              |
| Amounts displayed as very large or very small numbers     | Raw units displayed without decimal conversion                          | Always use `formatUnits(balance, decimals)` for display and `parseUnits(input, decimals)` for input; fetch decimals via `useMetadata` |

---

## Running tests

This example ships with a Playwright e2e test suite. Tests run against the real Next.js dev server with a mocked EIP-1193 browser wallet — no real wallet, no on-chain transactions required.

```bash
# Install deps (first time only)
npm install

# Run all 18 tests — starts the dev server automatically
npm run test:e2e

# Interactive mode — watch each test run step-by-step in the browser
npx playwright test --ui

# Single file
npx playwright test e2e/connect.spec.ts
```

Covered flows: connect screen (no wallet, install error, auto-detect, click-to-connect), wrong-network screen (display, chain ID, switch button), main UI (cards, token selector, buttons disabled before metadata loads, balance display, loading hint, token switching, pending unshield absence, mint button state).

Tests run automatically on CI for every pull request that touches `examples/example-hoodi/`.

---

## Going further

- **Additional tokens** — add entries to the `TOKENS` constant in `src/app/page.tsx` with the ERC-20 address and the ERC-7984 wrapper address. Both can be found in the registry at `0x1807aE2f693F8530DFB126D0eF98F2F2518F292f`.
- **Production use** — replace `RelayerCleartext` with `RelayerWeb` (browser) or `RelayerNode` (server) when targeting a chain with the full FHE co-processor (Sepolia, Mainnet).
- **Batch balance decryption** — for multiple tokens, use `useConfidentialBalances` (batch hook) to decrypt all balances in a single relayer call.
- **Optimistic balance updates** — pass `optimistic: true` to `useShield` to immediately add the shielded amount to the cached confidential balance while the transaction confirms, then roll back automatically on error. Improves perceived responsiveness in production UIs.
- **On-chain ACL delegation** — grant another wallet the right to decrypt your confidential balance via `useDelegateDecryption`, revoke it with `useRevokeDelegation`, and let delegates decrypt on your behalf with `useDecryptBalanceAs`.

---

## Tech stack

| Package                 | Version       | Role                                                                                                         |
| ----------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| `@zama-fhe/sdk`         | 1.2.0-alpha.5 | FHE core — `RelayerCleartext`, `EthersSigner`, contract builders                                             |
| `@zama-fhe/react-sdk`   | 1.2.0-alpha.5 | React hooks — `useShield`, `useConfidentialTransfer`, `useUnshield`, `useConfidentialBalance`, `useMetadata` |
| `ethers`                | ^6.13.0       | Ethereum client (via `EthersSigner`)                                                                         |
| `@tanstack/react-query` | ^5.90.0       | Async state management                                                                                       |
| `next`                  | ^16.0.0       | React framework (App Router)                                                                                 |
| **Chain**               | Hoodi testnet | chainId 560048                                                                                               |
