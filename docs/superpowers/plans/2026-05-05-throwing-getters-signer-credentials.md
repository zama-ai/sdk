# Throwing Getters for `signer` and `credentialService` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `requireSigner(operation)` and `#requireCredentialService(operation)` on `ZamaSDK` with throwing getters, plus a non-throwing `hasSigner` peek. Keep the async `requireChainAlignment` / `requireAlignedWalletAccount` methods unchanged.

**Architecture:** `signer` becomes a public throwing getter backed by `#signer`; expose `hasSigner` for non-throwing checks. `#credentialService` becomes a private throwing getter backed by `#credentialServiceField`. Both getters use `assertNonNullable` and wrap the resulting `TypeError` as the `cause` of `SignerNotConfiguredError`. `SignerRequiredError`'s `operation` field becomes optional metadata; `SignerNotConfiguredError` drops it entirely.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, api-extractor.

**Spec:** `docs/superpowers/specs/2026-05-05-throwing-getters-signer-credentials-design.md`

---

## File Structure

| File | Change | Responsibility |
|---|---|---|
| `packages/sdk/src/errors/signer.ts` | Modify | `SignerRequiredError.operation` → optional via options bag; `SignerNotConfiguredError` drops `operation` constructor arg + interpolation |
| `packages/sdk/src/zama-sdk.ts` | Modify | Rename `signer` field to `#signer`; add throwing getter `signer` + non-throwing `hasSigner`; rename `#credentialService` field to `#credentialServiceField` + add private throwing getter `#credentialService`; delete `requireSigner` and `#requireCredentialService` methods; update internal call sites |
| `packages/sdk/src/token/token.ts` | Modify | Replace `this.sdk.requireSigner("X")` with `this.sdk.signer` (11 sites) |
| `packages/sdk/src/token/readonly-token.ts` | Read-only check | No `requireSigner` calls today; verify still clean after refactor |
| `packages/react-sdk/src/utils/wallet-account.ts` | Modify | Switch `sdk.signer?.walletAccount.getSnapshot()` to `sdk.hasSigner ? sdk.signer.walletAccount.getSnapshot() : undefined` |
| `packages/sdk/src/__tests__/optional-signer.test.ts` | Modify | Replace `sdk.signer === undefined` assertion with `sdk.hasSigner === false`; replace `requireSigner` test with throwing-getter test asserting `cause` chain; fix `SignerNotConfiguredError` constructor call |
| `packages/react-sdk/src/__tests__/optional-signer.test.tsx` | Modify | `result.current.signer === undefined` → `result.current.hasSigner === false` |
| `packages/sdk/etc/sdk.api.md`, `etc/sdk-query.api.md` | Regen | API surface changes |
| `packages/react-sdk/etc/react-sdk.api.md` | Regen | API surface (react re-exports types only — likely unchanged but confirm) |
| `docs/gitbook/src/reference/sdk/errors.md` | Modify | Drop "carries the `operation` name" sentence for `SignerNotConfiguredError`; update example if it constructs the error |

---

## Task 1: Make `SignerRequiredError.operation` optional, drop it from `SignerNotConfiguredError`

**Files:**
- Modify: `packages/sdk/src/errors/signer.ts`

- [ ] **Step 1: Read the current file**

```bash
cat packages/sdk/src/errors/signer.ts
```

Confirm shape matches the original baseline before editing.

- [ ] **Step 2: Replace the file contents**

