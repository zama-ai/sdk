# Example SDK Upgrade Playbook

This playbook is for running AI-assisted upgrades of SDK example apps. The short-term goal is a reliable local workflow. The long-term goal is a semi-automated process that can open or update pull requests after npm releases.

## Scope

Active apps are listed in `examples/examples-upgrade.config.json` with `"status": "active"`. Do not modify apps marked `"future"` or `"excluded"` unless the user explicitly changes the scope.

During an app upgrade, code changes must stay under that app's directory, for example `examples/react-viem/**`. Generated LLM corpus artifacts (`llms.txt`, `llms-full.txt`, and `docs/llm/corpus-manifest.json`) are allowed when app docs change because the docs CI verifies them. Process-tooling changes may touch `docs/agents/**`, `scripts/examples/**`, root `package.json`, `.gitignore`, and `examples/examples-upgrade.config.json`.

Run upgrade work from a dedicated branch based on `prerelease`, preferably in a separate worktree. The agent is allowed to modify code in that branch. Do not run app-upgrade edits directly on `prerelease` or in a shared dirty checkout.

## One Command

`pnpm examples:upgrade` is the only public command.

Prepare context only. `--target latest` means the most recently published npm version,
including prereleases such as alpha versions. It is intentionally not limited to the
`latest` npm dist-tag. The prepare stage fails if any scoped SDK package target
version cannot be resolved.

```sh
pnpm examples:upgrade --example react-wagmi --target latest
```

Run the full AI-assisted pipeline and open a Draft PR:

```sh
pnpm examples:upgrade --example react-wagmi --target latest --pr draft
```

By default the pipeline uses `--analysis deep`, `--agent claude`, and `--model claude-sonnet-4-6` (Sonnet 4.6).
Use `--agent codex --model gpt-5.5` when you explicitly want Codex instead.

The command prints the next command to run at the end of each stage, with the `run-id` already filled in.

## Stages

Use `--stage` when you want to run one part of the pipeline:

- `--stage prepare`: generate context and an agent task. This is the default when no agent or PR mode is requested.
- `--stage analysis`: run the deep analyst passes for an existing prepared run.
- `--stage agent`: run an LLM over an existing prepared run.
- `--stage verify`: run validation and generate the consolidated report for an existing run.
- `--stage report`: generate only the consolidated report.
- `--stage pr`: commit, push, and create/update a PR for an existing run.
- `--stage all`: prepare, run the agent, validate, report, and optionally open/update a PR.

Examples:

```sh
pnpm examples:upgrade --example react-wagmi --target latest
pnpm examples:upgrade --stage analysis --run-id <run-id> --example react-wagmi
pnpm examples:upgrade --stage agent --run-id <run-id> --example react-wagmi --agent codex --model gpt-5.5
pnpm examples:upgrade --stage verify --run-id <run-id> --example react-wagmi --include-install --include-playwright-install
pnpm examples:upgrade --stage pr --run-id <run-id> --example react-wagmi --pr draft
```

## Workflow

1. Generate context with the prepare stage.
2. In deep mode, run the analysis stage. It produces separate history, docs-pattern, and source JSON reports, then derives a consolidated impact plan.
3. Read the generated context report, `analysis/impact-plan.json`, and analyst reports for the target app.
4. Read the app's `package.json`, docs, SDK-sensitive source files, and tests.
5. Read only the relevant docs/API reports listed in the context report.
6. Compare current SDK package versions with the resolved target versions.
7. Identify API and behavior changes that affect the app. Do not migrate unrelated code.
8. Use `analysis/impact-plan.json` as the source of truth before editing. `analysis/impact-plan.md` is generated for human reading only.
9. Update package versions and lockfile with the app's declared package manager.
10. Update source, tests, README, and WALKTHROUGH as needed.
11. Complete `implementation-resolution.json`: every impact-plan finding must be marked `implemented`, `not-applicable`, `deferred`, or `not-resolved`.
12. Regenerate the LLM corpus artifacts if README, WALKTHROUGH, or docs changed. The pipeline runs `pnpm llm:build` automatically before verify/report/PR stages.
13. Run deterministic validation with the verify stage.
14. Complete the manual checklist in `docs/agents/example-upgrade-checklist.md`.
15. Open or update a PR with `--stage pr --pr draft` once the report is ready.

## Deep Analysis

Deep analysis is the default. The script orchestrates three read-only analyst prompts before implementation:

- History analyst: commit history, changelog excerpts, API report changes, and version deltas.
- Docs-pattern analyst: current documented SDK and React SDK usage patterns.
- Source analyst: package exports, API reports, source-level hook signatures, and risky local reimplementations.

Structured reports are written under `.tmp/example-upgrades/<run-id>/analysis/`:

- `history-analysis.json`
- `docs-pattern-analysis.json`
- `source-analysis.json`
- `impact-plan.json`

Markdown files in the same directory are generated from JSON for human reading and must not be treated as the source of truth. The implementation agent must read `impact-plan.json` before editing. Use `--analysis standard` only for quick manual debugging or very small follow-up fixes.

## Structured Artifacts

The pipeline is JSON-first so automation can reason over findings without parsing free-form Markdown.

- Analyst JSON reports contain `findings[]`, `manualChecks[]`, and `notes[]`.
- Each finding has `id`, `severity`, `category`, `summary`, `evidence`, `affectedFiles`, `recommendedChange`, and `validation`.
- `analysis/impact-plan.json` consolidates analyst findings and is the implementation input.
- `implementation-resolution.json` is generated as a skeleton before the agent edits code. The agent must complete one resolution per finding.
- `final-report.json` and `final-report.md` are generated during report/verify. `report.md` is kept as a compatibility alias for PR bodies.

