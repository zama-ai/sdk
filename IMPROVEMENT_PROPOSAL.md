# Improvement Proposal: Compile-Time Signer Safety

## Problem

`ZamaSDK` exposes the same API surface regardless of whether a signer is configured. Write methods (`shield`, `confidentialTransfer`, `unshield`) and decrypt methods (`balanceOf`, `userDecrypt`) compile fine on a signer-less SDK — the error only surfaces at runtime via `SignerRequiredError`. TypeScript users get no feedback in the editor.

```ts
const sdk = new ZamaSDK({ provider, relayer, storage }); // no signer
const token = sdk.createToken("0x...");
await token.shield(1000n); // compiles ✓, throws at runtime ✗
```

## How viem solves this

Viem has one base `Client` object. `PublicClient` and `WalletClient` are not separate classes — they are the same runtime object with different methods `.extend()`-ed onto it.

### Single base, decorated capabilities

```ts
// viem internals (simplified)
type Client<
  transport,
  chain,
  account extends Account | undefined,
  rpcSchema,
  extended,    // ← accumulates merged action objects
> = Client_Base<...> & (extended extends Extended ? extended : unknown) & {
  extend: <const client extends Extended>(
    fn: (client: Client<...>) => client
  ) => Client<..., Prettify<client> & extended>
}
```

`createPublicClient` = `createClient().extend(publicActions)` — adds `readContract`, `getBlock`, ~50 methods.
`createWalletClient` = `createClient().extend(walletActions)` — adds `sendTransaction`, `writeContract`, ~20 methods.

At runtime, `extend()` merges the action functions onto the base object:

```ts
function extend(base) {
  return (extendFn) => {
    const extended = extendFn(base);
    for (const key in base) delete extended[key]; // don't shadow base keys
    return Object.assign({ ...base, ...extended }, { extend: extend(combined) });
  };
}
```

**Write methods don't exist on a `PublicClient`** — not guarded, just absent. TypeScript catches it; at runtime it's a `TypeError`.

### Conditional account requirement

For the "wallet exists but not connected" case, viem uses a conditional type:

```ts
type GetAccountParameter<
  account extends Account | undefined,
  required extends boolean = true,
> = MaybeRequired<
  { account?: Account | Address },
  IsUndefined<account> extends true ? (required extends true ? true : false) : false
>;
```

When `account` is `undefined` on the client type, `sendTransaction` requires `account` as a call-time argument. When the client was created with a concrete account, the argument becomes optional. The type flows from client construction → through the generic → into each action signature.

At runtime, a fallback `AccountNotFoundError` guards untyped callers:

```ts
// sendTransaction.ts
const account_ = parameters.account ?? client.account;
if (typeof account_ === "undefined") throw new AccountNotFoundError();
```

### Summary

| Concern              | Viem approach                                                                |
| -------------------- | ---------------------------------------------------------------------------- |
| No wallet at all     | Method doesn't exist on `PublicClient` type — compile error                  |
| Wallet not connected | `account: undefined` generic → action requires `account` arg — compile error |
| Untyped callers      | `AccountNotFoundError` at runtime — fallback                                 |

## What this could look like for ZamaSDK

### Option A: Generic on `ZamaSDK` + conditional methods

Make `signer` a generic parameter. Write methods only appear on the type when a signer is present.

```ts
class ZamaSDK<TSigner extends GenericSigner | undefined = GenericSigner | undefined> {
  readonly signer: TSigner;

  // Always available
  createReadonlyToken(address: Address): ReadonlyToken;

  // Only available when TSigner is defined
  createToken: TSigner extends GenericSigner
    ? (address: Address, wrapperAddress?: Address) => Token
    : never;
}
```

`createConfig` with a signer returns `ZamaSDKConfig<GenericSigner>` → `ZamaSDK<GenericSigner>` → `createToken` exists.
`createConfig` without a signer returns `ZamaSDKConfig<undefined>` → `ZamaSDK<undefined>` → `createToken` is `never`.

```ts
// Provider-only
const sdk = new ZamaSDK(providerOnlyConfig);
sdk.createReadonlyToken("0x..."); // ✓
sdk.createToken("0x..."); // TS error: not callable

// With signer
const sdk = new ZamaSDK(fullConfig);
sdk.createToken("0x..."); // ✓
```

**Pros**: Minimal API change. One class. Familiar pattern.
**Cons**: Conditional types on class methods are awkward — IDE tooltips show `never` instead of a helpful error. Doesn't compose as cleanly as viem's `.extend()`.

### Option B: Overloaded constructor return type

Use function overloads so the constructor (or a factory) returns a narrower type when no signer is present.

```ts
interface ZamaSDKReadOnly {
  readonly provider: GenericProvider;
  readonly registry: WrappersRegistry;
  readonly cache: DecryptCache;
  createReadonlyToken(address: Address): ReadonlyToken;
  terminate(): void;
}

interface ZamaSDKFull extends ZamaSDKReadOnly {
  readonly signer: GenericSigner;
  readonly credentials: CredentialsManager;
  createToken(address: Address, wrapperAddress?: Address): Token;
  userDecrypt(handles: DecryptHandle[]): Promise<Record<Handle, ClearValueType>>;
  allow(contractAddresses: Address[]): Promise<void>;
  revokeSession(): Promise<void>;
  onIdentityChange(listener: SignerIdentityListener): () => void;
}

// Overloaded factory
function createZamaSDK(config: ZamaSDKConfig & { signer: GenericSigner }): ZamaSDKFull;
function createZamaSDK(config: ZamaSDKConfig): ZamaSDKReadOnly;
```

```ts
const readOnly = createZamaSDK({ provider, relayer, storage });
readOnly.createReadonlyToken("0x..."); // ✓
readOnly.createToken("0x..."); // TS error: property doesn't exist

const full = createZamaSDK({ provider, relayer, storage, signer });
full.createToken("0x..."); // ✓
```

**Pros**: Clean separation. IDE shows the right methods. No `never` noise.
**Cons**: Two interface definitions to maintain. `new ZamaSDK()` can't do overloaded return types — needs a factory function.

### Option C: Viem-style `.extend()` decorator

Add an `extend` method to `ZamaSDK`. Signer capabilities are a decorator applied post-construction.

```ts
const base = new ZamaSDK({ provider, relayer, storage });
// base only has read methods

const full = base.extend(signerActions(signer));
// full has read + write methods
```

Where `signerActions` is a decorator function (like viem's `walletActions`) that returns `{ createToken, userDecrypt, allow, ... }` bound to the SDK + signer.

**Pros**: Most composable. Matches viem's mental model exactly. Could extend to other capability groups later.
**Cons**: Most invasive change. Unfamiliar pattern for non-viem users. The `extend()` typing machinery is complex.

## Recommendation

**Option B** (overloaded factory) is the best balance of type safety, API clarity, and implementation effort. It doesn't require restructuring internals — the runtime class stays the same, the factory just narrows the return type. Existing `new ZamaSDK(config)` can be deprecated gradually in favor of `createZamaSDK(config)`.

The `createConfig` helpers already return typed config objects — threading the signer generic through to the factory return type is straightforward.

Keep `requireSigner()` as the runtime fallback for untyped / `as any` callers — same role as viem's `AccountNotFoundError`.

## Non-goals

- Modeling "signer exists but wallet not connected" at the type level. This is the wallet adapter's responsibility (wagmi handles it via `useAccount().isConnected`). The SDK's job is "signer configured vs not configured."
- Breaking the existing `new ZamaSDK()` constructor immediately. The factory can coexist during migration.
