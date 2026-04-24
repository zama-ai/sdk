# Optional Signer Architecture Plan

## North Star

The SDK must be constructible and useful before a wallet exists.

`provider`, `relayer`, and `storage` are the SDK's baseline requirements. A `signer` is an optional capability used only by operations that need wallet authority: address identity, EIP-712 signatures, transactions, user decrypt credentials, delegated decrypt credentials, and wallet lifecycle cleanup.

This is a full cutover. We do not need to preserve legacy types or hook shapes if they conflict with the cleaner capability model.

Core rules:

- Constructing `new ZamaSDK({ provider, relayer, storage })` must never probe wallet identity.
- Public reads must never touch `sdk.signer`, `sdk.credentials`, or `sdk.delegatedCredentials`.
- Signer-required operations must fail at the operation edge with `SignerRequiredError`, not at SDK construction or React provider mount.
- React should not become a wallet-state library. Wallet connection state belongs to wagmi, viem, ethers, or the host app.
- Public read hooks must take explicit account-like inputs and idle while those inputs are unavailable.
- Credential/session checks are signer-scoped and must not accept arbitrary account inputs.
- Mutation hooks must always mount and surface `SignerRequiredError` only when invoked without a signer.

## Capability Model

### Always Available

These capabilities exist with no signer:

- `sdk.provider`
- `sdk.relayer`
- `sdk.storage`
- `sdk.sessionStorage`
- `sdk.cache`
- `sdk.registry`
- `sdk.createReadonlyToken(address)`
- public token reads: `name`, `symbol`, `decimals`, `totalSupply`, `isConfidential`, `isWrapper`, `underlyingToken`, `confidentialBalanceOf`, allowance/approval reads with explicit owners
- `sdk.publicDecrypt(handles)`
- wrappers registry reads
- relayer-only helpers such as public key, public params, keypair generation, EIP-712 payload creation, public decrypt, and ZK proof verification

### Optional Connected Capabilities

These capabilities exist only when `signer` exists:

- `sdk.signer`
- `sdk.credentials`
- `sdk.delegatedCredentials`
- user decrypt
- credentials/session operations
- write transactions
- signer-derived defaults such as "current wallet address"
- wallet lifecycle subscription and signer-scoped cleanup

Recommended shape:

```ts
export interface ZamaSDKConfig {
  provider: GenericProvider;
  signer?: GenericSigner;
  relayer: RelayerSDK;
  storage: GenericStorage;
  // existing non-signer options unchanged
}

export class ZamaSDK {
  readonly provider: GenericProvider;
  readonly signer: GenericSigner | undefined;
  readonly credentials: CredentialsManager | undefined;
  readonly delegatedCredentials: DelegatedCredentialsManager | undefined;

  requireSigner(operation: string): GenericSigner {
    if (!this.signer) {
      throw new SignerRequiredError(operation);
    }
    return this.signer;
  }

  requireCredentials(operation: string): CredentialsManager {
    if (!this.credentials) {
      throw new SignerRequiredError(operation);
    }
    return this.credentials;
  }

  requireDelegatedCredentials(operation: string): DelegatedCredentialsManager {
    if (!this.delegatedCredentials) {
      throw new SignerRequiredError(operation);
    }
    return this.delegatedCredentials;
  }
}
```

`credentials` and `delegatedCredentials` should be nullable/undefined instead of non-null manager instances that throw from every method. This avoids a mirage API: the manager is a connected-wallet credential store, not a read-only SDK service.

## Error Model

Add `SignerRequiredError` to the existing `ZamaError` hierarchy, not as a plain `Error`.

```ts
export class SignerRequiredError extends ZamaError {
  readonly operation: string;

  constructor(operation: string, options?: ErrorOptions) {
    super(
      ZamaErrorCode.SignerRequired,
      `Cannot ${operation} without a signer. Configure one via ZamaSDKConfig.signer or <ZamaProvider signer={...}>.`,
      options,
    );
    this.name = "SignerRequiredError";
    this.operation = operation;
  }
}
```

