# Conventions

## Naming

The SDK is for all Zama Protocol use cases, not just tokens. The code is in transition toward that, so naming discipline matters.

- **SDK-level operations use "contracts":** `contractAddress`, `contractAddresses`, generic ops like allow/revoke/session management, package descriptions, README language. These work with any confidential contract type.
- **Token-specific operations use "tokens":** `Token`/`ReadonlyToken` classes, `shield`, `unshield`, `transfer`, `balanceOf`, ERC-7984/ERC-20 interfaces. These are explicitly about confidential tokens.
- **Generic hooks omit the domain:** `useRevoke` not `useRevokeTokens`, `useAllow` not `useAllowTokens`.
- **Token-specific hooks include the domain:** `useConfidentialBalance`, `useConfidentialTransfer`.
- **User-facing docs:** no Slack links or internal tool references. Linear ticket refs (SDK-42) in code comments and PR titles are fine.
- **Docs use stage-gate language, not calendar dates.** Write "once deployed to testnet" / "after mainnet launch", not "in Q2 2026" or "by March 31" — calendar dates rot, stage gates don't.

## Design decisions

- **First decrypt requires explicit user click.** The first EIP-712 blind sign per session must be triggered by user action (e.g. "Decrypt Balance" button). After that, cached sessions can auto-decrypt on subsequent renders.
- **Three-layer hook architecture.** Core async action → TanStack Query options factory → React hook. The `tanstack-best-practices` skill (installed by `pnpm setup:claude`) documents the full pattern. All new hooks must follow this layering.
- **Contract call builders are pure.** Functions in `packages/sdk/src/contracts/` return `{ address, abi, functionName, args }` config objects. They never execute transactions. Library-specific sub-paths (`/viem`, `/ethers`) compose these.
- **Adapter pattern for framework neutrality.** Core SDK depends only on `GenericSigner` and `GenericStorage` interfaces. New integrations (viem, ethers, wagmi) add an adapter, not a dependency on the core.
- **Token method params mirror Solidity.** `Token`/`ReadonlyToken` method signatures (arg order and names) strictly track the underlying contract ABI per-method: `confidentialBalanceOf(account)`, `allowance(owner, spender)`, `isOperator(holder, operator)`. SDK-internal inconsistency across methods is accepted — do not "normalize" these, since callers cross-reference the Solidity source.
