# How to use the Zama custom RPC

This guide is for developers integrating **`zama-json-rpc`** — the write-side
of Zama's Privacy Service proof of concept ([SDK-149](https://linear.app/zama/issue/SDK-149)).
It answers three questions: what this is, how to test it in the next five
minutes, and how it fits into an app you already have.

> For the full CLI reference, see [`README.md`](./README.md). For design
> rationale, limitations, and verification evidence, see
> [`WALKTHROUGH.md`](./WALKTHROUGH.md).

## What this is

`zama-json-rpc` is a local JSON-RPC endpoint you put **in front of** a normal
Ethereum RPC node. Your app talks to it exactly like it would talk to any RPC
node — same JSON-RPC methods, same response shapes. The one difference: if a
call targets an address that's a genuine ERC-7984 confidential token, and the
call looks like an ordinary ERC-20 method, the server transparently rewrites
it into the real, encrypted confidential call before forwarding it onward.
Everything else — reads, calls to non-confidential contracts, anything that
isn't a recognized shape — passes through unchanged.

Concretely: your code calls `transfer(to, amount)`, the same function every
ERC-20 token exposes. If `to` is a confidential token, what actually reaches
the chain is `confidentialTransfer(to, encryptedAmount, inputProof)` — the
amount encrypted, a validity proof attached, nothing plaintext on-chain. Your
code never imports an SDK, never calls an encryption function, never knows
the token is confidential at all.

No per-token setup. Validity is checked on-chain, per request, against
Zama's own wrappers registry — any real confidential token works, the first
time, with no configuration.

## How it works

```text
Your app / script / wallet
       │  eth_sendTransaction / eth_call / eth_estimateGas
       │  plain calldata: transfer(to, amount)
       ▼
┌───────────────────────────────────────────┐
│  zama-json-rpc                            │
│                                            │
│  1. Does the calldata match a known        │
│     operation? (transfer, transferFrom,    │
│     transferAndCall, ...)                  │
│         │ no  ──────────────────────────────┼──► forward unchanged
│         │ yes                               │
│  2. Is "to" a genuine confidential token?  │
│     (on-chain check, cached)                │
│         │ no  ──────────────────────────────┼──► forward unchanged
│         │ lookup failed ─────────────────────┼──► reject (fail closed)
│         │ yes                               │
│  3. Encrypt the plaintext amount            │
│     (real call to the Zama relayer)         │
│  4. Rebuild the real calldata:               │
│     confidentialTransfer(to, encAmount,      │
│                          inputProof)         │
└───────────────────────────────────────────┘
       │  rewritten request, still UNSIGNED
       ▼
Whatever signs your transactions
(your wallet, your custodian, your signer service — see "Where you fit in")
       │  eth_sendRawTransaction (already signed)
       ▼
Upstream RPC → real chain
```

The rewrite applies identically to `eth_sendTransaction`, `eth_call`, and
`eth_estimateGas` — so a client that simulates or estimates gas before
sending sees the real operation's cost, not a call to a function that
doesn't actually exist on the real contract.

The server **never holds a private key and never signs anything**. It only
ever touches the request before it's signed. Signing and broadcasting stay
entirely your responsibility, same as today.

## Try it yourself

Everything below is copy-pasteable against the repo you already have cloned
(branch `feat/sdk-149-privacy-service-poc`, [PR #535](https://github.com/zama-ai/sdk/pull/535)).
No signer, no funded account, no setup beyond `npm install` — every call
below is either a read or a simulation.

```bash
cd examples/zama-json-rpc
npm install
npx tsx src/cli.ts --http --port 8545 \
  --rpcUrl https://ethereum-sepolia-rpc.publicnode.com \
  --chainId 11155111 --verbose
```

```text
Zama JSON-RPC server listening on http://127.0.0.1:8545/
```

### 1. A normal call, forwarded unchanged

```bash
curl -s http://127.0.0.1:8545/ \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}'
```

```json
{ "jsonrpc": "2.0", "result": "0xaa36a7", "id": 1 }
```

Ordinary pass-through — `0xaa36a7` is just Sepolia's chain ID (11155111),
answered by the real upstream node behind the wrapper.

### 2. Ask what it can do

```bash
curl -s http://127.0.0.1:8545/ \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"zama_getCapabilities","params":[]}'
```

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "name": "zama-json-rpc",
    "chainId": 11155111,
    "features": {
      "passThrough": true,
      "autoRewrite": true,
      "signing": false,
      "sendTransaction": false
    },
    "confidentialOperations": ["confidentialTransfer (ERC-7984 standard)", "..."]
  }
}
```

### 3. A "confidential transfer" — the ERC-20 analogy

This is the core of the product. You send exactly the calldata you'd send
for a plain ERC-20 `transfer(address to, uint256 amount)` — same selector
(`0xa9059cbb`), same argument encoding, against a real deployed confidential
token address (cUSDC on Sepolia, used throughout this project's own
verification):

```bash
curl -s http://127.0.0.1:8545/ \
  -H "content-type: application/json" \
  -d '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"eth_estimateGas",
    "params":[{
      "from":"0xYourAddress",
      "to":"0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
      "data":"0xa9059cbb0000000000000000000000002222222222222222222222222222222222222222000000000000000000000000000000000000000000000000000000000000000a"
    }]
  }'
