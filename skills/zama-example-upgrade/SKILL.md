---
name: zama-example-upgrade
description: Use when upgrading Zama SDK example apps in this repository, especially via pnpm examples:upgrade, including deep analysis reports, SDK/API impact planning, implementation, validation, and draft PR preparation.
---

# Zama Example Upgrade

Use the repository script as the deterministic entrypoint:

```sh
pnpm examples:upgrade --example <app> --target latest
```

Read `docs/agents/example-upgrade.md` first. Treat it as the source of truth for scope, stages, validation, PR safety, source priority, and lessons learned.

For generated upgrade runs, read:

- `.tmp/example-upgrades/<run-id>/agent-task.md`
- `.tmp/example-upgrades/<run-id>/<app>/context.md`
- `.tmp/example-upgrades/<run-id>/analysis/impact-plan.json` when deep analysis is enabled
- `.tmp/example-upgrades/<run-id>/analysis/*-analysis.json` when you need role-specific evidence
- `.tmp/example-upgrades/<run-id>/implementation-resolution.json` before and after editing

Load bundled references only when needed:

- `references/analyst-roles.md` when producing or evaluating deep analysis reports.
- `references/implementation-rules.md` immediately before editing example app code.
- `references/review-rules.md` before final validation, report generation, or PR preparation.

Keep changes inside scoped `examples/<app>/**` unless the playbook explicitly allows generated LLM corpus artifacts. Do not modify pipeline/process files during an app upgrade; record such discoveries in `followUpProcessIssues` instead. Prefer high-level `@zama-fhe/sdk` and `@zama-fhe/react-sdk` hooks/utilities over local reimplementations.
