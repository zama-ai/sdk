# Using Zama Confidential Tokens (ERC-7984) with a Ledger Hardware Wallet

**Audience:** Developers integrating Zama confidential tokens on the Hoodi testnet using a **Ledger hardware device** directly in the browser — no MetaMask, no browser extension wallet required.

**What this document covers:** architecture rationale, device compatibility, how the cleartext stack works, prerequisites, step-by-step operation walkthrough, SDK integration details, and troubleshooting.

**Chain:** Hoodi testnet (chainId 560048)

---

## Context

ERC-7984 is a token standard that adds **confidential balances and transfer amounts** to ERC-20 tokens. Instead of storing plaintext balances on-chain, balances are stored as encrypted handles. Only the token owner can decrypt their own balance.

The **Zama SDK** (`@zama-fhe/sdk`, `@zama-fhe/react-sdk`) handles all cryptographic operations — encryption, decryption, EIP-712 signing — behind simple React hooks (`useConfidentialTransfer`, `useUnshield`, `useConfidentialBalance`) and the `Token` API (`sdk.createToken().shield()`).

This example uses the **cleartext stack** (`RelayerCleartext`), which is Zama's lightweight backend for chains where the full FHE co-processor is not deployed (including Hoodi). See [How the cleartext stack works](#how-the-cleartext-stack-works) below.

---

## What this example demonstrates

> A Ledger hardware device can interact directly with ERC-7984 confidential tokens on Hoodi — without any browser extension wallet — using the Zama SDK's ethers integration and a custom EIP-1193 provider built on `@ledgerhq/hw-transport-webhid`.

Specifically:

1. The user connects any supported Ledger device (Nano S, Nano S Plus, Nano X, Stax, Flex) via USB/WebHID.
2. They can select between available tokens loaded from the on-chain registry.
3. All ERC-7984 protocol operations work end-to-end: shield, transfer, unshield, balance decryption, and on-chain ACL delegation (grant, revoke, decrypt-as).
4. Transaction signing, EIP-712 signatures, and address retrieval all happen on the physical device — no hot wallet involved.

---

## Supported operations

| Operation                    | SDK API                                                | Source file                                            | Transactions          |
| ---------------------------- | ------------------------------------------------------ | ------------------------------------------------------ | --------------------- |
| Decrypt confidential balance | `useIsAllowed` + `useAllow` + `useConfidentialBalance` | `src/app/page.tsx` + `src/components/BalancesCard.tsx` | 0 (read)              |
| Shield (ERC-20 → cToken)     | `sdk.createToken().shield()`                           | `src/components/ShieldCard.tsx`                        | 1–3 (wrap, ± approve) |
| Confidential transfer        | `useConfidentialTransfer`                              | `src/components/TransferCard.tsx`                      | 1                     |
| Unshield (cToken → ERC-20)   | `useUnshield`                                          | `src/components/UnshieldCard.tsx`                      | 2 (unwrap + finalize) |
| Grant decryption access      | `useDelegateDecryption`                                | `src/components/DelegateDecryptionCard.tsx`            | 1                     |
| Revoke decryption access     | `useRevokeDelegation`                                  | `src/components/RevokeDelegationCard.tsx`              | 1                     |
| Decrypt balance as delegate  | `useDecryptBalanceAs` + `useDelegationStatus`          | `src/components/DecryptAsCard.tsx`                     | 0 (read)              |

---

## Device compatibility

| Device             | Supported | Signing method                                     | Notes                                                             |
| ------------------ | --------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| Ledger Nano S      | Yes       | `signEIP712HashedMessage` (pre-hashed, blind sign) | Device shows generic "Sign typed data?" screen — no field details |
| Ledger Nano S Plus | Yes       | `signEIP712Message` (full field display)           | Device shows each field name and value                            |
| Ledger Nano X      | Yes       | `signEIP712Message` (full field display)           | Device shows each field name and value                            |
| Ledger Stax        | Yes       | `signEIP712Message` (full field display)           | Device shows each field name and value                            |
| Ledger Flex        | Yes       | `signEIP712Message` (full field display)           | Device shows each field name and value                            |

