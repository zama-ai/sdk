# Next major release: cleanup log

Things kept only for backward compatibility on the current major line. Each entry names what to
remove or fold, and why it was not done at the time. Add to this list whenever a change is made
additive to avoid a breaking release; remove entries as they ship in the next major.

## Fold `batchPreparePermits` / `batchRegisterPermits` into the singular methods

`sdk.offline.preparePermit` and `sdk.permits.registerPermit` were kept as single-permit
methods because a live integrator was already calling them when automatic chunking landed.
The plural variants were added alongside instead of changing the return type and parameter
shape. In the next major:

- `preparePermit(request)` returns `PreparedPermit[]` (one permit per 10 contracts) and drops
  the "more than 10 contracts" `ConfigurationError`.
- `registerPermit(permits: SignedPreparedPermit[])` replaces `registerPermit(prepared, signature)`.
- Delete `batchPreparePermits`, `batchRegisterPermits`, `useBatchPreparePermits`, `useBatchRegisterPermits`,
  `batchPreparePermitsMutationOptions`, `batchRegisterPermitsMutationOptions`, and their reference pages;
  retarget `usePreparePermit` / `useRegisterPermit` and their query factories to the new shapes.

## Remove existing `@deprecated` exports

- `DefaultRegistryAddresses` (`packages/sdk/src/wrappers-registry.ts`): read `registryAddress`
  from the chain presets instead.
- `@zama-fhe/sdk/cleartext` subpath (`packages/sdk/src/cleartext/index.ts`): import `cleartext`
  from `@zama-fhe/sdk` instead.