```

```json
{ "jsonrpc": "2.0", "id": 1, "result": "0x75f31" }
```

`0x75f31` is `482,097` — the real gas cost of a `confidentialTransfer`, not
of a plain ERC-20 transfer (~50,000 gas). The server didn't just accept the
call: it recognized `transfer(to, amount)`, confirmed on-chain that
`0x7c5B...3639` is a genuine confidential token, encrypted `10` (the amount
in the calldata above) through the real Zama relayer, and estimated gas
against the _real_ rewritten call. `eth_sendTransaction` with the same
payload goes through the identical rewrite — the only difference is what
happens next requires a real signer (see below).

Confirm the decision directly, without parsing logs:

```bash
curl -s http://127.0.0.1:8545/audit
```

```json
{
  "entries": [
    {
      "timestamp": "...",
      "entry": {
        "decision": "rewritten",
        "method": "eth_estimateGas",
        "contractAddress": "0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639",
        "operation": "confidentialTransfer (ERC-7984 standard)"
      }
    }
  ]
}
```

Every routing decision the server makes — `rewritten`, `passthrough`, or
`rejected` — is available here in real time. Useful while integrating, to
confirm a given call is being recognized the way you expect.

## Where you fit in

Your integration changes exactly **one** thing: which RPC endpoint your
existing transaction-sending code points to. Everything else — how you hold
keys, how you sign, how you track nonces, how you broadcast — stays exactly
as it is today. You are still responsible for:

- **Building plain, ERC-20-shaped calldata.** `transfer`, `transferFrom`,
  `transferAndCall`, `transferFromAndCall`, `unwrap`, `finalizeUnwrap` — see
  the operations table below. Nothing Zama-specific to import or call.
- **Signing it, however you already do that.** A browser wallet, a
  custodian's signing API, an HSM-backed service, a raw key in a backend
  process — the wrapper never asks how a transaction gets signed. It only
  acts on the request while it's still unsigned, then forwards the rewritten
  version onward for whatever signs it next.
- **Broadcasting and confirming it, the same way you already do.** The
  wrapper isn't in the receipt-polling business — that's unchanged from
  today's flow.

**One case worth flagging explicitly.** If signing happens inside a
self-contained browser wallet extension (MetaMask, Rabby, ...), that
extension signs `eth_sendTransaction` internally, _before_ it makes any
network call — pointing the wallet's own RPC setting at this server only
affects where the _already-signed_ transaction gets broadcast, which is too
late for a rewrite to apply. If your integration's signing step is opaque
like this, the unsigned request needs to reach the wrapper directly — your
own code submits the plain `eth_sendTransaction` to it, and whatever signs
on your behalf completes signing on the _rewritten_ result. This has nothing
to do with the wrapper's design; it's simply how browser wallets are built.
If you already control the signing step end-to-end (a backend service, a
custodian API, anything that isn't a black-box extension), none of this
applies — you just repoint your existing RPC calls at this server.

## Supported operations

| Send this (plain, ERC-20-shaped)                                            | Becomes this (real, on-chain)                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `transfer(address to, uint256 amount)`                                      | `confidentialTransfer(to, encryptedAmount, inputProof)`                        |
| `transferFrom(address from, address to, uint256 amount)`                    | `confidentialTransferFrom(from, to, encryptedAmount, inputProof)`              |
| `transferAndCall(address to, uint256 amount, bytes data)`                   | `confidentialTransferAndCall(to, encryptedAmount, inputProof, data)`           |
| `transferFromAndCall(address from, address to, uint256 amount, bytes data)` | `confidentialTransferFromAndCall(from, to, encryptedAmount, inputProof, data)` |
| `unwrap(address from, address to, uint256 amount)`                          | `unwrap(from, to, encryptedAmount, inputProof)` — phase 1 of 2                 |
| `finalizeUnwrap(bytes32 unwrapRequestId)`                                   | `finalizeUnwrap(unwrapRequestId, clearAmount, decryptionProof)` — phase 2 of 2 |

`transferFrom`/`transferFromAndCall` require the caller to already be an
approved operator for the token holder (`setOperator`, enforced on-chain —
not by this wrapper). `wrap` (plain ERC-20 → confidential) needs no rewrite
at all, since its amount is already plaintext by design.

## Auth and production posture

- `--apiKey` gates the whole surface behind a shared bearer token
  (`Authorization: Bearer <key>`). Without it, anyone who can reach the
  server can trigger real relayer calls and probe which addresses are
  confidential tokens.
- CORS is permissive and always on — fine for local integration testing, not
  something to expose publicly as-is.
- This is a proof of concept: no rate limiting, no TEE, no HA story. See
  `WALKTHROUGH.md` for the full list of known limitations before relying on
  it beyond exploration.

## Further reading

- [`README.md`](./README.md) — full CLI reference, Docker, all curl examples.
- [`WALKTHROUGH.md`](./WALKTHROUGH.md) — why the wrapper is positioned before
  signing rather than instead of it, real Sepolia verification evidence, and
  the wallet-signing architectural finding referenced above.