The app auto-detects the device tier at runtime (see [Two-tier EIP-712 signing](#two-tier-eip-712-signing) below). No manual configuration is required.

**Browser requirement:** WebHID is a Chromium-only API. Use **Chrome, Edge, or Brave**. Firefox and Safari are not supported.

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
Ledger device (hardware)
  │  USB / WebHID
  ▼
LedgerWebHIDProvider (src/lib/LedgerWebHIDProvider.ts)
  │  Implements EIP-1193
  ├─ signing methods     → hw-app-eth (on-device: getAddress, signTransaction,
  │                                    signPersonalMessage, signEIP712Message /
  │                                    signEIP712HashedMessage)
  └─ read-only methods   → JsonRpcProvider (HOODI_RPC_URL)
       │
       ▼
providers.tsx — EthersSigner + RelayerCleartext + ZamaProvider
  │
  ▼
page.tsx — sdk.createToken().shield() / useConfidentialTransfer / useUnshield
         / useConfidentialBalance / useDelegateDecryption / useRevokeDelegation
         / useDecryptBalanceAs
  │
  ▼
@zama-fhe/react-sdk (React hooks + ZamaProvider)
  │
  ▼
@zama-fhe/sdk (ZamaSDK)
  ├─ EthersSigner   → ledgerProvider (EIP-1193 singleton)
  └─ RelayerCleartext → hoodiCleartextConfig
       └─ reads plaintexts from CleartextFHEVMExecutor (on-chain, Hoodi)
       └─ produces mock KMS signatures locally (no external call)
```

**Module-level singleton:** `ledgerProvider` (exported from `LedgerWebHIDProvider.ts`) is a single `LedgerWebHIDProvider` instance shared between `providers.tsx` (signing, used by `EthersSigner`) and `page.tsx` (connect UI, `ledgerProvider.connect()`). This ensures both consumers use the same transport state and address.

**`walletKey` pattern:** when the device reports a new account (via the `accountsChanged` event), `walletKey` is incremented, which recreates the `EthersSigner` useMemo in `providers.tsx`. The new signer is passed as a prop to `ZamaProvider`, which picks up the new account without a full subtree remount (`key=` is intentionally not used on `ZamaProvider`).

**`getActiveUnshieldToken` bridge** (`src/lib/activeUnshield.ts`): module-level variable that stores the token address of an in-flight unshield. `ZamaSDKEvents.UnshieldPhase1Submitted` does not carry the token address, so `UnshieldCard` sets this variable just before calling `mutate()`. The `onEvent` handler in `providers.tsx` reads it to call `savePendingUnshield` with the correct wrapper address. A module-level variable is safe here — only one unshield can be in flight per browser tab.

**Separate IndexedDB instances:** `ZamaProvider` requires separate `IndexedDBStorage` instances for `storage` (credentials / ML-KEM keypair) and `sessionStorage` (EIP-712 session signatures). Both use the same key internally — sharing a single instance causes the session entry to overwrite the encrypted keypair, forcing a re-sign on every balance decryption.

---

## Two-tier EIP-712 signing

The Zama SDK requires EIP-712 signatures for balance decryption and delegation operations. The Ledger Ethereum app exposes two signing paths, depending on firmware capabilities:

**Tier 1 — `signEIP712Message` (Nano X, Nano S Plus, Stax, Flex)**

The full typed-data structure is sent to the device. The Ethereum app parses it and displays each field name and value on-screen. The user can verify what they are signing field by field before approving.

**Tier 2 — `signEIP712HashedMessage` (Nano S fallback)**

The Nano S firmware does not support full typed-data display. The app pre-hashes the domain and message locally using `ethers.TypedDataEncoder`, then sends the two 32-byte hashes to the device. The device shows a generic "Sign typed data? ⚠️" prompt without field details.

The `LedgerWebHIDProvider` tries Tier 1 first and automatically falls back to Tier 2 if the device rejects the `signEIP712Message` call (typically `"0x6984"` status). No configuration is needed.

---

## Prerequisites

### 1. Chromium-based browser

WebHID (the USB communication layer used by this example) is available in:

- Google Chrome 89+
- Microsoft Edge 89+
- Brave 1.30+

Firefox and Safari are **not supported**.

### 2. Ledger device + Ethereum app

Any of: Nano S, Nano S Plus, Nano X, Stax, Flex.

Steps before connecting:

1. Unlock the device with your PIN.
2. Open the **Ethereum** app on the device. The screen should read "Application is ready".
3. In the Ethereum app settings, ensure **Blind signing** is enabled if you are using a Nano S (required for the `signEIP712HashedMessage` fallback path).

> On Nano S Plus, Nano X, Stax, and Flex, blind signing is not required — the app uses full EIP-712 field display instead.

### 3. Hoodi ETH (gas)

All on-chain operations require Hoodi ETH. Aim for at least **0.01 ETH** before starting — shield and unshield each involve multiple transactions.

Recommended faucets:

- [hoodi-faucet.pk910.de](https://hoodi-faucet.pk910.de) — proof-of-work faucet, unlimited
- [faucet.quicknode.com](https://faucet.quicknode.com/ethereum/hoodi) — requires QuickNode account

### 4. Test tokens

Available tokens have a permissionless `mint(address to, uint256 amount)` function. See [Minting test tokens](#minting-test-tokens) below.

---

## Hoodi contract addresses

| Token      | ERC-20                                       | ERC-7984 (cToken / wrapper)                  |
| ---------- | -------------------------------------------- | -------------------------------------------- |
| USDT Mock  | `0x51a63b5621D78dE54D2F4D098A23a5A69e76F30b` | `0x2dEBbe0487Ef921dF4457F9E36eD05Be2df1AC75` |
| Test Token | `0x7740F913dC24D4F9e1A72531372c3170452B2F87` | `0x7B1d59BbCD291DAA59cb6C8C5Bc04de1Afc4Aba1` |

Registry (DeploymentCoordinator): `0x1807aE2f693F8530DFB126D0eF98F2F2518F292f`

All contracts verified on [hoodi.etherscan.io](https://hoodi.etherscan.io).

> Token pairs are loaded dynamically from the on-chain WrappersRegistry at runtime — `src/app/page.tsx` contains no hardcoded token addresses. If contracts are redeployed, only the registry needs updating; the app picks up new addresses automatically.

---

## Minting test tokens

### Via the app

Click the **Mint** button next to the ERC-20 balance. This mints 10 whole tokens directly to your connected Ledger address using the token's `mint(address, uint256)` function. You will need to confirm the transaction on the device.

### Via Etherscan

1. Go to the ERC-20 contract on [hoodi.etherscan.io](https://hoodi.etherscan.io).
2. Click the **Contract** tab → **Write Contract**.
3. Click **Connect to Web3** and connect a wallet.
4. Find the `mint` function, enter your Ledger address and the desired amount in raw units (e.g., `10000000` for 10 USDT Mock, which has 6 decimals).
5. Click **Write** and confirm in your wallet.

### Via code

```ts
import { Contract, JsonRpcProvider, Wallet, parseUnits } from "ethers";

const MINT_ABI = ["function mint(address to, uint256 amount)"];
const provider = new JsonRpcProvider("https://rpc.hoodi.ethpandaops.io");
const signer = new Wallet("0xYOUR_PRIVATE_KEY", provider);

// Amounts are raw integers: use parseUnits to convert from human-readable values.
const token = new Contract("0x51a63b5621D78dE54D2F4D098A23a5A69e76F30b", MINT_ABI, signer);
await token.mint("0xYOUR_LEDGER_ADDRESS", parseUnits("10", 6)); // 6 decimals
```

---

## Step-by-step walkthrough

### Step 1 — Connect the Ledger device

Ensure the Ledger is unlocked with the **Ethereum app open** ("Application is ready"), then open the app at [http://localhost:3000](http://localhost:3000).

**Account selection:** before connecting, use the **Account (BIP-44 index)** dropdown to choose which derived address to use. Index _n_ maps to BIP-44 path `m/44'/60'/0'/0/n`; the dropdown offers accounts #0 through #4. The default is account #0.

Click **Connect Ledger**. The browser opens a **WebHID device picker** listing all compatible HID devices. Select your Ledger device. The app then:

1. Calls `TransportWebHID.create()` to open the transport.
2. Reads the Ethereum address at the selected BIP-44 path via `hw-app-eth.getAddress()`.
3. Sets the address in state and emits an `accountsChanged` event.

Once connected, your Ledger address, ETH balance, and account index appear at the top of the page. No network switch is needed — transactions are signed and broadcast directly to the Hoodi RPC by the provider.

**Verify address:** after connecting, the header shows a **Verify address** button. Clicking it calls `getAddress(path, display:true)` — the device screen shows the derived address so you can compare it with what the browser displays (anti-phishing check). The button label updates to **✓ Verified** for 4 seconds, then resets.

**Disconnect recovery:** if the device is physically unplugged mid-session, `LedgerWebHIDProvider` detects the transport `disconnect` event, resets its internal state, and emits EIP-1193 `accountsChanged` (with `[]`) and `disconnect` events. The app returns to the connect screen automatically — no page reload required. You can reconnect by clicking **Connect Ledger** again.

### Step 2 — Select a token

Use the **Token** dropdown to select between available tokens. Pairs are loaded from the on-chain **WrappersRegistry** via `useListPairs({ metadata: true })` — no hardcoded addresses needed. Name, symbol, and decimal precision are included in the registry response.

### Step 3 — Mint tokens (if needed)

If your ERC-20 balance shows `0`, click **Mint** next to the ERC-20 balance to mint 10 whole tokens. You will need to confirm the transaction on the Ledger device. The balance refreshes automatically.

> On the **Nano S**, the device shows the contract address and amount in the transaction confirmation screen. On **Nano S Plus / Nano X / Stax / Flex**, individual field labels are shown.

### Step 4 — Check your balances

Two balances are displayed:

- **ERC-20 balance** — your public on-chain balance of the underlying token. Read via a standard `balanceOf` call (no device interaction).
- **Confidential balance** — your confidential cToken balance, read via `useConfidentialBalance`. The SDK reads the encrypted handle on-chain (Phase 1), then decrypts it via `RelayerCleartext` (Phase 2).

**Explicit decrypt pattern:** the confidential balance is not queried until you explicitly authorize FHE decryption. The Balances card shows a **Decrypt Balance** button instead of a balance value. This avoids prompting EIP-712 signatures on mount.

Click **Decrypt Balance**. The Ledger device will display an EIP-712 signature request:

- **Nano S:** "Sign typed data?" with a hash — this is the pre-hashed fallback (normal, see [Two-tier EIP-712 signing](#two-tier-eip-712-signing)).
- **Nano S Plus / Nano X / Stax / Flex:** individual field names and values.

Approve on the device. A single signature covers all registered tokens — switching tokens will not prompt again. The credential is cached in IndexedDB (30-day TTL) and reused for all subsequent decryptions within that period.

If you have never shielded any tokens, the confidential balance shows **—** after decryption — this is expected.

### Step 5 — Shield (ERC-20 → cToken)

Enter a human-readable amount (e.g., `1.5`) and click **Shield**. This converts public ERC-20 tokens into confidential cTokens.

The app manages ERC-20 allowances automatically. The spend cap is set to your **full ERC-20 balance** (not the exact shield amount), so once approved, subsequent shields within the remaining cap need only the wrap transaction — no re-approval.

| Situation                                          | Transactions                                       | Device confirmations |
| -------------------------------------------------- | -------------------------------------------------- | -------------------- |
| Allowance already covers the amount                | `wrap` only                                        | 1                    |
| No existing allowance (or zero)                    | `approve(fullBalance)` → `wrap`                    | 2                    |
| Non-zero allowance insufficient — standard token   | `approve(fullBalance)` → `wrap` (direct overwrite) | 2                    |
| Non-zero allowance insufficient — USDT-style token | `approve(0)` → `approve(fullBalance)` → `wrap`     | 3 _(rare)_           |

Each device confirmation displays the transaction details on-screen. On **Nano S**, fields are shown as raw hex values. On **Nano S Plus / Nano X / Stax / Flex**, field names and decoded values are shown.

The button shows **Shielding… (1/2 approve)** during approval and **Shielding… (2/2 wrap)** once the approval is confirmed. The ERC-20 balance refreshes automatically on success.

### Step 6 — Confidential transfer

Enter a **recipient address** and an **amount**, then click **Transfer**. This sends cTokens to another address with the amount hidden on-chain.

The operation has two phases:

1. **FHE encryption** — the amount is encrypted locally by the SDK. The button shows **Encrypting…** during this phase (no device interaction).
2. **Transaction submission** — the encrypted transfer is sent on-chain. The button shows **Submitting…** and one device confirmation is required.

### Step 7 — Unshield (cToken → ERC-20)

Enter an amount and click **Unshield**. This converts cTokens back into public ERC-20 tokens.

Unshield is a two-phase operation:

1. **Unwrap** — a transaction that burns the cTokens and emits an `UnwrapRequested` event. The button shows **Unshielding… (1/2)**. One device confirmation.
2. **Finalize** — `RelayerCleartext` decrypts the amount locally (no external call, no device prompt), then submits a `finalizeUnwrap` transaction. The button shows **Unshielding… (2/2)**. One device confirmation.

Both phases complete within seconds on Hoodi. The ERC-20 balance refreshes automatically on success.

**Tab close resilience:** if you close the tab after Phase 1 completes but before Phase 2 starts, the pending unshield is saved in IndexedDB. A **Pending Unshield** card appears when you reopen the app, allowing you to resume finalization.

### Step 8 — Verify updated balances

After each operation, balances refresh automatically. All three operations (shield, transfer, unshield) invalidate the same set of queries: the ERC-20 balance, the ETH balance, and the confidential handle. The confidential balance re-decrypts after all three, since each modifies the encrypted handle on-chain.

---

## Delegation walkthrough

The three delegation cards are located below the core operation cards. They require **two separate Ledger addresses** — one acting as the token owner (delegator) and one as the delegate.

### Step 9 — Grant decryption access (owner address)

In the **Grant Decryption Access** card, enter the delegate's address. By default, access is permanent (the **No expiration** checkbox is checked). To set a time limit, uncheck it and pick a date and time. **The ACL contract requires the expiry to be at least 1 hour in the future** (`expirationDate >= block.timestamp + 1 hours`); shorter values will revert on-chain.

Click **Grant Access** and confirm the transaction on the Ledger device. One transaction is submitted to the on-chain ACL contract.

### Step 10 — Decrypt balance as delegate (delegate address)

Connect with the delegate's Ledger address (disconnect, reconnect, and select the appropriate device/path). In the **Decrypt Balance On Behalf Of** card, enter the owner's address.

As soon as a valid address is entered, a live **delegation status** indicator appears:

- **✓ Delegated · Permanent** — delegation is active with no expiry.
- **✓ Delegated · \<date\>** — delegation is active until the shown date.
- **No active delegation for this token** — no delegation exists; go back to Step 9.

Click **Decrypt Balance** to decrypt the owner's confidential balance. The result is displayed in token units.

> **Cache behaviour:** decrypted values are cached locally in IndexedDB, keyed by the on-chain encrypted handle. If the owner's balance has not changed between two decrypt calls, the second call returns the cached value without re-checking the ACL — this is intentional. See [Troubleshooting](#troubleshooting) for details.

### Step 11 — Revoke decryption access (owner address)

Switch back to the owner address. In the **Revoke Decryption Access** card, enter the delegate's address and click **Revoke Access**. One transaction is submitted. After confirmation, the delegation is removed from the on-chain ACL.

> **Revocation and caching:** if the delegate calls Decrypt Balance again immediately after revocation and the owner's balance has not changed, the cached plaintext is returned — no new ACL check occurs. Revocation takes full effect for the delegate as soon as the owner's balance changes (any shield, transfer, or unshield), which produces a new on-chain handle and invalidates the cache entry.

---

## SDK integration details

### LedgerWebHIDProvider

The core of this example is `src/lib/LedgerWebHIDProvider.ts` — a custom EIP-1193 provider that wraps `@ledgerhq/hw-transport-webhid` and `@ledgerhq/hw-app-eth`:

```ts
import TransportWebHID from "@ledgerhq/hw-transport-webhid";
import Eth from "@ledgerhq/hw-app-eth";

export class LedgerWebHIDProvider implements EIP1193Provider {
  // eth_accounts / eth_requestAccounts → getAddress(BIP-44 m/44'/60'/0'/0/0)
  // personal_sign                      → signPersonalMessage
  // eth_signTypedData_v4               → signEIP712Message (Tier 1, field display)
  //                                       or signEIP712HashedMessage (Tier 2, Nano S)
  // eth_sendTransaction                → signTransaction + eth_sendRawTransaction
  // eth_chainId                        → hardcoded Hoodi (560048)
  // eth_blockNumber                    → high-water mark (monotonically increasing)
  // everything else                    → forwarded to JsonRpcProvider(HOODI_RPC_URL)

  // Skips the fetch to crypto-assets-service.api.ledger.com — Hoodi and Zama
  // contracts are not registered there, so the request always 403s with CORS.
  private static readonly LOAD_CONFIG = { calServiceURL: null };

  async connect(accountIndex = 0): Promise<string> {
    // Close any existing transport before opening a new one.
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        /* ignore */
      }
      this.transport = null;
    }
    this._path = `44'/60'/0'/0/${accountIndex}`;
    this.transport = await TransportWebHID.create();
    const app = new Eth(this.transport, undefined, LedgerWebHIDProvider.LOAD_CONFIG);
    const { address } = await app.getAddress(this._path, /* display= */ false);
    this._address = address;
    this._fire("accountsChanged", [[address]]);
    return address;
  }

  // Voluntarily closes the transport and emits the same events as a physical
  // disconnect (accountsChanged([]) + disconnect code 4900).
  async disconnect(): Promise<void> {
    if (this.transport) {
      try {
        await this.transport.close();
      } catch {
        /* ignore */
      }
    }
    this._onDisconnect();
  }
}

export const ledgerProvider = new LedgerWebHIDProvider();
```

**High-water mark on `eth_blockNumber`:** ethers' `PollingBlockSubscriber` only polls for new receipts when `eth_blockNumber` returns a value strictly higher than the last seen block. To ensure the subscriber fires every poll interval (~4 s) rather than once per block (~12 s on Hoodi), `eth_blockNumber` responses are adjusted to always be strictly increasing — if the actual block has not advanced, the counter increments by 1.

**EIP-1559 transaction signing:** `eth_sendTransaction` builds an unsigned EIP-1559 transaction (`Transaction.from({ type: 2, ... })`), sends `tx.unsignedSerialized.slice(2)` (without the `0x` prefix) to `hw-app-eth.signTransaction()`, then attaches the signature in-place: `tx.signature = Signature.from({ r, s, v })`. The signed `tx.serialized` is broadcast via `eth_sendRawTransaction` on the Hoodi RPC.

### Providers setup

```tsx
// src/providers.tsx
import { RelayerCleartext, hoodiCleartextConfig } from "@zama-fhe/sdk/cleartext";
import { EthersSigner } from "@zama-fhe/sdk/ethers";
import { ZamaProvider, IndexedDBStorage, indexedDBStorage } from "@zama-fhe/react-sdk";
import { ledgerProvider } from "@/lib/LedgerWebHIDProvider";
import { HOODI_RPC_URL } from "@/lib/config";

// EthersSigner wraps ledgerProvider (EIP-1193) for use by ZamaSDK.
// walletKey is incremented on accountsChanged, forcing ZamaProvider to remount
// with a fresh signer bound to the new Ledger address.
const signer = new EthersSigner({ ethereum: ledgerProvider as any });

// hoodiCleartextConfig contains the chainId, executor address, and ACL address for Hoodi.
// Override `network` to use a custom RPC endpoint.
const relayer = new RelayerCleartext({ ...hoodiCleartextConfig, network: HOODI_RPC_URL });

// IMPORTANT: use a separate IndexedDBStorage instance for sessionStorage.
// Both storage and sessionStorage use the same key internally — sharing the same
// database instance causes the session entry to overwrite the encrypted keypair.
const sessionDBStorage = new IndexedDBStorage("SessionStore");

<ZamaProvider
  relayer={relayer}
  signer={signer}
  storage={indexedDBStorage} // "CredentialStore" DB — encrypted FHE keypair
  sessionStorage={sessionDBStorage} // "SessionStore" DB — EIP-712 session signatures
  keypairTTL={30 * 24 * 60 * 60} // 30 days — same as sessionTTL default
>
  ...
</ZamaProvider>;
```

### Hook usage

```tsx
import {
  useZamaSDK,
  useListPairs,
  useIsAllowed,
  useAllow,
  useConfidentialTransfer,
  useUnshield,
  useConfidentialBalance,
  allowanceContract,
  approveContract,
  balanceOfContract,
} from "@zama-fhe/react-sdk";

// Fetch all valid token pairs from the on-chain WrappersRegistry.
const { data: pairsData } = useListPairs({ metadata: true });
const pair = pairsData?.items?.[0];

const cTokenDecimals = pair?.confidential.decimals ?? 0;
const erc20Decimals = pair?.underlying.decimals ?? 0;

// Explicit decrypt pattern.
const { data: isAllowed } = useIsAllowed();
const allowTokens = useAllow();
function handleDecrypt() {
  const addresses = pairsData?.items?.map((p) => p.confidentialTokenAddress) ?? [];
  if (addresses.length > 0) allowTokens.mutate(addresses);
}

const balance = useConfidentialBalance(
  { tokenAddress: pair?.confidentialTokenAddress ?? "0x0000000000000000000000000000000000000000" },
  { enabled: !!isAllowed && !!pair },
);

// Shield (see ShieldCard.tsx for the full approval + wrap flow).
const sdk = useZamaSDK();
const token = sdk.createToken(pair!.confidentialTokenAddress);
await token.shield(parseUnits("1", erc20Decimals), { approvalStrategy: "skip" });

// Transfer: FHE encryption (local) + 1 transaction.
const transfer = useConfidentialTransfer({ tokenAddress: pair?.confidentialTokenAddress });
transfer.mutate({
  to: "0xRecipient",
  amount: parseUnits("1", cTokenDecimals),
  callbacks: { onEncryptComplete: () => setStep(2) },
});

// Unshield: 2 transactions (unwrap + finalizeUnwrap).
const unshield = useUnshield({
  tokenAddress: pair?.confidentialTokenAddress,
  wrapperAddress: pair?.confidentialTokenAddress,
});
unshield.mutate({
  amount: parseUnits("1", cTokenDecimals),
  callbacks: { onFinalizing: () => setStep(2) },
});
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

// Grant — 1 transaction. expirationDate: undefined → permanent (MAX_UINT64 on-chain).
const delegate = useDelegateDecryption({ tokenAddress: cTokenAddress });
delegate.mutate({ delegateAddress: "0xDelegate" });
// With expiry (at least 1 hour in the future):
delegate.mutate({ delegateAddress: "0xDelegate", expirationDate: new Date("2027-01-01") });

// Revoke — 1 transaction.
const revoke = useRevokeDelegation({ tokenAddress: cTokenAddress });
revoke.mutate({ delegateAddress: "0xDelegate" });

// Query delegation status.
const { data: status } = useDelegationStatus({
  tokenAddress: cTokenAddress,
  delegatorAddress: "0xOwner",
  delegateAddress: "0xDelegate",
});
// status?.isDelegated     → boolean
// status?.expiryTimestamp → bigint (MAX_UINT64 for permanent)

// Decrypt as delegate — 0 transactions.
const decryptAs = useDecryptBalanceAs(cTokenAddress);
decryptAs.mutate({ delegatorAddress: "0xOwner" });

if (decryptAs.error instanceof DelegationNotFoundError) {
  /* no delegation */
}
if (decryptAs.error instanceof DelegationExpiredError) {
  /* expired */
}
```

---

## Environment variables

| Variable                    | Required | Default                            | Description                                                                     |
| --------------------------- | -------- | ---------------------------------- | ------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_HOODI_RPC_URL` | No       | `https://rpc.hoodi.ethpandaops.io` | Override the Hoodi RPC endpoint. Example: `https://hoodi.infura.io/v3/YOUR_KEY` |

Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_HOODI_RPC_URL` to a private endpoint if desired. Leaving the value empty is safe — the app falls back to the default public endpoint automatically.

---

## Troubleshooting

| Symptom                                                     | Likely cause                                                                                                                                             | Fix                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Failed to connect Ledger device" on connect                | Device locked, Ethereum app not open, or USB permission denied                                                                                           | Unlock the device, open the Ethereum app ("Application is ready"), and retry. If the WebHID picker shows the device but connecting fails, replug the USB cable.                                                                                        |
| WebHID device picker is empty                               | Ledger not connected via USB, or browser lacks permission                                                                                                | Connect the Ledger via USB before clicking **Connect Ledger**. Bluetooth is not supported by `hw-transport-webhid`.                                                                                                                                    |
| "WebHID is not supported in this browser"                   | Using Firefox or Safari                                                                                                                                  | Switch to Chrome, Edge, or Brave (Chromium 89+).                                                                                                                                                                                                       |
| Device shows "Sign typed data? ⚠️" for all EIP-712 requests | Using a Nano S — this is expected (Tier 2 pre-hashed signing)                                                                                            | Normal behavior. Approve as usual. To see individual field names and values, use a Nano S Plus, Nano X, Stax, or Flex.                                                                                                                                 |
| EIP-712 signature fails with "Blind signing not enabled"    | Nano S requires blind signing to be enabled for `signEIP712HashedMessage`                                                                                | On the Ledger device: Ethereum app → Settings → Blind signing → Enable.                                                                                                                                                                                |
| ERC-20 balance shows `0`                                    | Tokens not yet minted                                                                                                                                    | Click the **Mint** button or use one of the methods in [Minting test tokens](#minting-test-tokens).                                                                                                                                                    |
| Confidential balance shows `—` immediately after connect    | No shielded balance yet — no encrypted handle to read                                                                                                    | Shield some tokens first; the balance will display once there is something to decrypt.                                                                                                                                                                 |
| "Decrypting…" stays indefinitely                            | Missed the EIP-712 confirmation prompt on the device                                                                                                     | Check the device screen and approve (or reject) the pending signature request.                                                                                                                                                                         |
| Transaction confirmation times out on the device            | Ledger screen-lock activates mid-flow                                                                                                                    | Keep the device active during multi-step operations. If a confirmation times out, retry the operation — nonces and gas estimates will be refreshed.                                                                                                    |
| "nonce too low" error on transaction submission             | A previous transaction is still pending in the mempool                                                                                                   | Wait for all pending transactions to confirm, then retry. The provider queries the `pending` nonce count to account for un-mined transactions.                                                                                                         |
| Asked to sign again after each balance decrypt              | Session not yet cached (first use — expected)                                                                                                            | Approve once — subsequent decryptions reuse the IndexedDB-persisted session credential (30-day TTL). If the prompt recurs every time, check that `storage` and `sessionStorage` in `ZamaProvider` point to **different** `IndexedDBStorage` instances. |
| Shield fails with "Transaction reverted"                    | Insufficient token balance, or spend cap approved but wrap reverted                                                                                      | Verify you have sufficient ERC-20 balance and Hoodi ETH. Retry — the app re-estimates gas and re-queries the nonce on each attempt.                                                                                                                    |
| Unshield shows "Unshielding… (2/2)" for longer than usual   | Finalize phase waiting for the Phase 2 receipt                                                                                                           | Normal on Hoodi — the public RPC can be slow. The receipt is polled every ~4 s via the high-water mark on `eth_blockNumber`.                                                                                                                           |
| Pending unshield card appears on reload                     | Tab was closed between Phase 1 and Phase 2 of an unshield                                                                                                | Click **Finalize** in the Pending Unshield card to complete the operation and receive your ERC-20 tokens.                                                                                                                                              |
| Delegate can still decrypt after revocation                 | Expected behavior — decrypted values are cached in IndexedDB keyed by `(token, owner, handle)`; the cache is served without re-checking the on-chain ACL | By design: the SDK uses the on-chain encrypted handle as the cache key (no TTL). Revocation takes full effect as soon as the owner's balance changes (shield, transfer, or unshield), producing a new handle and invalidating the cache entry.         |
| Grant Access reverts with `ExpirationDateBeforeOneHour`     | Expiration date is less than 1 hour in the future                                                                                                        | Set the expiry to at least 1 hour from now. The ACL contract compares against `block.timestamp` (UTC).                                                                                                                                                 |
| Grant Access reverts with `SenderCannotBeDelegate`          | Attempted to delegate to your own address                                                                                                                | Enter a different address. The ACL contract does not allow self-delegation.                                                                                                                                                                            |
| Revoke Access reverts with `NotDelegatedYet`                | No active delegation exists for the entered address and token                                                                                            | Verify the delegate address is correct and that a grant was previously confirmed on-chain for the selected token.                                                                                                                                      |

---

## Running tests

End-to-end tests live in `e2e/` and use **Playwright**. The test suite mocks both the Ledger hardware device and the Hoodi RPC, so **no physical device and no network connection are required**.

```bash
# Install Playwright browsers (first time only)
npx playwright install chromium

# Start the dev server in one terminal
npm run dev

# Run all E2E tests in another terminal
npm run test:e2e
```

### Test suites

| File                     | Coverage                                                                                  |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `e2e/connect.spec.ts`    | Connect screen UI, account selector, successful connect, error on missing device          |
| `e2e/main.spec.ts`       | All operation cards, header elements, token selector, registry empty state                |
| `e2e/disconnect.spec.ts` | Device unplug → connect screen, title after disconnect, reconnect flow, Disconnect button |
| `e2e/delegation.spec.ts` | Delegation section labels, button enable/disable states, Decrypt Balance card visibility  |

### How tests mock the Ledger

`LedgerWebHIDProvider` exposes its singleton on `window.__ledgerProvider` in non-production builds. The Playwright fixtures (`e2e/fixtures.ts`) override `connect()` and `verifyAddress()` via `page.evaluate()` after `page.goto()`:

- **`mockLedger(config)`** — replaces `connect()` with a stub that sets `_address` and fires `accountsChanged` without opening a WebHID picker; replaces `verifyAddress()` with a no-op.
- **`simulateDisconnect()`** — calls `_onDisconnect()` directly to simulate the device being unplugged.
- **`mockRpc(options)`** — intercepts all requests to the Hoodi RPC with ABI-encoded static responses (chain ID, registry pairs, token metadata).

---

## Going further

- **Additional tokens** — register new ERC-7984 pairs in the on-chain WrappersRegistry at `0x1807aE2f693F8530DFB126D0eF98F2F2518F292f`. The app picks them up automatically via `useListPairs` on the next load.
- **More BIP-44 accounts** — the connect-screen dropdown supports indices 0–4. To expose additional accounts or non-standard derivation paths, extend the account options passed to `connect(accountIndex)` in `LedgerWebHIDProvider.ts`.
- **Production use** — replace `RelayerCleartext` with `RelayerWeb` (browser) or `RelayerNode` (server) when targeting a chain with the full FHE co-processor (Sepolia, Mainnet).
- **Bluetooth transport** — swap `@ledgerhq/hw-transport-webhid` for `@ledgerhq/hw-transport-web-ble` to support Nano X / Stax / Flex over Bluetooth (also Chromium-only).
- **ERC-7730 clear signing** — pass a resolution object as the third argument to `signTransaction` in `LedgerWebHIDProvider.ts` to enable Ledger's clear-signing metadata standard for full transaction field display on-device.
