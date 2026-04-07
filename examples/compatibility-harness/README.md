# Zama Compatibility Validation Harness

A developer tool that validates whether your signing system is compatible with the Zama SDK.

Run it once. Get a clear PASS / FAIL / SKIP report for each of:

- **EIP-712 typed data** — signature recoverable via `ecrecover`
- **Transaction execution** — on-chain broadcast (EOA) or contract call routing (MPC)
- **Zama SDK flow** — ERC-7984 credential authorization (`sdk.allow()`)

The **final verdict** is determined by the Zama SDK section only. An EOA-specific
test that is skipped (e.g. because you use an MPC wallet) does not block compatibility.

---

## Who this is for

Infrastructure teams, custody providers, and wallet integrators (Crossmint, Openfort,
Turnkey, Privy, …) who want to verify their signing stack works with the Zama SDK
**before** building a full integration.

---

## Quickstart — EOA wallet (default)

```bash
git clone <repo>
cd examples/compatibility-harness
npm install
cp .env.example .env
```

Edit `.env`, set `PRIVATE_KEY` to a Sepolia-funded EOA key, then:

```bash
npm test
```

---

## Quickstart — MPC wallet (e.g. Crossmint)

```bash
git clone <repo>
cd examples/compatibility-harness
npm install

# 1. Swap in the Crossmint adapter
cp examples/crossmint/signer.ts src/signer/index.ts

# 2. Configure credentials
cp .env.example .env
#    → set CROSSMINT_API_KEY and CROSSMINT_WALLET_LOCATOR (leave PRIVATE_KEY blank)

npm test
```

See [`examples/crossmint/COMPATIBILITY.md`](examples/crossmint/COMPATIBILITY.md) for
the full Crossmint setup guide and expected report output.

---

## Writing your own adapter

Open `src/signer/index.ts`. Replace the default EOA implementation with your own.
The only constraint is that your export satisfies this interface:

```ts
export interface Signer {
  /** The wallet address (checksummed 0x string). */
  address: string;

  /** Required — must produce a standard secp256k1 EIP-712 signature. */
  signTypedData: (data: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  }) => Promise<string>;

  /**
   * Optional — EOA path.
   * Sign a raw EIP-1559 transaction and return the serialised hex string.
   * If omitted, the Transaction Execution test is skipped.
   */
  signTransaction?: (tx: {
    to: string;
    value: bigint;
    data: string;
    gas: bigint;
    maxFeePerGas: bigint;
    maxPriorityFeePerGas: bigint;
    nonce: number;
    chainId: number;
    type: "eip1559";
  }) => Promise<string>;

  /**
   * Optional — MPC / smart-account path.
   * Submit a contract call and return the transaction hash.
   * If `signTransaction` is absent and this is present, the Transaction
   * Execution test is skipped (writeContract is used during Zama SDK flows).
   */
  writeContract?: (config: {
    address: string;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    value?: bigint;
  }) => Promise<string>;
}
```

**No other file needs to change.**

### Async address resolution (MPC adapters)

Some MPC providers cannot provide `signer.address` synchronously at startup
(they need to call an API to resolve it from a wallet locator). To handle this,
also export a `ready` promise — the harness awaits it before the first test runs:

```ts
// src/signer/index.ts
export const signer: Signer = { ... };

// Harness awaits this before accessing signer.address.
export const ready: Promise<void> = provider.init().then(addr => {
  signer.address = addr;
});
```

Alternatively, set the address directly in `.env` to skip the async lookup entirely
(see the Crossmint example: `CROSSMINT_WALLET_ADDRESS`).

### Example — EOA via viem

```ts
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";
import type { Signer } from "./types.js";

const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
const client  = createWalletClient({ account, chain: sepolia, transport: http() });

export const signer: Signer = {
  address:         account.address,
  signTypedData:   (data) => client.signTypedData({ account, ...data }),
  signTransaction: (tx)   => client.signTransaction({ account, ...tx }),
};
```

### Example — MPC adapter (Crossmint)

See the ready-to-use adapter at [`examples/crossmint/signer.ts`](examples/crossmint/signer.ts).

---

## Environment variables

Copy `.env.example` to `.env`. Only set the variables relevant to your adapter.

### EOA signer (default)

| Variable      | Required | Default | Description |
| ------------- | -------- | ------- | ----------- |
| `PRIVATE_KEY` | Yes\*    | —       | `0x`-prefixed 32-byte hex private key. \*Only required for the built-in EOA signer. |

### Crossmint MPC adapter

| Variable                    | Required | Default | Description |
| --------------------------- | -------- | ------- | ----------- |
| `CROSSMINT_API_KEY`         | Yes      | —       | Your Crossmint server-side API key |
| `CROSSMINT_WALLET_LOCATOR`  | Yes      | —       | e.g. `email:alice@example.com:evm-smart-wallet` |
| `CROSSMINT_WALLET_ADDRESS`  | No       | —       | `0x` address — skips the `/wallets` API call at startup |

### Network

