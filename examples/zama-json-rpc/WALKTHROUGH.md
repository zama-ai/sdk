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
    │     ├─ selector matches a known operation (e.g. transfer(address,uint256))?
    │     │     ├─ is `to` a genuine confidential token? — ON-CHAIN check via
    │     │     │  sdk.registry.isConfidentialTokenValid() (Zama's wrappers
    │     │     │  registry contract; NOT a locally configured address list)
    │     │     │     ├─ yes → decode plaintext args, ZamaSDK.encrypt() → real
    │     │     │     │        ciphertext + inputProof, rebuild real calldata,
    │     │     │     │        forward the rewritten, still-UNSIGNED transaction
    │     │     │     ├─ no  → forward unchanged (probably a real ERC-20)
    │     │     │     └─ lookup failed → reject (fail closed, never guess)
    │     └─ no selector match → forward unchanged
    │
    └─ everything else → forward unchanged to the upstream RPC
```

Components (`src/`):

| Module                                | Responsibility                                                                 |
| -------------------------------------- | -------------------------------------------------------------------------------- |
| `registry/` (`types.ts`, `index.ts`, `operations/`) | Declarative extension point for *operations* (public ABI → real call). Matches by (chainId, selector) only — no address. The only place you touch to support more operations; supporting more tokens needs no change here at all (see "Dynamic token discovery" below). |
| `zama/rewriter.ts`                     | Decode → encrypt → re-encode. Emits an audit log entry for every decision (rewritten / passthrough / rejected). |
| `zama/introspection.ts`                | Secondary, explicit `zama_*` namespace — debug/introspection only, not the primary flow. |
| `rpc/router.ts`, `rpc/passthrough.ts`, `rpc/jsonrpc.ts`, `rpc/errors.ts` | JSON-RPC plumbing: batch/single dispatch, upstream forwarding, SDK-error → JSON-RPC-error mapping via the SDK's own `matchZamaError`. |
| `sdk.ts`                               | Builds the single `ZamaSDK` instance — see "No custody, verified" below. |
| `config.ts`, `cli.ts`, `server.ts`     | CLI flags/env vars (mirrors fireblocks-json-rpc naming), HTTP server, wiring. |
| `logging/logger.ts`, `logging/redact.ts` | Audit trail + plaintext redaction in verbose logs. |

## Key design decisions

### 1. Auto-rewrite, bounded by an explicit operation registry + an on-chain identity check

The wrapper only ever rewrites a request that clears **two** independent gates: (a) the
calldata's selector matches a **declared** operation shape (`ConfidentialOperationRegistry`,
matched by chainId + selector, no address involved), and (b) `tx.to` is confirmed, live,
to be a genuine registered confidential token via `sdk.registry.isConfidentialTokenValid()`.
Neither gate alone is "guessing": (a) is a fixed, standard function shape; (b) is a read
against Zama's own on-chain source of truth, not a heuristic. This is what keeps the
"magic" auditable: every request hits exactly one of `rewritten` / `passthrough` /
`rejected` in the audit log (`logger.audit(...)`, see `src/logging/logger.ts` and
`src/zama/rewriter.ts`), so an operator can verify the rewrite never applies to
anything but a real confidential token. This also gives a direct, concrete answer to the
post-LayerZero/KelpDAO "does this RPC middleware tamper with the feed silently" concern
that motivates the ticket's Epic in the first place.

### 2. Dynamic token discovery, not a configured address list

**v1 originally shipped with a `--confidentialToken <address>` CLI flag** wiring exactly
one token address into the registry — a design that was then challenged (correctly)
during review: a normal ERC-20-aware RPC doesn't need to know which token address you're
calling ahead of time, so why should this wrapper? The fix uses a mechanism the SDK
already exposes for exactly this: `sdk.registry` (`WrappersRegistry`,
`packages/sdk/src/wrappers-registry.ts`) wraps Zama's on-chain wrappers-registry
contract, and `isConfidentialTokenValid(address): Promise<boolean>` answers "is this a
genuine registered confidential token" directly, for any address, with no local
configuration. This works because ERC-7984 fixes the real function signature
(`confidentialTransfer(address,externalEuint64,bytes)`) **and** the `euint64` amount
width as part of the standard interface itself — confirmed by reading the actual
standard, `IERC7984.sol`
(`contracts/lib/forge-fhevm/dependencies/@openzeppelin-confidential-contracts-7ac7cee/contracts/interfaces/IERC7984.sol`):

```solidity
import {euint64, externalEuint64} from "@fhevm/solidity/lib/FHE.sol";
interface IERC7984 is IERC165 {
    function confidentialTransfer(address to, externalEuint64 encryptedAmount, bytes calldata inputProof)
        external returns (euint64);
    ...
}
```

So one `ConfidentialOperation` entry (the operation's *shape*) genuinely covers every
conforming token — there was never a real need to parameterize it by address. The
result: adding support for a new token is now free (any token registered in Zama's
ecosystem works immediately); only adding a new *operation* (a different function
shape) still requires a code change. **This on-chain check was run for real, against
the live Sepolia registry, in this session** — see "Verified during this work".

**Fail-closed policy**: if the registry lookup itself fails (network error, RPC issue),
the request is rejected with a clear error — never silently treated as "not a
confidential token" (which could let a real confidential-transfer-shaped call go out as
plaintext) nor as "assume it's valid" (which could rewrite a call to an unrelated
contract). Never guess in either direction.

### 3. "ERC-20-like UX" is literal, not aspirational

The registry entry for `confidentialTransfer` (`src/registry/operations/confidential-transfer.ts`)
declares a **public-looking ABI** — an ordinary `transfer(address,uint256)`, the same
shape any ERC-20 token uses — as the surface callers write calldata against. The
wrapper decodes that, encrypts the amount, and rebuilds the *real* on-chain call
(`confidentialTransfer(address,bytes32,bytes)`). The caller never imports the SDK, never
constructs an encrypted input, and never writes Zama-specific code — this is the literal
mechanism behind the ticket's "ERC-20-like UX ... while the chain continues to store
only ciphertexts" framing, not just a metaphor.

### 4. No private-key custody — verified, not just asserted

`src/sdk.ts` constructs the `ZamaSDK` instance with an **accountless** viem
`walletClient` (no `account`, no private key anywhere in the process). This is safe
specifically because `EncryptionService.encrypt()` (`packages/sdk/src/services/encryption-service.ts`
in the SDK source) only calls the relayer — it never touches the configured signer.
`userAddress` in `EncryptParams` is just a string the relayer binds the ZK proof to; the
wrapper never needs to hold that address's key. This was checked against SDK source
before writing the code, not assumed — see "Verified during this work" below.

### 5. Positioning: before signing, not instead of it

The wrapper only rewrites **unsigned** `eth_sendTransaction` requests (never
`eth_sendRawTransaction` — rewriting calldata after a signature would invalidate it). It
never signs or submits anything itself. This means it must sit **upstream of whatever
actually signs** (a wallet, a custodian signing service, a local dev node) — not upstream
of a public read-only RPC node. This is empirically confirmed, not theoretical: see
"Live-tested, not just unit-tested" below for a real transcript showing exactly this
failure mode against a public Sepolia RPC.

### 6. `ConfidentialOperation` generalized to `"encrypt"` | `"decrypt"` — for `finalizeUnwrap`

`finalizeUnwrap` was initially assessed as needing genuinely new async operation-tracking
machinery (poll a pending KMS decryption over minutes) — deferred out of v1 for that
reason. On closer inspection of the SDK source, that assessment was wrong: `finalizeUnwrap`'s
real parameters (`unwrapAmountCleartext`, `decryptionProof`) are fetched via
`sdk.decryption.decryptPublicValues(handles)`, documented in the SDK itself as
**"signer-independent: works without a configured signer"** — the exact same no-custody
property as `sdk.encrypt()`, and a single request/response call, not a polling loop. If the
KMS hasn't finished yet, the call just fails and the caller retries — no different from any
other transient failure this wrapper already surfaces.

The one real difference from the four `"encrypt"` operations: the wrapper **decrypts** a
handle instead of **encrypting** an argument. `ConfidentialOperation` (`src/registry/types.ts`)
is now a discriminated union — `EncryptOperation` (`extractEncryptedInput` +
`sdk.encrypt()`) and `DecryptOperation` (`extractHandlesToDecrypt` +
`sdk.decryption.decryptPublicValues()`) — so `src/zama/rewriter.ts` branches once on
`operation.kind` and each operation file still only declares its own shape. This also
made the `tx.from` requirement explicit and correct per-kind: only `"encrypt"` operations
need a sender (the FHE proof binds to it); `"decrypt"` operations need no `from` at all,
enforced by the same branch rather than a blanket check.

Only fits handles the **protocol itself** discloses as part of a defined flow (see
`AmountDisclosed` in `IERC7984.sol`) — never a still-confidential user balance, which
needs `userDecrypt`/`delegatedUserDecrypt` and a real signer. That distinction is why
`decryptBalanceOf`-style reads are still out of scope here — see "Open questions".

## What's implemented (v1)

- HTTP JSON-RPC server, single + batch requests, pass-through for every non-matched
  method.
- Five operations, each working for **any** confidential token (no per-token
  configuration): `confidentialTransfer`, `confidentialTransferFrom`,
  `confidentialTransferAndCall`, `unwrap`, and `finalizeUnwrap` — the full
  two-phase unwrap flow, not just phase 1 (see "Key design decisions" for
  how `finalizeUnwrap` fits). All ERC-7984 standard, `euint64` amount,
  dynamically validated per-request via `sdk.registry.isConfidentialTokenValid()`.
  Tested live against cUSDC on Sepolia (`0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639`,
  same token used by `examples/react-wagmi`'s vault demo), but not specific
  to it. `wrap` needs no operation entry at all — its amount is plaintext by
  design (see "Operations" in README.md), so it already works as
  pass-through.
- `zama_getCapabilities`, `zama_getNetworkConfig`, `zama_listConfidentialOperations`.
- SDK-error → JSON-RPC-error mapping via `matchZamaError`, including relayer
  back-pressure (`retryable` / `retryAfter` from `RelayerRequestFailedError` — see
  SDK-236, on a separate branch not yet in `prerelease` at time of writing) and
  public-decryption failures (`DECRYPTION_FAILED`, marked retryable — the KMS
  may simply not have finished yet, see `finalizeUnwrap` below).
- CLI (commander) + env vars mirroring fireblocks-json-rpc's flag naming; Dockerfile.
- Audit logging of every routing decision; plaintext redaction in verbose logs.
- Unit tests (registry, rewriter, router, pass-through, error mapping) — all mocked, 27
  passing.
- One real end-to-end test (`test/e2e/confidential-transfer.e2e.test.ts`) that hits the
  **actual Sepolia relayer/KMS** via `sdk.encrypt()` — the one genuinely novel, highest-risk
  piece of this design — and asserts the rewritten calldata decodes as a valid
  `confidentialTransfer(address,bytes32,bytes)` call with a real ciphertext handle and a
  real ZK input proof. **This test passed against live infrastructure during this
  session** (not just planned/written — actually executed, see transcript below), both
  before and after the dynamic-discovery refactor.

### Verified during this work (not assumed)

- `ZamaSDK` can be constructed with an accountless `walletClient` and used purely for
  `.encrypt()` — confirmed by reading `EncryptionService` and `ViemSigner` source before
  relying on it, then proven by the real e2e test succeeding.
- `getAbiItem(...)` can return non-function ABI members; `toFunctionSelector` needs a
  `type === "function"` narrowing the SDK's own types don't do for you automatically.
- **`euint64` is mandated by the ERC-7984 standard itself, not a per-token convention** —
  confirmed by reading `IERC7984.sol` directly (see "Dynamic token discovery" above),
  which settled a real open question from this session's review rather than leaving it
  as a hedge.
- **`sdk.registry.isConfidentialTokenValid(cUSDC address)` returned `true` against the
  live Sepolia registry** in this session's e2e run — the dynamic-discovery mechanism
  isn't just theoretically sound, it was confirmed working end-to-end against real
  on-chain infrastructure, not only against the relayer.
- **`confidentialTransferAndCallContract` is a real gap in the SDK's public export
  surface**: it's defined in `packages/sdk/src/contracts/confidential-wrapper.ts` and
  re-exported from `contracts/index.ts`, but not from the SDK root (`@zama-fhe/sdk`),
  and there is no `./contracts` subpath export in `package.json` either — confirmed by
  grepping both, not assumed from a missing autocomplete. Worked around here by
  inlining the (fixed-by-standard) real ABI fragment directly
  (`src/registry/operations/confidential-transfer-and-call.ts`); worth reporting
  upstream so real consumers don't hit the same wall.
- **`unwrap`'s registry+encrypt path was also run live against the real Sepolia
  relayer** (not just unit-mocked) in this session, matching, encrypting, and
  rewriting correctly — same live check applied to `confidentialTransfer` earlier,
  repeated for the newest/least-similar operation rather than assumed to generalize.
- **`finalizeUnwrap` was run live too**, without a `from` field at all: matched, called
  the real `sdk.decryption.decryptPublicValues()` over the network (with a fabricated,
  non-existent request id, since no real pending unwrap was available), and got back a
  clean `DECRYPTION_FAILED` JSON-RPC error rather than a crash — confirming both the
  live connectivity of the decrypt path and that the `"decrypt"`-kind branch genuinely
  skips the sender requirement, not just in mocked tests.
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
and sending a plaintext `transfer(to, amount)` against cUSDC on Sepolia produced:

```text
[debug] Matched "confidentialTransfer (ERC-7984 standard)" for 0x7c5BF...639 — decoded public args: ["0x2222...2222","<redacted>"]
[audit] {"decision":"rewritten","method":"eth_sendTransaction","contractAddress":"0x7c5BF...639","operation":"confidentialTransfer (ERC-7984 standard)"}
```

...followed by the upstream (a public Sepolia RPC node) rejecting the forwarded,
rewritten, still-unsigned transaction with `"unknown account"` — because a public node
has no unlocked signer. That failure is **expected and correct**: it's the "positioning"
limitation above, demonstrated live rather than just argued.

### Full broadcast, verified via Anvil fork + impersonation (no real private key used)

To prove a real broadcast without needing a funded key or exposing a real private key
anywhere, Foundry was installed in this session and Anvil was run forked from live
Sepolia (`anvil --fork-url <sepolia-rpc> --fork-block-number latest`), then
`anvil_impersonateAccount` was used to act as a real Sepolia address holding real cUSDC
— no key material involved, since Anvil accepts unsigned `eth_sendTransaction` from
impersonated accounts directly. Pointing the wrapper's `--rpcUrl` at this local fork
(instead of a public node) makes Anvil play the "signer-capable upstream" role the
wrapper expects.

Result: `sdk.registry.isConfidentialTokenValid` and `sdk.encrypt()` both still hit the
**real** Sepolia relayer/registry (only the final broadcast is local), the rewritten
`confidentialTransfer` call executed on-chain, and the receipt came back
**`status 1 (success)`**, with a real `ConfidentialTransfer(from, to, encryptedAmount)`
event emitted by the token contract. First attempt (no explicit `gas` field) failed with
`OutOfGas` — see limitation #3 below; retried with `gas: 2_000_000` and succeeded using
448,188 gas. This also settles a real open question from earlier in this session: Zama's
FHE operations on Sepolia are implemented as ordinary Solidity contracts (ACL,
input-verifier, coprocessor-like contracts, all forked normally), not native
EVM-level precompiles Anvil can't emulate — there was no fundamental fork
incompatibility, only a gas-estimation gap.

### Full broadcast, done for real on live Sepolia (not a fork)

With a real private key made available (the same cUSDC-holding account used
throughout, `0x72059F5569B6c7ab165Bf05a280f2F870C73b4f8`), the remaining gap was
closed directly rather than only simulated. A minimal "dev signer" was built —
deliberately **not** part of this project, kept as an ephemeral external script and
never committed — that holds the real key, receives the wrapper's rewritten
(still-unsigned) `eth_sendTransaction`, and actually signs + broadcasts it via
`eth_sendRawTransaction`. This stands in for exactly the piece the wrapper is
designed to sit in front of (a custodian/wallet's own signing infrastructure), not
a feature the wrapper itself should ever provide.

Pointing `--rpcUrl` at this dev signer instead of a public node or a fork, the
same 1 cUSDC `confidentialTransfer` used in the fork test above was sent again —
this time signed and broadcast for real. Receipt on live Sepolia:
**`status 1 (success)`**, tx
`0xeb63a79ac2eb5ed950be952ca8fa81cd1573e1704f9519945ad8cb3701bdc022`, block
`11215537`, 448,188 gas (matching the fork test exactly), with the real
`ConfidentialTransfer(from: 0x7205...b4f8, to: 0x3357...09dD)` event emitted by the
token contract. Every step in the chain was real: encryption via the live relayer,
registry validation via the live wrappers registry, signing via a real private key,
broadcast to the live network — no mocking, no fork, anywhere.

## Known limitations

1. ~~Needs a signer-capable upstream to actually broadcast.~~ **Resolved** — a real
   broadcast was completed end-to-end on live Sepolia (above). The wrapper itself
   still deliberately holds no key and never signs anything (see "No private-key
   custody") — what changed is that a stand-in for "the custodian's own
   infrastructure" was built and used for this test, not that the wrapper's design
   changed. That stand-in is not part of this project and shouldn't become one:
   its whole value was being disposable, one-off tooling.
2. **Smart-contract-wallet / account-abstraction senders are out of scope** — per
   explicit instruction for this work, not investigated further. This is a **current
   Zama protocol limitation**, not something this wrapper works around: if it turns out
   the FHE input proof's ACL binding requires `msg.sender` to equal the encrypting
   `userAddress` and a vault/AA contract is the actual on-chain sender, the auto-rewrite
   as designed would not be usable by ICP candidates whose custody model routes through
   a smart-contract signer. Worth re-checking if/when this becomes in-scope.
3. ~~`eth_sendTransaction` only.~~ **Resolved.** `eth_call` and `eth_estimateGas`
   against a registered operation are now rewritten identically (same
   `maybeRewriteTransaction`, `REWRITABLE_METHODS` in `rpc/router.ts`), so a client
   that estimates gas or simulates before sending sees the *real* operation, not the
   plaintext-looking one. This directly fixes the root cause of the `OutOfGas`
   failure found earlier: a real `confidentialTransfer` uses **448,188 gas** (nested
   ACL/ZK verification calls) vs. ~50k for a plain ERC-20 transfer — a client that
   estimates gas against the fake `transfer(address,uint256)` selector (which doesn't
   exist on the real contract) before this fix would get a wrong/reverted estimate and
   then fail with `OutOfGas` on the real send. Verified live against the real Sepolia
   relayer and a real public node: `eth_estimateGas` returned `0x6fba6` (457,638 gas,
   the right ballpark), and `eth_call` returned a real ciphertext handle instead of
   reverting.
4. ~~`data` field only, not `input`.~~ **Resolved.** `parseEthTransactionParams`
   accepts calldata under either field now (`data` wins if both are present); the
   rewritten output keeps both in sync if the caller used `input`. Verified live with
   a real `eth_estimateGas` call using `input` instead of `data`.
5. **Five operations wired**, including the full two-phase unwrap
   (`confidentialTransfer`, `confidentialTransferFrom`, `confidentialTransferAndCall`,
   `unwrap`, `finalizeUnwrap`). `decryptBalanceOf`-style reads of a still-confidential
   balance are still out of scope — that needs `userDecrypt`/a real signer, not the
   signer-independent public-decrypt path `finalizeUnwrap` uses (see "Key design
   decisions" #6). Any *token* is already supported dynamically (see "Dynamic token
   discovery"); adding more *operations* is still a code change, by design.
6. **On-chain registry lookup adds latency per matched-selector transaction** — one
   extra read before the (already more expensive) relayer `encrypt()` call. The SDK's
   `WrappersRegistry` caches results (`registryTTL`, default 24h), so repeat calls to
   the same token are amortized; a cold first call per token is not.
7. **No auth, no rate limiting, no TEE.** Explicitly out of scope for a POC; `config.ts`
   avoids hardcoding `localhost`-only assumptions so this isn't an architecture rewrite
   later, but nothing beyond the `0.0.0.0` bind warning is implemented.
8. **The SDK-236 relayer back-pressure fields (`retryAfter`) may still change name**
   before that work lands in `prerelease` — see the note above.

## Extensibility

- **Another token**: zero code change. Any address `sdk.registry.isConfidentialTokenValid()`
  confirms is a genuine confidential token is auto-rewritten immediately.
- **Another operation** (any future ERC-7984 method): one new file under
  `src/registry/operations/` implementing either the `"encrypt"` or `"decrypt"` variant
  of `ConfidentialOperation` (`src/registry/types.ts`), registered in `src/cli.ts`.
  `ConfidentialOperationRegistry` (`src/registry/index.ts`) does the selector-matching
  generically regardless of kind — nothing else changes. Demonstrated four times over
  (`confidentialTransferFrom`, `confidentialTransferAndCall`, `unwrap`, `finalizeUnwrap`),
  each a small, independent addition with its own "public-looking" ABI and its own
  real-call builder, no changes needed to the router or registry class itself
  (the rewriter needed exactly one new branch, for the `"decrypt"` kind — see "Key
  design decisions" #6).

This split (token axis: dynamic/free, operation axis: declarative/code) is a direct
result of the dynamic-discovery refactor — the original v1 required a code change for
both axes.

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
- This work sits on a dedicated branch (`feat/sdk-149-json-rpc-write-poc`, based on
  `prerelease`), not merged to `main` or `prerelease`.

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
   reachable before signing, or does their architecture sign earlier than that? The
   mechanism itself is now proven (a real broadcast was done end-to-end, see above);
   what's still unknown is whether each real candidate's actual signing
   infrastructure exposes the right seam for it.
5. Is a `decryptBalanceOf`-style read (a still-confidential user balance, not a
   protocol-disclosed value like `finalizeUnwrap`'s amount) wanted on this write-side
   surface at all, or does it belong entirely to the ticket's separate read-side
   indexer (H2)? It needs a real signer/EIP-712 permit either way — either relayed
   per-request from the caller's own wallet (stays no-custody, but the caller still
   needs a wallet-signing step) or via a persistently delegated key held by the
   service (matches the indexer's model, but reintroduces real custody).
