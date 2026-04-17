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

## D3 — `sdk.signer` stays required

**Question.** Once `GenericProvider` owns public reads, should `sdk.signer`
also become optional so the SDK can be constructed in a read-only mode?

**Decision.** No. Keep `sdk.signer` typed as `GenericSigner`, make
`ZamaSDKConfig.signer` required, and keep `sdk.credentials` /
`sdk.delegatedCredentials` unconditionally constructed. Do not model this
PR as "provider/signer split plus read-only SDK construction".

**Reasoning.** The provider/signer split is about separating read
transport from wallet authority. Making `signer` optional is a separate
product decision that widens the public surface: nullable fields on
`ZamaSDK`, extra guard helpers, mutation hooks that tolerate missing
`Token`, alternate signer-address behavior, and additional docs/tests for
an SDK-construction path no current consumer uses. That scope creep makes
the split harder to review and leaves the main API less coherent.

If a future consumer needs true read-only construction, it should land as
an explicit separate design, e.g. a dedicated `ReadonlyZamaSDK` (or
equivalent) with its own invariants, rather than threading
`GenericSigner | undefined` through every wallet-bound path.

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