```ts
import { ZamaError, ZamaErrorCode } from "./base";

/**
 * Base class for signer/account readiness failures.
 */
export class SignerRequiredError extends ZamaError {
  readonly operation: string | undefined;

  constructor(
    code: ZamaErrorCode,
    message: string,
    options?: ErrorOptions & { operation?: string },
  ) {
    super(code, message, options);
    this.name = "SignerRequiredError";
    this.operation = options?.operation;
  }
}

/**
 * Thrown when an operation requires a signer but none is configured.
 *
 * The SDK can be constructed without a signer. Operations that need wallet
 * authority throw this when accessed.
 *
 * @example
 * ```ts
 * try {
 *   await token.confidentialTransfer("0xTo", 100n);
 * } catch (e) {
 *   if (e instanceof SignerNotConfiguredError) {
 *     // Fix SDK/provider configuration.
 *   }
 * }
 * ```
 */
export class SignerNotConfiguredError extends SignerRequiredError {
  constructor(options?: ErrorOptions) {
    super(
      ZamaErrorCode.SignerNotConfigured,
      "Signer not configured. Configure one via ZamaSDKConfig.signer or createConfig({ signer: ... }).",
      options,
    );
    this.name = "SignerNotConfiguredError";
  }
}

/** Thrown when a signer exists but no wallet account is currently connected. */
export class WalletNotConnectedError extends SignerRequiredError {
  constructor(operation: string, options?: ErrorOptions) {
    super(
      ZamaErrorCode.WalletNotConnected,
      `Cannot ${operation} without a connected wallet account.`,
      { ...options, operation },
    );
    this.name = "WalletNotConnectedError";
  }
}

/** Thrown when an async adapter has not resolved its initial wallet account yet. */
export class WalletAccountNotReadyError extends SignerRequiredError {
  constructor(operation: string, options?: ErrorOptions) {
    super(
      ZamaErrorCode.WalletAccountNotReady,
      `Cannot ${operation} before the wallet account is ready.`,
      { ...options, operation },
    );
    this.name = "WalletAccountNotReadyError";
  }
}
```

- [ ] **Step 3: Update internal helpers to use the new constructor signature**

The two callers of `new SignerNotConfiguredError(...)` are inside `requireSigner` and `#requireCredentialService` in `packages/sdk/src/zama-sdk.ts`. Update both to drop the operation argument:

```ts
// In requireSigner (around line 192):
throw new SignerNotConfiguredError();

// In #requireCredentialService (around line 199):
throw new SignerNotConfiguredError();
```

The two methods continue to accept an `operation: string` parameter (unused) for now — they'll be deleted in later tasks.

- [ ] **Step 4: Update the existing test that constructs the error directly**

In `packages/sdk/src/__tests__/optional-signer.test.ts:94`, change:

```ts
expect(new SignerNotConfiguredError("myOp").message).not.toContain("<ZamaProvider signer=");
```

to:

```ts
expect(new SignerNotConfiguredError().message).not.toContain("<ZamaProvider signer=");
```

The standalone `requireSigner` test (lines 65–79) still passes since the helper now constructs the error without `operation` — but it asserts `operation: "myOp"` on the thrown error, which will no longer be set. Update lines 65–79 to remove the `operation` field from the assertion:

```ts
  it("requireSigner throws SignerNotConfiguredError without signer; returns signer when present", ({
    createSDK,
  }) => {
    const sdkNoSigner = createSDK({ signer: undefined });
    expect(() => sdkNoSigner.requireSigner("myOp")).toThrow(
      expect.objectContaining({
        name: "SignerNotConfiguredError",
        code: ZamaErrorCode.SignerNotConfigured,
      }),
    );

    const sdk = createSDK();
    expect(sdk.requireSigner("op")).toBe(sdk.signer);
  });
```

(This whole test gets deleted in Task 4 when `requireSigner` is removed; for now keep it green.)

- [ ] **Step 5: Run typecheck and tests**

Run: `pnpm --filter @zama-fhe/sdk typecheck && pnpm --filter @zama-fhe/sdk test`
Expected: clean, all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/errors/signer.ts \
        packages/sdk/src/zama-sdk.ts \
        packages/sdk/src/__tests__/optional-signer.test.ts
git commit -m "$(cat <<'EOF'
refactor(sdk): drop operation arg from SignerNotConfiguredError

