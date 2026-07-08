# zama-json-rpc

A local JSON-RPC server powered by `@zama-fhe/sdk`. It forwards standard
Ethereum JSON-RPC methods to an upstream RPC provider unchanged, and
transparently rewrites plaintext calls to known confidential-token
operations into their real, encrypted ERC-7984 calls — so callers write
ordinary-looking calldata (`transfer(to, amount)`) and never touch FHE
encryption directly. Works against **any** confidential token — there is no
per-token configuration; validity is checked on-chain, per request, via
Zama's own wrappers registry.

Inspired by [fireblocks-json-rpc](https://github.com/fireblocks/fireblocks-json-rpc)
in form (CLI shape, pass-through model), not in target audience — see
`WALKTHROUGH.md` for the context this was built for (Linear SDK-149).

> **Status: proof of concept.** Not a maintained product. See
> `WALKTHROUGH.md` for known limitations before relying on this for
> anything beyond exploration.

> **Integrating this into your own app?** See
> [`HOW-TO-USE.md`](./HOW-TO-USE.md) for a five-minute integrator-focused
> guide (execution diagram, copy-pasteable test calls, where you fit in).
> This README is the full CLI/reference doc.

---

## How it works

```text
Client request
    |
    v
zama-json-rpc
    |
    |-- calldata shape matches a known confidential operation
    |   (confidentialTransfer, confidentialTransferFrom,
    |    confidentialTransferAndCall, confidentialTransferFromAndCall,
    |    unwrap, or finalizeUnwrap — see "Operations" below)
    |       -> is "to" a genuine confidential token? (on-chain check via
    |          Zama's wrappers registry, sdk.registry.isConfidentialTokenValid)
    |             yes -> decode plaintext args, then either encrypt the
    |                    marked argument (ZamaSDK.encrypt()) or publicly
    |                    decrypt a handle (ZamaSDK.decryption.decryptPublicValues()),
    |                    rebuild the real on-chain calldata, forward the
    |                    rewritten, still-unsigned tx
    |             no  -> forward unchanged (probably a real ERC-20)
    |             lookup failed -> reject (fail closed, never guess)
    |
    |-- method is zama_* (introspection only)
    |       -> handled locally, no chain interaction
    |
    |-- anything else
            -> forwarded to the upstream RPC unchanged
```

The same rewrite applies to `eth_sendTransaction`, `eth_call`, and
`eth_estimateGas` alike — a client that simulates or estimates gas against
the plaintext-looking calldata before sending sees the _real_ operation,
not a call to a function that doesn't actually exist on-chain (which would
otherwise revert, or silently under-estimate gas — the real operations use
significantly more gas than a plain ERC-20 transfer, see `WALKTHROUGH.md`).

The server never holds a private key and never signs or submits anything
itself — it only rewrites calldata before an unsigned `eth_sendTransaction`
reaches whatever already signs it upstream (a wallet, a custodian signer, a
local dev node). See `WALKTHROUGH.md` for why that positioning matters.

## Prerequisites

- Node.js >= 22
- A Sepolia RPC endpoint (any public node works for `eth_call`/`eth_estimateGas`
  and pass-through reads; actually broadcasting `eth_sendTransaction` needs
  a signer-capable upstream behind it — see `WALKTHROUGH.md`)

## Setup

```bash
cd examples/zama-json-rpc
npm install
cp .env.example .env
```

## Usage

Start the server:

```bash
npm start -- --http --rpcUrl https://ethereum-sepolia-rpc.publicnode.com --chainId 11155111
```

Expected output:

```text
Zama JSON-RPC server listening on http://127.0.0.1:8545/
Auto-rewriting confidential operations: confidentialTransfer (ERC-7984 standard), confidentialTransferFrom (ERC-7984 standard), confidentialTransferAndCall (ERC-7984 standard), confidentialTransferFromAndCall (ERC-7984 standard), unwrap (ERC-7984 standard, phase 1/2 — request only), finalizeUnwrap (ERC-7984 standard, phase 2/2 — completes unwrap)
```

### Use it as a normal RPC endpoint

```bash
curl -X POST http://127.0.0.1:8545/ \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

Forwarded unchanged to the upstream RPC.

### Ask what it can do

```bash
curl -X POST http://127.0.0.1:8545/ \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"zama_getCapabilities","params":[]}'
```

### Check the audit trail over HTTP

Every routing decision (`rewritten` / `passthrough` / `rejected`) is written
to stdout, and also kept in an in-memory ring buffer (last 200, by default)
queryable at `GET /audit` — gated behind `--apiKey` like everything else when
configured. Built for `examples/rpc-demo-app`'s trace log, but useful for any
UI or script that wants to show real rewrite decisions without tailing the
process's own log:

```bash
curl http://127.0.0.1:8545/audit
```

### Send a plaintext confidential transfer

The caller writes a completely ordinary-looking `transfer(to, amount)` call
against any confidential token address — no Zama-specific code, no
per-token setup on the server:

```bash
curl -X POST http://127.0.0.1:8545/ \
  -H "content-type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"eth_sendTransaction",
    "params":[{
      "from":"0xYourAddress",
      "to":"0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
      "data":"0xa9059cbb0000000000000000000000002222222222222222222222222222222222222222000000000000000000000000000000000000000000000000000000000000000a"
    }]
  }'
