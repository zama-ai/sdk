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

## TypeScript

- **ESM-only** — `"type": "module"` on every package; no `require()`, no `module.exports`
- **Strict** — no `any`, no non-null assertions (`!`) except in files whitelisted in `.oxlintrc.json`
- **Type imports** — use `import type` for type-only imports (`@typescript-eslint/consistent-type-imports` is enforced)
- **Unused variables** — prefix with `_` (e.g., `_unused`)
- **Async** — no floating promises
- **`"use client"` in react-sdk** — all hook and component source files in `packages/react-sdk/src/` must have `"use client"` as the first line (RSC compatibility); barrel exports, wagmi-subpath adapters, and internal utilities are exempt