Downstream effects:

- Add `ZamaErrorCode.SignerRequired`.
- Export `SignerRequiredError` from `packages/sdk/src/errors/index.ts`.
- Export it from the root SDK entry point.
- Treat signer absence as a typed configuration/capability failure, not as `TypeError`, `Invalid address`, or adapter-specific wallet errors.

One subtle requirement: `signer: undefined` and "signer object exists but is disconnected" should converge at operation boundaries. For example, current `WagmiSigner.getAddress()` throws `TypeError("Invalid address")` when disconnected. A write/decrypt path should normalize that into `SignerRequiredError(operation)` when the failing call is part of resolving signer identity.

## Core SDK Effects

### Construction

Current code requires signer and immediately builds signer-backed managers:

```ts
// packages/sdk/src/zama-sdk.ts
signer: GenericSigner;

readonly signer: GenericSigner;
readonly credentials: CredentialsManager;
readonly delegatedCredentials: DelegatedCredentialsManager;

this.signer = config.signer;
this.credentials = new CredentialsManager(credentialsConfig);
this.delegatedCredentials = new DelegatedCredentialsManager(credentialsConfig);
this.#identityReady = this.#initIdentity();
const subscribe = this.signer.subscribe?.bind(this.signer);
```

Target behavior:

- `config.signer` is optional.
- `this.signer = config.signer`.
- Construct credentials managers only if `config.signer` exists.
- `#identityReady` should resolve immediately when no signer exists.
- Do not subscribe to lifecycle events when no signer exists.
- Do not call `getAddress()` or `getChainId()` during construction if no signer exists.

Illustrative target:

```ts
this.signer = config.signer;
this.credentials = config.signer ? new CredentialsManager(credentialsConfig) : undefined;
this.delegatedCredentials = config.signer
  ? new DelegatedCredentialsManager(credentialsConfig)
  : undefined;
this.#identityReady = config.signer ? this.#initIdentity() : Promise.resolve();

const subscribe = config.signer?.subscribe?.bind(config.signer);
```

### Chain Alignment

Current `requireChainAlignment` always calls signer and provider:

```ts
const [signerChainId, providerChainId] = await Promise.all([
  this.signer.getChainId(),
  this.provider.getChainId(),
]);
```

Target:

- Public reads do not call `requireChainAlignment`.
- Signer-required operations call `requireChainAlignment(operation)`.
- `requireChainAlignment` first resolves signer via `requireSigner(operation)`.
- Return the aligned chain ID after mismatch check.

```ts
async requireChainAlignment(operation: string): Promise<number> {
  const signer = this.requireSigner(operation);
  const [signerChainId, providerChainId] = await Promise.all([
    signer.getChainId(),
    this.provider.getChainId(),
  ]);

  if (signerChainId !== providerChainId) {
    throw new ChainMismatchError({ operation, signerChainId, providerChainId });
  }

  return providerChainId;
}
```

Do not use chain alignment as a general "what chain am I on?" helper for public reads. Public reads should use `provider.getChainId()` when they need network identity.

### User Decrypt

Current `userDecrypt` depends on signer for alignment, cache partitioning, credentials, and relayer payload:

```ts
await this.requireChainAlignment("userDecrypt");
const signerAddress = await this.signer.getAddress();
const creds = await this.credentials.allow(...);
```

Target:

- `userDecrypt` is signer-required.
- Guard once at the top with a caller-meaningful operation name.
- Use the guarded signer and credentials through locals, not `this.signer!`.

```ts
async userDecrypt(handles: DecryptHandle[]) {
  const signer = this.requireSigner("userDecrypt");
  const credentials = this.requireCredentials("userDecrypt");
  await this.requireChainAlignment("userDecrypt");

  // zero-handle fast path may remain before the guard only if it never needs
  // signer identity or cache. Prefer guard-first for semantic consistency.
}
```

### Public Decrypt

`publicDecrypt` already only calls the relayer:

