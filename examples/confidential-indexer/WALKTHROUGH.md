# WALKTHROUGH — confidential-indexer (SDK-149, read-side)

## Context

Companion project to `examples/zama-json-rpc` (write-side), same
[SDK-149](https://linear.app/zama/issue/SDK-149) Epic. The ticket splits
"Privacy Service" into two halves:

- **Write-side**: auto-encrypt + rewrite transactions (built in `zama-json-rpc`).
- **Read-side** (this project): *"a service that decrypts and caches handle
  values via the consumer's ACL rights, avoiding repeated KMS calls per
  query"* — originally motivated by an Elliptic/Merkle analytics-tooling
  conversation (Profile B in the ticket).

**Explicit product decision** (not an engineering default): write and
read ship as **two fully separate products** — separate Docker images,
separate deployables, no shared runtime. This was decided after discussing
that the two have fundamentally different operational models: write-side
is stateless and holds no keys; read-side (this project) is stateful and
holds a real signing key continuously. Forcing a shared abstraction beyond
`@zama-fhe/sdk` and chain config risked coupling two things that don't need
to be coupled — see "Relationship to zama-json-rpc" below for what, if
anything, changed on the write-side as a result of this project (nothing).

## Not a public block explorer

The original framing floated was "a block-explorer-style service for
confidential balances/amounts." That's not achievable, and was corrected
during design: a real block explorer is permissionless by nature (anyone
can look up anyone's balance); ERC-7984 confidential balances are the
opposite by protocol design — decryptable only by the owner or an active
ACL delegate. So this service can only ever reveal what its **own**
operational identity has actually been delegated to decrypt, to whoever is
authorized to query it — never a global, public view. "Who delegates to
this service, at what scale" (individual opt-in vs. some broader
compliance arrangement) is a product question the protocol itself doesn't
constrain — left open deliberately, not resolved here.

## Architecture

```text
ACL contract (real, deployed on Sepolia — not vendored in this repo)
    │  delegateDecryption(delegate, contractAddress, expiry) — holder-initiated
    │  emits a grant/revoke log, indexed by (delegator, delegate)
    ▼
delegation-discovery (poll) ──► DelegationStore (delegator, contractAddress) → active?
    │
    ├─► balance-refresh (poll): confidentialBalanceOf(delegator) → handle
    │        └─► DecryptCache.resolve(handle, contractAddress, delegatorAddress)
    │                 └─► sdk.decryption.delegatedDecryptValues() ──► BalanceStore
    │
    └─► transfer-tracker (poll): ConfidentialTransfer logs for delegator
             └─► DecryptCache.resolve(amountHandle, ...) ──► TransferStore

query API (REST, app-level auth) ──► reads BalanceStore / TransferStore / DelegationStore
```

Components (`src/`):

| Module | Responsibility |
| --- | --- |
| `acl/delegation-log.ts`, `acl/transfer-log.ts`, `acl/raw-logs.ts` | Raw `eth_getLogs` (bypassing viem's ABI-driven typed action — no source available for these events, see below), parsing grant/revoke and transfer logs. |
| `indexer/delegation-store.ts` | Cache of which (delegator, contractAddress) pairs currently delegate to this service — a *hint*, not authoritative (see "fail closed" below). |
| `indexer/decrypt-cache.ts` | Decrypt-once-cache-by-handle layer over `sdk.decryption.delegatedDecryptValues()`, with propagation retry. |
| `indexer/balance-refresh.ts`, `indexer/balance-store.ts` | Current decrypted balance per delegated account. |
| `indexer/transfer-tracker.ts`, `indexer/transfer-store.ts` | Decrypted transfer-amount history per delegated account. |
| `api/router.ts`, `api/auth.ts` | REST query API + app-level bearer-token auth, decoupled from `node:http` for testability (same pattern as `zama-json-rpc`'s router). |
| `sdk.ts` | `ZamaSDK` instance with a **real** configured signer — the opposite of `zama-json-rpc`'s accountless design. |

## Key design decisions

### 1. Real custody — the opposite of the write-side's "no custody"

`sdk.decryption.delegatedDecryptValues()` requires a configured signer
(`requireAlignedWalletAccount` throws `SignerNotConfiguredError` without
one — verified against SDK source during the write-side project's
`decryptBalanceOf` discussion). This service's whole reason to exist is to
*be* a delegate, so it must hold a real, continuously-available private
key — genuine custody, not a POC simplification to fix later. Production
would need HSM/vault-backed storage; a plain env var here is POC-only.

### 2. Delegation discovery — event-based, topics found empirically

No source is available for the real ACL contract (deployed on Sepolia,
not vendored in this repo — only the SDK's own curated, events-free ABI
is). Topics were captured by making real `delegateForUserDecryption` /
`revokeDelegationForUserDecryption` calls against a local Anvil fork of
live Sepolia (no real key or on-chain effect involved) and reading the
emitted log topics directly:

- Grant: `0x527b025d7ff06689c1ab9d32dfd7881c964cce72ce8ac5b2fe1d3be8cfda5bfc`
- Revoke: `0x7aca80b6b7928b9038f186e3d9922a0fc5d52c398fbf144725c142c52a5277e4` (a
  **different** topic0 from grant — confirmed by testing both, not assumed)

Both index `(delegator, delegate)`. Active/revoked state is decided by
**which topic fired most recently** for a given `(delegator,
contractAddress)` pair — not by interpreting the non-indexed data fields
(their exact semantics weren't verified; only the first word, which is
consistently `contractAddress`, is relied on). This is deliberately the
more conservative reading: trusting an unverified numeric field could
silently mis-classify a delegation's state.

**This is a cache hint, not an authorization decision.** `DelegationStore`
tells the indexing loop what to *try* decrypting; it is never the last word
on whether a decrypt is actually allowed. Same "fail closed, never guess"
principle as `zama-json-rpc`'s registry lookup.

### 3. Two separate authorization layers

- **On-chain ACL delegation** — controls what this service's operational
  key is *able* to decrypt. Protocol-level, not our concern to redesign.
- **App-level `--apiKey`** — controls who is allowed to *query* this
  service afterward. New concern, absent from the write-side entirely: the
  write-side never reveals anything sensitive (it only rewrites calldata
  the caller already intended to send); this service's entire output is
  decrypted, previously-confidential data. Conflating the two layers would
  mean anyone who can reach the HTTP port can read anything ever
  decrypted for anyone, regardless of their relationship to the account.

### 4. Cache by ciphertext handle, not by account

A ciphertext handle's cleared value never changes — a new transfer
produces a *new* handle, it never mutates an old one (same fact already
relied on in `zama-json-rpc`'s "no wrap needed" reasoning). So
`DecryptCache` needs no TTL or invalidation logic: once a handle is
decrypted, the result is valid forever. What *does* need refreshing on a
poll interval is which handle currently represents "the balance" for a
given account — that's `balance-refresh.ts`'s job, not the cache's.

### 5. Retry on `DelegationNotPropagatedError`

Same pattern as `examples/node-viem`'s `decryptBalanceAs`: a freshly
granted ACL delegation takes roughly 1-2 minutes to propagate to the
gateway on Sepolia. `DecryptCache.resolve()` retries with a delay rather
than failing immediately on the first not-yet-propagated response.

## What's implemented (v1)

- Delegation discovery via real event-log scanning (grant + revoke,
  distinguished by topic0).
- Balance decrypt + cache (current balance per delegated account).
- Transfer-amount decrypt + cache (history per delegated account) — the
  amount is itself an indexed event topic, so no extra on-chain read is
  needed to get the handle.
- REST query API (`/health`, `/delegations`, `/balances/:token/:account`,
  `/transfers/:token/:account`) with app-level bearer-token auth.
- CLI (commander) + env vars, Dockerfile, structured similarly to
  `zama-json-rpc` for consistency across the two sibling projects.
- 19 unit tests (delegation store, decrypt cache incl. retry behavior,
  router incl. auth/403/202/200 paths) — all mocked.
- 1 real e2e test querying **actual historical logs on live Sepolia** (not
  a fork, not a fixture) — see "Verified during this work".

### Verified during this work (not assumed)

- **`confidentialBalanceOf` has zero access restriction in the real
  implementation** — read directly:
  `contracts/lib/forge-fhevm/dependencies/@openzeppelin-confidential-contracts-7ac7cee/contracts/token/ERC7984/ERC7984.sol`:
  `return _balances[account];`, no modifier, no require. Reading the
  ciphertext handle needs nothing from this service.
- **Grant and revoke emit genuinely different event topics** — confirmed
  by making both real calls (via Anvil fork + impersonation, no real key)
  and reading the actual emitted logs, not assumed from a naming
  convention.
- **A real historical delegation exists and was found by this project's
  own code**: `fetchDelegationLogs` (this repo) located the grant from
  `0x72059F5569B6c7ab165Bf05a280f2F870C73b4f8` to
  `0x89c4580764f8e31B5c1B045392fE3B7f2C083584` on cUSDC at block
  `11193387`, matching a manual `cast logs` query byte-for-byte — the
  parser is correct against production data, not just synthetic fixtures.
  This is the basis of `test/e2e/delegation-discovery.e2e.test.ts`.
- **`eth_getLogs` range limits vary sharply by public RPC provider** —
  `ethereum-sepolia-rpc.publicnode.com` refused even a 5,000-block window
  ("archive requests require a personal token"); `drpc.org` capped at
  10,000 blocks/query (paginated around, see `raw-logs.ts` callers);
  `1rpc.io` also worked. Documented in README's prerequisites so this
  doesn't surprise the next person.
- **viem's typed `getLogs` action requires a full ABI `event`/`events`
  definition** — it has no raw-`topics` escape hatch in this version
  (2.54.6). Since no ABI is available for these events, `raw-logs.ts` uses
  `publicClient.request({ method: "eth_getLogs", ... })` directly instead.
- **The full server boots and serves correctly end-to-end** — run live
  with a freshly generated throwaway key (no real delegation, by
  construction): `/health`, `/`, `/delegations` (correctly empty), and
  `/balances/...` (correctly `403`, no known delegation) all behaved as
  designed against the real Sepolia chain config.
- **`ConfidentialTransfer`'s topic0 reused, not re-derived**: already
  empirically confirmed in the sibling `zama-json-rpc` project's own
  Anvil-fork test (`0x67500e8d0ed826d2194f514dd0d8124f35648ab6e3fb5e6ed867134cffe661e9`,
  3 indexed topics, empty data) — reused here rather than re-deriving it.
- **Full decrypt-via-delegation round trip, done for real on live Sepolia**
  (not a fork, not a mock): a fresh throwaway keypair was generated as a
  test delegate identity; the real holder of cUSDC
  (`0x72059F5569B6c7ab165Bf05a280f2F870C73b4f8`) sent a real
  `delegateForUserDecryption` transaction (tx
  `0xdf5d592aecc59c78c7ce832eeff5c51717c2c41c74ca5715c783b13e56cffb83`,
  block `11215472`, 2-hour expiry — not permanent, self-expires) naming the
  fresh address as delegate. Running this service with that fresh key as
  `--operationalPrivateKey` discovered the delegation on the very next poll
  and `GET /balances/...` returned `clearValue: "97001021"` (97.001021
  cUSDC) at block `11215474` — decrypted via a genuine
  `delegatedDecryptValues()` call, no mocking anywhere in the chain.
  Propagation was near-instant here (2 blocks), faster than the ~1-2 minute
  worst case documented for `examples/node-viem`'s retry loop — that retry
  logic is kept regardless, since this was one observation, not a
  guarantee.

## Known limitations

1. **Transfer-history decrypt path not independently live-tested.** The
   balance path (`confidentialBalanceOf` → `delegatedDecryptValues`) was
   verified for real (see above); `transfer-tracker.ts` calls the exact
   same `DecryptCache.resolve()` with a handle sourced from a
   `ConfidentialTransfer` log topic instead of a fresh contract read, so
   the risk is low, but it wasn't separately exercised against a real
   transfer amount handle in this session.
2. **In-memory only.** Restarting the process loses all cached balances
   and transfers (delegations get rediscovered from chain on next poll,
   using `--fromBlock` as the floor — anything before that block is
   invisible to a fresh instance).
3. **No reorg handling.** A re-org that changes delegation state or
   transfer history within the recently-scanned window isn't detected or
   corrected.
4. **Revoke's non-indexed data fields aren't semantically understood** —
   see "Key design decisions" #2. Doesn't affect correctness of
   active/revoked state (that's topic-based), but means the recorded
   `expirationDate` on a revoke record shouldn't be trusted for anything.
5. **No production auth model, no TEE, no HSM-backed key storage** —
   explicitly out of scope for a POC; the exact posture the ticket flags
   as a real requirement for Profile B (Elliptic/Merkle-style consumers).
6. **`userDecrypt`-style per-request signature relay (still-confidential,
   non-delegated balances) is out of scope** — see the write-side project's
   WALKTHROUGH.md ("open questions") for why that's a materially different
   feature (needs a fresh signer/EIP-712 interaction per request or a
   different custody model entirely), not an extension of this project.

## Relationship to `zama-json-rpc` (write-side)

**Nothing changed on the write-side as a result of building this.** The
write-side wrapper never had any coupling to decryption/delegation
concerns — every time the topic came up during that project (balance
decryption, `finalizeUnwrap`), it was deliberately kept out, and this
project's existence just confirms that boundary was drawn correctly.

Beyond `@zama-fhe/sdk` itself and the Sepolia chain config values (ACL
address, relayer URL), there's very little natural code-sharing between
the two: different API shapes (JSON-RPC pass-through vs. REST query),
different state models (stateless vs. cached/indexed), different custody
models (none vs. real signer). Forcing a shared abstraction beyond that
would likely couple two things that don't need to be coupled — consistent
with the "two separate products" decision.

## Open questions for whoever picks this up next

1. Who delegates to this service, and at what scale — individual holders
   opting in one at a time, or some broader arrangement? The protocol
   permits either; this is a product question, not resolved here (by
   instruction, not oversight).
2. Does every real ERC-7984 deployment emit the same delegation
   grant/revoke topics, or could a different ACL contract version/address
   emit something else? These topics were captured against one specific
   deployed ACL address (Sepolia's `sepolia.aclContractAddress`); worth
   confirming before assuming this generalizes to other networks.
3. ~~Should this be validated with a real, live delegate identity...~~
   **Done** — a real delegation was granted on live Sepolia (tx
   `0xdf5d592aecc59c78c7ce832eeff5c51717c2c41c74ca5715c783b13e56cffb83`)
   and this service correctly discovered and decrypted through it. Worth
   doing again for the transfer-history path specifically (limitation #1).
4. Persistent storage (swap the in-memory stores for Redis/Postgres) is
   the obvious next step if this moves beyond exploration — deliberately
   not done here to keep the POC's surface small.
