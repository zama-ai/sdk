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
codemods/<slug>/   # e.g. codemods/sdk-migration-v3/
  workflow.yaml
  codemod.yaml
  scripts/
  rules/
  tests/
```

Keep each codemod self-contained so maintainers can validate and publish packages independently.

### Naming convention: one package per major line

Key each package to a **major SDK line** (`sdk-migration-v<major>`), not to a single
`from`→`to` couple or to every minor. One package covers the whole SDK surface for that
line — both `@zama-fhe/sdk` and `@zama-fhe/react-sdk`, which ship in lockstep — and its
single workflow **accrues the transforms of each breaking minor** (3.0→3.1, 3.1→3.2, …),
bringing code up to the latest release in the line. A new breaking minor **adds its
transforms to the existing package and bumps the codemod version**, rather than spawning a
new package — so this stays bounded to ~one package per major (not one per minor).

The slug follows `sdk-migration-v<major>`, published as `@zama-fhe/sdk-migration-v<major>`
— e.g. `codemods/sdk-migration-v3` → `@zama-fhe/sdk-migration-v3`. (Codemod package names
must match `/^[a-z0-9-_/]+$/`; see https://docs.codemod.com/package-structure.) Same model
as `ng update` / `@next/codemod` — one package, run it to reach the latest in the line.

Each package documents an assumed floor (e.g. "assumes 3.0.x") and is idempotent, so
running it from any point in the line is a safe no-op for already-applied steps. A new
**major** (v4) gets its own `sdk-migration-v4` package. (Codemod has no built-in
cross-major "upgrade to X" chaining — a consumer crossing a major runs the relevant
major-line packages in order, or we add a thin orchestrator later.)

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
