# Throwing Getters for `signer` and `credentialService`

**Status:** approved
**Date:** 2026-05-05
**Branch:** `refactor/throwing-getters-signer-credentials` (off `prerelease`)

## Goal

Replace the explicit `requireSigner(operation)` / `#requireCredentialService(operation)` methods on `ZamaSDK` with throwing getters. Call sites become plain property reads (`this.signer`, `this.#credentialService`) instead of method calls.

## Motivation

The `require*(operation)` pattern was introduced in SDK-134 to bake an operation name into `SignerNotConfiguredError`. In practice, the operation name adds noise: every call site repeats the method name as a string literal, and consumers of the error rarely branch on it. A getter that throws the same error class without the operation context produces equivalent diagnostic value with less ceremony at every call site.

## Scope

**In scope** — sync-only require methods:

- `requireSigner(operation): GenericSigner`
- `#requireCredentialService(operation): CredentialService`

**Out of scope** — async methods stay as-is (getters can't be async):

- `requireChainAlignment(operation): Promise<number>`
- `requireAlignedWalletAccount(operation): Promise<WalletAccount>`

## Design

### Field rename + throwing getter for `signer`

```ts
class ZamaSDK {
  readonly #signer: GenericSigner | undefined;

  constructor(config: ZamaSDKConfig) {
    this.#signer = config.signer;
    // …
  }

  /** Whether a signer is configured. Non-throwing. */
  get hasSigner(): boolean {
    return this.#signer !== undefined;
  }

  /** Throws {@link SignerNotConfiguredError} if no signer is configured. */
  get signer(): GenericSigner {
    try {
      assertNonNullable(this.#signer, "signer");
      return this.#signer;
    } catch (cause) {
      throw new SignerNotConfiguredError({ cause });
    }
  }
}
```

`assertNonNullable` is the existing utility in `packages/sdk/src/utils/assertions.ts` — it throws a `TypeError("signer must not be null or undefined")`. We catch and rethrow as `SignerNotConfiguredError` with the original `TypeError` attached as `cause`, so consumers see the SDK's typed error while preserving the underlying assertion in the error chain for diagnostics.

- The public field `signer: GenericSigner | undefined` becomes the throwing getter `signer: GenericSigner`.
- New public boolean `hasSigner` for non-throwing peeks.
- Internal disposal `this.signer?.dispose?.()` (zama-sdk.ts:1077) becomes `this.#signer?.dispose?.()`.
- `requireSigner` method is deleted.

### Throwing private getter for `credentialService`

The existing private field `#credentialService` is renamed to give the getter its name:

```ts
class ZamaSDK {
  readonly #credentialServiceInternal: CredentialService | undefined;

  get #credentialService(): CredentialService {
    try {
      assertNonNullable(this.#credentialServiceInternal, "credentialService");
      return this.#credentialServiceInternal;
    } catch (cause) {
      throw new SignerNotConfiguredError({ cause });
    }
  }
}
```

- `#requireCredentialService(operation)` is deleted.
- Internal call sites that did `this.#requireCredentialService("foo")` become `this.#credentialService`.

### `SignerNotConfiguredError` simplification

Drop the operation argument and field:

```ts
export class SignerRequiredError extends ZamaError {
  constructor(code: ZamaErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
    this.name = "SignerRequiredError";
  }
}

export class SignerNotConfiguredError extends SignerRequiredError {
  constructor(options?: ErrorOptions) {
    super(
      ZamaErrorCode.SignerNotConfigured,
      "Signer not configured. Configure one via ZamaSDKConfig.signer or <ZamaProvider config={createConfig({ signer: ... })}>.",
      options,
    );
  }
}
```

- `operation: string` removed from `SignerRequiredError`.
- All subclass constructors of `SignerRequiredError` lose the operation parameter (see Migration below).

### Call site migration

Inside `ZamaSDK` (16 call sites in `zama-sdk.ts`):

```ts
// Before
const signer = this.requireSigner("delegateDecryption");
// After
const signer = this.signer;
```

Inside `Token` / `ReadonlyToken`:

```ts
// Before
const signer = this.sdk.requireSigner("confidentialTransfer");
// After
const signer = this.sdk.signer;
```

Internal `#requireCredentialService("foo")` → `this.#credentialService`.

The destructure pattern from the original abandoned branch (`const { signer } = this.sdk`) is identical to the explicit local assignment and works cleanly because the getter throws once on first access.

### Tests

- `packages/sdk/src/__tests__/optional-signer.test.ts:27`: `expect(sdk.signer).toBeUndefined()` → `expect(sdk.hasSigner).toBe(false)`. Add `expect(() => sdk.signer).toThrow(SignerNotConfiguredError)`.
- `optional-signer.test.ts:78`: `expect(sdk.requireSigner("op")).toBe(sdk.signer)` → `expect(sdk.signer).toBe(theSigner)`.
- New test: when no signer is configured, reading `sdk.signer` throws `SignerNotConfiguredError` whose `cause` is a `TypeError` with the message `"signer must not be null or undefined"`.
- `zama-sdk.test.ts:28`: `expect(sdk.signer).toBe(signer)` stays valid (signer configured).
- `packages/react-sdk/src/__tests__/optional-signer.test.tsx:15`: same change as SDK twin.
- `provider.test.tsx:34,97` (`expect(result.current.signer).toBeDefined()` / `.toBe(signer)`) keep working as-is — signer is configured in those cases, the getter resolves.
- React hooks/utils that read `sdk.signer` for peek (e.g. `react-sdk/src/utils/wallet-account.ts:9`) switch to `sdk.hasSigner ? sdk.signer.walletAccount.getSnapshot() : undefined`.

### API surface

Regenerate after the change:

- `packages/sdk/etc/sdk.api.md`
- `packages/sdk/etc/sdk-query.api.md`
- `packages/react-sdk/etc/react-sdk.api.md`

Surface diff:

- `requireSigner(operation: string): GenericSigner` removed.
- `signer: GenericSigner | undefined` → `readonly signer: GenericSigner` (throwing).
- `readonly hasSigner: boolean` added.
- `SignerRequiredError`/`SignerNotConfiguredError` constructor signatures lose the `operation` parameter; `operation` field removed.

### Documentation

- `docs/gitbook/src/reference/sdk/ZamaSDK.md` — replace `requireSigner` references with `signer` getter + `hasSigner`.
- `docs/gitbook/src/reference/sdk/errors.md` — drop `operation` from `SignerNotConfiguredError` example.
- `llms-full.txt` regenerated by docs build.

## Migration impact

Breaking change for downstream consumers:

- Anyone reading `sdk.signer` to test for `undefined` must switch to `sdk.hasSigner`.
- Anyone catching `SignerNotConfiguredError` and reading `error.operation` loses that field.
- `requireSigner` callers (rare — it's mostly internal) must switch to `sdk.signer`.

This lands in a prerelease, so a single CHANGELOG entry covers the contract change.

## Out of scope

- Async chain-alignment / wallet-account require methods.
- `provider` destructuring optimization in `Token` (cosmetic, separate change).
- Public exposure of `credentialService` (intentionally remains private).
