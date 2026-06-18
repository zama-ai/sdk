# # @zama-fhe Codemods

Official codemods for the `@zama-fhe` organization scope to help users adopt new features and handle breaking changes with less manual work.

Community contributions are welcome. Use this repository to create, validate, and publish codemods from a shared monorepo.

## One-time setup

1. Create this codemod repository in the `@zama-fhe` organization scope.
2. Sign in to [Codemod](https://app.codemod.com) with your GitHub account.
3. Install the Codemod GitHub app for this repository so publishes can be associated with your organization.
4. Configure a [trusted publisher](https://docs.codemod.com) in Codemod so GitHub Actions can publish with OIDC.
5. Publish packages under the `@zama-fhe/*` scope so they stay grouped in the Codemod Registry.

Use [Codemod MCP](https://docs.codemod.com/model-context-protocol) and `npx codemod init` to create new codemods from this monorepo.

## Repository layout

Each codemod is a self-contained flat package directory:

```text
codemods/<slug>/   # e.g. codemods/sdk-upgrade-v3-1-0/
  workflow.yaml
  codemod.yaml
  scripts/
  rules/
  tests/
```

Keep each codemod self-contained so maintainers can validate and publish packages independently.

### Naming convention: one package per breaking release

Key each package to the **release that introduced the breaking changes** (the
target), not to a `from`→`to` couple. One package covers the whole SDK surface for
that release — both `@zama-fhe/sdk` and `@zama-fhe/react-sdk`, which ship in lockstep —
so a release's breaking changes (spanning both packages) live in a single codemod.

The slug follows `sdk-upgrade-v<release>`, published as `@zama-fhe/sdk-upgrade-v<release>`
— e.g. `codemods/sdk-upgrade-v3-1-0` → `@zama-fhe/sdk-upgrade-v3-1-0`. Note the
dot-free version: Codemod package names must match `/^[a-z0-9-_/]+$/`, so `3.1.0`
becomes `v3-1-0` (see https://docs.codemod.com/package-structure). This stays O(N) in
releases (vs O(N²) for couples),
and matches `ng update` / `@next/codemod`. A new package is added only when a
release actually ships breaking changes (most patch/minor releases ship none).

Each package documents an assumed version floor (e.g. "assumes 3.0.x"). A consumer
several releases behind runs the relevant release packages **in order**; codemods
are idempotent, so over-applying on already-migrated code is a safe no-op. (Codemod
has no built-in cross-package "upgrade to X" chaining — the consumer picks the
packages, or we add a thin orchestrator later.)

## Creating codemods

- Scaffold new codemods with `npx codemod init`.
- Use Codemod MCP when creating or refining codemods, especially when symbol definitions or cross-file references matter.
- Validate package workflows with `npx codemod workflow validate codemods/<family>/<release>/workflow.yaml`.
- Run package tests from the codemod directory before publishing.

## Running codemods

> [!CAUTION]
> Codemods modify code. Run them only on Git-tracked files, and commit or stash changes first.

### From the registry

```bash
npx codemod <codemod-name>
```

### From source

```bash
npx codemod workflow run -w codemods/<family>/<release>/workflow.yaml
```

By default, codemods run in the current folder. Add `--target /path/to/repo` to run elsewhere.

## Publishing and contribution guidance

- Use the generated GitHub Actions workflow to publish after review and merge.
- Add a `CONTRIBUTING.md` in this repository to document review, testing, and release expectations for contributors.
- See the [Codemod docs](https://go.codemod.com/docs) for CLI and publishing details.