operation becomes optional on SignerRequiredError (passed via the options
bag). WalletNotConnectedError and WalletAccountNotReadyError continue to
forward operation. SignerNotConfiguredError no longer interpolates the
operation name in its message.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `signer` field → throwing getter + `hasSigner`

**Files:**
- Modify: `packages/sdk/src/zama-sdk.ts`

- [ ] **Step 1: Add a failing test for `hasSigner` and the throwing getter**

Edit `packages/sdk/src/__tests__/optional-signer.test.ts`. Replace lines 25–28 (the "constructs with signer omitted" block) and lines 65–95 (`requireSigner` test + regression guard) so the test surface matches the new API.

Replace:

```ts
  it("constructs with signer omitted and exposes no signer", ({ createSDK }) => {
    const sdk = createSDK({ signer: undefined });
    expect(sdk.signer).toBeUndefined();
  });
```

with:

```ts
  it("constructs with signer omitted and exposes hasSigner=false", ({ createSDK }) => {
    const sdk = createSDK({ signer: undefined });
    expect(sdk.hasSigner).toBe(false);
  });

  it("signer getter throws SignerNotConfiguredError with TypeError cause when no signer", ({
    createSDK,
  }) => {
    const sdk = createSDK({ signer: undefined });
    let caught: unknown;
    try {
      void sdk.signer;
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(SignerNotConfiguredError);
    expect((caught as SignerNotConfiguredError).code).toBe(ZamaErrorCode.SignerNotConfigured);
    expect((caught as SignerNotConfiguredError).cause).toBeInstanceOf(TypeError);
    expect(((caught as SignerNotConfiguredError).cause as TypeError).message).toBe(
      "signer must not be null or undefined",
    );
  });

  it("signer getter returns the configured signer; hasSigner is true", ({ createSDK }) => {
    const sdk = createSDK();
    expect(sdk.hasSigner).toBe(true);
    expect(sdk.signer).toBeDefined();
  });
```

Replace the regression guard (lines 93–95):

```ts
  it("error message does not leak React-specific hint", () => {
    expect(new SignerNotConfiguredError("myOp").message).not.toContain("<ZamaProvider signer=");
  });
```

with:

```ts
  it("error message does not leak React-specific hint", () => {
    expect(new SignerNotConfiguredError().message).not.toContain("<ZamaProvider signer=");
  });
```

Delete the standalone `requireSigner` test (the old lines 65–79). Leave the `SIGNER_REQUIRED_OPS` matrix (line 81 onwards) in place — those still pass because the throwing getter throws the same error class.

- [ ] **Step 2: Run the test — expect failures**

Run: `pnpm --filter @zama-fhe/sdk test optional-signer`
Expected: TypeScript errors (`hasSigner` does not exist on `ZamaSDK`) and runtime failures.

- [ ] **Step 3: Refactor `zama-sdk.ts`: introduce `#signer` + getter + `hasSigner`**

In `packages/sdk/src/zama-sdk.ts`:

1. At the top of the file, add `assertNonNullable` to the existing utils import:
   ```ts
   import { swallow, toError, assertNonNullable } from "./utils";
   ```
   (verify `assertNonNullable` is already exported from `./utils/index.ts`; it is — see `packages/sdk/src/utils/index.ts:9`).

2. Replace the field declaration around line 115. Change:
   ```ts
     readonly signer: GenericSigner | undefined;
   ```
   to:
   ```ts
     readonly #signer: GenericSigner | undefined;
   ```

3. In the constructor, change `this.signer = config.signer;` (line 140) to `this.#signer = config.signer;`.

