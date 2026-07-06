# WALKTHROUGH — zama-json-rpc (SDK-149, write-side)

## Context

[SDK-149](https://linear.app/zama/issue/SDK-149) ("Privacy Service: validate ICP for
JSON-RPC wrapper + indexer") is a validation Epic for a two-part "Privacy Service"
product idea:

- **Write-side**: a JSON-RPC middleware that auto-encrypts inputs and submits
  transactions, hiding Zama-specific pre-transaction operations from the consumer.
- **Read-side**: a confidential indexer (out of scope here).

The Epic's own scope calls for a *minimal architecture spike* — enough to reason about
the design, explicitly **not** an implementation. This project deliberately goes further
than that: it's a working reference implementation of the write-side wrapper, built to
de-risk the technical design (not to pre-empt any build/no-build decision, which the
Epic still gates on ICP validation — a separate, independent workstream from this code).
That's a conscious scope decision, not scope creep by accident — see "Relationship to
the ticket" below.

A companion inspiration document (`zama-write-poc-spec.md`, not committed here) proposed
a purely explicit `zama_*`-namespace design with no automatic detection. That document
is a **structural** reference (CLI shape, pass-through model, borrowed from
[fireblocks-json-rpc](https://github.com/fireblocks/fireblocks-json-rpc)), not a
product-fidelity one — the ticket's actual value proposition (H1: "hides Zama-specific
pre-transaction operations", "ERC-20-like UX", minimal app changes) requires the
auto-rewrite behavior this project implements, not a purely explicit API. Fireblocks
itself is named as an interview candidate in the ticket, but is used here **only** as a
UX/CLI reference — not as this POC's target integration.

## Architecture

```text
Client (unmodified — sends ordinary eth_sendTransaction / eth_call)
    │
    ▼
zama-json-rpc (this project)
    │
    ├─ zama_* methods (introspection only: zama_getCapabilities,
    │  zama_getNetworkConfig, zama_listConfidentialOperations)
    │
    ├─ eth_sendTransaction
    │     │
    │     ├─ (to, selector) matches the registry?
    │     │     ├─ decode plaintext args (viem, using a "public" ABI —
    │     │     │  e.g. standard ERC-20 transfer(address,uint256))
    │     │     ├─ ZamaSDK.encrypt() → real ciphertext handle + inputProof
    │     │     ├─ rebuild real calldata (e.g. confidentialTransfer(to, bytes32, bytes))
    │     │     └─ forward the rewritten, still-UNSIGNED transaction upstream
    │     └─ no match → forward unchanged
    │
    └─ everything else → forward unchanged to the upstream RPC
```

Components (`src/`):

| Module                                | Responsibility                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `registry/` (`types.ts`, `index.ts`, `operations/`) | Declarative extension point: contract + public ABI → real call. The only place you touch to support more operations. |
| `zama/rewriter.ts`                     | Decode → encrypt → re-encode. Emits an audit log entry for every decision (rewritten / passthrough / rejected). |
| `zama/introspection.ts`                | Secondary, explicit `zama_*` namespace — debug/introspection only, not the primary flow. |
| `rpc/router.ts`, `rpc/passthrough.ts`, `rpc/jsonrpc.ts`, `rpc/errors.ts` | JSON-RPC plumbing: batch/single dispatch, upstream forwarding, SDK-error → JSON-RPC-error mapping via the SDK's own `matchZamaError`. |
| `sdk.ts`                               | Builds the single `ZamaSDK` instance — see "No custody, verified" below. |
| `config.ts`, `cli.ts`, `server.ts`     | CLI flags/env vars (mirrors fireblocks-json-rpc naming), HTTP server, wiring. |
| `logging/logger.ts`, `logging/redact.ts` | Audit trail + plaintext redaction in verbose logs. |

## Key design decisions

### 1. Auto-rewrite, bounded by an explicit registry

The wrapper detects confidential operations by (chainId, contract address, function
selector) matching a **declared** registry entry — never by inferring intent from
arbitrary calldata. This is what keeps the "magic" auditable: every request hits exactly
one of `rewritten` / `passthrough` / `rejected` in the audit log
(`logger.audit(...)`, see `src/logging/logger.ts` and `src/zama/rewriter.ts`), so an
operator can verify the rewrite never applies outside what's declared. This also gives a
direct, concrete answer to the post-LayerZero/KelpDAO "does this RPC middleware tamper
with the feed silently" concern that motivates the ticket's Epic in the first place —
without needing to fall back to a fully explicit, non-magic API that wouldn't satisfy
H1's actual value proposition.

### 2. "ERC-20-like UX" is literal, not aspirational

The registry entry for `confidentialTransfer` (`src/registry/operations/confidential-transfer.ts`)
declares a **public-looking ABI** — an ordinary `transfer(address,uint256)`, the same
shape any ERC-20 token uses — as the surface callers write calldata against. The
wrapper decodes that, encrypts the amount, and rebuilds the *real* on-chain call
(`confidentialTransfer(address,bytes32,bytes)`). The caller never imports the SDK, never
constructs an encrypted input, and never writes Zama-specific code — this is the literal
mechanism behind the ticket's "ERC-20-like UX ... while the chain continues to store
only ciphertexts" framing, not just a metaphor.

### 3. No private-key custody — verified, not just asserted

`src/sdk.ts` constructs the `ZamaSDK` instance with an **accountless** viem
`walletClient` (no `account`, no private key anywhere in the process). This is safe
specifically because `EncryptionService.encrypt()` (`packages/sdk/src/services/encryption-service.ts`
in the SDK source) only calls the relayer — it never touches the configured signer.
`userAddress` in `EncryptParams` is just a string the relayer binds the ZK proof to; the
wrapper never needs to hold that address's key. This was checked against SDK source
before writing the code, not assumed — see "Verified during this work" below.

### 4. Positioning: before signing, not instead of it

The wrapper only rewrites **unsigned** `eth_sendTransaction` requests (never
`eth_sendRawTransaction` — rewriting calldata after a signature would invalidate it). It
never signs or submits anything itself. This means it must sit **upstream of whatever
actually signs** (a wallet, a custodian signing service, a local dev node) — not upstream
of a public read-only RPC node. This is empirically confirmed, not theoretical: see
"Live-tested, not just unit-tested" below for a real transcript showing exactly this
failure mode against a public Sepolia RPC.

## What's implemented (v1)

- HTTP JSON-RPC server, single + batch requests, pass-through for every non-matched
  method.
- One wired confidential operation: `confidentialTransfer` on cUSDC (Sepolia,
  `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639` — same token used by
  `examples/react-wagmi`'s vault demo), encrypted as `euint64`.
- `zama_getCapabilities`, `zama_getNetworkConfig`, `zama_listConfidentialOperations`.
- SDK-error → JSON-RPC-error mapping via `matchZamaError`, including relayer
  back-pressure (`retryable` / `retryAfter` from `RelayerRequestFailedError` — see
  SDK-236, on a separate branch not yet in `prerelease` at time of writing).
- CLI (commander) + env vars mirroring fireblocks-json-rpc's flag naming; Dockerfile.
- Audit logging of every routing decision; plaintext redaction in verbose logs.
- Unit tests (registry, rewriter, router, pass-through, error mapping) — all mocked, 21
  passing.
- One real end-to-end test (`test/e2e/confidential-transfer.e2e.test.ts`) that hits the
  **actual Sepolia relayer/KMS** via `sdk.encrypt()` — the one genuinely novel, highest-risk
  piece of this design — and asserts the rewritten calldata decodes as a valid
  `confidentialTransfer(address,bytes32,bytes)` call with a real ciphertext handle and a
  real ZK input proof. **This test passed against live infrastructure during this
  session** (not just planned/written — actually executed, see transcript below).

### Verified during this work (not assumed)

- `ZamaSDK` can be constructed with an accountless `walletClient` and used purely for
  `.encrypt()` — confirmed by reading `EncryptionService` and `ViemSigner` source before
  relying on it, then proven by the real e2e test succeeding.
- `getAbiItem(...)` can return non-function ABI members; `toFunctionSelector` needs a
  `type === "function"` narrowing the SDK's own types don't do for you automatically.
- **Published-package lag, again** (same lesson as prior sessions — see
  `skills-zama-typescript-3.1-update` note): this package initially depended on published
  `@zama-fhe/sdk@^3.2.0`, which does **not** have `retryAfter`/`retryable`/`statusCode`
  on `RelayerRequestFailedError`, nor the `RPC_RATE_LIMITED` error code — both present in
  this worktree's `prerelease` source. Switched to `3.3.0-alpha.8` (latest published
  prerelease alpha at the time) to match. If this project is ever revisited, re-check
  whether a newer stable release has since shipped these fields under a different name
  (SDK-236, still unmerged into `prerelease` as of this session, may rename
  `retryAfter` → `retryAfterMs`).

### Live-tested, not just unit-tested

Running the server locally (`npm start -- --http --rpcUrl https://ethereum-sepolia-rpc.publicnode.com --chainId 11155111 --verbose`)
and sending a plaintext `transfer(to, amount)` against the wired cUSDC address produced:

```text
[debug] Matched "confidentialTransfer @ 0x7c5BF...639" for 0x7c5BF...639 — decoded public args: ["0x2222...2222","<redacted>"]
[audit] {"decision":"rewritten","method":"eth_sendTransaction","contractAddress":"0x7c5BF...639","operation":"confidentialTransfer @ 0x7c5BF...639"}
```

...followed by the upstream (a public Sepolia RPC node) rejecting the forwarded,
rewritten, still-unsigned transaction with `"unknown account"` — because a public node
has no unlocked signer. That failure is **expected and correct**: it's the "positioning"
limitation above, demonstrated live rather than just argued. This POC does not include a
signer-capable upstream to demonstrate a full broadcast (no Foundry/anvil was installed
for this session, and no funded test key was available) — see "Known limitations".

## Known limitations

1. **Needs a signer-capable upstream to actually broadcast.** Demonstrated live (above).
   A follow-up could add a local Anvil-fork + `anvil_impersonateAccount` test to prove a
   full broadcast without needing a funded real key — not done here for time/scope
   reasons (would also require installing Foundry, not currently on this machine).
2. **Smart-contract-wallet / account-abstraction senders are out of scope** — per
   explicit instruction for this work, not investigated further. This is a **current
   Zama protocol limitation**, not something this wrapper works around: if it turns out
   the FHE input proof's ACL binding requires `msg.sender` to equal the encrypting
   `userAddress` and a vault/AA contract is the actual on-chain sender, the auto-rewrite
   as designed would not be usable by ICP candidates whose custody model routes through
   a smart-contract signer. Worth re-checking if/when this becomes in-scope.
3. **`eth_sendTransaction` only.** `eth_call` and `eth_estimateGas` against a registered
   operation are passed through unchanged, not rewritten — a client trying to simulate or
   estimate gas for a confidential transfer before sending will get a revert or wrong
   estimate against the real contract, since it'll submit the plaintext-shaped calldata
   as-is. Same underlying registry/rewriter could extend to these; not done in v1.
4. **`data` field only**, not `input` (some clients send calldata under `input` instead
   of `data` for `eth_sendTransaction`). Documented, not handled.
5. **One operation, one token, wired in v1** — by design, extensible (see below), not
   generalized preemptively.
6. **No auth, no rate limiting, no TEE.** Explicitly out of scope for a POC; `config.ts`
   avoids hardcoding `localhost`-only assumptions so this isn't an architecture rewrite
   later, but nothing beyond the `0.0.0.0` bind warning is implemented.
7. **The SDK-236 relayer back-pressure fields (`retryAfter`) may still change name**
   before that work lands in `prerelease` — see the note above.

## Extensibility

Adding another confidential operation (a different token, or another function like
`wrap`/`transferFrom`) means adding one file under `src/registry/operations/`
implementing `ConfidentialOperation` (`src/registry/types.ts`) and registering it in
`src/cli.ts`. `ConfidentialOperationRegistry` (`src/registry/index.ts`) does the
selector-matching generically — nothing else changes. This was a specific requirement
for this iteration (v1 wires exactly one operation, but the next step is expected to be
"other operations, other tokens" — the registry is designed for that now, not
retrofitted later).

## Relationship to the SDK-149 ticket

This intentionally exceeds the ticket's "minimal architecture spike ... without
committing to implementation" scope — a conscious decision made during this work, not a
drift. Concretely:

- No stakeholder review (Guillaume/Arik) has happened as part of this work — that's a
  separate, independent track per instruction for this session.
- The ICP validation interviews referenced in the ticket are a separate, parallel
  workstream — not blocked on, and not blocking, this code.
- This should not be read as a signal that a build/no-build decision has been made. It
  exists to de-risk the technical design so that *if* the Epic's gating criteria are
  met, there's a working reference implementation rather than a blank page.
- This work sits on a dedicated branch, in an isolated worktree, not merged to `main` or
  `prerelease`.

## Open questions for whoever picks this up next

1. Does the FHE ACL/input-proof model tolerate a `userAddress` that differs from the
   actual on-chain `msg.sender` (smart-contract wallets)? Excluded from this work by
   instruction, but the answer determines whether several realistic custodian
   architectures could use this at all.
2. Is "EIP-1193" in the ticket meant literally (an in-process JS provider object,
   like Fireblocks' own Web3 Provider library) or loosely (a local JSON-RPC server, like
   fireblocks-json-rpc, which is what this project builds)? Both exist as separate
   surfaces in Fireblocks' own stack — worth confirming which one ICP candidates
   actually expect.
3. Should `eth_call`/`eth_estimateGas` support be added next, or is
   `eth_sendTransaction`-only sufficient for whatever comes after this POC?
4. What does "signer-capable upstream" look like for each real ICP candidate — do they
   even have a step in their pipeline where an unsigned `eth_sendTransaction` is
   reachable before signing, or does their architecture sign earlier than that?
