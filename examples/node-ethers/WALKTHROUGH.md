# Integrating Zama Confidential Tokens (ERC-7984) — Node.js + ethers

**Audience:** Backend developers integrating ERC-7984 confidential tokens into a Node.js
service using [ethers v6](https://docs.ethers.org/v6/) as the Ethereum client library.

**Chain:** Sepolia testnet (chainId `11155111`)

ERC-7984 is a token standard that adds **confidential balances and transfer amounts** to
ERC-20 tokens. Balances are stored as encrypted handles on-chain; only the token owner
(or an authorized delegate) can decrypt them.

This example demonstrates the high-level `@zama-fhe/sdk` API in a pure Node.js
environment. Callers use plaintext amounts and familiar token operations; the SDK owns
FHE encryption, decryption, access-control signatures, relayer communication, and token
operation routing.

## What This Example Demonstrates

| Section                    | Operations                                                                     |
| -------------------------- | ------------------------------------------------------------------------------ |
| 1 — Setup                  | Wallets, provider, SDK config, Node.js relayer transport                       |
| 2 — Mint                   | Fund Account A through the ERC-20 mock's `mint()`                              |
| 3 — Confidential lifecycle | `balanceOf(owner)` → `shield` → `confidentialTransfer` → `unshield`            |
| 4 — Delegation             | `delegateDecryption` → `decryptBalanceAs` → `revokeDelegation` → `isDelegated` |

## Architecture

```
PRIVATE_KEY / DELEGATE_PRIVATE_KEY
  │
  ▼
ethers Wallet(key, JsonRpcProvider)
  │
  ▼
createConfig(...) from @zama-fhe/sdk/ethers
  │
  ├─ chains: [Sepolia preset + SEPOLIA_RPC_URL + optional RELAYER_API_KEY]
  ├─ signer: ethers Wallet
  ├─ storage: MemoryStorage
  └─ relayers: { [sepolia.id]: node() }
       │
       ▼
ZamaSDK(config)
  │
  └─ Token via sdk.createToken(confidentialTokenAddress)
```

The ethers adapter converts the `Wallet` and attached `JsonRpcProvider` into the SDK's
generic signer/provider interfaces. The `node()` transport uses native Node.js
`worker_threads` for FHE work. Each SDK instance in this demo has its own signer and
in-memory credential store.

## Section 1 — Setup

The script creates a normal ethers provider and two wallets:

```ts
const provider = new JsonRpcProvider(SEPOLIA_RPC_URL);
const walletA = new Wallet(PRIVATE_KEY, provider);
const walletB = new Wallet(DELEGATE_PRIVATE_KEY, provider);
```

It then derives a Zama Sepolia chain config from the SDK preset:

```ts
const zamaSepolia = {
  ...sepolia,
  network: SEPOLIA_RPC_URL,
  ...(RELAYER_API_KEY && { auth: { __type: "ApiKeyHeader" as const, value: RELAYER_API_KEY } }),
} as const satisfies FheChain;
```

`network` is the host-chain RPC endpoint used by SDK reads and transaction polling.
`auth` is optional on Sepolia and useful on authenticated relayer deployments.

Each wallet gets its own SDK instance:

```ts
using sdkA = new ZamaSDK(
  createConfig({
    chains: [zamaSepolia],
    signer: walletA,
    storage: new MemoryStorage(),
    relayers: { [zamaSepolia.id]: node() },
  }),
);
```

`using` ensures `sdk.terminate()` runs when the scope exits, including on errors, so the
Node worker pool is shut down cleanly.

## Registry Lookup

The example receives the public ERC-20 token address in `TOKEN_ADDRESS`, then resolves
the registered confidential token/wrapper:

```ts
const registryResult = await sdkA.registry.getConfidentialToken(TOKEN_ADDRESS as Address);
if (!registryResult) {
  throw new Error(`No confidential wrapper registered for ${TOKEN_ADDRESS}`);
}
if (!registryResult.isValid) {
  throw new Error(`Confidential wrapper registration for ${TOKEN_ADDRESS} is revoked or invalid`);
}
const { confidentialTokenAddress } = registryResult;
```

The registry can return a non-null but invalid entry when a wrapper has been revoked, so
the example checks both conditions before creating `Token` instances.

```ts
const tokenA = sdkA.createToken(confidentialTokenAddress);
const tokenB = sdkB.createToken(confidentialTokenAddress);
```

In this deployment the confidential token is also the ERC-7984 wrapper. Only pass a
separate wrapper address if a verified deployment uses distinct confidential-token and
wrapper contracts.

## Section 2 — Mint

The demo token is a mock ERC-20, so the script mints public USDT directly to Account A:

```ts
const erc20 = new Contract(TOKEN_ADDRESS as Address, ERC20_ABI, walletA);
const mintTx = await mintFn(walletA.address, MINT_AMOUNT);
await mintTx.wait();
```

This is intentionally plain ethers code because minting the public mock token is outside
the confidential token flow. On production tokens, fund the account through normal token
distribution instead.

## Section 3 — Confidential Token Lifecycle

### `balanceOf(owner)`

SDK 3.x requires the balance owner explicitly:

```ts
const balanceA = await tokenA.balanceOf(walletA.address as Address);
const balanceB = await tokenB.balanceOf(walletB.address as Address);
```

The SDK creates or reuses decrypt credentials, asks the relayer to re-encrypt the
on-chain ciphertext to the local key, decrypts locally, and returns a plaintext `bigint`.

### `shield`

```ts
await tokenA.shield(SHIELD_AMOUNT, {
  onApprovalSubmitted: (tx) => console.log("  Approval submitted:", tx),
  onShieldSubmitted: (tx) => console.log("  Shield submitted:  ", tx),
});
```

`shield()` is SDK-owned routing:

| Underlying token capability | SDK path                                 |
| --------------------------- | ---------------------------------------- |
| ERC-1363 supported          | `transferAndCall` in one transaction     |
| ERC-1363 not supported      | `approve` if needed, then wrapper `wrap` |

`onApprovalSubmitted` only fires on the approve + wrap path. The app should not
reimplement this routing.

### `confidentialTransfer`

```ts
await tokenA.confidentialTransfer(walletB.address as Address, TRANSFER_AMOUNT, {
  onEncryptComplete: () => console.log("  Encryption complete"),
  onTransferSubmitted: (tx) => console.log("  Transfer submitted:", tx),
});
```

The amount is encrypted client-side before the transaction is submitted. Only the
recipient and authorized delegates can decrypt the resulting balance.

### `unshield`

```ts
await tokenA.unshield(UNSHIELD_AMOUNT, {
  onUnwrapSubmitted: (tx) => console.log("  Unwrap submitted:   ", tx),
  onFinalizing: () => console.log("  Waiting for finalization..."),
  onFinalizeSubmitted: (tx) => console.log("  Finalize submitted:", tx),
});
```

Unshielding is a two-phase operation:

| Phase | Operation                                                                     |
| ----- | ----------------------------------------------------------------------------- |
| 1     | `unwrap`: burns or locks the confidential balance and requests public release |
| 2     | `finalizeUnwrap`: relayer finalization releases the public ERC-20 amount      |

The SDK waits for both phases and exposes callbacks for progress logging.

## Section 4 — Delegation

Delegation lets Account B decrypt Account A's confidential balance without holding
Account A's private key.

```ts
await tokenA.delegateDecryption({ delegateAddress: walletB.address as Address });
```

The example then verifies the grant:

```ts
const isDelegated = await tokenA.isDelegated({
  delegatorAddress: walletA.address as Address,
  delegateAddress: walletB.address as Address,
});
```

Account B decrypts Account A's balance with:

```ts
const balanceOfAasB = await tokenB.decryptBalanceAs({
  delegatorAddress: walletA.address as Address,
});
```

Sepolia ACL propagation can take one or two minutes, so the script retries
`DelegationNotPropagatedError` before failing.

Finally, Account A revokes the grant:

```ts
await tokenA.revokeDelegation({ delegateAddress: walletB.address as Address });
```

SDK 3.x checks delegation status before using cached delegated balances, so revoked
delegations should not continue to succeed from stale cache.

## Environment

`.env.example` provides:

| Variable               | Purpose                                                         |
| ---------------------- | --------------------------------------------------------------- |
| `PRIVATE_KEY`          | Account A: mint, shield, transfer, unshield, delegate, revoke   |
| `DELEGATE_PRIVATE_KEY` | Account B: delegated decrypt demo                               |
| `SEPOLIA_RPC_URL`      | Host-chain RPC used by ethers and SDK provider reads            |
| `TOKEN_ADDRESS`        | Public ERC-20 mock token; SDK resolves the confidential wrapper |
| `RELAYER_API_KEY`      | Optional relayer auth, usually not required on Sepolia          |

## Storage

The script uses `MemoryStorage` for simplicity. Credentials are lost when the process
exits, which is fine for a demo CLI.

For production backends, use a persistent `GenericStorage` implementation, for example
Redis. For per-request isolation in HTTP servers, use `asyncLocalStorage` from
`@zama-fhe/sdk/node`.

## Cleanup

`ZamaSDK` implements `Symbol.dispose`, so the `using` declarations call `terminate()` at
the end of `main()`. This shuts down worker resources even if a later operation throws.

## Troubleshooting

| Symptom                            | Likely cause                                    | Fix                                                        |
| ---------------------------------- | ----------------------------------------------- | ---------------------------------------------------------- |
| `Missing env: ...`                 | Required `.env` variable is unset               | Copy `.env.example` to `.env` and fill all required values |
| No registered wrapper              | `TOKEN_ADDRESS` is not in the wrappers registry | Use the Sepolia mock token from `.env.example`             |
| Wrapper registration invalid       | Registry entry was revoked                      | Use a currently valid token/wrapper pair                   |
| Delegated decrypt not propagated   | Sepolia ACL propagation is still catching up    | Let the retry loop run; 1-2 minutes can be normal          |
| `unshield` finalization is delayed | Relayer/chain finalization delay                | Wait; phase 2 depends on relayer polling and chain state   |
