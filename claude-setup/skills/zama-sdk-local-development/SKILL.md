---
name: zama-sdk-local-development
description: "Use when setting up local or test-only development flows with RelayerCleartext, Hardhat, custom cleartext deployments, or the approved Hoodi cleartext example. Covers cleartext constraints, presets, and migration-safe development patterns."
---

# Zama SDK Local Development

## When to Use

Use this skill when developing against local Hardhat nodes, custom cleartext deployments, or the approved Hoodi cleartext example instead of the production FHE relayer flow.

## Source Priority

1. `docs/gitbook/src/guides/local-development.md`
2. `docs/gitbook/src/reference/sdk/RelayerCleartext.md`
3. `docs/gitbook/src/guides/configuration.md`
4. `examples/example-hoodi/README.md`
5. `examples/example-hoodi/WALKTHROUGH.md`
6. API reports only if exported surface details are still unclear

## Reference Files

- `examples/example-hoodi/src/providers.tsx`
- `examples/example-hoodi/src/app/page.tsx`
- `examples/example-hoodi/src/components/ShieldCard.tsx`
- `examples/example-hoodi/src/components/TransferCard.tsx`
- `examples/example-hoodi/src/components/UnshieldCard.tsx`
- `examples/example-hoodi/src/components/DecryptAsCard.tsx`

## Golden Path

1. Start from `RelayerCleartext` for local and test-only environments.
2. Use the built-in cleartext presets when they match the target environment.
3. Follow the approved `example-hoodi` app when the goal is a cleartext-backed frontend integration on Hoodi.
4. Keep the rest of the SDK wiring as close as possible to the production shape so the migration path stays small.
5. Make the "testing only / not encrypted" constraint explicit in both code and docs.

## Implementation Rules

- Use `RelayerCleartext` only for local, custom, or explicitly supported cleartext test environments.
- Start from the reference files above when implementing a Hoodi-style cleartext frontend.
- Keep production and cleartext configs clearly separated.
- Do not inspect internal SDK source or unrelated production examples unless the official local-development docs, approved Hoodi example, and API reports still leave a concrete exported-surface question unanswered.
- Preserve the same application-level APIs where possible so teams can swap relayers later without rewriting the whole app.
- When using Hoodi, follow the approved `example-hoodi` behavior instead of inventing a new cleartext path.

## Common Pitfalls

- Do not use cleartext mode on Ethereum Mainnet or Sepolia.
- Do not describe cleartext mode as encrypted or production-safe.
- Do not mix cleartext addresses and production preset assumptions.
- Do not use excluded examples such as `react-ledger`.

## Done When

- The local/test integration uses `RelayerCleartext` correctly.
- The environment is explicitly marked as non-production and non-encrypted.
- The implementation follows the local-development guide or approved Hoodi example.
- The migration path to `RelayerWeb` or `RelayerNode` remains straightforward.
