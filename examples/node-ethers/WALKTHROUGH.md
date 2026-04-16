# Integrating Zama Confidential Tokens (ERC-7984) — Node.js + ethers

**Audience:** Backend developers integrating ERC-7984 confidential tokens into a Node.js
service using [ethers v6](https://docs.ethers.org/v6/) as the Ethereum client library.

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
generation, encryption, EIP-712 signing, decryption — behind a high-level `Token` API
and lower-level primitives (`sdk.userDecrypt()`, `sdk.publicDecrypt()`, `sdk.allow()`).
This example shows how to use both in a pure Node.js backend with ethers v6.

---

## What this example demonstrates

Five self-contained sections, meant to be read and run in order:

| Section                    | Operations                                                                     |
| -------------------------- | ------------------------------------------------------------------------------ |
| 1 — Setup                  | Wallets, provider, signers, relayer, SDK                                       |
| 2 — Mint                   | Fund Account A via the ERC-20 mock's `mint()`                                  |
| 3 — Confidential lifecycle | `balanceOf` → `shield` → `confidentialTransfer` → `unshield`                   |
| 4 — Delegation             | `delegateDecryption` → `decryptBalanceAs` → `revokeDelegation` → `isDelegated` |
| 5 — SDK Primitives         | `sdk.allow` → `sdk.userDecrypt` → `sdk.publicDecrypt`                          |

---

## Architecture

```
PRIVATE_KEY / DELEGATE_PRIVATE_KEY
  │
  ▼
ethers Wallet(key, provider)    ← key derivation + transaction signing
  │
  ├─ walletA / walletB          ← per-account Wallet instances
  └─ provider (JsonRpcProvider) ← shared, points at SEPOLIA_RPC_URL
       │
       ▼
  EthersSigner (signerA / signerB)   ← @zama-fhe/sdk/ethers — bridges ethers ↔ GenericSigner
       │
       ├─ ZamaSDK (sdkA / sdkB)      ← one SDK instance per signer context
       │    └─ Token (tokenA / tokenB) ← createToken(cUSDT address)
       │
       └─ RelayerNode (shared)        ← @zama-fhe/sdk/node — FHE in worker_threads
            └─ transport[chainId]     ← network: SEPOLIA_RPC_URL, optional auth
```

**Key design points:**

- `JsonRpcProvider` is shared across both wallets — consistent view of the chain.
- `walletA` and `walletB` are separate `Wallet` instances, each with their own key.
- `RelayerNode` is shared across both SDK instances. It runs FHE operations (keypair
  generation, encryption, decryption) in Node.js `worker_threads` so they don't block
  the event loop.
- `ZamaSDK` is lightweight — it wraps a signer and relayer and manages FHE credentials.
  One instance per account.

---

## Section 1 — Setup

### Ethers provider and wallets

```ts
const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
const walletA = new Wallet(PRIVATE_KEY, provider);
const walletB = new Wallet(DELEGATE_PRIVATE_KEY, provider);
```

Both wallets share the same provider — they see the same chain state and nonces.
The provider targets `SEPOLIA_RPC_URL`, which is also passed to `RelayerNode`
so both clients talk to the same RPC node.

### EthersSigner

```ts
const signerA = new EthersSigner({ signer: walletA });
```

`EthersSigner` implements `GenericSigner`, the SDK's internal signer interface. It wraps
an ethers `Wallet` and exposes `readContract`, `writeContract`, `signTypedData`,
`getAddress`, `getChainId`, `getBlockTimestamp`, and `waitForTransactionReceipt` in a
library-agnostic way.

### RelayerNode

```ts
const relayer = new RelayerNode({
  getChainId: async () => SepoliaConfig.chainId,
  transports: {
    [SepoliaConfig.chainId]: {
      network: SEPOLIA_RPC_URL, // same RPC as the ethers provider — consistent view
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

const tokenA = sdkA.createToken(confidentialTokenAddress);
```

`createToken(address)` takes the confidential token contract address. In ERC-7984 the
confidential token IS the wrapper, so only one address is needed. The underlying ERC-20
is resolved automatically from the on-chain wrapper contract — no need to pass it.

`MemoryStorage` stores FHE keypairs and EIP-712 session credentials in memory.
Credentials are lost when the process exits — see [Storage](#storage) below.

---

## Section 2 — Mint

The USDT mock contract has an open `mint(address, uint256)` function — no ACL.
Real production tokens would not have this; fund via faucet or transfer instead.

```ts
const erc20 = new Contract(TOKEN_ADDRESS, ERC20_ABI, walletA);
const mintFn = erc20.getFunction("mint");

const mintTx = await mintFn(walletA.address, MINT_AMOUNT);
console.log("Mint tx:", mintTx.hash); // log before waiting — track in real time
await mintTx.wait();
```

`getFunction()` is used instead of direct property access (`erc20.mint`) because
ethers v6 `Contract` objects use a JavaScript `Proxy` to dispatch calls dynamically.
While `erc20.mint(...)` works at runtime, TypeScript types it as a generic
`BaseContractMethod<any[], any, any>`, losing the specific signature inferred from
the ABI. `getFunction("mint")` resolves the method by name and returns a properly
typed `ContractMethod`, so the arguments and return type are checked against the ABI.

This is standard ethers usage — no SDK involvement. The SDK only operates on the
ERC-7984 wrapper (`confidentialTokenAddress`), not the ERC-20.

---

## Section 3 — Confidential Token Lifecycle

### 3a — `balanceOf` (decrypt)

```ts
const balance = await tokenA.balanceOf();
```

Under the hood, `balanceOf` delegates to `sdk.userDecrypt()` — the SDK's general-purpose
decryption primitive. On the first call, `userDecrypt` performs several steps:

1. Reads the encrypted balance handle from the chain via `confidentialBalanceOf()`.
2. Calls `sdk.allow([contractAddress])` to provision FHE credentials:
   - Generates an ML-KEM re-encryption keypair (via `RelayerNode` worker).
   - Prompts an EIP-712 wallet signature (stored in `MemoryStorage` for the session duration).
3. Sends the handle + credentials to the Zama relayer for re-encryption.
4. The relayer re-encrypts the on-chain ciphertext under the user's key and returns the result.
5. The SDK decrypts locally, caches the result, and returns the plaintext `bigint`.

Subsequent calls reuse the cached keypair, session signature, and decrypted values (no
re-signing or relayer round-trip until the session expires or the cache is invalidated).
See Section 5 for using `sdk.userDecrypt()` and `sdk.publicDecrypt()` directly.

### 3b — `shield` (ERC-20 → cToken)

```ts
await tokenA.shield(SHIELD_AMOUNT, {
  onApprovalSubmitted: (tx) => console.log("Approval:", tx),
  onShieldSubmitted: (tx) => console.log("Shield:", tx),
});
```

`shield` is two transactions:

1. `ERC20.approve(wrapper, amount)` — if the current allowance is insufficient.
2. `ERC7984Wrapper.wrap(amount)` — moves ERC-20 tokens into the confidential pool.

The callbacks are flat properties on the options object. If approval is already sufficient,
only the wrap transaction is submitted.

### 3c — `confidentialTransfer`

```ts
await tokenA.confidentialTransfer(walletB.address, TRANSFER_AMOUNT, {
  onEncryptComplete: () => console.log("Encrypted"),
  onTransferSubmitted: (tx) => console.log("Transfer:", tx),
});
```

The amount is encrypted client-side (via `RelayerNode`) before the transaction is built.
Only the recipient and authorized delegates can decrypt the transferred amount.
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
2. **Phase 2 — `finalizeUnwrap`:** calls `sdk.publicDecrypt()` to obtain the decrypted
   amount and a cryptographic proof, then submits both on-chain to release the ERC-20
   tokens to the user's wallet.

The SDK polls for Phase 2 automatically. The `onFinalizing` callback fires while waiting.
On Sepolia, Phase 2 typically completes within 1–3 minutes.

---

## Section 4 — Delegation

Delegation allows Account B (a service account) to decrypt Account A's confidential
balance without holding Account A's private key. This is the core pattern for backend
services that need to read user balances.

### Grant

```ts
await tokenA.delegateDecryption({ delegateAddress: walletB.address });
```

Writes a delegation record on-chain. Account B is now authorized to request
re-encryption of Account A's balance handle.

By default (no `expirationDate` passed), the delegation is permanent — the ACL
contract stores a sentinel value (`2^64 − 1`) to represent "no expiry". Pass an
`expirationDate: Date` to create a time-limited delegation.

### `isDelegated` — verify delegation status

```ts
const isDelegated = await tokenA.isDelegated({
  delegatorAddress: walletA.address as Address,
  delegateAddress: walletB.address as Address,
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
  delegatorAddress: walletA.address,
});
```

Called on `tokenB` (Account B's context). The relayer verifies the delegation on-chain
before authorizing the re-encryption. Account A's private key is never involved.

### Revoke

```ts
await tokenA.revokeDelegation({ delegateAddress: walletB.address });
```

Removes the delegation record on-chain. Subsequent `decryptBalanceAs` calls from
Account B will fail with an authorization error. A follow-up `isDelegated` call
(same parameters as above) confirms the revoke took effect — it should return `false`.

---

## Section 5 — SDK Primitives

Sections 3 and 4 use the high-level `Token` class, which handles credential management,
caching, and event emission automatically. For advanced use cases — multi-token batch
decrypts, custom contract integrations, or fine-grained control — the SDK exposes three
lower-level primitives directly on the `ZamaSDK` instance.

### `sdk.allow()` — pre-authorize contracts

```ts
await sdkA.allow([confidentialTokenAddress]);
```

Triggers a single EIP-712 wallet signature that covers **all** supplied contract addresses.
Subsequent `userDecrypt()` calls for any of these contracts reuse the cached credentials
without prompting the wallet again. This is especially useful when working with multiple
tokens — call `sdk.allow([cUSDT, cDAI, cWETH])` once, then decrypt each individually.

`Token.balanceOf()` calls `sdk.allow()` internally, but calling it explicitly gives you
control over **when** the signature prompt appears (e.g. during onboarding rather than
on the first balance read).

### `sdk.userDecrypt()` — decrypt FHE handles

```ts
const handle = await sdkA.signer.readContract(
  confidentialBalanceOfContract(confidentialTokenAddress, walletA.address),
);

const values = await sdkA.userDecrypt([
  { handle, contractAddress: confidentialTokenAddress },
]);
console.log(values[handle]); // bigint
```

`userDecrypt` is the primitive that `Token.balanceOf()` delegates to. It accepts an array
of `{ handle, contractAddress }` pairs and returns a record mapping each handle to its
clear-text value (`bigint`, `boolean`, or hex-encoded bytes).

Key features:

- **Caching:** decrypted values are cached per `(signer, contract, handle)`. Repeated
  calls skip the relayer round-trip entirely.
- **Batch optimization:** handles are grouped by contract and decrypted in parallel
  (up to 5 concurrent relayer requests).
- **Zero-handle shortcut:** `0x` handles map to `0n` without a relayer call.
- **Events:** emits `DecryptStart`, `DecryptEnd`, and `DecryptError` events with
  timing and result metadata.

### `sdk.publicDecrypt()` — decrypt with proof

```ts
const { clearValues, decryptionProof, abiEncodedClearValues } =
  await sdkA.publicDecrypt([handle]);
```

Public decryption does not require user credentials — it returns the clear-text values
alongside a **decryption proof** that can be submitted on-chain. This is the primitive
that `Token.finalizeUnwrap()` uses internally to complete the unshield flow.

Use `publicDecrypt` when you need:

- The raw decryption proof for a custom finalization transaction.
- ABI-encoded clear values for direct contract calls.
- Proof-of-value for auditing or dispute resolution.

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
    get<T = unknown>(key: string): Promise<T | null>;
    set<T = unknown>(key: string, value: T): Promise<void>;
    delete(key: string): Promise<void>;
  }
  ```

---

## Cleanup

```ts
using sdkA = new ZamaSDK({ relayer, signer: signerA, storage: new MemoryStorage() });
using sdkB = new ZamaSDK({ relayer, signer: signerB, storage: new MemoryStorage() });
```

`ZamaSDK` implements `Symbol.dispose`, which calls `terminate()` — unsubscribing
signer events and shutting down the relayer. `using` guarantees cleanup runs when
the scope exits, even if an error is thrown. Both SDKs share the same relayer;
`relayer.terminate()` is idempotent, so the second call is a safe no-op.

---

## Prerequisites

- Node.js >= 22
- Two Sepolia accounts funded with ETH (for gas) — [sepoliafaucet.com](https://sepoliafaucet.com)
- A Sepolia RPC endpoint — [Infura](https://infura.io), [Alchemy](https://alchemy.com),
  or any public node

---

## Environment variables

| Variable               | Required | Description                                                   |
| ---------------------- | -------- | ------------------------------------------------------------- |
| `PRIVATE_KEY`          | Yes      | Private key for Account A (hex, `0x`-prefixed)                |
| `DELEGATE_PRIVATE_KEY` | Yes      | Private key for Account B (hex, `0x`-prefixed)                |
| `SEPOLIA_RPC_URL`      | Yes      | Sepolia RPC endpoint                                          |
| `TOKEN_ADDRESS`        | Yes      | ERC-20 token address (pre-set to USDT mock in `.env.example`) |
| `RELAYER_API_KEY`      | No       | API key for the Zama relayer (Mainnet only)                   |

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

- [node-viem example](../node-viem) — same flows using viem instead of ethers
- [SDK documentation](https://docs.zama.ai/sdk)
- [ERC-7984 specification](https://eips.ethereum.org/EIPS/eip-7984)
