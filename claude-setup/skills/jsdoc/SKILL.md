---
name: jsdoc
description: "Opinionated JSDoc conventions for TypeScript SDK codebases. Use when: (1) Writing or reviewing JSDoc on public API exports, (2) Cleaning up over-documented code, (3) Auditing documentation for internal leakage, (4) Writing JSDoc for types, interfaces, and classes, (5) Deciding whether a function needs JSDoc at all. Principle: JSDoc should add value, not restate what TypeScript already shows."
---

# JSDoc Conventions

TypeScript signatures are documentation. JSDoc exists only to fill gaps that the type system cannot express.

## Core Principle

> **If TypeScript already says it, don't write it again.**

JSDoc adds value when it communicates: intent, constraints, side-effects, error contracts, or usage patterns that types alone cannot convey.

## Decision Tree

Before writing JSDoc on any symbol, ask:

```
1. Is the name + signature self-explanatory?
   YES → No JSDoc needed
   NO  → Continue

2. Is this a public export (consumed by users / fed to typedoc)?
   YES → Full JSDoc (description, @param, @returns, @throws, @example)
   NO  → Continue

3. Is this a protected method on an abstract base class (extension point)?
   YES → Minimal JSDoc (description + @throws, no @param/@returns)
   NO  → Continue

4. Is this marked @internal (and NOT a protected extension point)?
   YES → Just `/** @internal */`, nothing else
   NO  → Minimal JSDoc (description + @throws only, no @param/@returns)
```

## Rules by Category

### 1. Public Export Functions and Methods

Full JSDoc. These feed typedoc and appear in generated API reference pages.

````ts
// GOOD — describes intent, documents params for typedoc, lists errors
/**
 * Confidential transfer.
 * Set `skipBalanceCheck: true` to bypass balance validation (e.g. for smart wallets).
 *
 * @param to - Recipient address.
 * @param amount - Plaintext amount to transfer.
 * @param options - Transfer options.
 * @returns The transaction hash and mined receipt.
 * @throws {@link InsufficientConfidentialBalanceError} if balance is less than `amount`.
 * @throws {@link EncryptionFailedError} if FHE encryption fails.
 * @throws {@link TransactionRevertedError} if the on-chain transfer reverts.
 *
 * @example
 * ```ts
 * const result = await token.confidentialTransfer("0xRecipient", 1000n);
 * // Smart wallet (skip balance check):
 * const result = await token.confidentialTransfer("0xRecipient", 1000n, { skipBalanceCheck: true });
 * ```
 */

// BAD — describes implementation internals
/**
 * Confidential transfer. Encrypts the amount via FHE, then calls the contract.
 * Returns the transaction hash.
 *
 * By default, the SDK validates the confidential balance before submitting.
 * If a cached plaintext balance exists it is used; otherwise, if credentials
 * are cached, it decrypts on the fly.
 *
 * @param to - Recipient address.
 * @param amount - Plaintext amount to transfer (encrypted automatically via FHE).
 * ...
 */
````

**What to include in the description:**

- What the function does (one sentence)
- Configurable behavior that affects usage (options, strategies, defaults)
- Non-obvious constraints or prerequisites
- Observable side-effects that change the caller's experience (e.g. wallet prompts, network requests, state mutations)

**What to exclude from the description:**

- How the function works internally (encryption steps, cache strategies, event emission)
- Implementation sequence ("encrypts, then calls contract, then waits for receipt")
- Internal delegation patterns ("delegates to ZamaSDK.userDecrypt")

#### React Hooks (public exports)

Hooks are public exports and follow the same full JSDoc rule. However, `@param` can be omitted when the parameter is a well-documented config interface — the config's property-level JSDoc carries the detail. `@returns` is always required because TanStack Query return types are opaque without it.

````ts
// GOOD — @returns tells the user what `data` contains, @param omitted (config is self-documented)
/**
 * Read the connected wallet's confidential token balance, polling at regular intervals.
 *
 * @returns Query result with `data` as the decrypted balance in base units (bigint).
 * @throws {@link DecryptionFailedError} if FHE decryption fails.
 *
 * @example
 * ```tsx
 * const { data: balance } = useConfidentialBalance({ tokenAddress: "0x..." });
 * ```
 */

// BAD — missing @returns, user has no idea what `data` contains
/**
 * Read the connected wallet's confidential token balance, polling at regular intervals.
 *
 * @example
 * ```tsx
 * const { data: balance } = useConfidentialBalance({ tokenAddress: "0x..." });
 * ```
 */
````

Document non-standard defaults that diverge from framework conventions:

