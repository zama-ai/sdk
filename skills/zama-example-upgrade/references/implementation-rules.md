# Implementation Rules

- Upgrade only active scoped apps from `examples/examples-upgrade.config.json`.
- Keep app edits inside each scoped `examples/<app>/**` directory.
- Update app package versions and lockfiles with the app's declared package manager.
- Use clear-text-in, clear-text-out SDK APIs. Hide FHE protocol details behind SDK primitives.
- Prefer `@zama-fhe/react-sdk` hooks and SDK utilities over local orchestration.
- Do not use `@zama-fhe/relayer-sdk` directly unless the example intentionally demonstrates low-level legacy behavior.
- Avoid placeholder token or contract addresses. Prefer component boundaries that mount token-dependent hooks only after real registry/config data exists.
- Verify hook options and types against the example app's declared published package version, not only local monorepo source.
- Keep README and WALKTHROUGH aligned with actual app behavior. If they change, run `pnpm llm:build` and keep generated corpus artifacts.
- Do not weaken tests to pass validation. Update tests only for intended SDK behavior.
