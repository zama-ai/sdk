---
name: zama-sdk-react-viem
description: "Use when integrating @zama-fhe/react-sdk into a React or Next.js app that uses viem directly instead of wagmi. Covers ViemSigner wiring, relayer proxying, wallet reactivity, confidential hooks, and the approved react-viem example flow."
---

# Zama SDK React + viem

## When to Use

Use this skill when the target app is a React or Next.js frontend that uses viem directly for wallet and public clients without wagmi.

## Source Priority

1. `docs/gitbook/src/guides/configuration.md`
2. `docs/gitbook/src/guides/authentication.md`
3. `docs/gitbook/src/guides/nextjs-ssr.md`
4. `docs/gitbook/src/reference/sdk/ViemSigner.md`
5. `examples/react-viem/README.md`
6. `examples/react-viem/WALKTHROUGH.md`
7. API reports only if exported surface details are still unclear

## Reference Files

- `examples/react-viem/src/providers.tsx`
- `examples/react-viem/src/lib/ethereum.ts`
- `examples/react-viem/src/app/page.tsx`
- `examples/react-viem/src/components/BalancesCard.tsx`
- `examples/react-viem/src/components/ShieldCard.tsx`
- `examples/react-viem/src/components/TransferCard.tsx`
- `examples/react-viem/src/components/UnshieldCard.tsx`
- `examples/react-viem/src/components/PendingUnshieldCard.tsx`

## Golden Path

1. Start from the approved `examples/react-viem` example.
2. Create a shared `publicClient` and a wallet-aware `walletClient`.
3. Wrap those in `ViemSigner`.
4. Use `RelayerWeb` through a local backend proxy.
5. Keep all SDK wiring inside a client-side provider component.
6. Follow the example's wallet reactivity pattern so the signer stays bound to the correct account.
7. Use React SDK hooks for balances and mutations unless there is a documented reason to go lower-level.

## Implementation Rules

- Normalize wallet addresses with viem utilities when the example requires checksummed addresses.
- Respect the example's signer recreation and wallet reactivity constraints.
- Use the reference files above before inferring wallet reactivity or provider patterns from scratch.
- Do not inspect internal SDK source or unapproved examples unless the official docs, approved examples, and API reports still leave a concrete exported-surface question unanswered.
- Keep the relayer's `getChainId` implementation resilient to wallet changes.
- Use the example's shape for token discovery, balance reads, and mutation-triggered refresh behavior.
- Prefer official guide language for architecture decisions and the example for concrete UI patterns.

## Common Pitfalls

- Do not assume viem infers the account automatically in the same way ethers does.
- Do not initialize browser-only SDK objects in SSR code paths.
- Do not expose relayer authentication secrets to the browser.
- Do not ignore the example's notes about wallet switching and signer rebinding.
- Do not use excluded examples such as `react-ledger`.

## Done When

- The app follows the approved `react-viem` structure for signer, relayer, and provider setup.
- Wallet reactivity is handled explicitly and correctly.
- Confidential reads and writes follow official hooks and docs-backed patterns.
- The implementation is consistent with both the React SDK docs and the approved viem example.
