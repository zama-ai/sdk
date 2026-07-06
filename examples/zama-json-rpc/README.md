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

---

## How it works

```text
Client request
    |
    v
zama-json-rpc
    |
    |-- calldata shape matches a known confidential operation
    |   (currently: confidentialTransfer, i.e. a plain transfer(to, amount))
    |       -> is "to" a genuine confidential token? (on-chain check via
    |          Zama's wrappers registry, sdk.registry.isConfidentialTokenValid)
    |             yes -> decode plaintext args, encrypt the marked argument
    |                    via ZamaSDK.encrypt(), rebuild the real on-chain
    |                    calldata, forward the rewritten, still-unsigned tx
    |             no  -> forward unchanged (probably a real ERC-20)
    |             lookup failed -> reject (fail closed, never guess)
    |
    |-- method is zama_* (introspection only)
    |       -> handled locally, no chain interaction
    |
    |-- anything else
            -> forwarded to the upstream RPC unchanged
```

The server never holds a private key and never signs or submits anything
itself — it only rewrites calldata before an unsigned `eth_sendTransaction`
reaches whatever already signs it upstream (a wallet, a custodian signer, a
local dev node). See `WALKTHROUGH.md` for why that positioning matters.

## Prerequisites

- Node.js >= 22
- A Sepolia RPC endpoint (any public node works for read/pass-through
  methods; see `WALKTHROUGH.md` for the `eth_sendTransaction` caveat)

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
Auto-rewriting confidential operations: confidentialTransfer (ERC-7984 standard)
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

## CLI options

| Flag                       | Env var                  | Default                  |
| --------------------------- | ------------------------- | ------------------------- |
| `--rpcUrl <url>`            | `ZAMA_RPC_URL`             | *(required)*               |
| `--chainId <id>`             | `ZAMA_CHAIN_ID`            | `11155111` (Sepolia)       |
| `--host <host>`              | `ZAMA_HOST`                | `127.0.0.1`                 |
| `--port <port>`              | `ZAMA_PORT`                | `8545`                      |
| `--httpPath <path>`          | `ZAMA_HTTP_PATH`           | `/`                          |
| `--relayerApiKey <key>`      | `ZAMA_RELAYER_API_KEY`     | *(optional on testnet)*    |
| `-v, --verbose`              | `ZAMA_VERBOSE`             | `false`                      |
| `-q, --quiet`                 | `ZAMA_QUIET`               | `false`                      |

Binding `--host 0.0.0.0` prints a warning — this POC has no production auth
model (see `WALKTHROUGH.md`).

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

Supporting another *token* needs no code change at all — any address Zama's
on-chain wrappers registry confirms as a valid confidential token is
auto-rewritten. Supporting another *operation* (wrap, transferFrom,
confidentialTransferAndCall, ...) is one new file under
`src/registry/operations/` implementing `ConfidentialOperation` (see
`src/registry/types.ts`), plus one line registering it in `src/cli.ts`.
Nothing else changes — see `WALKTHROUGH.md`.

## Non-goals (this POC)

- ERC-20 ↔ ERC-7984 wrap/unwrap
- Signing, custody, or transaction submission
- Smart-contract-wallet / account-abstraction senders (current Zama protocol
  limitation, not specific to this wrapper)
- Production auth, TEE deployment, multi-tenant hosting

See `WALKTHROUGH.md` for the full picture.
