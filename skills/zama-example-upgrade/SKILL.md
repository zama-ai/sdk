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
- `.tmp/example-upgrades/<run-id>/analysis/*.md` when deep analysis is enabled

Load bundled references only when needed:

- `references/analyst-roles.md` when producing or evaluating deep analysis reports.
- `references/implementation-rules.md` immediately before editing example app code.
- `references/review-rules.md` before final validation, report generation, or PR preparation.

Keep changes inside scoped `examples/<app>/**` unless the playbook explicitly allows generated LLM corpus artifacts or process-tooling changes. Prefer high-level `@zama-fhe/sdk` and `@zama-fhe/react-sdk` hooks/utilities over local reimplementations.
