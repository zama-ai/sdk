# @zama-fhe/sdk-upgrade-3.1.0

Codemods for the breaking changes introduced in `@zama-fhe/sdk` / `@zama-fhe/react-sdk`
**3.1.0**, built on the [Codemod](https://codemod.com) workflow engine. They apply
the **mechanical** breaking changes (symbol/type renames, config-key changes,
structural removals) so the upgrade doesn't have to be done by hand.

This package is keyed to the **release that introduced the breaks** (3.1.0), not a
specific `from`→`to` couple — see the workspace [README](../../README.md) for the
package-per-breaking-release convention. It assumes a **3.0.x floor**; a consumer
further behind runs earlier release packages first (codemods are idempotent, so
order/overlap is safe).

## Run

```sh
# from the SDK repo root (the codemod CLI is a devDependency there)
pnpm codemod -t /path/to/app/src
pnpm codemod -t /path/to/app/src --dry-run

# or, published, with no repo access:
npx codemod @zama-fhe/sdk-upgrade-3.1.0 -t ./src
```

Idempotent (re-running is a no-op); edits are not formatted (run your formatter
afterwards); pins are never bumped.

## What it does (9 changes)

- **renames + config-key changes** — native `ast-grep` steps (`rules/*.yml`):
  `useReadonlyToken→useWrappedToken`, `useDelegatedUserDecrypt→useDelegatedDecrypt`,
  `useAllow/useIsAllowed→useGrantPermit/useHasPermit`, `createZamaConfig→createConfig`,
  `Handle→EncryptedValue`, query-hook `tokenAddress→address`,
  `useDelegationStatus tokenAddress→contractAddress`.
- **structural rewrites** — JSSG transforms (`scripts/*.ts`): mutation-hook config
  object → positional `address`; remove the `UseZamaConfig` interface.

## Optional AI tail

The deterministic codemods cover the mechanical subset only. The **non-mechanical**
3.1.0 changes (removed-without-replacement APIs, signature reshapes — `useUserDecrypt`,
`useEncrypt`, the removed EIP-712/keypair hooks, the `ZamaSDK` capability refactor)
can be handled by an **opt-in `ai` step** that runs *after* the deterministic ones:

```sh
# configure an LLM, then opt in
export LLM_API_KEY=...        # plus LLM_PROVIDER=anthropic, LLM_MODEL=<model>
pnpm codemod -t ./src --param ai=true
```

It's **off by default** (`params.ai` defaults to `"false"`), so the standard run
and the test suite stay fully deterministic — the AI only ever touches the tail the
codemods leave behind, and is prompted to make minimal edits and leave
`// TODO(sdk-3.1.0)` markers where there's no drop-in replacement (never to invent
APIs). Treat its output as a reviewed draft, not a finished migration.

## Scope

Derived by diffing the api-reports (not the changelog): released stable
`2.5.0`/`3.0.0`/`3.0.1` are API-identical, so 3.1.0 is the first release since to
carry breaking changes. `3.1.0` is unreleased — this package is **provisional**,
derived from the `v3.0.1 → v3.1.0-alpha.14` diff, and covers the **mechanical
subset** deterministically (the non-mechanical tail is left to the optional AI step
above and to manual review).

## Layout

```
codemod.yaml             # package manifest (publishable to the Codemod registry)
workflow.yaml            # the workflow: ast-grep + js-ast-grep steps
rules/<id>.yml           # ast-grep rules (renames / config-key changes)
scripts/<id>.ts          # JSSG transforms (structural rewrites)
tests/fixtures/<id>/     # input.tsx + output.tsx per change
tests/workflow.test.mjs  # runs the workflow over the fixtures (apply + oxfmt == output)
```