```ts
return await this.relayer.publicDecrypt(handles);
```

It should remain signer-free.

### Revoke Session

Current `revokeSession` falls back to live signer reads:

```ts
const address = this.#lastAddress ?? (await this.signer.getAddress());
const chainId = this.#lastChainId ?? (await this.signer.getChainId());
```

Target semantics need a deliberate choice:

- If no signer was ever configured, `revokeSession()` can either throw `SignerRequiredError("revokeSession")` or be a no-op.
- Preferred: throw when called explicitly by app code without signer, because this is a session operation.
- Lifecycle-internal cleanup should no-op if no tracked identity exists.

Split the concepts:

- Public method `revokeSession()` is signer-required.
- Private `#revokeByTrackedIdentity()` is best-effort/no-op when no tracked identity exists.

## Credentials Managers

Current public methods are all signer-keyed except `revokeByKey`:

```ts
async allow(...contractAddresses: Address[]) {
  const key = await this.#storeKey();
  ...
}

async isAllowed(contractAddresses: [Address, ...Address[]]) {
  return this.checkAllowed(await this.#storeKey(), contractAddresses);
}

async #storeKey() {
  const address = await this.signer.getAddress();
  const chainId = await this.signer.getChainId();
}
```

Design decision:

- Do not make `CredentialsManager` accept `signer | undefined`.
- Keep `CredentialsManager` as a connected-wallet class.
- Make `sdk.credentials` undefined when no signer exists.
- Route all SDK/token/query access through `requireCredentials(operation)`.

`revokeByKey` is signer-free but should not force the whole manager to be always present. If key-based revocation remains important without a signer, move that capability to a separate static/helper surface later. It is not the primary optional-signer path.

Delegated credentials follow the same rule.

## Token Layer Effects

`ReadonlyToken` is not being split in this scope, but the implementation must respect capability boundaries internally.

Signer-free methods should remain signer-free:

- `confidentialBalanceOf(owner)`
- `isConfidential()`
- `isWrapper()`
- `underlyingToken()`
- `allowance(wrapper, owner)`
- `name()`
- `symbol()`
- `decimals()`
- `isDelegated({ delegatorAddress, delegateAddress })`
- `getDelegationExpiry({ delegatorAddress, delegateAddress })`

Signer-required methods should guard at the method edge:

- `balanceOf(owner)` because it calls `sdk.userDecrypt`
- `batchBalancesOf(...)` because it pre-authorizes and decrypts
- `allow()`
- `isAllowed()`
- `revoke(...)`
- `ReadonlyToken.allow(...tokens)`
- `decryptBalanceAs(...)`
- `batchDecryptBalancesAs(...)`
- private delegation assertion that defaults delegate to connected signer

Example current signer reach-through:

```ts
async isAllowed(): Promise<boolean> {
  return this.sdk.credentials.isAllowed([this.address]);
}

async #assertDelegationActive(delegatorAddress: Address): Promise<void> {
  const delegateAddress = await this.sdk.signer.getAddress();
  ...
}
```

Target:

```ts
async isAllowed(): Promise<boolean> {
  return this.sdk.requireCredentials("isAllowed").isAllowed([this.address]);
}

async #assertDelegationActive(delegatorAddress: Address): Promise<void> {
  const signer = this.sdk.requireSigner("decryptBalanceAs");
  const delegateAddress = await signer.getAddress();
  ...
}
```

`Token` remains the write-capable class. It can still be returned by `createToken`, but every method that writes, signs, encrypts with signer identity, or defaults to signer address must guard at method edge.

Current examples:

```ts
await this.sdk.requireChainAlignment("confidentialTransfer");
userAddress: await this.sdk.signer.getAddress();
await this.sdk.signer.writeContract(...);
```

Target:

```ts
await this.sdk.requireChainAlignment("confidentialTransfer");
const signer = this.sdk.requireSigner("confidentialTransfer");
const userAddress = await signer.getAddress();
await signer.writeContract(...);
```

