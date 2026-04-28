# Conventions

## Naming

The SDK is for all Zama Protocol use cases, not just tokens. The code is in transition toward that, so naming discipline matters.

- **SDK-level operations use "contracts":** `contractAddress`, `contractAddresses`, generic ops like allow/revoke/session management, package descriptions, README language. These work with any confidential contract type.
- **Token-specific operations use "tokens":** `Token`/`ReadonlyToken` classes, `shield`, `unshield`, `transfer`, `balanceOf`, ERC-7984/ERC-20 interfaces. These are explicitly about confidential tokens.
- **User-facing docs:** no Slack links or internal tool references. Linear ticket refs (SDK-42) in code comments and PR titles are fine.
- **Docs use stage-gate language, not calendar dates.** Write "once deployed to testnet" / "after mainnet launch", not "in Q2 2026" or "by March 31" — calendar dates rot, stage gates don't.

> React-sdk has its own naming rules for hooks — see [`packages/react-sdk/AGENTS.md`](../../packages/react-sdk/AGENTS.md).

## Design decisions

- **Contract call builders are pure.** Functions in `packages/sdk/src/contracts/` return `{ address, abi, functionName, args }` config objects. They never execute transactions. Library-specific sub-paths (`/viem`, `/ethers`) compose these.
- **Generic interfaces over framework primitives.** Stateful framework dependencies — wallet, RPC, storage — are typed as `Generic*` interfaces in the core (e.g. `GenericSigner`, `GenericProvider`, `GenericStorage`). New framework-touching code reuses or defines a `Generic*`; framework-specific code lives in adapter sub-paths, not the core.
- **Token method params mirror Solidity.** `Token`/`ReadonlyToken` method signatures (arg order and names) strictly track the underlying contract ABI per-method: `confidentialBalanceOf(account)`, `allowance(owner, spender)`, `isOperator(holder, operator)`. SDK-internal inconsistency across methods is accepted — do not "normalize" these, since callers cross-reference the Solidity source.

## Generic interface contracts

`GenericSigner` and `GenericProvider` are in `packages/sdk/src/types/`. They are the integration seam for custom wallet and RPC adapters.

**`GenericSigner`** (`types/signer.ts`) — wallet operations only. Requires:

- `getChainId(): Promise<number>`
- `getAddress(): Promise<Address>`
- `signTypedData(typedData: EIP712TypedData): Promise<Hex>`
- `writeContract(config): Promise<Hex>`
- `subscribe?` — optional; listen to identity transitions (connect, disconnect, account/chain change); omit for server-side signers

**`GenericProvider`** (`types/provider.ts`) — read-only chain access. Requires:

- `getChainId(): Promise<number>`
- `readContract(config): Promise<...>`
- `waitForTransactionReceipt(hash): Promise<TransactionReceipt>`
- `getBlockTimestamp(): Promise<bigint>`

Concrete implementations: `ViemSigner`/`ViemProvider` (`packages/sdk/src/viem/`), `EthersSigner`/`EthersProvider` (`packages/sdk/src/ethers/`), `WagmiSigner`/`WagmiProvider` (`packages/react-sdk/src/wagmi/`). Use `ViemSigner` as the canonical reference when implementing a custom `GenericSigner`.

**EIP-712 in `signTypedData`:** strip `EIP712Domain` from the `types` object before calling `walletClient.signTypedData`. Viem injects it automatically from the `domain` field — passing it in `types` causes a signature mismatch that surfaces as a credential rejection at decrypt time.

## Code quality

- **Formatter:** `oxfmt` (config: `.oxfmtrc.json`) — 100 col, 2-space indent, double quotes, trailing commas. Run `pnpm format` to apply.
- **Linter:** `oxlint` (config: `.oxlintrc.json`) + `ast-grep` (config: `sgconfig.yml`). Two distinct tools: oxlint covers standard TypeScript rules; ast-grep enforces structural patterns (e.g. the `useQueries` wrapper rule in `react-sdk`).
- **Pre-commit:** Husky runs three things in order: lint-staged (oxlint --fix + ast-grep scan + oxfmt on staged `.ts`/`.tsx`/`.js`/`.json`/`.yml` files), then `pnpm typecheck` (full monorepo typecheck), then `pnpm llm:stage` (auto-stages updated LLM artifacts).
- **Claude Code:** a PostToolUse hook in `claude-setup/settings.json` runs `pnpm format` after every Write or Edit.

## TypeScript

- **ESM-only** — `"type": "module"` on every package; no `require()`, no `module.exports`
- **Strict** — no `any`, no non-null assertions (`!`) except in files whitelisted in `.oxlintrc.json`
- **Type imports** — use `import type` for type-only imports (`@typescript-eslint/consistent-type-imports` is enforced)
- **Unused variables** — prefix with `_` (e.g., `_unused`)
- **Async** — no floating promises
- **`"use client"` in react-sdk** — all hook and component source files in `packages/react-sdk/src/` must have `"use client"` as the first line (RSC compatibility); barrel exports, wagmi-subpath adapters, and internal utilities are exempt
