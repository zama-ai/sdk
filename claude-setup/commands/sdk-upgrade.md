---
description: Upgrade an app that uses @zama-fhe/sdk to a target version, deterministically (SDK-208)
argument-hint: "[--example <name> | --app <path>] --to <version> [--from <version>]"
---

Orchestrate the SDK-upgrade pipeline for: `$ARGUMENTS`

You are the thin wrapper around the deterministic CLI (`scripts/sdk-upgrade/`) and the two bounded skills. Hold no migration logic yourself — the CLI is deterministic and the skills carry the judgement. Drive this flow:

## 1. Parse intent

From `$ARGUMENTS`, determine the target app (`--example <name>` or `--app <path>`) and target version `--to <B>`. If `--to` is missing, ask. `<B>` may be a dist-tag (`latest`, `alpha`) — the CLI resolves it.

## 2. Ensure a guide exists for the couple

Run the dry selection:

```sh
pnpm sdk-upgrade apply --example <name> --to <B>
```

- **If it prints a selected guide** → skip to step 4 (apply).
- **If it errors with "no committed guide"** → the couple needs a guide. Go to step 3.

## 3. Generate the guide (only if missing)

```sh
pnpm sdk-upgrade guide --from <A> --to <B>
```

where `<A>` is the app's installed version (the error in step 2 prints it). This writes the deterministic diff bundle to `.tmp/sdk-upgrade/<A>__<B>/`. Then **invoke the `sdk-upgrade-generate-guide` skill** on that bundle. It writes `migrations/<A>__<B>.{json,md}`. Validate:

```sh
pnpm sdk-upgrade guide --validate migrations/<A>__<B>.json
```

Pause for the human to review the `.md` before applying — the guide is committed and reused for every app, so it must be right once.

## 4. Apply the guide to the app

**Invoke the `sdk-upgrade-apply-guide` skill** with the selected guide and app. It edits only the app source. Then run the deterministic gate:

```sh
pnpm sdk-upgrade apply --example <name> --to <B> --gate
```

This bumps the pins, installs, formats (oxfmt), then typechecks against B. If typecheck fails, the apply skill resolves it (and reports any guide gap). Re-run until exit 0.

## 5. Report

Summarize: guide used (generated or reused), changes applied, sites touched, gate result, and any guide gaps the typecheck exposed that should flow back into the guide. Do **not** commit or open a PR unless asked.