| Variable          | Required | Default                                       | Description |
| ----------------- | -------- | --------------------------------------------- | ----------- |
| `RPC_URL`         | No       | `https://ethereum-sepolia-rpc.publicnode.com` | Sepolia JSON-RPC endpoint |
| `RELAYER_URL`     | No       | `https://relayer.testnet.zama.org/v2`         | Zama relayer base URL |
| `RELAYER_API_KEY` | No       | _(empty)_                                     | `x-api-key` for private/mainnet relayers |

---

## Supported networks

| Network | Chain ID | Public relayer |
| ------- | -------- | -------------- |
| Sepolia | 11155111 | `https://relayer.testnet.zama.org/v2` (no API key) |

---

## How to read the report

After `npm test`, a compatibility report is printed at the end:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Zama Compatibility Report
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Signer             0xcafe1234…abcd5678
  Type               MPC
  EIP-712            ✓ recoverable (secp256k1)
  signTransaction    – not provided
  writeContract      ✓ provided (MPC / smart-account path)

  ── Ethereum Compatibility ─────────────────────────────
  ✓ EIP-712 Signature                      PASS
  – Transaction Execution                  SKIP
      Note:           writeContract path available — raw transaction signing not
                      supported (expected for MPC wallets).

  ── Zama SDK Compatibility ─────────────────────────────
  ✓ Zama SDK Flow                          PASS

────────────────────────────────────────────────────────
  Final: ZAMA COMPATIBLE ✓
  Note:  1 Ethereum test skipped — not required for Zama SDK compatibility
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

Every failure includes:
- **Reason** — what went wrong
- **Likely cause** — the most probable root cause
- **Recommendation** — what to fix

The final verdict is `ZAMA COMPATIBLE` if all **Zama SDK** tests pass,
regardless of Ethereum-section SKIPs.

---

## What the tests validate

| # | Test | Section | What it checks |
|---|------|---------|----------------|
| 1 | Signer Profile | (header) | Detects signer type (EOA / MPC / Smart Account) — never fails |
| 2 | EIP-712 Signature | Ethereum | Signature recoverable via `ecrecover` and matches `signer.address` |
| 3 | Transaction Execution | Ethereum | EOA: sign + broadcast. MPC: SKIP (writeContract path). No capability: SKIP |
| 4 | Zama SDK Flow | Zama | `sdk.allow()` completes — EIP-712 credential payload accepted by the relayer |

---

## CI/CD integration

Use environment secrets to inject credentials — no `.env` file needed in CI.

### GitHub Actions example

```yaml
- name: Run Zama compatibility harness
  working-directory: examples/compatibility-harness
  env:
    PRIVATE_KEY:                 ${{ secrets.PRIVATE_KEY }}
    # Or, for MPC adapters:
    CROSSMINT_API_KEY:           ${{ secrets.CROSSMINT_API_KEY }}
    CROSSMINT_WALLET_LOCATOR:    ${{ secrets.CROSSMINT_WALLET_LOCATOR }}
    CROSSMINT_WALLET_ADDRESS:    ${{ secrets.CROSSMINT_WALLET_ADDRESS }}
  run: npm ci && npm test
```

---

## Troubleshooting

### `PRIVATE_KEY is not set` — but I'm using an MPC adapter

You copied `examples/crossmint/signer.ts` to `src/signer/index.ts` but did not
rebuild the module cache, or the wrong file is still in place.
Verify: `head -5 src/signer/index.ts` — it should reference `CROSSMINT_API_KEY`,
not `PRIVATE_KEY`.

### `signer.address is not yet available`

Your adapter resolves the address asynchronously but has not exported a `ready`
promise. See the [async address resolution](#async-address-resolution-mpc-adapters)
section above, or set `CROSSMINT_WALLET_ADDRESS` directly in `.env`.

### EIP-712 FAIL — "Signature is not recoverable via ecrecover"

Your signer produces a non-standard signature format (ERC-1271 smart account,
threshold / BLS signature, etc.). Standard secp256k1 is required for the Zama SDK
credential flow. Check whether your provider offers an "EOA-compatible" signing mode.

### Zama SDK Flow FAIL — relayer or network errors

- Verify `RELAYER_URL` is reachable: `curl -s $RELAYER_URL/healthz`
- The public Sepolia relayer requires no API key — `RELAYER_API_KEY` should be empty
- If you override `RPC_URL`, confirm the node is synced and responsive
- Increase `testTimeout` in `vitest.config.ts` if the relayer is slow (default: 60 s)

### Transaction Execution FAIL — "insufficient funds"

Get Sepolia ETH at [sepoliafaucet.com](https://sepoliafaucet.com) or
[faucet.alchemy.com](https://faucet.alchemy.com/faucets/ethereum-sepolia).
The test sends a zero-value self-transfer — it only costs gas (~0.0001 ETH).

### Tests time out

Increase `testTimeout` in `vitest.config.ts`:

```ts
testTimeout: 120_000, // 2 minutes
```

Network calls to the relayer and RPC can be slow on congested testnets.