Valid finding severities are `required`, `recommended`, `optional`, and `info`. Valid resolution statuses are `implemented`, `not-applicable`, `deferred`, and `not-resolved`. Non-implemented statuses require a concrete justification in `notes`.

## Agent Runner

Supported agents:

- `codex`: runs `codex exec` with `--cd <repo>`, `--sandbox workspace-write`, and configurable `--ask-for-approval`.
- `claude`: runs `claude --print` with configurable `--model` and permission mode mapping.

The agent stage writes two audit files before execution:

- `.tmp/example-upgrades/<run-id>/agent-prompt.md`
- `.tmp/example-upgrades/<run-id>/agent-command.json`

The analysis stage writes one prompt and one command audit file per analyst under:

- `.tmp/example-upgrades/<run-id>/prompts/`
- `.tmp/example-upgrades/<run-id>/analysis/`

Dry-run the exact agent command and prompt path before launching it:

```sh
pnpm examples:upgrade --stage agent --run-id <run-id> --example react-wagmi --agent codex --model gpt-5.5 --dry-run
```

Useful options:

- `--model <model>` selects the model for the underlying agent CLI.
- `--agent codex|claude` selects the runner backend.
- `--analysis standard|deep` controls whether the three read-only analyst passes are required before implementation.
- `--analyst-agent codex|claude` and `--analyst-model <model>` select the read-only analyst runner.
- `--analyst-sandbox read-only|workspace-write|danger-full-access` defaults to `read-only` for Codex analyst runs.
- `--sandbox read-only|workspace-write|danger-full-access` is passed to Codex.
- `--approval on-request|never` is passed to Codex as `--ask-for-approval`; Claude maps this to a permission mode.
- `--profile <name>` is passed to Codex for configuration from `~/.codex/config.toml`.
- `--effort <level>` is passed to Claude.

## Pull Requests

After review and validation, use the PR stage:

```sh
pnpm examples:upgrade --stage pr --run-id <run-id> --example react-wagmi --pr draft
```

Safety defaults:

- It refuses to commit files outside the selected example app(s), except generated LLM corpus artifacts.
- It refuses process-tooling files unless `--allow-process-files` is set.
- It does not create a PR unless `--pr draft` or `--pr ready` is set.
- It refuses to create or update a PR when deterministic validation failed.
- Draft PRs may be opened when a finding remains `deferred` or `not-resolved`, including a `required` finding, but the unresolved point must be visible in the final report and PR body with justification and expected human action.
- Ready PRs refuse unresolved `required` findings.
- It targets `prerelease` by default.
- `--pr draft` opens a Draft PR; `--pr ready` opens a ready-for-review PR.
- Keep PRs as Draft until human review has validated the upgrade and manual checklist.

## Validation Rules

- Treat typecheck/build/test failures as blockers unless the report explicitly marks them as environment-blocked.
- Treat generated LLM artifact failures as blockers; regenerate and commit generated LLM corpus artifacts when app docs change. The full `pnpm llm:check` runs under `--ci-parity` and in CI.
- Do not mark a network, wallet, or secret-dependent check as passed unless it actually ran successfully.
- If a check cannot run because secrets or RPC configuration are missing, mark it `blocked-env`.
- If a script does not exist for an app, mark it `skipped`, not `passed`.
- Do not weaken tests to make the upgrade pass. Update tests only to match intended SDK behavior.

## React Wagmi Lessons

The `react-wagmi` SDK 3.x upgrade exposed concrete checks the agent must make for future React/wagmi updates:

- Prefer the high-level `@zama-fhe/react-sdk/wagmi` config adapter and `@zama-fhe/sdk/web` browser transport when the API reports/docs expose them. Do not keep direct `WagmiSigner` or `RelayerWeb` wiring unless the target SDK still requires it.
- Prefer domain-level React SDK hooks over local orchestration. If a hook such as `useShield`, `useUnshield`, `useConfidentialTransfer`, `useAllow`, or `useDelegateDecryption` exists, do not reimplement it with local `useMutation`, low-level contract builders, direct `readContract`/`writeContract`, or manual cache invalidation unless the example is intentionally teaching a custom low-level flow.
- Avoid placeholder contract/token addresses in upgraded examples. If a selected token/pair may be undefined, prefer a token-dependent child component that only mounts SDK/wagmi hooks once real registry data exists. Only use a placeholder address when the consumed published SDK/API requires an address-shaped input and there is no cleaner component boundary; document that tradeoff explicitly.
- Do not assume an unreleased local SDK API is available to the example. Example apps compile against the SDK version declared in their own `package.json`, so hook options and types must match the published target package, not just the monorepo source.
- Use absolute browser relayer URLs for SDK relayer config, for example `new URL("/api/relayer", window.location.origin).toString()`. Relative URLs can fail inside the relayer worker before any browser Network entry appears.
- For wagmi/viem E2E RPC mocks, account for Multicall3 reads. A mechanically updated app can pass typecheck but fail tests if mocks only handle direct `eth_call` targets.
- Playwright RPC route callbacks should fail closed with fixture-style fallback data for unknown or malformed mock inputs. Avoid uncaught decoding/parsing throws inside `page.route` callbacks because they often surface as confusing browser network timeouts.
- When wrapper behavior matters, verify whether the registry points to upgraded proxies and avoid legacy APIs unless the code explicitly uses `*Legacy*` paths for compatibility.
- Re-read nearby comments after mechanical API migrations. Comments that mention old hook options, disabled queries, provider ordering, or signer/relayer wiring must be updated or removed with the code.
- Keep README/WALKTHROUGH aligned with the actual SDK wiring, then commit regenerated LLM corpus artifacts. Run `pnpm format:check` after `pnpm llm:build`; CI `lint` fails on generated or markdown formatting drift.

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