```ts
// GOOD — documents a surprising default
/**
 * Decrypt FHE ciphertext handles using the connected wallet's credentials.
 * The query is **disabled by default** — pass `enabled: true` to trigger decryption.
 */
```

### 2. Private/Internal Methods and Helpers

Minimal JSDoc. By default, no `@param` or `@returns` — TypeScript signatures suffice — but if ambiguity internally on the params, add `@param` and `@returns` to the JSDoc. Keep `@throws` because error contracts aren't in the type system.

This rule also applies to **`protected` methods on abstract base classes** — these are extension points for subclass authors, not public API. They need a description and `@throws`, but not `@param`/`@returns`.

```ts
// GOOD — private method, description + @throws only
/**
 * Ensure ERC-20 allowance is sufficient for the shield amount.
 *
 * @throws {@link ApprovalFailedError} if the approval transaction fails.
 */
async #ensureAllowance(amount: bigint, maxApproval: boolean, callbacks?: ShieldCallbacks): Promise<void> {

// GOOD — protected extension point, description + @throws
/**
 * Resolve credentials for the given contracts, creating fresh ones if none are cached.
 * Deduplicates concurrent creation calls.
 *
 * @throws {@link SigningRejectedError} if the user rejects the wallet signature prompt.
 * @throws {@link SigningFailedError} if signing fails for any other reason.
 */
protected async resolveCredentials(...): Promise<TCreds> {

// BAD — @param/@returns repeat that's explicitly stated in the types
/**
 * Ensure ERC-20 allowance is sufficient for the shield amount.
 *
 * @param amount - The amount to check allowance for.
 * @param maxApproval - Whether to approve max uint256.
 * @param callbacks - Optional shield callbacks.
 * @returns Resolves when allowance is sufficient.
 * @throws {@link ApprovalFailedError} if the approval transaction fails.
 */

// BAD — protected method reduced to just @internal (loses error contract)
/** @internal */
protected async resolveCredentials(...): Promise<TCreds> {
```

### 3. Classes and Modules

First sentence describes the "what". Observable behavior contracts (guarantees, invariants) stay. Implementation details go.

````ts
// GOOD
/**
 * Storage-backed cache for decrypted FHE plaintext values.
 * All public methods are best-effort: storage errors are caught and swallowed — the cache never throws.
 */
