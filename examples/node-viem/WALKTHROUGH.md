# Integrating Zama Confidential Tokens (ERC-7984) — Node.js + viem

**Audience:** Backend developers integrating ERC-7984 confidential tokens into a Node.js
service using [viem](https://viem.sh/) as the Ethereum client library.

**What this document covers:** how the Zama FHE stack works in a Node.js context,
architecture decisions, step-by-step explanation of each SDK operation, delegation
mechanics, environment setup, and troubleshooting.

**Chain:** Sepolia testnet (chainId 11155111)

---

## Context

ERC-7984 is a token standard that adds **confidential balances and transfer amounts** to
ERC-20 tokens. Balances are stored as encrypted handles on-chain; only the token owner
(or an authorized delegate) can decrypt them.

The **Zama SDK** (`@zama-fhe/sdk`) handles all cryptographic operations — FHE keypair
generation, encryption, EIP-712 signing, decryption — behind a high-level `Token` API.
This example shows how to use that API in a pure Node.js backend with viem.

---

## What this example demonstrates

Four self-contained sections, meant to be read and run in order:

| Section                    | Operations                                                                     |
| -------------------------- | ------------------------------------------------------------------------------ |
| 1 — Setup                  | Wallets, clients, signers, relayer, SDK                                        |
| 2 — Mint                   | Fund Account A via the ERC-20 mock's `mint()`                                  |
| 3 — Confidential lifecycle | `balanceOf` → `shield` → `confidentialTransfer` → `unshield`                   |
| 4 — Delegation             | `delegateDecryption` → `decryptBalanceAs` → `revokeDelegation` → `isDelegated` |

---

## Architecture

```
PRIVATE_KEY / DELEGATE_PRIVATE_KEY
  │
  ▼
privateKeyToAccount()           ← viem/accounts — deterministic key derivation
  │
  ├─ walletClientA / walletClientB   ← viem WalletClient (per account, signs txs)
  └─ publicClient                    ← viem PublicClient (shared, read-only)
       │
       ▼
  ViemSigner (signerA / signerB)     ← @zama-fhe/sdk/viem — bridges viem ↔ GenericSigner
       │
       ├─ ZamaSDK (sdkA / sdkB)      ← one SDK instance per signer context
       │    └─ Token (tokenA / tokenB) ← createToken(cUSDT address)
       │
       └─ RelayerNode (shared)        ← @zama-fhe/sdk/node — FHE in worker_threads
            └─ transport[sepolia.id]  ← network: SEPOLIA_RPC_URL, optional auth
```

**Key design points:**

- `publicClient` is shared — read operations (balances, receipts) don't need a signer.
- `walletClientA` and `walletClientB` are separate — each signs with its own key.
- `RelayerNode` is shared across both SDK instances. It runs FHE operations (keypair
  generation, encryption, decryption) in Node.js `worker_threads` so they don't block
  the event loop.
- `ZamaSDK` is lightweight — it wraps a signer and relayer and manages FHE credentials.
  One instance per account.

---

## Section 1 — Setup

### Viem clients

```ts
const transport = http(SEPOLIA_RPC_URL);

// Shared read client — no signing key required.
const publicClient = createPublicClient({ chain: sepolia, transport });

// Per-account write clients — each signs with its own private key.
const walletClientA = createWalletClient({ account: accountA, chain: sepolia, transport });
const walletClientB = createWalletClient({ account: accountB, chain: sepolia, transport });
```

One transport, one `publicClient`, two `walletClient`s. Sharing the transport means
all three clients talk to the same RPC node — consistent block height, no split-brain.

### ViemSigner

```ts
const signerA = new ViemSigner({ walletClient: walletClientA, publicClient });
```

`ViemSigner` implements `GenericSigner`, the SDK's internal signer interface. It routes:

- **Reads** (`readContract`, `getChainId`, `getAddress`, `getBalance`) → `publicClient`
- **Writes** (`writeContract`, `signTypedData`) → `walletClient`

### RelayerNode

```ts
const relayer = new RelayerNode({
  getChainId: () => signerA.getChainId(),
  transports: {
    [sepolia.id]: {
      network: SEPOLIA_RPC_URL, // same RPC as viem clients — consistent view
      ...(auth && { auth }), // optional API key for Mainnet
    },
  },
});
```

`RelayerNode` is the backend-specific FHE engine. It spawns a pool of `worker_threads`,
each loaded with the WASM FHE library. This keeps heavy cryptographic work off the main
thread. A single instance is shared across `sdkA` and `sdkB`.

> **Sepolia vs Mainnet:** Sepolia does not require a relayer API key. For Mainnet, pass
> `RELAYER_API_KEY` via `auth: { __type: "ApiKeyHeader", value: key }`.

### ZamaSDK and Token

```ts
const sdkA = new ZamaSDK({ relayer, signer: signerA, storage: new MemoryStorage() });

// Resolve the confidential wrapper address via the on-chain registry.
const registryResult = await sdkA.registry.getConfidentialToken(TOKEN_ADDRESS as Address);
if (!registryResult) throw new Error(`No confidential wrapper registered for ${TOKEN_ADDRESS}`);
const { confidentialTokenAddress } = registryResult;

const tokenA = sdkA.createToken(TOKEN_ADDRESS as Address, confidentialTokenAddress);
```

`createToken(erc20Address, wrapperAddress)` takes both the underlying ERC-20 address and
the ERC-7984 wrapper address. The wrapper address is resolved at runtime via
`sdk.registry.getConfidentialToken()` — no hardcoded wrapper address is needed.

`MemoryStorage` stores FHE keypairs and EIP-712 session credentials in memory.
Credentials are lost when the process exits — see [Storage](#storage) below.

---

## Section 2 — Mint

The USDT mock contract has an open `mint(address, uint256)` function — no ACL.
Real production tokens would not have this; fund via faucet or transfer instead.

```ts
// Read (publicClient)
const balanceBefore = await publicClient.readContract({
  address: USDT_ADDRESS,
  abi: ERC20_ABI,
  functionName: "balanceOf",
  args: [accountA.address],
});

// Write (walletClientA) — returns the tx hash immediately
const mintHash = await walletClientA.writeContract({
  address: USDT_ADDRESS,
  abi: ERC20_ABI,
  functionName: "mint",
  args: [accountA.address, MINT_AMOUNT],
});
console.log("Mint tx:", mintHash); // log before waiting so you can track it

// Wait for confirmation
await publicClient.waitForTransactionReceipt({ hash: mintHash });
```

This is standard viem usage — no SDK involvement. The SDK only operates on the
ERC-7984 wrapper (`CUSDT_ADDRESS`), not the ERC-20.

---

## Section 3 — Confidential Token Lifecycle

### 3a — `balanceOf` (decrypt)

```ts
const balance = await tokenA.balanceOf();
```

Under the hood, `balanceOf` performs several steps the first time it is called:

1. Generates an ML-KEM re-encryption keypair (via `RelayerNode` worker).
2. Prompts an EIP-712 wallet signature (stored in `MemoryStorage` for the session duration).
3. Sends the re-encryption public key to the Zama relayer.
4. The relayer re-encrypts the on-chain ciphertext under that key and returns the result.
5. The SDK decrypts locally and returns the plaintext `bigint`.

Subsequent calls reuse the cached keypair and session signature (no re-signing until the
session expires or `sdk.revoke()` is called).

### 3b — `shield` (ERC-20 → cToken)

```ts
await tokenA.shield(SHIELD_AMOUNT, {
  callbacks: {
    onApprovalSubmitted: (tx) => console.log("Approval:", tx),
    onShieldSubmitted: (tx) => console.log("Shield:", tx),
  },
});
```

`shield` is two transactions:

1. `ERC20.approve(wrapper, amount)` — if the current allowance is insufficient.
2. `ERC7984Wrapper.wrap(amount)` — moves ERC-20 tokens into the confidential pool.

The `callbacks` option lets you observe each step. If approval is already sufficient,
only the wrap transaction is submitted.

### 3c — `confidentialTransfer`

```ts
await tokenA.confidentialTransfer(accountB.address, TRANSFER_AMOUNT, {
  onEncryptComplete: () => console.log("Encrypted"),
  onTransferSubmitted: (tx) => console.log("Transfer:", tx),
});
```

The amount is encrypted client-side (via `RelayerNode`) before the transaction is built.
Only the confidential token contract (via its ACL) can decrypt the amount on-chain.
From an observer's point of view, the transferred value is opaque.

### 3d — `unshield` (cToken → ERC-20)

```ts
await tokenA.unshield(UNSHIELD_AMOUNT, {
  onUnwrapSubmitted: (tx) => console.log("Unwrap:", tx),
  onFinalizing: () => console.log("Waiting for finalization..."),
  onFinalizeSubmitted: (tx) => console.log("Finalize:", tx),
});
```

`unshield` is a **two-phase** operation:

1. **Phase 1 — `unwrap`:** the wrapper contract initiates decryption and burns the
   confidential balance.
2. **Phase 2 — `finalizeUnwrap`:** the Zama relayer fulfils the decryption request and
   the ERC-20 tokens are released to the user's wallet.

The SDK polls for Phase 2 automatically. The `onFinalizing` callback fires while waiting.
On Sepolia, Phase 2 typically completes within 1–3 minutes.

---

## Section 4 — Delegation

Delegation allows Account B (a service account) to decrypt Account A's confidential
balance without holding Account A's private key. This is the core pattern for backend
services that need to read user balances.

### Grant

```ts
await tokenA.delegateDecryption({ delegateAddress: accountB.address });
```

Writes a delegation record on-chain. Account B is now authorized to request
re-encryption of Account A's balance handle.

By default (no `expirationDate` passed), the delegation is permanent — the ACL
contract stores a sentinel value (`2^64 − 1`) to represent "no expiry". Pass an
`expirationDate: Date` to create a time-limited delegation.

### `isDelegated` — verify delegation status

```ts
const isDelegated = await tokenA.isDelegated({
  delegatorAddress: accountA.address as Address,
  delegateAddress: accountB.address as Address,
});
console.log("Delegation active:", isDelegated); // true
```

`isDelegated` is a read-only on-chain check — no FHE credentials needed. It returns
`true` if a valid (non-expired) delegation exists for this token between the two
addresses. Called twice in the demo: once after `delegateDecryption` (expect `true`)
and once after `revokeDelegation` (expect `false`).

### Decrypt as delegate

```ts
const balance = await tokenB.decryptBalanceAs({
  delegatorAddress: accountA.address,
});
```

Called on `tokenB` (Account B's context). The relayer verifies the delegation on-chain
before authorizing the re-encryption. Account A's private key is never involved.

### Revoke

```ts
await tokenA.revokeDelegation({ delegateAddress: accountB.address });
```

Removes the delegation record on-chain. Subsequent `decryptBalanceAs` calls from
Account B will fail with an authorization error. A follow-up `isDelegated` call
(same parameters as above) confirms the revoke took effect — it should return `false`.

---

## Sepolia contract addresses

| Token     | ERC-20 address                               | ERC-7984 wrapper address                     |
| --------- | -------------------------------------------- | -------------------------------------------- |
| USDT Mock | `0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0` | `0x4E7B06D78965594eB5EF5414c357ca21E1554491` |

The ERC-20 address is pre-configured in `.env.example`. The confidential wrapper
address is resolved at runtime via `sdk.registry.getConfidentialToken()` — no
hardcoded wrapper address is required. If the USDT mock is redeployed, update
`TOKEN_ADDRESS` in your `.env`.

---

## Storage

`MemoryStorage` is used in this example for simplicity. Two types of data are stored:

| Data            | Description                                 | Lost on process exit? |
| --------------- | ------------------------------------------- | --------------------- |
| ML-KEM keypair  | Re-encryption keypair for the relayer       | Yes                   |
| EIP-712 session | Wallet signature authorizing credential use | Yes                   |

**Production options:**

- For short-lived processes or scripts: `MemoryStorage` is fine.
- For long-running HTTP servers with per-request credential isolation: use
  `AsyncLocalMapStorage` from `@zama-fhe/sdk/node` (backed by Node.js
  `AsyncLocalStorage` — each async context gets its own isolated store).
- For persistent credentials across restarts: implement `GenericStorage` backed by
  Redis or another durable store. See the SDK type definition:
  ```ts
  interface GenericStorage {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<void>;
    delete(key: string): Promise<void>;
  }
  ```

---

## Cleanup

```ts
} finally {
  sdkB.dispose();   // unsubscribes signer listeners, does NOT kill the relayer
  sdkA.terminate(); // terminates the shared RelayerNode (kills worker_threads)
}
```

`dispose()` is for SDK instances that share a relayer with another instance still in
use. `terminate()` shuts down the relayer entirely. Always call `terminate()` on the
last SDK instance to avoid dangling worker threads.

---

## Prerequisites

- Node.js >= 22
- Two Sepolia accounts funded with ETH (for gas) — [sepoliafaucet.com](https://sepoliafaucet.com)
- A Sepolia RPC endpoint — [Infura](https://infura.io), [Alchemy](https://alchemy.com),
  or any public node

---

## Environment variables

| Variable               | Required | Description                                                         |
| ---------------------- | -------- | ------------------------------------------------------------------- |
| `PRIVATE_KEY`          | Yes      | Private key for Account A (hex, `0x`-prefixed)                      |
| `DELEGATE_PRIVATE_KEY` | Yes      | Private key for Account B (hex, `0x`-prefixed)                      |
| `SEPOLIA_RPC_URL`      | Yes      | Sepolia RPC endpoint                                                |
| `TOKEN_ADDRESS`        | Yes      | ERC-20 token address (pre-set to USDT mock in `.env.example`)       |
| `RELAYER_API_KEY`      | No       | API key for the Zama relayer (Mainnet only)                         |

---

## Troubleshooting

| Symptom                          | Likely cause                      | Fix                                                          |
| -------------------------------- | --------------------------------- | ------------------------------------------------------------ |
| `Missing env: PRIVATE_KEY`       | `.env` not loaded                 | Run `cp .env.example .env` and fill in values                |
| `insufficient funds`             | Account A has no Sepolia ETH      | Fund via [sepoliafaucet.com](https://sepoliafaucet.com)      |
| `balanceOf` hangs                | Relayer unreachable or cold start | Wait a few seconds; the worker pool initializes on first use |
| `unshield` Phase 2 never arrives | Sepolia congestion                | Wait up to 5 minutes; Phase 2 depends on relayer polling     |
| `execution reverted` on `wrap`   | ERC-20 allowance too low          | `shield()` handles approval automatically; check gas         |

---

## Related

- [node-ethers example](../node-ethers) — same flows using ethers v6 instead of viem
- [SDK documentation](https://docs.zama.ai/sdk)
- [ERC-7984 specification](https://eips.ethereum.org/EIPS/eip-7984)
