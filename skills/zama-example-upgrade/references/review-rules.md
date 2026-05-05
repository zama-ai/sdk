# Review Rules

- Treat build, typecheck, lint, format, E2E, and generated LLM artifact failures as blockers unless clearly environment-blocked.
- Mark network, wallet, secret, or RPC-dependent checks as `blocked-env` unless they actually ran successfully.
- Review for local reimplementations of SDK primitives after each upgrade.
- Re-read nearby comments after mechanical migrations and remove stale explanations.
- Confirm generated PRs target `prerelease` and stay Draft until human validation is complete.
- Include remaining manual checks from `docs/agents/example-upgrade-checklist.md` in the final report.
