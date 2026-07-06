# confidential-indexer

The read-side companion to `examples/zama-json-rpc` (write-side) — a
**separate product, separate deployable** (own Docker image, own repo path)
per an explicit product decision, not just a code-organization choice. See
`WALKTHROUGH.md` for the SDK-149 context this was built for.

For token holders who have delegated decrypt rights (`delegateDecryption`)
to this service's own operational address, it watches on-chain confidential
transfers, decrypts balances and transfer amounts via the Zama relayer, and
serves them through a small query API — so a consumer doesn't have to pay
the relayer round-trip cost on every single lookup.

> **Not a public block explorer.** Confidential balances are only ever
> visible to whoever the protocol's ACL actually authorizes (owner or an
> active delegate) — this service can only ever show what its own
> delegate identity has been granted, to whoever is allowed to query it.
> See `WALKTHROUGH.md`.

> **Status: proof of concept.** Not a maintained product.

---

## How it works

```text
Token holder                                    This service
     |                                                |
     |-- delegateDecryption(indexerAddress, token) -->|  (on-chain, holder-initiated)
     |                                                |
     |                                    [poll] scan ACL logs for
     |                                    delegate == indexerAddress
     |                                                |
     |                                    [poll] read confidentialBalanceOf(holder)
     |                                    + watch ConfidentialTransfer logs
     |                                                |
     |                                    decrypt handles via
     |                                    sdk.decryption.delegatedDecryptValues()
     |                                    (signer-independent per-value,
     |                                     but this service's OWN key must
     |                                     be the delegate — real custody)
     |                                                |
     |<-- GET /balances/:token/:holder ---------------|  (app-level auth,
     |<-- GET /transfers/:token/:holder --------------|   separate from the
     |                                                |   on-chain ACL)
```

## Prerequisites

- Node.js >= 22
- A Sepolia RPC endpoint that supports `eth_getLogs` with a workable block
  range (some public nodes cap this hard — `drpc.org`/`1rpc.io` worked
  during development; `ethereum-sepolia-rpc.publicnode.com` did not, even
  for small recent ranges)
- A private key for this service's own operational (delegate) identity —
  genuine custody, see `WALKTHROUGH.md`

## Setup

```bash
cd examples/confidential-indexer
npm install
cp .env.example .env
```

## Usage

```bash
npm start -- \
  --rpcUrl https://sepolia.drpc.org \
  --chainId 11155111 \
  --operationalPrivateKey 0xYourDelegateKey \
  --fromBlock 11200000
```

Expected output:

```text
Confidential indexer listening on http://127.0.0.1:8787
Operational (delegate) address: 0x...
```

For token holders to be covered, they (or whoever's key controls their
account) must have already called `delegateDecryption` naming this
service's operational address as the delegate — this service only ever
discovers and reacts to delegations that already exist on-chain, it never
creates or requests them.

### Query it

```bash
curl http://127.0.0.1:8787/health

curl http://127.0.0.1:8787/delegations

curl http://127.0.0.1:8787/balances/0xTokenAddress/0xHolderAddress

curl http://127.0.0.1:8787/transfers/0xTokenAddress/0xHolderAddress
```

`balances`/`transfers` return `403` if there's no known active delegation
for that (account, token) pair, `202` if the delegation is known but not
decrypted yet, `200` with the cached value otherwise.

## App-level auth

`--apiKey` gates the query API with a shared bearer token
(`Authorization: Bearer <key>`) — **separate from the on-chain ACL
delegation**. The delegation controls what this service is allowed to
decrypt; `--apiKey` controls who is allowed to read the results back out.
Without it, anyone who can reach the service can read anything it has ever
decrypted — fine for local exploration, not beyond that.

## CLI options

| Flag                        | Env var                            | Default                |
| ----------------------------- | ------------------------------------ | ------------------------ |
| `--rpcUrl <url>`              | `INDEXER_RPC_URL`                    | *(required)*             |
| `--chainId <id>`              | `INDEXER_CHAIN_ID`                   | `11155111` (Sepolia)      |
| `--host <host>`               | `INDEXER_HOST`                       | `127.0.0.1`               |
| `--port <port>`               | `INDEXER_PORT`                       | `8787`                    |
| `--operationalPrivateKey <key>` | `INDEXER_OPERATIONAL_PRIVATE_KEY`  | *(required)*              |
| `--relayerApiKey <key>`       | `INDEXER_RELAYER_API_KEY`            | *(optional on testnet)*  |
| `--apiKey <key>`              | `INDEXER_API_KEY`                    | *(unauthenticated)*      |
| `--fromBlock <block>`         | `INDEXER_FROM_BLOCK`                 | *(required)*              |
| `--pollIntervalMs <ms>`       | `INDEXER_POLL_INTERVAL_MS`           | `60000`                   |
| `-v, --verbose`               | `INDEXER_VERBOSE`                    | `false`                   |
| `-q, --quiet`                 | `INDEXER_QUIET`                      | `false`                   |

## Docker

```bash
docker build -t confidential-indexer .
docker run --rm -p 8787:8787 \
  -e INDEXER_RPC_URL=https://sepolia.drpc.org \
  -e INDEXER_CHAIN_ID=11155111 \
  -e INDEXER_OPERATIONAL_PRIVATE_KEY=0xYourDelegateKey \
  -e INDEXER_FROM_BLOCK=11200000 \
  confidential-indexer
```

## Tests

```bash
npm test        # unit tests, fully mocked
npm run test:e2e  # queries real historical logs on live Sepolia — see WALKTHROUGH.md
```

## Non-goals (this POC)

- Persistent storage (in-memory only — restarting loses the cache, not the
  on-chain delegations, which get rediscovered)
- `userDecrypt` / per-request signature relay (still-confidential balances
  a consumer hasn't been delegated — see WALKTHROUGH.md)
- Production auth, TEE deployment, multi-tenant hosting, HSM-backed key storage
- Reorg handling for the log scanners

See `WALKTHROUGH.md` for the full picture.