Do not make `useToken()` return `Token | undefined` if we can avoid it. A non-null `Token` whose signer-required methods fail at invocation time is easier for always-mountable mutation hooks. This matches the "guard at operation edge" principle.

## React SDK Effects

### Provider

Current provider requires signer:

```ts
export interface ZamaProviderProps {
  provider: GenericProvider;
  signer: GenericSigner;
  relayer: RelayerSDK;
  storage: GenericStorage;
}
```

Target:

```ts
export interface ZamaProviderProps {
  provider: GenericProvider;
  signer?: GenericSigner;
  relayer: RelayerSDK;
  storage: GenericStorage;
}
```

Provider behavior:

- `<ZamaProvider signer={undefined} ...>` mounts cleanly.
- It constructs `new ZamaSDK({ provider, relayer, storage, signer })`.
- It only wires lifecycle invalidation if `signer?.subscribe` exists.
- It does not try to resolve signer address during render or mount.

### Do We Need `useSigner()`?

No, not for the optional-signer goal.

Reasoning:

- Zama is not the wallet connection source of truth.
- Wagmi already exposes `useAccount()` and connection status.
- Viem/ethers apps already decide when to construct and pass a signer.
- Server/indexer apps have no signer.
- A Zama `useSigner()` would duplicate wallet state and introduce adapter-specific semantics unrelated to FHE/token operations.

Preferred direction:

- Remove `useSigner()` from the plan.
- Remove or de-emphasize `useSignerAddress()`.
- If `useSignerAddress()` remains, it should be a convenience only, not a core dependency for other hooks.

Current `useSignerAddress()` is a TanStack query:

```ts
return useQuery<Address>(signerAddressQueryOptions(sdk.signer));
```

This cannot work cleanly when `sdk.signer` is optional. More importantly, most read hooks should not infer wallet identity at all. They should accept explicit account parameters.

### Read Hooks

Read hooks should be classified as:

1. Pure public reads: no signer, no signer address.
2. Reads over encrypted state that require explicit owner/holder/account and then may decrypt.
3. Signer/session status reads that are actually connected-capability reads.

Guidelines:

- Public metadata/registry hooks work with no signer.
- Hooks that need an owner/holder should accept it explicitly and idle when missing.
- Hooks should not call `useSignerAddress()` internally.
- Credential/session hooks should not accept arbitrary account parameters. They are scoped to the configured signer because credentials are keyed from `signer.getAddress()` and `signer.getChainId()`.

Current good pattern:

```ts
enabled: Boolean(config.account) && queryOpts?.enabled !== false;
```

Current problematic pattern:

```ts
const { data: account } = useSignerAddress();
const baseOpts = account
  ? isAllowedQueryOptions(sdk, { account, contractAddresses })
  : { queryFn: skipToken, enabled: false };
```

Target for `useIsAllowed`:

```ts
export interface UseIsAllowedConfig {
  contractAddresses: [Address, ...Address[]];
}
```

`useIsAllowed` should remain scoped to the current configured signer. It should not accept an `account` because `isAllowed` checks local/session credential state, not public on-chain state for an arbitrary address.

The hook should stop using `useSignerAddress()`, but it should not replace that dependency with a caller-supplied account. Instead, it should idle when no signer/credentials capability exists and call the signer-scoped credentials manager when connected:

```ts
const sdk = useZamaSDK();

return useQuery({
  ...isAllowedQueryOptions(sdk, config),
  enabled: Boolean(sdk.credentials) && (options?.enabled ?? true),
});
```

The query factory should derive identity through the credentials manager:

```ts
queryFn: () => sdk.requireCredentials("isAllowed").isAllowed(config.contractAddresses);
```

If invoked without credentials, the operation throws `SignerRequiredError("isAllowed")`.

### Mutation Hooks

Mutation hooks should always mount. They should not require a connected signer to create the hook.

Two acceptable implementation patterns:

1. Let `Token`/`ZamaSDK` methods throw `SignerRequiredError`.
2. Guard in the hook mutation function before calling token methods.

