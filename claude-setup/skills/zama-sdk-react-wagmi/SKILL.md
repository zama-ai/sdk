---
name: zama-sdk-react-wagmi
description: "Use when integrating @zama-fhe/react-sdk into a React or Next.js app that uses wagmi for wallet state and viem transport. Covers provider wiring, relayer proxying, confidential hooks, balance refresh, and the approved react-wagmi example flow."
---

# Zama SDK React + wagmi

## When to Use

Use this skill when the target app is a React or Next.js frontend that already uses wagmi, or should use wagmi, for wallet connection and chain state.

## Source Priority

1. `docs/gitbook/src/guides/configuration.md`
2. `docs/gitbook/src/guides/authentication.md`
3. `docs/gitbook/src/guides/nextjs-ssr.md`
4. `docs/gitbook/src/reference/react/ZamaProvider.md`
5. `examples/react-wagmi/README.md`
6. `examples/react-wagmi/WALKTHROUGH.md`
7. API reports only if exported surface details are still unclear

## Reference Files

- `examples/react-wagmi/src/providers.tsx`
- `examples/react-wagmi/src/app/page.tsx`
- `examples/react-wagmi/src/components/BalancesCard.tsx`
- `examples/react-wagmi/src/components/ShieldCard.tsx`
- `examples/react-wagmi/src/components/TransferCard.tsx`
- `examples/react-wagmi/src/components/UnshieldCard.tsx`
- `examples/react-wagmi/src/components/PendingUnshieldCard.tsx`

## Golden Path

1. Start from the approved `examples/react-wagmi` example.
2. Keep all Zama SDK setup in a client-side provider module.
3. Use `WagmiSigner` with the app's wagmi config.
4. Use `RelayerWeb` in the browser and route it through a local backend proxy so API keys stay server-side.
5. Wrap the app with `WagmiProvider`, `QueryClientProvider`, and `ZamaProvider`.
6. Prefer React SDK hooks such as `useConfidentialBalance`, `useShield`, `useConfidentialTransfer`, and `useUnshield` instead of hand-rolling low-level flows.
7. Preserve the example's separation between persistent credential storage and session storage when the app needs persistent session signatures.

## Implementation Rules

- Keep `ZamaProvider` and any `@zama-fhe/react-sdk` hook usage in client components only.
- Prefer the approved example's provider topology and proxy pattern over ad hoc wiring.
- Use the reference files above before exploring unrelated app code paths.
- Do not inspect internal SDK source or unapproved examples unless the official docs, approved examples, and API reports still leave a concrete exported-surface question unanswered.
- When the app performs writes outside the standard hooks, invalidate the confidential handle query so balances refresh predictably.
- Keep the UI aligned with the two-phase nature of unshield and the encrypted balance polling model.
- Use the docs-first approach for product behavior and the example for concrete app structure.

## Common Pitfalls

- Do not embed relayer API keys in browser code.
- Do not initialize `RelayerWeb` or `ZamaProvider` in a server component.
- Do not mix wagmi-driven wallet state with manual provider polling unless the example explicitly requires it.
- Do not use excluded examples such as `react-ledger`.
- Do not prefer raw SDK class usage when a stable React hook already exists for the same workflow.

## Done When

- The app follows the `react-wagmi` example's provider and proxy shape.
- All Zama SDK client-only constraints are respected.
- Confidential balances, transfer, shield, and unshield flows use official hooks or documented low-level APIs.
- The resulting code matches the official docs and approved example behavior.