export class DecryptCache {

// BAD — leaks storage key format, micro-queue implementation, lifecycle details
/**
 * Storage-backed cache for decrypted FHE plaintext values.
 *
 * Each entry is keyed by `(requester, contractAddress, handle)` so that...
 * Addresses are checksummed and handles lowercased...
 * A separate index (`zama:decrypt:keys`) tracks all stored cache keys...
 * Index writes are serialised through a micro-queue...
 *
 * Cache storage key format:
 * ```
 * zama:decrypt:{checksumAddress}:{checksumAddress}:{lowercaseHandle}
 * ```
 */
````

### 4. Types, Interfaces, and Type Aliases

No JSDoc when the name + values are self-documenting. Add JSDoc on properties only when they provide non-obvious context.

**"Self-documenting" means:** a developer unfamiliar with the codebase can understand the type's purpose and usage from its name and field names alone. String literal unions, simple config objects with obvious fields, and boolean flags are typically self-documenting. **Protocol structs with domain-specific fields are NOT** — if the type represents a protocol message, authorization payload, or crypto primitive, add a one-liner explaining what it is and whether consumers construct it manually or receive it from the SDK.

```ts
// GOOD — self-documenting string union, no JSDoc needed
export type ActivityDirection = "incoming" | "outgoing" | "self";

// GOOD — protocol struct needs a one-liner (domain-specific fields)
/** Parameters for a user-decrypt request to the KMS relayer. Produced by the EIP-712 signing flow. */
export interface UserDecryptParams {
  handles: Handle[];
  contractAddress: Address;
  publicKey: Hex;
  privateKey: Hex;
  signature: Hex;
  signerAddress: Address;
  signedContractAddresses: Address[];
  startTimestamp: number;
  durationDays: number;
}

// BAD — restates the obvious on a self-documenting type
/** Direction of an activity item relative to the connected wallet. */
export type ActivityDirection = "incoming" | "outgoing" | "self";

// BAD — protocol struct with no context (reader has no idea if they construct this)
export interface UserDecryptParams {
  handles: Handle[];
  // ... 8 more opaque fields
}

// GOOD — property JSDoc adds non-obvious context
export type ActivityAmount =
  | { readonly type: "clear"; readonly value: bigint }
  | {
      readonly type: "encrypted";
      readonly handle: Handle;
      /** Populated after batch decryption via {@link applyDecryptedValues}. */
      readonly decryptedValue?: bigint;
    };

// BAD — property JSDoc restates the name
export interface ActivityItem {
  /** Classified event type. */
  readonly type: ActivityType;
  /** Direction relative to the connected wallet. */
  readonly direction: ActivityDirection;
}
```

### 5. `@internal` Exports

Just the tag. No description — internal consumers can read the code.

**Scope:** This rule applies to symbols tagged `@internal` for typedoc suppression — re-exported test helpers, type aliases, internal plumbing. It does **NOT** apply to `protected` methods on abstract base classes that subclass authors need to understand — those follow Rule 2 (description + `@throws`).

```ts
// GOOD — pure internal re-export
/** @internal */
export type DecryptedHandlesMap = Map<Handle, ClearValueType>;

// GOOD — internal event emitter on a base class (trivial, name is clear)
/** @internal */
protected emit(partial: ZamaSDKEventInput): void {

// BAD — verbose description on an @internal export
/**
 * Re-exported alias used by tests and helpers for arbitrary-handle decryption.
 * Use {@link ZamaSDK.userDecrypt} directly in application code.
 *
 * @internal
 */
export type DecryptedHandlesMap = Map<Handle, ClearValueType>;

// BAD — protected extension point reduced to bare @internal (loses error contract)
/** @internal */
protected async resolveCredentials(...): Promise<TCreds> {
```

### 6. `@example` Blocks

One per function. Compact. Show the primary use case, plus one variant if it demonstrates a non-obvious option.

````ts
// GOOD — one block, two cases
* @example
* ```ts
* await token.approveUnderlying(); // max approval
* await token.approveUnderlying(1000n); // exact amount
* ```

// BAD — separate blocks for trivial variants
* @example
* ```ts
* await token.approveUnderlying();
* ```
* @example
* ```ts
* await token.approveUnderlying(1000n);
* ```
````

### 7. `@throws`

Keep everywhere — public and private. This is the only place error contracts are documented. TypeScript has no `throws` clause, thus, the information is conveyed via JSDoc.

```ts
// Always document @throws, even on private methods
@throws {@link DelegationNotFoundError} if no active delegation exists.
@throws {@link DelegationExpiredError} if the delegation has expired.
```

### 8. `{@link}` References

Keep them. They produce navigable links in typedoc output and IDE hover.

```ts
// GOOD
/** Call {@link finalizeUnwrap} after the request is processed on-chain. */
```

### 9. Inline Code Comments

Keep comments that explain **why** (non-obvious design decisions, workarounds, known pitfalls). Remove comments that paraphrase **what** the code does. Inline comments are the right medium for line-level rationale that does not belong in JSDoc (field declarations, security-critical parameters, concurrency primitives).

```ts
// GOOD — explains a non-obvious workaround
// Reset to zero first when there's an existing non-zero allowance.
// Required by non-standard tokens like USDT, and also mitigates the
// ERC-20 approve race condition for all tokens.

// GOOD — explains a design choice
// Pre-flight: reject if never delegated (expiry === 0).
// Expired delegations (non-zero expiry in the past) are allowed through —
// the ACL contract accepts revocation of expired delegations.

// GOOD — security-critical parameter rationale
iterations: 600_000, // NIST SP 800-132 (2023) for PBKDF2-SHA-256. Do not reduce.

// GOOD — concurrency design on field declarations
// Serialises re-entrant calls: while one caller is checking chain IDs
// and potentially tearing down an old worker, others await this promise.
#ensureLock: Promise<WorkerClient> | null = null;
// Deduplicates WASM init: all concurrent callers share one promise.
// Cleared on failure so the next caller retries.
#initPromise: Promise<WorkerClient> | null = null;

// BAD — paraphrases the code
// Normalize the address
const normalizedTo = getAddress(to);

// BAD — restates the obvious
// Check if balance is sufficient
if (balance < amount) {
```

### 10. `@remarks` — Consumer-Facing Context

Use `@remarks` (TSDoc standard) to provide extended context that a **consumer needs to use the API correctly** but that would clutter the summary. Typedoc renders `@remarks` under a dedicated "Remarks" heading on the detail page; index/overview pages show only the summary.

**Decision rule:** "If a consumer saw this, would it change how they call this function?" If yes → `@remarks`.

Use `@remarks` for:

- **Observable side-effects** — actions the function triggers beyond its return value
- **Data hazard caveats** — silent collisions, surprising equality semantics
- **Behavioral contracts** — guarantees about caching, batching, error propagation
- **Timing constraints** — delays, propagation windows, polling behavior

```ts
// GOOD — side-effect a consumer must know about
/**
 * Decrypt and return the plaintext balance for the given owner.
 *
 * @remarks
 * Triggers a wallet signature prompt if credentials are not yet cached.
 * Call {@link allow} first to pre-authorize and control when the prompt appears.
 *
 * @returns The decrypted plaintext balance as a bigint.
 * @throws {@link SigningRejectedError} if the user rejects the wallet prompt.
 */

// GOOD — data caveat on a utility
/**
 * Stable hash function for query keys.
 * Sorts object keys recursively and converts bigint values to strings.
 *
 * @remarks
 * bigint `1n` and string `"1"` serialize identically — avoid mixing
 * bigint and string representations of the same value within one query key.
 */

// GOOD — behavioral contract on a utility
/**
 * Returns `true` for errors that affect the whole SDK session rather than a single operation.
 *
 * @remarks
 * When this returns `true`, batch operations (e.g. {@link ReadonlyToken.batchBalancesOf})
 * abort entirely rather than collecting a per-item failure. Retrying individual items
 * will not help — the session must be re-established.
 */

// BAD — implementation detail in @remarks (should be @privateRemarks or inline comment)
/**
 * Generate an FHE keypair.
 *
 * @remarks
 * Internally delegates to the WASM worker via postMessage, which serializes
 * the request through the pending-request queue in BaseWorkerClient.
 */
```

### 11. `@privateRemarks` — Maintainer-Only Context

Use `@privateRemarks` (TSDoc standard) for notes intended **only for developers working on the codebase**. Typedoc strips `@privateRemarks` from generated output — they are invisible to consumers.

**Decision rule:** "Is this about how the code works or why a specific implementation choice was made?" If yes → `@privateRemarks` (or inline `//` for line-level notes).

Use `@privateRemarks` for:

- **Concurrency design rationale** — why a lock/queue/dedup pattern exists
- **Maintenance obligations** — "keep aligned with dependency X on upgrade"
- **Cross-reference to external specs** — NIST standards, EIP numbers, protocol docs
- **Performance trade-off explanations** — why a cache TTL was chosen, why a batch size is limited

```ts
// GOOD — maintenance obligation (stripped from typedoc)
/**
 * TanStack Query behavioral option keys stripped by {@link filterQueryOptions}.
 *
 * @privateRemarks
 * Keep this list aligned with `UseQueryOptions` in `@tanstack/query-core` on every upgrade.
 *
 * @internal
 */
export type StrippedQueryOptionKeys = "gcTime" | "staleTime" | ...;

// GOOD — concurrency rationale (stripped from typedoc)
/**
 * RelayerWeb — browser encryption/decryption backend using a Web Worker.
 *
 * @privateRemarks
 * Uses a two-level lock: `#ensureLock` serialises chain-ID checks and
 * worker teardown, while `#initPromise` deduplicates the WASM init.
 * Both are needed because chain switches must complete atomically
 * before a new init can start.
 */
export class RelayerWeb implements RelayerSDK {
```

#### When to use `@privateRemarks` vs inline `//`

- **`@privateRemarks`** — class/function-level design rationale that applies to the whole symbol
- **Inline `//`** — line-level notes tied to a specific field, parameter value, or code branch

Both serve maintainers. Use the one closest to the code it describes.

## Checklist for Reviewing JSDoc

When auditing a file, check each JSDoc block against:

- [ ] Description says "what", not "how"
- [ ] No implementation details leaked (encryption steps, cache strategies, internal delegation)
- [ ] Observable side-effects are documented (wallet prompts, state mutations)
- [ ] `@param`/`@returns` present on public exports; `@returns` present on all React hooks
- [ ] `@param` descriptions add info beyond the parameter name and type
- [ ] `@throws` present on every function that throws typed errors (public AND private)
- [ ] `@example` is one block, compact, shows primary usage
- [ ] `@internal` exports have just `/** @internal */` — but `protected` extension points have description + `@throws`
- [ ] Domain/protocol types have a one-liner; self-documenting types (string unions, simple configs) have none
- [ ] `@remarks` used for consumer-facing context (side-effects, caveats, behavioral contracts)
- [ ] `@privateRemarks` used for maintainer-only context (concurrency design, maintenance obligations)
- [ ] Inline comments explain "why", not "what" — security params, concurrency fields, workarounds
- [ ] `{@link}` references are preserved
