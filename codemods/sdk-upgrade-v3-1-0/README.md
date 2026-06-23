# @zama-fhe/sdk-upgrade-v3-1-0

Codemods for the breaking changes introduced in `@zama-fhe/sdk` / `@zama-fhe/react-sdk`
**3.1.0**, built on the [Codemod](https://codemod.com) workflow engine. They apply
the **mechanical** breaking changes (symbol/type renames, config-key changes,
structural removals) so the upgrade doesn't have to be done by hand.

This package is keyed to the **release that introduced the breaks** (3.1.0), not a
specific `from`→`to` couple — see the workspace [README](../README.md) for the
package-per-breaking-release convention. It assumes a **3.0.x floor**; a consumer
further behind runs earlier release packages first (codemods are idempotent, so
order/overlap is safe).

## Run

```sh
# from the SDK repo root (the codemod CLI is a devDependency there)
pnpm codemod -t /path/to/app/src
pnpm codemod -t /path/to/app/src --dry-run

# or, published, with no repo access:
npx codemod @zama-fhe/sdk-upgrade-v3-1-0 -t ./src
```

It **edits your source files in place** (no report file). Practical flow for an app
developer upgrading:

```sh
git status                 # start from a clean tree (codemod edits tracked files)
npx codemod @zama-fhe/sdk-upgrade-v3-1-0 -t ./src --dry-run   # preview
npx codemod @zama-fhe/sdk-upgrade-v3-1-0 -t ./src             # apply in place
git diff                   # review the changes
# then: run your formatter, bump @zama-fhe/* in package.json, handle the
# non-mechanical tail (see "Optional AI tail") and any // TODO(sdk-3.1.0) markers
```

Idempotent (re-running is a no-op); edits are not formatted (run your formatter
afterwards); pins are never bumped.

## What it does (9 changes)

- **renames + config-key changes** — native `ast-grep` steps (`rules/*.yml`):
  `useReadonlyToken→useWrappedToken`, `useDelegatedUserDecrypt→useDelegatedDecrypt`,
  `useAllow/useIsAllowed→useGrantPermit/useHasPermit`, `Handle→EncryptedValue`,
  `useDelegationStatus tokenAddress→contractAddress`.
- **structural / context-sensitive rewrites** — JSSG transforms (`scripts/*.ts`):
  import-aware `createZamaConfig→createConfig` (leaves local aliases of the new
  export untouched), query-hook config `tokenAddress→address` (any object shape),
  mutation-hook config object → positional `address`, remove the `UseZamaConfig`
  interface.

## Optional AI tail

The deterministic codemods cover the mechanical subset only. The **non-mechanical**
3.1.0 changes (removed-without-replacement APIs, signature reshapes — `useUserDecrypt`,
`useEncrypt`, the removed EIP-712/keypair hooks, the `ZamaSDK` capability refactor)
can be handled by an **opt-in `ai` step** that runs _after_ the deterministic ones:

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
codemod.yaml                 # package manifest (publishable to the Codemod registry)
workflow.yaml                # the workflow: ast-grep + js-ast-grep steps
rules/<id>.yml               # ast-grep rules (renames / config-key changes)
scripts/<id>.ts              # JSSG transforms (structural rewrites)
sgconfig.yml                 # ast-grep config: ruleDirs + testConfigs (for `ast-grep test`)
test.sh                      # runs the JSSG harness + `ast-grep test` + the e2e runner
test-e2e.mjs                 # runs the whole chain (workflow order) on a multi-file target
tests/<script>/<case>/       # JSSG fixtures: input.tsx + expected.tsx, one dir per scripts/<script>.ts
rule-tests/<id>-test.yml     # ast-grep rule tests: valid/invalid samples, one per rules/<id>
rule-tests/__snapshots__/    # ast-grep snapshots: each rule's matched node + fixed output
tests/_e2e/{input,expected}/ # multi-file fixtures for the end-to-end chain
```

## Test

The JSSG transforms are tested with the official
[JSSG harness](https://docs.codemod.com/jssg/testing) — `codemod jssg test`. By
convention each `scripts/<name>.ts` is tested against its `tests/<name>/` fixture
dir (the parent holding the `<case>/` subdirs). [`test.sh`](./test.sh) discovers
`scripts/*.ts` and runs the harness for each, so adding a transform needs no
config edits (and a script with no `tests/<name>/` dir fails the run):

```sh
pnpm test          # -> ./test.sh
```

`test.sh` forwards extra flags to every invocation, so during development:

```sh
./test.sh -u   # rewrite expected.tsx from current output
./test.sh -v   # per-case diff
```

To run a single transform — or to `--filter` to one case (which errors on
scripts that don't have that case, so don't pass it through the whole loop) —
call the documented command directly:

```sh
# codemods don't format their output, so compare ASTs not bytes (--strictness ast)
codemod jssg test -l tsx --strictness ast --filter alias-preserved \
  scripts/core-rename-createzamaconfig-to-createconfig.ts \
  tests/core-rename-createzamaconfig-to-createconfig
```

`test.sh` also runs the declarative rules and the whole chain, so the package is
covered end to end — not just the JSSG scripts:

- **`ast-grep test`** — the JSSG harness doesn't cover the declarative `rules/*.yml`, so
  they're tested with ast-grep's own harness: `rule-tests/<id>-test.yml` holds `valid` /
  `invalid` samples per rule id, and `rule-tests/__snapshots__/` captures each rule's
  matched node and fixed output. `sgconfig.yml` wires `ruleDirs` + `testConfigs`. Update
  snapshots with `ast-grep test -U` from the package dir.
- **`test-e2e.mjs`** — applies the **whole chain in workflow order** to the
  multi-file `tests/_e2e/` fixture and asserts it converges to the expected tree,
  then re-applies it and asserts a no-op (chain-level idempotency). Catches
  step-ordering and cross-transform regressions.

CI runs all three via `.github/workflows/codemod.yml` (`pnpm --filter
@zama-fhe/sdk-upgrade-v3-1-0 test`).

## Known limitations

- **Type-position renames under-cover plain `.ts` files.** The `ast-grep` rules
  declare `language: tsx`; on a `.ts` file the engine renames import specifiers but
  **misses type-position occurrences** (e.g. `function f(h: Handle)` keeps `Handle`
  while the import becomes `EncryptedValue`). It works in `.tsx`. Affects the
  type-position parts of `core-handle-type`, `rename-permit-hooks`
  (`UseIsAllowedConfig`), and `rename-use-delegated-user-decrypt`
  (`DelegatedUserDecryptMutationParams`). Fix is to add `language: typescript`
  rule variants (or map `.ts`→tsx in engine config). The typecheck of the consumer
  app surfaces any dangling reference. The e2e fixtures are `.tsx` for this reason.
- **`createToken` → `createWrappedToken` is not auto-migrated** (data-flow dependent).
  In 3.1.x the wrapper methods (`shield` / `unshield` / `unshieldAll` / `allowance` /
  `approveUnderlying`) moved from `Token` to `WrappedToken` (`sdk.createWrappedToken`), but
  `createToken` still exists for non-wrapper token ops (balance, transfer, delegation).
  Whether a given `createToken(addr)` must become `createWrappedToken` depends on how its
  result is later used (often via an intermediate variable) — a syntactic rule can't tell,
  and a blanket rename would wrongly upgrade plain-`Token` call sites (and could fail at
  runtime on a token with no underlying to wrap). Migrate by hand where the typecheck flags a
  missing wrapper method on a `Token`; since `WrappedToken extends Token`, switching a
  shielding call site to `createWrappedToken` keeps its `Token` methods working.
- **The optional `ai` node is not formally gated** by `--param ai=true`; it is a
  no-op only because no LLM is configured by default. Consider an explicit node
  condition so the intent is enforced, not incidental.
