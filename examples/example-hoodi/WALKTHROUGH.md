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

## What this demo proves

> A standard MetaMask wallet can interact with ERC-7984 confidential tokens on Hoodi using the Zama SDK's ethers integration and the cleartext backend — with no external relayer service and no API key.

Specifically:

1. A user connects MetaMask (or any injected EIP-1193 wallet).
2. They can select between two token pairs (USDT Mock / Test Token).
3. All four ERC-7984 protocol operations work end-to-end.

---

## Supported operations

| Operation                    | SDK hook                  | Status      |
| ---------------------------- | ------------------------- | ----------- |
| Decrypt confidential balance | `useConfidentialBalance`  | ✅ Verified |
| Shield (ERC-20 → cToken)     | `useShield`               | ✅ Verified |
| Confidential transfer        | `useConfidentialTransfer` | ✅ Verified |
| Unshield (cToken → ERC-20)   | `useUnshield`             | ✅ Verified |

---

## Wallet compatibility

| Wallet type                        | Supported | Notes                                                                                              |
| ---------------------------------- | --------- | -------------------------------------------------------------------------------------------------- |
| MetaMask (EOA)                     | Yes       | Fully tested — this demo                                                                           |
| Any injected EIP-1193 wallet (EOA) | Yes       | Must support `wallet_switchEthereumChain` / `wallet_addEthereumChain`                              |
| Smart account (ERC-4337)           | No        | The Zama relayer uses ECDSA (`ecrecover`) — smart account signing key differs from account address |

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
User (MetaMask)
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
  │    ├─ eth_call  → JsonRpcProvider(HOODI_RPC) — direct Hoodi RPC, bypasses MetaMask routing
  │    └─ all other → MetaMask → Hoodi
  └─ RelayerCleartext → hoodiCleartextConfig
       └─ reads plaintexts from CleartextFHEVMExecutor (on-chain, Hoodi)
       └─ produces mock KMS signatures locally (no external call)
```

The hybrid EIP-1193 provider is necessary because MetaMask's `BrowserProvider` routes `eth_call` through its own network detection, which can target the wrong chain if MetaMask was on a different network when the provider was initialised. Routing reads directly to a `JsonRpcProvider` pointed at the known-good Hoodi RPC eliminates this issue.

---

## Prerequisites

### 1. MetaMask

Install [MetaMask](https://metamask.io) and create or import a wallet. The app automatically adds the Hoodi network when you connect.

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

### Via Etherscan

1. Go to the ERC-20 contract on [hoodi.etherscan.io](https://hoodi.etherscan.io) (e.g., `0x51a63b...` for USDT Mock).
2. Click the **Contract** tab → **Write Contract**.
3. Click **Connect to Web3** and connect MetaMask.
4. Find the `mint` function, enter your wallet address and the desired amount (in wei — e.g., `1000` for 1000 tokens with 0 decimals, or `1000000000` for tokens with 6 decimals).
5. Click **Write** and confirm in MetaMask.

### Via code

```ts
import { Contract, BrowserProvider } from "ethers";

const MINT_ABI = ["function mint(address to, uint256 amount)"];
const provider = new BrowserProvider(window.ethereum);
const signer = await provider.getSigner();

// Mint USDT Mock
const usdtMock = new Contract("0x51a63b5621D78dE54D2F4D098A23a5A69e76F30b", MINT_ABI, signer);
await usdtMock.mint(await signer.getAddress(), 1000n);