```

With `--verbose`, the server logs show the plaintext amount getting redacted,
the operation matched, and the calldata rewritten before it's forwarded —
see `WALKTHROUGH.md` for a full annotated transcript, including what
happens next (this specific example needs a signer-capable upstream to
actually broadcast — a public RPC node will reject it with "unknown
account", which is expected and explained there).

## Operations

Two kinds of rewrite, both against any address the on-chain wrappers
registry confirms is a real confidential token:

- **`"encrypt"` operations** — send a plaintext-looking call, the wrapper
  encrypts the marked argument and forwards the real, encrypted ERC-7984
  call.
- **`"decrypt"` operations** — send a plaintext call referencing a handle,
  the wrapper publicly decrypts it (no signer needed — only handles the
  ERC-7984 protocol itself discloses, like a pending unwrap amount) and
  forwards the real call with the clear value + proof.

| Send this (plaintext)                                                       | Wrapper forwards this (real)                                                          | Kind    |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------- |
| `transfer(address to, uint256 amount)`                                      | `confidentialTransfer(to, encryptedAmount, inputProof)`                               | encrypt |
| `transferFrom(address from, address to, uint256 amount)`                    | `confidentialTransferFrom(from, to, encryptedAmount, inputProof)`                     | encrypt |
| `transferAndCall(address to, uint256 amount, bytes data)`                   | `confidentialTransferAndCall(to, encryptedAmount, inputProof, data)`                  | encrypt |
| `transferFromAndCall(address from, address to, uint256 amount, bytes data)` | `confidentialTransferFromAndCall(from, to, encryptedAmount, inputProof, data)`        | encrypt |
| `unwrap(address from, address to, uint256 amount)`                          | `unwrap(from, to, encryptedAmount, inputProof)` — phase 1/2                           | encrypt |
| `finalizeUnwrap(bytes32 unwrapRequestId)`                                   | `finalizeUnwrap(unwrapRequestId, unwrapAmountCleartext, decryptionProof)` — phase 2/2 | decrypt |

`transferFrom` requires the request's `from` (the actual on-chain caller) to
already be an approved operator for the logical `from` (the token holder) —
enforced on-chain via `setOperator`, not by this wrapper.

`unwrap`/`finalizeUnwrap` together complete ERC-7984's two-phase unwrap:
`unwrap` requests the conversion, `finalizeUnwrap` completes it once the KMS
has decrypted the amount (the caller supplies just the `unwrapRequestId`
from `unwrap`'s receipt — the wrapper fetches the clear value and proof).
If the KMS hasn't finished yet, `finalizeUnwrap` returns a retryable error;
no polling is done by the wrapper, the caller just retries the request
later. `wrap` (ERC-20 → confidential) needs no rewrite at all: its amount is
already plaintext by design, so it already works as plain pass-through.

## CLI options

| Flag                            | Env var                           | Default                     |
| ------------------------------- | --------------------------------- | --------------------------- |
| `--rpcUrl <url>`                | `ZAMA_RPC_URL`                    | _(required)_                |
| `--chainId <id>`                | `ZAMA_CHAIN_ID`                   | `11155111` (Sepolia)        |
| `--host <host>`                 | `ZAMA_HOST`                       | `127.0.0.1`                 |
| `--port <port>`                 | `ZAMA_PORT`                       | `8545`                      |
| `--httpPath <path>`             | `ZAMA_HTTP_PATH`                  | `/`                         |
| `--relayerApiKey <key>`         | `ZAMA_RELAYER_API_KEY`            | _(optional on testnet)_     |
| `--apiKey <key>`                | `ZAMA_API_KEY`                    | _(unset — unauthenticated)_ |
| `--tokenValidityTtlSeconds <s>` | `ZAMA_TOKEN_VALIDITY_TTL_SECONDS` | `86400`                     |
| `-v, --verbose`                 | `ZAMA_VERBOSE`                    | `false`                     |
| `-q, --quiet`                   | `ZAMA_QUIET`                      | `false`                     |

`--apiKey` gates the whole JSON-RPC surface behind a shared bearer token
(`Authorization: Bearer <key>`) — separate from `--relayerApiKey`, which
authenticates _this wrapper_ to the Zama relayer, not callers to this
wrapper. Without it, a startup warning fires: anyone reaching this server
can trigger real relayer `encrypt()` calls and probe which addresses are
confidential tokens.

Binding `--host 0.0.0.0` without `--apiKey` prints an additional warning —
this POC has no production auth model beyond the shared bearer token (see
`WALKTHROUGH.md`).

CORS is permissive and always on (`Access-Control-Allow-Origin: *`) — dev-only,
so a browser app (like `examples/rpc-demo-app`) can call this server directly
cross-origin. Same posture as the `0.0.0.0` warning: fine for local
development, not something to expose as-is.

## Docker

```bash
docker build -t zama-json-rpc .
docker run --rm -p 8545:8545 \
  -e ZAMA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com \
  -e ZAMA_CHAIN_ID=11155111 \
  zama-json-rpc --http
```

## Tests

```bash
npm test        # unit tests, fully mocked
npm run test:e2e  # hits the real Sepolia relayer — see WALKTHROUGH.md
```

## Extending

Supporting another _token_ needs no code change at all — any address Zama's
on-chain wrappers registry confirms as a valid confidential token is
auto-rewritten. Supporting another _operation_ is one new file under
`src/registry/operations/` implementing either the `"encrypt"` or
`"decrypt"` variant of `ConfidentialOperation` (see `src/registry/types.ts`),
plus one line registering it in `src/cli.ts`. Nothing else changes — see
`WALKTHROUGH.md`.

## Non-goals (this POC)

- Signing, custody, or transaction submission
- Smart-contract-wallet / account-abstraction senders (current Zama protocol
  limitation, not specific to this wrapper)
- Production auth, TEE deployment, multi-tenant hosting

See `WALKTHROUGH.md` for the full picture.
