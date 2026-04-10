---
name: zama-sdk-react-ethers
description: "Use when integrating @zama-fhe/react-sdk into a React or Next.js app that uses ethers v6 and an injected EIP-1193 wallet. Covers EthersSigner wiring, relayer proxying, provider remount patterns, and the approved react-ethers example flow."
---

# Zama SDK React + ethers

## When to Use

Use this skill when the target app is a React or Next.js frontend built around ethers v6 and an injected EIP-1193 wallet.

## Source Priority

1. `docs/gitbook/src/guides/configuration.md`
2. `docs/gitbook/src/guides/authentication.md`
3. `docs/gitbook/src/guides/nextjs-ssr.md`
4. `docs/gitbook/src/reference/sdk/EthersSigner.md`
5. `examples/react-ethers/README.md`
6. `examples/react-ethers/WALKTHROUGH.md`
7. `examples/example-hoodi/README.md` only when cleartext mode or Hoodi-specific behavior matters
8. API reports only if exported surface details are still unclear

## Reference Files

- `examples/react-ethers/src/providers.tsx`
- `examples/react-ethers/src/lib/ethereum.ts`
- `examples/react-ethers/src/app/page.tsx`
- `examples/react-ethers/src/components/BalancesCard.tsx`
- `examples/react-ethers/src/components/ShieldCard.tsx`
- `examples/react-ethers/src/components/TransferCard.tsx`
- `examples/react-ethers/src/components/UnshieldCard.tsx`
- `examples/react-ethers/src/components/PendingUnshieldCard.tsx`

## Golden Path

1. Start from the approved `examples/react-ethers` example.
2. Use `EthersSigner` over the injected provider.
3. Keep `RelayerWeb` behind a local proxy route.
4. Put all SDK setup inside a client-only provider component.
5. Follow the example's remount pattern to keep account-scoped session state isolated when the wallet changes.
6. Use React SDK hooks for balances and writes unless the example intentionally drops to `sdk.createToken()` for a specific operation.

## Implementation Rules

- Preserve the provider remount logic the approved example uses for wallet reactivity.
- Use the reference files above before redesigning provider state or wallet event handling.
- When registry results come through ethers-specific result objects, follow the example's normalization pattern instead of assuming plain enumerable fields.
- Do not inspect internal SDK source or unapproved examples unless the official docs, approved examples, and API reports still leave a concrete exported-surface question unanswered.
- Keep relayer authentication on the server side.
- Use the React SDK's hooks for the happy path and documented low-level APIs only when the example does so for a concrete reason.

## Common Pitfalls

- Do not create `RelayerWeb` or `ZamaProvider` in server-rendered modules.
- Do not assume ethers result objects behave like plain objects after spreading.
- Do not remove the remount/reset logic if the app changes wallets or accounts.
- Do not use excluded examples such as `react-ledger`.
- Do not turn cleartext/Hoodi-specific behavior into the default Sepolia/Mainnet path.

## Done When

- The app follows the approved `react-ethers` example for signer, provider, and proxy setup.
- Wallet changes do not leak account-scoped session state.
- Registry, balance, shield, transfer, and unshield flows follow official example behavior.
- The final code stays within the official docs and approved example patterns.