// Mint Test Token
const testToken = new Contract("0x7740F913dC24D4F9e1A72531372c3170452B2F87", MINT_ABI, signer);
await testToken.mint(await signer.getAddress(), 1000n);
```

---

## Step-by-step walkthrough

### Step 1 — Connect wallet

Open the app at [http://localhost:3000](http://localhost:3000) and click **Connect MetaMask**.

The app calls `eth_requestAccounts` to connect, then `wallet_switchEthereumChain` (or `wallet_addEthereumChain` if Hoodi is not yet in MetaMask) to switch to Hoodi (chainId 560048 / 0x88BB0). No further setup is needed.

Once connected, your wallet address appears at the top of the page.

If you switch MetaMask to a different network after connecting, a yellow warning banner appears with a **Switch to Hoodi** button. All operation buttons are disabled until you switch back.

### Step 2 — Select a token

Use the **Token** dropdown to select between **USDT Mock** and **Test Token**. The token name, symbol, and decimal precision are loaded from the chain via `useMetadata`.

### Step 3 — Mint tokens (if needed)

If your ERC-20 balance shows `0`, mint test tokens using one of the methods above before shielding.

### Step 4 — Check your balances

Two balances are displayed:

- **ERC-20 balance** — your public on-chain balance of the underlying token (e.g., USDTMock). Read via a standard `balanceOf` call against the Hoodi RPC.
- **Confidential balance** — your encrypted cToken balance, decrypted locally via `useConfidentialBalance`. In cleartext mode the `RelayerCleartext` reads the plaintext directly from the `CleartextFHEVMExecutor` contract — no wallet signature is required.

### Step 5 — Shield (ERC-20 → cToken)

Enter an amount and click **Shield**. This converts public ERC-20 tokens into confidential cTokens.

Under the hood, the SDK sequences two transactions automatically:

1. ERC-20 `approve` — authorises the wrapper contract to spend your tokens
2. `wrap` — locks the ERC-20 in the wrapper and mints the equivalent cToken amount

Both transactions require MetaMask confirmation. Gas fees on Hoodi are effectively zero. The ERC-20 balance refreshes automatically on success.

### Step 6 — Confidential transfer

Enter a **recipient address** and an **amount**, then click **Transfer**. This sends cTokens to another address with the amount hidden on-chain.

The SDK encrypts the amount locally before submitting the transaction. One MetaMask confirmation is required.

### Step 7 — Unshield (cToken → ERC-20)

Enter an amount and click **Unshield**. This converts cTokens back into public ERC-20 tokens.

Unshield is a two-phase operation:

1. **Unwrap** — a transaction that burns the cTokens and emits an `UnwrapRequested` event containing the encrypted amount handle. One MetaMask confirmation.
2. **Finalize** — the `RelayerCleartext` decrypts the amount locally (no external call, no wallet prompt), then submits a `finalizeUnwrap` transaction that releases the ERC-20 tokens. One MetaMask confirmation.

Both phases complete within seconds on Hoodi. The ERC-20 balance refreshes automatically on success.

### Step 8 — Verify updated balances

After each operation, balances refresh automatically. The ERC-20 balance is re-fetched after shield and unshield. The confidential balance updates as the SDK cache is invalidated.

---

## SDK integration details

### Providers setup

```tsx
// src/providers.tsx
import { RelayerCleartext, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { ZamaProvider, indexedDBStorage } from "@zama-fhe/react-sdk";

// Route eth_call to a direct JsonRpcProvider; signing stays in MetaMask.
const hybridEthereum = createHybridEthereum(window.ethereum);
const signer = new EthersSigner({ ethereum: hybridEthereum });

const relayer = new RelayerCleartext(hoodiCleartextConfig);
// hoodiCleartextConfig = {
//   chainId: 560048,
//   network: "https://rpc.hoodi.ethpandaops.io",
//   aclContractAddress: "0x6D3FAf6f86e1fF9F3B0831Dda920AbA1cBd5bd68",
//   executorAddress: "0xC316692627de536368d82e9121F1D44a550894E6",
//   ...
// }

// No proxy route needed — RelayerCleartext reads on-chain directly
<ZamaProvider relayer={relayer} signer={signer} storage={indexedDBStorage}>
  ...
</ZamaProvider>;
```

### Hook usage

```tsx
// tokenAddress = wrapperAddress = the ERC-7984 (cToken) address
// The underlying ERC-20 is resolved automatically by the SDK via underlying()
const shield = useShield({ tokenAddress: cTokenAddress, wrapperAddress: cTokenAddress });
const transfer = useConfidentialTransfer({ tokenAddress: cTokenAddress });
const unshield = useUnshield({ tokenAddress: cTokenAddress, wrapperAddress: cTokenAddress });
const balance = useConfidentialBalance({ tokenAddress: cTokenAddress });

// Shield: 2 transactions (approve + wrap)
shield.mutate({ amount: 1000n });

// Transfer: 1 transaction (amount encrypted by SDK)
transfer.mutate({ to: "0xRecipient", amount: 500n });

// Unshield: 2 transactions (unwrap + finalizeUnwrap), automatic finalization
unshield.mutate({ amount: 200n });
```

---

## Environment variables

| Variable                    | Required | Default                            | Description                                                                    |
| --------------------------- | -------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_HOODI_RPC_URL` | No       | `https://rpc.hoodi.ethpandaops.io` | Override the Hoodi RPC endpoint. Infura: `https://hoodi.infura.io/v3/YOUR_KEY` |

Copy `.env.example` to `.env.local` and fill in `NEXT_PUBLIC_HOODI_RPC_URL` if you want to use a private RPC endpoint.

---

## Troubleshooting

| Symptom                                                   | Likely cause                                                     | Fix                                                                                                      |
| --------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| "MetaMask not found" on connect                           | MetaMask extension not installed                                 | Install MetaMask from [metamask.io](https://metamask.io)                                                 |
| Stuck on "Connect MetaMask" after clicking                | MetaMask popup was dismissed or blocked                          | Open MetaMask manually and approve the connection request                                                |
| Network switch fails with error                           | MetaMask cannot reach the Hoodi RPC                              | Check `NEXT_PUBLIC_HOODI_RPC_URL`; try the default `https://rpc.hoodi.ethpandaops.io`                    |
| Yellow "Wrong network" banner appears                     | MetaMask switched away from Hoodi                                | Click **Switch to Hoodi** in the banner                                                                  |
| ERC-20 balance shows `—`                                  | Not yet connected or query pending                               | Wait for the connection to complete                                                                      |
| ERC-20 balance shows `0`                                  | Tokens not yet minted                                            | Mint tokens via Etherscan or the code snippet above                                                      |
| Shield fails — approve confirmed but wrap never submitted | Ran out of Hoodi ETH between the two transactions                | Top up your wallet and try again                                                                         |
| "Transaction confirmed!" but balance unchanged            | MetaMask was on the wrong network at the time of the transaction | Verify the yellow banner is absent (Hoodi active) before retrying                                        |
| Unshield shows "Unshielding..." for longer than usual     | Finalize phase waiting for the unwrap receipt                    | Normal — wait for both MetaMask confirmations                                                            |
| "Transaction reverted" on any operation                   | Insufficient token balance, or wrong network                     | Verify you are on Hoodi (chainId 560048) and have sufficient tokens                                      |
| Amounts look wrong (e.g. off by 10^6)                     | Mixing raw units and display units                               | Amounts in the SDK are raw integers — use the `decimals` field from `useMetadata` to convert for display |

---

## Going further

- **Additional token pairs** — add entries to the `TOKENS` constant in `page.tsx` using addresses from the registry at `0x1807aE2f693F8530DFB126D0eF98F2F2518F292f`.
- **Production use** — replace `RelayerCleartext` with `RelayerWeb` (browser) or `RelayerNode` (server) when targeting a chain with the full FHE co-processor (Sepolia, Mainnet).
- **Batch balance decryption** — for multiple tokens, use `useConfidentialBalances` (batch hook) to decrypt all balances with a single EIP-712 signature.

---

## Tech stack

| Package                 | Version       | Role                                                                                          |
| ----------------------- | ------------- | --------------------------------------------------------------------------------------------- |
| `@zama-fhe/sdk`         | prerelease    | FHE core — `RelayerCleartext`, `EthersSigner`, contract builders                              |
| `@zama-fhe/react-sdk`   | prerelease    | React hooks — `useShield`, `useConfidentialTransfer`, `useUnshield`, `useConfidentialBalance` |
| `ethers`                | ^6.13.0       | Ethereum client (via `EthersSigner`)                                                          |
| `@tanstack/react-query` | ^5.90.0       | Async state management                                                                        |
| `next`                  | ^16.0.0       | React framework (App Router)                                                                  |
| **Chain**               | Hoodi testnet | chainId 560048                                                                                |
