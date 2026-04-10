---
name: zama-sdk-errors-and-debugging
description: "Use when diagnosing Zama SDK integration problems in browser or Node.js environments. Covers error matching, relayer/auth issues, SSR mistakes, storage/session issues, pending unshield recovery, and the official troubleshooting guides."
---

# Zama SDK Errors and Debugging

## When to Use

Use this skill when a Zama SDK integration already exists and something is failing, hanging, or producing incorrect balances, signing behavior, or relayer requests.

## Source Priority

1. `docs/gitbook/src/guides/handle-errors.md`
2. `docs/gitbook/src/guides/authentication.md`
3. `docs/gitbook/src/guides/nextjs-ssr.md`
4. `docs/gitbook/src/guides/local-development.md`
5. `docs/gitbook/src/reference/sdk/errors.md`
6. Approved examples that match the target stack
7. API reports only if exported surface details are still unclear

## Reference Files

- `examples/react-wagmi/src/providers.tsx`
- `examples/react-viem/src/providers.tsx`
- `examples/react-ethers/src/providers.tsx`
- `examples/node-viem/src/index.ts`
- `examples/example-hoodi/src/providers.tsx`

## Golden Path

1. Identify whether the issue is browser-only, Node-only, relayer/auth, storage/session, or on-chain logic.
2. Match the error against official SDK error types before inventing custom diagnoses.
3. Compare the target integration with the closest approved example.
4. Fix architecture-level issues first: wrong relayer, wrong runtime, wrong auth model, wrong storage model, or SSR misuse.
5. Only drop to API reports when docs and examples do not explain the exported behavior you need.

## Implementation Rules

- Prefer `matchZamaError` or explicit SDK error types over generic string matching.
- Compare the failing integration against the closest reference file before changing runtime architecture.
- Do not start by searching internal SDK source. First classify the failure with official errors, guides, and the nearest approved example.
- Check whether the current runtime matches the chosen relayer (`RelayerWeb`, `RelayerNode`, or `RelayerCleartext`).
- For browser apps, verify proxy/auth setup and SSR boundaries before debugging hook behavior.
- For unshield issues, check the pending unshield flow and recovery path.
- For session issues, verify storage separation and account-scoped behavior against the approved examples.

## Common Pitfalls

- Misconfigured relayer URL or missing auth
- Browser-only SDK code imported in SSR paths
- Wrong storage model for multi-user Node.js backends
- Assuming "zero balance" and "no ciphertext" are the same state
- Ignoring the official example's wallet reactivity or session-reset behavior
- Using excluded examples such as `react-ledger`

## Done When

- The issue is classified using official docs and error types.
- The diagnosis points to a docs-backed or example-backed fix.
- The recommended fix stays within the supported SDK architecture.
- The final resolution is consistent with the nearest approved example.