Preferred: guard in core methods, not in every hook. Hook-level guards are useful only when the hook can produce a clearer operation name than the underlying method.

Current mutation pattern:

```ts
const token = useToken(config);
return useMutation({
  ...confidentialTransferMutationOptions(token),
  ...
});
```

This can remain if `useToken()` returns a `Token` and `token.confidentialTransfer(...)` guards internally.

Hooks that call `sdk.credentials` directly through query factories must switch to core guards:

```ts
// current packages/sdk/src/query/revoke.ts
mutationFn: (contractAddresses) => sdk.credentials.revoke(...contractAddresses);

// target
mutationFn: (contractAddresses) => sdk.requireCredentials("revoke").revoke(...contractAddresses);
```

### Hook Inventory Must Be Full

The current plan undercounts mutation hooks. Before implementation, classify every hook under `packages/react-sdk/src` and every query factory under `packages/sdk/src/query`.

Signer-required examples:

- authorization: `useAllow`, `useRevoke`, `useRevokeSession`, `useIsAllowed`
- transfer: `useConfidentialTransfer`, `useConfidentialTransferFrom`, `useConfidentialApprove`
- shield/unwrap/unshield: `useShield`, `useApproveUnderlying`, `useUnwrap`, `useUnwrapAll`, `useFinalizeUnwrap`, `useUnshield`, `useUnshieldAll`, `useResumeUnshield`
- delegation/decrypt: `useDelegateDecryption`, `useRevokeDelegation`, `useDecryptBalanceAs`, `useBatchDecryptBalancesAs`, `useUserDecrypt`

Signer-free examples:

- metadata: `useMetadata`, `useTotalSupply`, `useIsConfidential`, `useIsWrapper`, `useWrapperDiscovery`
- registry hooks
- relayer-only hooks: `usePublicDecrypt`, `usePublicKey`, `usePublicParams`, `useGenerateKeypair`, `useEncrypt`, `useCreateEIP712`, `useCreateDelegatedUserDecryptEIP712`, `useDelegatedUserDecrypt`, `useRequestZkProofVerification`

Validate this list during implementation. The rule matters more than the initial categorization.

## Query Package Effects

Query factories should not assume signer-backed fields exist.

Current direct credential access:

```ts
return sdk.credentials.isAllowed(contractAddresses);
mutationFn: (contractAddresses) => sdk.credentials.revoke(...contractAddresses);
```

Target:

```ts
return sdk.requireCredentials("isAllowed").isAllowed(contractAddresses);
mutationFn: (contractAddresses) => sdk.requireCredentials("revoke").revoke(...contractAddresses);
```

Factories for public reads and relayer-only operations should not change except for type fallout from `ZamaSDK.signer` becoming optional.

Out of scope for this task:

- Changing decryption query key identity scoping.
- Reworking broad lifecycle invalidation.
- Splitting query caches by signer/account.

Those may be future quality improvements, but they are not required to make signer optional.

## Adapter Effects

### Wagmi

`WagmiSigner` can exist while disconnected, and currently throws from `getAddress()` when there is no address:

```ts
if (!account?.address) {
  throw new TypeError("Invalid address");
}
```

The SDK should handle this at operation boundaries. Do not build a Zama-level connection state machine just to model wagmi's lifecycle.

Host app pattern:

```tsx
const { address, status } = useAccount();

<ZamaProvider
  provider={provider}
  signer={status === "connected" ? signer : undefined}
  relayer={relayer}
  storage={storage}
>
  <App />
</ZamaProvider>;
```

It is also acceptable for a host app to pass a stable `WagmiSigner` while disconnected, as long as signer-required operations normalize missing account failures to `SignerRequiredError`.

### Viem / Ethers

Viem and ethers signers are typically constructed only once credentials exist. There is no native "reconnecting" state at the adapter level.

Docs/examples currently show invalid patterns such as `new ViemSigner({ publicClient })` or `new ViemSigner({ walletClient, publicClient })` even though `ViemSignerConfig` only accepts `walletClient` and optional `ethereum`.