4. In the constructor, change the disposal subscription guard `if (config.signer)` block — references to `config.signer` stay (it's the constructor argument). No change there.

5. Replace the existing `requireSigner` method (lines 185–195) with the throwing getter and a `hasSigner` peek:
   ```ts
     /** Whether a signer is configured. Non-throwing. */
     get hasSigner(): boolean {
       return this.#signer !== undefined;
     }

     /**
      * The configured signer.
      *
      * @throws {@link SignerNotConfiguredError} if no signer is configured.
      */
     get signer(): GenericSigner {
       try {
         assertNonNullable(this.#signer, "signer");
         return this.#signer;
       } catch (cause) {
         throw new SignerNotConfiguredError({ cause });
       }
     }
   ```

   Delete the old `requireSigner` method entirely.

6. Update internal disposal at line 1077 (`this.signer?.dispose?.()` inside `dispose()` or similar method) to use the backing field:
   ```ts
   this.#signer?.dispose?.();
   ```

7. Update `requireAlignedWalletAccount` body (line 232) — change `const signer = this.requireSigner(operation);` to `const signer = this.signer;`.

- [ ] **Step 4: Update the public `ZamaSDKConfig.signer` JSDoc note** (around line 76)

Optional but recommended. Adjust the JSDoc to reflect the new contract:
```ts
   * Optional wallet signer (`ViemSigner`, `EthersSigner`, `WagmiSigner`, or
   * custom {@link GenericSigner}). Reading {@link ZamaSDK.signer} when no
   * signer is configured throws {@link SignerNotConfiguredError}. Use
   * {@link ZamaSDK.hasSigner} for non-throwing checks.
```

- [ ] **Step 5: Run the optional-signer test**

Run: `pnpm --filter @zama-fhe/sdk test optional-signer`
Expected: most tests pass. The `Token.confidentialTransfer` row in `SIGNER_REQUIRED_OPS` still references `sdk.requireSigner` indirectly via `Token` — this will fail until Task 4. Skip that row by adding `it.skip` temporarily? No — keep it in; it'll start passing in Task 4.

If only `Token.confidentialTransfer` fails, that's expected. Continue.

- [ ] **Step 6: Run full SDK typecheck**

Run: `pnpm --filter @zama-fhe/sdk typecheck`
Expected: `Token` and other call sites of `this.sdk.requireSigner` will report errors. That's expected — they get fixed in Task 4.

- [ ] **Step 7: Don't commit yet** — combined commit at end of Task 4 once the SDK package compiles cleanly. Move on.

---

## Task 3: React `wallet-account.ts` — use `hasSigner` for the peek

**Files:**
- Modify: `packages/react-sdk/src/utils/wallet-account.ts`

- [ ] **Step 1: Update the snapshot reader**

In `packages/react-sdk/src/utils/wallet-account.ts`, replace:

```ts
"use client";

import { useSyncExternalStore } from "react";
import type { WalletAccount, ZamaSDK } from "@zama-fhe/sdk";

export function useWalletAccount(sdk: ZamaSDK): WalletAccount | undefined {
  return useSyncExternalStore(
    (listener) => sdk.onWalletAccountChange(listener),
    () => sdk.signer?.walletAccount.getSnapshot(),
    () => undefined,
  );
}
```

with:

```ts
"use client";

import { useSyncExternalStore } from "react";
import type { WalletAccount, ZamaSDK } from "@zama-fhe/sdk";

export function useWalletAccount(sdk: ZamaSDK): WalletAccount | undefined {
  return useSyncExternalStore(
    (listener) => sdk.onWalletAccountChange(listener),
    () => (sdk.hasSigner ? sdk.signer.walletAccount.getSnapshot() : undefined),
    () => undefined,
  );
}
```

- [ ] **Step 2: Don't commit yet** — combined commit comes later.

---

## Task 4: Replace `this.sdk.requireSigner("X")` call sites in `Token`

**Files:**
- Modify: `packages/sdk/src/token/token.ts`

- [ ] **Step 1: Replace each call site (11 occurrences)**

Use this exact mapping (line numbers from the prerelease baseline — confirm before editing in case of drift):

| Line | Before | After |
|---|---|---|
| 127 | `const signer = this.sdk.requireSigner("confidentialTransfer");` | `const signer = this.sdk.signer;` |
| 194 | `const signer = this.sdk.requireSigner("confidentialTransferFrom");` | `const signer = this.sdk.signer;` |
| 255 | `const signer = this.sdk.requireSigner("setOperator");` | `const signer = this.sdk.signer;` |
| 324 | `const signer = this.sdk.requireSigner("shield");` | `const signer = this.sdk.signer;` |
| 394 | `const signer = this.sdk.requireSigner("unwrap");` | `const signer = this.sdk.signer;` |
| 446 | `const signer = this.sdk.requireSigner("unwrapAll");` | `const signer = this.sdk.signer;` |
| 581 | `const signer = this.sdk.requireSigner("finalizeUnwrap");` | `const signer = this.sdk.signer;` |
| 630 | `const signer = this.sdk.requireSigner("approveUnderlying");` | `const signer = this.sdk.signer;` |
| 695 | `const signer = this.sdk.requireSigner("delegateDecryption");` | `const signer = this.sdk.signer;` |
| 784 | `const signer = this.sdk.requireSigner("revokeDelegation");` | `const signer = this.sdk.signer;` |
| 991 | `const signer = this.sdk.requireSigner("approveUnderlying");` | `const signer = this.sdk.signer;` |

Use a project-wide search to validate completeness:
```bash
grep -n "requireSigner" packages/sdk/src/token/token.ts
```
Expected after edits: no matches.

- [ ] **Step 2: Replace internal `this.requireSigner(...)` calls in `zama-sdk.ts`**

Find:
```bash
grep -n "this\.requireSigner\b" packages/sdk/src/zama-sdk.ts
```

Expected lines (from baseline): `232`, `448`, `538`. Replace each `this.requireSigner("...")` with `this.signer`.

- [ ] **Step 3: Verify there are no remaining call sites**

```bash
grep -rn "requireSigner" packages/sdk/src packages/react-sdk/src
```
Expected: no source-code matches (only matches inside markdown api reports — those are addressed in Task 8).

- [ ] **Step 4: Run SDK tests**

Run: `pnpm --filter @zama-fhe/sdk test`
Expected: all SDK tests pass, including the full `optional-signer.test.ts` matrix.

- [ ] **Step 5: Run typecheck**

Run: `pnpm --filter @zama-fhe/sdk typecheck`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/zama-sdk.ts \
        packages/sdk/src/token/token.ts \
        packages/sdk/src/__tests__/optional-signer.test.ts \
        packages/react-sdk/src/utils/wallet-account.ts
git commit -m "$(cat <<'EOF'
refactor(sdk): replace requireSigner with throwing signer getter + hasSigner

The signer field becomes a public throwing getter backed by #signer; reading
sdk.signer when no signer is configured throws SignerNotConfiguredError whose
cause is the underlying TypeError from assertNonNullable. hasSigner provides
a non-throwing peek for callers that want to test for configuration without
throwing (disposal path, useWalletAccount snapshot read).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `#credentialService` → throwing private getter

**Files:**
- Modify: `packages/sdk/src/zama-sdk.ts`

- [ ] **Step 1: Rename the backing field**

Replace the field declaration `readonly #credentialService: CredentialService | undefined;` (around line 118) with:

```ts
  readonly #credentialServiceField: CredentialService | undefined;
```

In the constructor, replace both assignments:
```ts
this.#credentialService = new CredentialService({...});  // line 165
// becomes
this.#credentialServiceField = new CredentialService({...});

this.#credentialService = undefined;  // line 181
// becomes
this.#credentialServiceField = undefined;
```

- [ ] **Step 2: Replace `#requireCredentialService` with the throwing getter**

Delete the existing `#requireCredentialService` method (lines 197–203) and add the getter. Place it next to `signer` getter for symmetry:

```ts
  /**
   * Internal: throws {@link SignerNotConfiguredError} if the credential
   * service is not initialized (i.e., no signer was configured).
   */
  get #credentialService(): CredentialService {
    try {
      assertNonNullable(this.#credentialServiceField, "credentialService");
      return this.#credentialServiceField;
    } catch (cause) {
      throw new SignerNotConfiguredError({ cause });
    }
  }
```

- [ ] **Step 3: Update internal call sites that need to *peek* (not throw)**

Five existing call sites read `this.#credentialService` expecting `undefined` to be a possibility. Migrate them to the backing field:

| Line | Before | After |
|---|---|---|
| 261 | `const credentialService = this.#credentialService;` | `const credentialService = this.#credentialServiceField;` |
| 399 | `if (!this.#credentialService) {` | `if (!this.#credentialServiceField) {` |
| 402 | `return this.#credentialService.isAllowed(contracts);` | `return this.#credentialServiceField.isAllowed(contracts);` |
| 413 | `if (!this.#credentialService) {` | `if (!this.#credentialServiceField) {` |
| 416 | `return this.#credentialService.isAllowed(contracts, delegator);` | `return this.#credentialServiceField.isAllowed(contracts, delegator);` |

Confirm via:
```bash
grep -n "#credentialService\b" packages/sdk/src/zama-sdk.ts
```

After edits, the only `#credentialService` (no `Field` suffix) references should be:
- The getter definition itself
- The 6 throwing call sites listed in Task 6

- [ ] **Step 4: Replace the throwing call sites**

Six existing `this.#requireCredentialService("...")` calls. Replace each with `this.#credentialService` (the new throwing getter):

| Line | Before | After |
|---|---|---|
| 373 | `const service = this.#requireCredentialService("allow");` | `const service = this.#credentialService;` |
| 388 | `const service = this.#requireCredentialService("allowAs");` | `const service = this.#credentialService;` |
| 661 | `const service = this.#requireCredentialService("userDecrypt");` | `const service = this.#credentialService;` |
| 802 | `const service = this.#requireCredentialService("delegatedUserDecrypt");` | `const service = this.#credentialService;` |
| 1032 | `const service = this.#requireCredentialService("revokePermits");` | `const service = this.#credentialService;` |
| 1049 | `const service = this.#requireCredentialService("clearCredentials");` | `const service = this.#credentialService;` |

- [ ] **Step 5: Verify no remaining references**

```bash
grep -n "#requireCredentialService" packages/sdk/src/zama-sdk.ts
```
Expected: no matches.

- [ ] **Step 6: Run SDK tests**

Run: `pnpm --filter @zama-fhe/sdk test`
Expected: all green.

- [ ] **Step 7: Run typecheck**

Run: `pnpm --filter @zama-fhe/sdk typecheck`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add packages/sdk/src/zama-sdk.ts
git commit -m "$(cat <<'EOF'
refactor(sdk): convert #requireCredentialService to private throwing getter

The backing field is now #credentialServiceField; the throwing accessor
#credentialService is a getter that asserts non-null and rethrows the
TypeError as the cause of SignerNotConfiguredError. Internal peek call
sites use #credentialServiceField directly.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Update React `optional-signer.test.tsx` for `hasSigner`

**Files:**
- Modify: `packages/react-sdk/src/__tests__/optional-signer.test.tsx`

- [ ] **Step 1: Replace the `signer` undefined assertion**

In `packages/react-sdk/src/__tests__/optional-signer.test.tsx`, line 15. Replace:

```ts
    expect(result.current.signer).toBeUndefined();
```

with:

```ts
    expect(result.current.hasSigner).toBe(false);
```

- [ ] **Step 2: Run react-sdk tests**

Run: `pnpm --filter @zama-fhe/react-sdk test optional-signer`
Expected: all pass. The mutation-error test (`SignerNotConfiguredError` on invoke) still works because the throwing getter throws the same class.

- [ ] **Step 3: Run full react-sdk test suite**

Run: `pnpm --filter @zama-fhe/react-sdk test`
Expected: all green.

- [ ] **Step 4: Run react-sdk typecheck**

Run: `pnpm --filter @zama-fhe/react-sdk typecheck`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add packages/react-sdk/src/__tests__/optional-signer.test.tsx
git commit -m "$(cat <<'EOF'
test(react-sdk): use hasSigner instead of signer===undefined

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Regenerate API extractor reports

**Files:**
- Modify: `packages/sdk/etc/sdk.api.md`
- Modify: `packages/sdk/etc/sdk-query.api.md`
- Modify: `packages/react-sdk/etc/react-sdk.api.md` (likely unchanged)

- [ ] **Step 1: Build and regenerate**

Run: `pnpm api-report`
Expected: reports updated with the API surface diff (`signer: GenericSigner | undefined` → `readonly signer: GenericSigner`; new `readonly hasSigner: boolean`; `requireSigner` removed; `SignerNotConfiguredError` constructor signature changed).

- [ ] **Step 2: Verify the diff is sensible**

Run: `git diff packages/sdk/etc/ packages/react-sdk/etc/`
Expected diff:
- Adds `readonly hasSigner: boolean;` on `ZamaSDK`
- Changes `signer: GenericSigner | undefined;` → `readonly signer: GenericSigner;`
- Removes `requireSigner(operation: string): GenericSigner;` line
- Changes `SignerNotConfiguredError` constructor from `(operation: string, options?: ErrorOptions)` → `(options?: ErrorOptions)`
- Changes `SignerRequiredError` constructor signature (operation moved into options bag)

If anything else changed unexpectedly, investigate before committing.

- [ ] **Step 3: Confirm `api-report:check` passes (CI guard)**

Run: `pnpm api-report:check`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/etc packages/react-sdk/etc
git commit -m "$(cat <<'EOF'
docs(sdk): regenerate api reports after throwing-getter refactor

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Update gitbook docs

**Files:**
- Modify: `docs/gitbook/src/reference/sdk/errors.md`

- [ ] **Step 1: Update the `SignerNotConfiguredError` section**

In `docs/gitbook/src/reference/sdk/errors.md` around line 111, replace:

```
Thrown when a write, sign, or decrypt operation is called on an SDK instance configured without a signer. The error carries the `operation` name that was attempted.
```

with:

```
Thrown when a write, sign, or decrypt operation is called on an SDK instance configured without a signer.
```

- [ ] **Step 2: Verify no other docs reference `requireSigner` or `SignerNotConfiguredError(operation)`**

```bash
grep -rn "requireSigner\|SignerNotConfiguredError(\"" docs/gitbook/
```
Expected: no matches.

- [ ] **Step 3: Verify `ZamaSDK.md` is still accurate**

```bash
grep -n "Signer-dependent operations throw" docs/gitbook/src/reference/sdk/ZamaSDK.md
```
The existing copy ("Signer-dependent operations throw `SignerNotConfiguredError` when invoked without a signer") is still accurate — no change needed.

If `ZamaSDK.md` describes `signer` as `GenericSigner | undefined` in a type signature, update to clarify it now throws on access. Otherwise no change.

- [ ] **Step 4: Commit**

```bash
git add docs/gitbook/src/reference/sdk/errors.md
git commit -m "$(cat <<'EOF'
docs(sdk): drop operation-name claim from SignerNotConfiguredError section

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Final verification

- [ ] **Step 1: Full repo typecheck**

Run: `pnpm typecheck`
Expected: clean across all workspaces.

- [ ] **Step 2: Full repo test suite**

Run: `pnpm test`
Expected: all green.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: clean.

- [ ] **Step 4: API report check (no diff vs. committed reports)**

Run: `pnpm api-report:check`
Expected: clean.

- [ ] **Step 5: Verify no stale references**

```bash
grep -rn "requireSigner\|#requireCredentialService" packages/sdk/src packages/react-sdk/src docs/gitbook
```
Expected: no matches.

- [ ] **Step 6: Push the branch**

```bash
git push -u origin refactor/throwing-getters-signer-credentials
```

The branch is ready for PR against `prerelease`.
