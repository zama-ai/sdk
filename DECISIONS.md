# Provider/Signer split — implementation decisions

This file captures decisions made while executing the GenericProvider /
GenericSigner split. Each entry records the question, the chosen answer,
and the reasoning.

## D1 — Clean break, no deprecation layer

**Question.** The PostToolUse `pnpm typecheck` hook blocks every Write/Edit
that fails to typecheck. Narrowing `GenericSigner` (removing `readContract` /
`waitForTransactionReceipt` / `getBlockTimestamp`) and making every consumer
route reads through `sdk.provider.readContract(...)` touches ~60 call sites.

**Decision.** Clean break in a single PR — no `@deprecated` shims, no
backwards-compat re-exports, no legacy members. `GenericSigner` is the
narrow interface from day one; `GenericProvider` owns every read method.
Each call site is migrated directly; typecheck stays green by landing the
interface changes, adapter splits, ZamaSDK wiring, and call-site updates
together.

**Reasoning.** Per user directive: "no deprecation notice, full backwards
compat, not keeping anything legacy". Shipping deprecated members — even
briefly — forces consumers to decode migration guidance instead of a clean
API. The typecheck gate was manageable by staging edits so each saved file
was coherent (split adapters first, add provider field to ZamaSDK, then
migrate readers).

## D2 — ReadonlyToken / Token constructor shape

**Question.** The plan shows constructor signatures such as
`new ReadonlyToken(address, provider, signer?, relayer, ...)`. The current
code is `new ReadonlyToken(sdk, address)`.

**Decision.** Keep the `(sdk, address)` constructor. Provider and signer
flow through `sdk.provider` / `sdk.signer`. The plan text matches the
underlying dataflow, not the literal signature, and the "Migration order"
section says "thread provider through ZamaSDK construction and down to
ReadonlyToken / Token", which fits the existing sdk-composition style.

**Reasoning.** Changing the constructor from `(sdk, …)` to
`(address, provider, signer?, relayer, …)` would be a breaking change on
every external call site that wraps `new Token(sdk, …)`, far beyond the
scope discipline of this refactor, and would force every static helper
(e.g. `batchBalancesOf`, `batchDecryptBalancesAs`) to rederive the shared
SDK from individual pieces.

## D3 — `sdk.signer` typing

**Question.** With the signer optional, should `sdk.signer` be typed
`GenericSigner | undefined` or should the SDK hide the optionality behind
`requireSigner(operation)`?

**Decision.** Type `sdk.signer` as `GenericSigner | undefined`. Provide a
public `requireSigner(operation)` method that throws `SignerRequiredError`
with an actionable message. External code uses `sdk.signer?.subscribe(…)`
and lets optional chaining short-circuit when no signer is configured
(matches the plan's example snippet).

**Reasoning.** Exposing `sdk.signer` as the canonical access point keeps
the API symmetric with `sdk.provider` / `sdk.relayer` / `sdk.storage`, and
lifts the "is a signer configured" decision into the type system where the
compiler can enforce it at each call site. `requireSigner` has to be
public (not a `#private` method) because `Token` and `ReadonlyToken` — which
live outside the `ZamaSDK` class — call it at every wallet-bound operation
to surface a typed error instead of a generic `TypeError`.

## D4 — `ReadonlyToken`'s owner fallback after the split

**Question.** Methods like `balanceOf(owner?)`, `allowance(wrapper, owner?)`
today fall back to `sdk.signer.getAddress()`. After the split `sdk.signer`
may be undefined.

**Decision.** Preserve the fallback, but route it through
`sdk.requireSigner("operation").getAddress()`. Callers that pass an
explicit `owner` continue to work without a signer; callers relying on the
fallback get a `SignerRequiredError` instead of a generic
`TypeError("No signer configured")`.

**Reasoning.** Matches the plan's explicit "Owner parameter semantics"
section. Moving to viem-style required-owner semantics is out of scope.

## D5 — `signer-address` query factory

**Question.** The plan mentions migrating 10 query factories from
`signer: GenericSigner` to `sdk: ZamaSDK`. `signer-address.ts` queries the
wallet address — it genuinely needs a signer, not a provider.

**Decision.** Migrate it to take `sdk: ZamaSDK` like the others. Internally
it calls `sdk.signer?.getAddress()`; if no signer is configured, the query
function throws `SignerRequiredError`. The `enabled` gate in the hook
layer short-circuits this in read-only mode — callers that need the signer
address must configure a signer.

**Reasoning.** Centralizing on `sdk: ZamaSDK` for every factory removes
a branch from the hook layer (no per-factory decision about whether to
pass `sdk.signer` or `sdk`).

## D6 — Wagmi adapter structure

**Question.** The wagmi adapter lives under `@zama-fhe/react-sdk/wagmi`,
but `WagmiProvider` is already a widely-known wagmi React component
exported from the `wagmi` package. Naming a class `WagmiProvider` would
collide visually in user code that imports both.

**Decision.** Ship the class as `WagmiProvider` from
`@zama-fhe/react-sdk/wagmi` as the plan specifies. Users disambiguate by
import aliasing (e.g.
`import { WagmiProvider as ZamaWagmiProvider } from "@zama-fhe/react-sdk/wagmi"`).

**Reasoning.** The plan is explicit about the name, and aliasing is the
standard TS/JS disambiguation mechanism. Any other name would reduce the
symmetry ViemProvider / EthersProvider / WagmiProvider that the plan
calls out as a key outcome.

## D7 — React `ZamaProvider` backward compatibility

**Question.** The React `ZamaProvider` component props shape changes:
`provider` becomes required. Existing examples / apps would break
immediately on upgrade.

**Decision.** Require `provider` as per the plan. Update the three
example apps (react-ethers, react-viem, react-wagmi) in the same PR so
they construct both the provider and the signer from their existing
sources. No runtime fallback / inference from the signer is added — the
type-level constraint is the value this refactor delivers.

**Reasoning.** Per plan: "the same SDK surface produces the same RPC
behavior regardless of library". Runtime inference would re-introduce the
conflation the refactor exists to remove.
