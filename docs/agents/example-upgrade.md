# Example SDK Upgrade Playbook

This playbook is for manually running an AI-assisted upgrade of SDK example apps. The short-term goal is a reliable local workflow. The long-term goal is a semi-automated process that can open or update pull requests after npm releases.

## Scope

Active apps are listed in `examples/examples-upgrade.config.json` with `"status": "active"`. Do not modify apps marked `"future"` or `"excluded"` unless the user explicitly changes the scope.

During an app upgrade, code changes must stay under that app's directory, for example `examples/react-viem/**`. Process-tooling changes may touch `docs/agents/**`, `scripts/examples/**`, root `package.json`, `.gitignore`, and `examples/examples-upgrade.config.json`.

Run upgrade work from a dedicated branch based on `prerelease`, preferably in a separate worktree. The agent is allowed to modify code in that branch. Do not run app-upgrade edits directly on `prerelease` or in a shared dirty checkout.

## Inputs

Start from generated context, not from memory:

```sh
pnpm examples:upgrade:context -- --example <app> --target latest
```

The context report points to relevant docs, API reports, changelog entries, usage scan results, app scripts, and validation commands.

For multi-app runs, prefer the orchestrator:

```sh
pnpm examples:upgrade -- --mode prepare --target latest
```

This generates context for all active apps plus `.tmp/example-upgrades/<run-id>/agent-task.md`.

## Workflow

1. Read the generated context report for the target app.
2. Read the app's `package.json`, docs, SDK-sensitive source files, and tests.
3. Read only the relevant docs/API reports listed in the context report.
4. Compare current SDK package versions with the resolved target versions.
5. Identify API and behavior changes that affect the app. Do not migrate unrelated code.
6. Write a concise impact plan before editing.
7. Update package versions and lockfile with the app's declared package manager.
8. Update source, tests, README, and WALKTHROUGH as needed.
9. Run deterministic validation:

```sh
pnpm examples:upgrade:validate -- --example <app>
```

Use `--include-install` when dependency installation should be part of validation. Use `--include-env-sensitive` only when required environment variables are configured.

10. Generate or update the report:

```sh
pnpm examples:upgrade:report -- --example <app>
```

11. Complete the manual checklist in `docs/agents/example-upgrade-checklist.md`.

## Orchestrator Modes

Use `pnpm examples:upgrade` for V2-style local runs:

- `--mode prepare`: generate context and an agent task. Use this before code edits.
- `--mode verify`: run validation and generate the consolidated report for an existing run.
- `--mode full`: generate context, run validation, and generate the consolidated report for the current tree.

Common examples:

```sh
pnpm examples:upgrade -- --mode prepare --target latest
pnpm examples:upgrade -- --mode verify --run-id <run-id> --include-install
pnpm examples:upgrade -- --mode full --target local --dry-run
```

The orchestrator does not call an LLM by itself. The agent reads `agent-task.md`, edits the apps, then runs `--mode verify`.

## Agent Runner

Use `examples:upgrade:agent` to run an LLM over a prepared run:

```sh
pnpm examples:upgrade -- --mode prepare --example react-wagmi --target latest
pnpm examples:upgrade:agent -- --run-id <run-id> --example react-wagmi --agent codex --model gpt-5.5
```

The runner writes two audit files before execution:

- `.tmp/example-upgrades/<run-id>/agent-prompt.md`
- `.tmp/example-upgrades/<run-id>/agent-command.json`

Dry-run the exact command and prompt path before launching the agent:

```sh
pnpm examples:upgrade:agent -- --run-id <run-id> --example react-wagmi --agent codex --model gpt-5.5 --dry-run
```

Supported agents:

- `codex`: runs `codex exec` with `--cd <repo>`, `--sandbox workspace-write`, and configurable `--ask-for-approval`.
- `claude`: runs `claude --print` with configurable `--model` and permission mode mapping.

Useful options:

- `--model <model>` selects the model for the underlying agent CLI.
- `--agent codex|claude` selects the runner backend.
- `--sandbox read-only|workspace-write|danger-full-access` is passed to Codex.
- `--approval on-request|never` is passed to Codex as `--ask-for-approval`; Claude maps this to a permission mode.
- `--profile <name>` is passed to Codex for configuration from `~/.codex/config.toml`.
- `--effort <level>` is passed to Claude.

## Pull Request Helper

After review and validation, a local helper can create or update a branch and PR:

```sh
pnpm examples:upgrade:pr -- --dry-run --allow-process-files
pnpm examples:upgrade:pr -- --allow-process-files --push --create-pr --body-file .tmp/example-upgrades/<run-id>/report.md
```

Safety defaults:

- It refuses to commit non-example files unless `--allow-process-files` is set.
- It does not push or create a PR unless `--push` or `--create-pr` is set.
- It targets `prerelease` by default.
- It creates draft PRs by default.
- Keep PRs as Draft until human review has validated the upgrade and manual checklist.

## Validation Rules

- Treat typecheck/build/test failures as blockers unless the report explicitly marks them as environment-blocked.
- Do not mark a network, wallet, or secret-dependent check as passed unless it actually ran successfully.
- If a check cannot run because secrets or RPC configuration are missing, mark it `blocked-env`.
- If a script does not exist for an app, mark it `skipped`, not `passed`.
- Do not weaken tests to make the upgrade pass. Update tests only to match intended SDK behavior.

## Source Priority

Use `docs/agents/example-upgrade-sources.json` as the source list. The default order is:

1. Local example code, docs, package metadata, and tests.
2. Local package metadata.
3. `CHANGELOG.md`.
4. API reports under `packages/*/etc`.
5. Official docs under `docs/gitbook/src`.
6. Usage scan results.
7. CI workflow references.

Prefer official docs over example inference when docs answer the question. Use API reports for exact exported API shape when docs are insufficient.

## Expected Final Output

The final report must include:

- App upgraded and target package versions.
- Files changed.
- Summary of behavior/API changes handled.
- Validation results with `passed`, `failed`, `skipped`, or `blocked-env`.
- Manual checklist items still requiring human verification.
- Known risks or follow-up tasks.