Optional signer should replace the fake read-only signer pattern:

```ts
const sdk = new ZamaSDK({
  provider: new ViemProvider({ publicClient }),
  signer: walletClient ? new ViemSigner({ walletClient }) : undefined,
  relayer,
  storage,
});
```

## Lifecycle and Identity

Keep lifecycle behavior narrow.

Current SDK tracks identity for cleanup:

```ts
#lastAddress: Address | null = null;
#lastChainId: number | null = null;
```

This can remain, but it should be signer-conditional:

- No signer means no identity tracking.
- No signer means no lifecycle subscription.
- No tracked identity means internal revocation cleanup is a no-op.
- Explicit operations like `revokeSession()` still require signer unless we decide to make them no-op.

Do not add `useSigner()` or provider-owned signer state unless a specific Zama-only need appears. Current evidence says the host wallet layer should own connection state.

## Testing Plan

Core tests:

- Construct SDK without signer.
- Assert `sdk.signer === undefined`.
- Assert `sdk.credentials === undefined`.
- Assert `sdk.delegatedCredentials === undefined`.
- Assert public token reads work with no signer.
- Assert `sdk.publicDecrypt(handles)` works with no signer.
- Assert `createReadonlyToken` works with no signer.
- Assert signer-required SDK methods throw `SignerRequiredError` with correct `operation`.
- Assert signer-required token methods throw `SignerRequiredError` with correct `operation`.
- Assert `requireChainAlignment(operation)` throws `SignerRequiredError(operation)` before trying provider/signer chain comparison when no signer exists.

React tests:

- `<ZamaProvider signer={undefined} ...>` mounts.
- Public read hooks mount and run if their explicit required inputs are present.
- Read hooks with missing explicit account/holder inputs idle.
- Mutation hooks mount with no signer.
- Invoking signer-required mutations surfaces `SignerRequiredError` through mutation error state.
- `useIsAllowed` no longer calls `useSignerAddress()` internally.

Type tests:

- `ZamaSDKConfig.signer` is optional.
- `sdk.signer` is `GenericSigner | undefined`.
- `sdk.credentials` is `CredentialsManager | undefined`.
- `sdk.delegatedCredentials` is `DelegatedCredentialsManager | undefined`.
- Read hook configs require explicit account-like inputs where appropriate.

Docs/examples:

- Add a read-only SDK example.
- Update viem docs to use `ViemProvider({ publicClient })` plus optional `ViemSigner({ walletClient })`.
- Remove fake `ViemSigner({ publicClient })` examples.
- Explain that wallet connection state is owned by the app/wallet library, not Zama.

## Implementation Order

1. Add `SignerRequiredError` to the error hierarchy and exports.
2. Make `ZamaSDKConfig.signer` optional and core fields nullable where appropriate.
3. Add `requireSigner`, `requireCredentials`, and `requireDelegatedCredentials`.
4. Make SDK construction signer-conditional.
5. Update `requireChainAlignment`, `userDecrypt`, `allow`, `revokeSession`, and lifecycle cleanup.
6. Update `ReadonlyToken` signer-required methods to use guards.
7. Update `Token` methods to use local guarded signer variables.
8. Update query factories that directly access `sdk.signer`, `sdk.credentials`, or `sdk.delegatedCredentials`.
9. Update React provider prop types and lifecycle wiring.
10. Remove internal `useSignerAddress()` dependencies from read hooks.
11. Audit all hooks and query factories against the capability classification.
12. Add tests.
13. Update docs/examples.

## Non-Goals

- No `ReadonlyToken` split in this scope.
- No separate `ReadonlyZamaSDK` class in this scope.
- No Zama-owned `useSigner()` unless a concrete Zama-specific identity requirement appears.
- No decryption query key redesign in this scope.
- No broad lifecycle invalidation redesign in this scope.
- No backwards compatibility for legacy signer-required construction or `useSignerAddress()` query shape.
