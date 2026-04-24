# Product Vision

Zama SDK is a suite of TypeScript libraries for building privacy-preserving dApps on EVM-compatible blockchains powered by the **Zama Confidential Blockchain Protocol**. It gives developers everything they need to interact with confidential smart contracts using Fully Homomorphic Encryption (FHE) — encrypting inputs, decrypting outputs, managing access control — without having to learn cryptography. The SDK publishes `@zama-fhe/sdk` (core) and `@zama-fhe/react-sdk` (React hooks), with ERC-7984 confidential tokens as the primary vertical today.

**Design principle: clear-text in, clear-text out.** Callers work with familiar primitives (for tokens, ERC-20-style `balanceOf`, `transfer`, etc.) while the SDK handles the protocol complexity under the hood — encrypted inputs, EIP-712 signing, Relayer routing, and response-format interpretation. Agents should design new APIs the same way: accept plaintext, return plaintext, push everything FHE-related down into the SDK.

**Framework-agnostic core.** The core SDK works with viem, ethers, or any EVM library via adapters. Heavy FHE operations run in Web Workers (browser) or worker threads (Node.js) so the main thread stays responsive.

**React-first view layer.** First-class React hooks, powered by `@tanstack/react-query`, including a drop-in wagmi integration. Other frameworks (React Native, Vue, etc.) aren't supported today, but the three-layer architecture (core action → query-options factory → framework hook) leaves room to add them without touching the core.

**Target users.** Developers integrating confidential operations into their applications — wallet teams, dApp teams, and anyone building on the Zama Protocol — without wanting to learn FHE.
