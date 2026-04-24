# Product Vision

The Zama SDK is the high-level TypeScript SDK for the **Zama Protocol**, including ERC-7984 confidential tokens. It publishes `@zama-fhe/sdk` (core) and `@zama-fhe/react-sdk` (React hooks).

**Design principle: clear-text in, clear-text out.** Developers work with familiar primitives (e.g. ERC-20-style `balanceOf`, `transfer` for tokens) while the SDK handles all protocol complexity under the hood — encrypted inputs, EIP-712 signing, Relayer routing, and response format interpretation. The SDK is a credentials + relayer coordination layer that abstracts the protocol so developers never need to understand FHE internals.

**Target users:** wallet developers and dApp developers building on the Zama Protocol who need a high-level integration layer.

**UX goals:** signing prompt minimization (no per-token prompts for balances, single confirmation for transfers), batch balance fetching, decryption caching and staleness management.

**Future direction:** plugin system for additional capabilities beyond tokens — DeFi primitives (swaps, yield), RWA extensions (ERC-3643 + ERC-7984), and domain-specific integrations. The view layer is React-focused today but the architecture accommodates React Native, Vue, and others.
