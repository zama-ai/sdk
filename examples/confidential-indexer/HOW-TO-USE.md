# How to use the Zama confidential indexer

This guide is for developers integrating **`confidential-indexer`** — the
read-side of Zama's Privacy Service proof of concept
([SDK-149](https://linear.app/zama/issue/SDK-149)). It answers three
questions: what this is, how to test it in the next few minutes, and how it
fits into an app you already have.

> For the full CLI reference, see [`README.md`](./README.md). For design
> rationale, limitations, and verification evidence, see
> [`WALKTHROUGH.md`](./WALKTHROUGH.md). Looking for the write-side instead?
> See [`examples/zama-json-rpc/HOW-TO-USE.md`](../zama-json-rpc/HOW-TO-USE.md).

## What this is

A confidential ERC-7984 token's balance and transfer history are encrypted
on-chain — by protocol design, decrypting a value normally means a signed
per-request round trip to the Zama relayer. `confidential-indexer` removes
that per-lookup cost for a specific, narrow case: accounts that have
explicitly granted it decrypt rights.

It's a separate, **stateful** service (unlike the write-side wrapper, which
is stateless and holds no key at all): it watches the chain for on-chain ACL
delegations naming its own address, decrypts balances and transfer amounts
for exactly those accounts, caches the results, and serves them over a small
REST API.

> **Not a public block explorer.** This service can only ever decrypt and
> show what its _own_ delegate identity has actually been granted by the
> account owner. No delegation, no data — see "Try it yourself" below for
> exactly what that looks like.

## How it works

```text
Token holder                                   confidential-indexer
     │                                          (holds a real private key,
     │                                           continuously — genuine custody)
     │                                                    │
     │── delegateDecryption(delegateAddr, token) ────────►│  one-time, on-chain,
     │   (holder-initiated, via the ACL contract)          │  holder-initiated
     │                                                    │
     │                                         [poll] scan ACL logs for
     │                                         delegate == its own address
     │                                                    │
     │                                         [poll] confidentialBalanceOf(holder)
     │                                                + watch ConfidentialTransfer logs
     │                                                    │
     │                                         decrypt via its own key
     │                                         (sdk.decryption.delegatedDecryptValues)
     │                                                    │
     │                                         cache the decrypted result
     │                                                    │
     │◄── GET /balances/:token/:holder ────────────────────│  app-level auth,
     │◄── GET /transfers/:token/:holder ───────────────────│  separate from the
     │◄── GET /delegations ────────────────────────────────│  on-chain ACL
```

Two authorization layers, deliberately not conflated: the **on-chain ACL
delegation** controls what this service is even capable of decrypting; the
service's own **`--apiKey`** controls who is allowed to read the results back
out afterward. Granting the delegation does not, by itself, make your data
public — it only makes it decryptable _by this one service_, for whoever it
lets query it.

## Try it yourself

Everything below runs against real Sepolia, using the repo you already have
cloned (branch `feat/sdk-149-privacy-service-poc`,
[PR #535](https://github.com/zama-ai/sdk/pull/535)).

### 1. Start your own instance

You need your own operational (delegate) identity — any fresh private key
works, it just needs a little Sepolia ETH later if _you_ end up granting
delegations from it for testing:

```bash
cd examples/confidential-indexer
npm install
npx tsx src/cli.ts --port 8787 \
  --rpcUrl https://sepolia.drpc.org --chainId 11155111 \
  --operationalPrivateKey 0xYourOperationalKey \
  --fromBlock 11223000 --verbose
```

```text
Confidential indexer listening on http://127.0.0.1:8787
Operational (delegate) address: 0xYourOperationalAddress
```

`--fromBlock` only needs to be recent enough to catch delegations you care
about — it doesn't need to reach back to the token's genesis.

### 2. No delegation, no data — by design

Query any account that hasn't delegated to your instance:

```bash
curl -s -w '\nHTTP %{http_code}\n' \
  http://127.0.0.1:8787/balances/0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639/0xSomeRandomAddress
```

```json
{"error":"No known active delegation for this account/token"}
HTTP 403
```

This is the correct, honest response — not an error to work around. It's
the entire point of the ACL model.

### 3. Grant a delegation, then query for real

For this service to show anything, some account has to actually delegate to
it. In your own app, this is one SDK call the token holder makes (or a
frontend button — `useDelegateDecryption` on the React side):

```ts
import { ZamaSDK } from "@zama-fhe/sdk";
// sdk configured with the holder's own signer — see packages/sdk docs
await sdk.delegations.delegateDecryption({
  contractAddress: "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639", // the token
  delegateAddress: "0xYourOperationalAddress", // your indexer
});
```

(`examples/rpc-demo-app/scripts/grant-delegation.mjs` is a runnable version
of exactly this, if you want a script instead of writing one from scratch.)

Once that transaction is mined and your instance's next poll cycle runs
(seconds, not minutes, in practice), query again:

```bash
curl -s http://127.0.0.1:8787/delegations
```

```json
{
  "delegations": [
    {
      "delegator": "0x72059F5569B6c7ab165Bf05a280f2F870C73b4f8",
      "contractAddress": "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
      "expirationDate": "18446744073709551615"
    }
  ]
}
```

```bash
curl -s http://127.0.0.1:8787/balances/0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639/0x72059F5569B6c7ab165Bf05a280f2F870C73b4f8
```

```json
{
  "delegator": "0x72059F5569B6c7ab165Bf05a280f2F870C73b4f8",
  "contractAddress": "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
  "encryptedValue": "0x0edc9283039c7be0e8797100ab42a08cb104ba4f27ff0000000000aa36a70500",
  "clearValue": "87317021",
  "decryptedAtBlock": "11223389"
}
```

`clearValue` is the raw integer amount — divide by the token's decimals
(`10^6` for cUSDC) to get `87.317021`. This is a real, live response,
captured while writing this guide: a real delegation
(tx `0x3818c5b47e8fd568527d5570b58cb659b3c601a8e2ba15cab4d4423f79a353b2`,
block `11223388`) granted from a disposable Sepolia test account, decrypted
by a freshly generated operational identity with no prior history. Nothing
about this example is staged.

```bash
curl -s http://127.0.0.1:8787/transfers/0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639/0x72059F5569B6c7ab165Bf05a280f2F870C73b4f8
```

```json
{ "transfers": [] }
```

An empty list here is also a correct, real answer — it means no
`ConfidentialTransfer` events involving this holder were found at or after
`--fromBlock`. Point `--fromBlock` at (or before) a block where a real
transfer happened for this holder, and the same call returns decrypted
transfer amounts instead.

## Where you fit in

This service's operational model is fundamentally different from the
write-side wrapper's, and that shapes your integration:

- **The write-side never holds a key and never needs to be trusted with
  anything.** This service **does** — continuously, for real. Whoever runs
  an instance holds a private key that can decrypt every balance and
  transfer anyone has ever delegated to it. That's not a limitation to
  design around; it's the service's entire value proposition (avoiding a
  relayer round-trip per query), and it comes with a real custody
  responsibility attached.
- As an integrator, you have two options, and the right one depends on your
  trust model:
  - **Run your own instance.** You hold the operational key yourself (HSM,
    secrets manager — not an env var, for anything beyond local testing).
    Your users delegate to _your_ address. You control both layers of
    authorization end-to-end.
  - **Consume someone else's already-running instance.** You're trusting
    that operator's key custody and their `--apiKey`-gated access control.
    Reasonable for internal tooling or a trusted partner; not something to
    do blindly for a public-facing product.
- **Your users make the on-chain delegation call, not you on their behalf**
  (unless you are the key holder — e.g. a custodial product). It's a normal
  signed transaction, same signing model as any other write — see the
  write-side guide's "Where you fit in" for what that implies if the signer
  is a browser wallet.
- **Querying is just REST.** No SDK import needed on the consuming side —
  same posture as the write-side wrapper: plain HTTP in, plain JSON out.

## Endpoints

| Endpoint                        | Returns                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------- |
| `GET /health`                   | `{"status":"ok"}`                                                                         |
| `GET /delegations`              | All delegations this instance has discovered and considers active                         |
| `GET /balances/:token/:holder`  | `403` no delegation · `202` delegated, not decrypted yet · `200` cached decrypted balance |
| `GET /transfers/:token/:holder` | Same status semantics, decrypted transfer history                                         |

## Auth and production posture

- `--apiKey` gates the whole query API with a shared bearer token
  (`Authorization: Bearer <key>`) — separate from the on-chain ACL. Without
  it, anyone who can reach the service can read anything it has ever
  decrypted.
- `--redisUrl` makes state (delegations, balances, transfers, decrypt cache)
  persist across restarts. Without it, everything is in-memory: delegations
  get rediscovered from `--fromBlock` on restart, but already-decrypted data
  does not, and gets re-decrypted (a real relayer round trip) rather than
  served from cache.
- This is a proof of concept: no reorg handling, no HSM-backed key storage,
  no multi-tenant hosting. See `WALKTHROUGH.md` for the full list of known
  limitations before relying on it beyond exploration.

## Further reading

- [`README.md`](./README.md) — full CLI reference, Docker, all endpoints.
- [`WALKTHROUGH.md`](./WALKTHROUGH.md) — why write and read ship as two
  separate deployables, the real delegation+decrypt verification this guide
  builds on, and full known limitations.
