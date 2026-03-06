# Delegated User Decryption — Design

**Linear issue:** SDK-12
**Date:** 2026-03-06

## Overview

Add delegated user decryption support to the Token class, allowing an account to delegate ACL permissions to a `(delegate, contractAddress)` pair so the delegate can decrypt balances on behalf of the delegator. Primary use case: smart wallet / account abstraction (e.g., smart wallet owner delegates to their own EOA).

## ACL Contract Interaction

New ABI entries in `packages/sdk/src/abi/acl.abi.ts` for ACL.sol functions:

**Write:**

- `delegateForUserDecryption(address delegate, address contractAddress, uint64 expirationDate)`
- `revokeDelegationForUserDecryption(address delegate, address contractAddress)`

**Read:**

- `isHandleDelegatedForUserDecryption(address delegator, address delegate, address contractAddress, bytes32 handle) → bool`
- `getUserDecryptionDelegationExpirationDate(address delegator, address delegate, address contractAddress) → uint64`

ACL address sourced from `FhevmInstanceConfig.aclContractAddress`.

## Token Class Methods

### Write methods (on `Token`)

- `delegateDecryption(delegate, expirationDate?)` → `TransactionResult`
  - With expiration: calls `delegateForUserDecryption(delegate, this.address, timestamp)`
  - Without expiration: permanent delegation (uint64.max or separate contract method if available)
- `revokeDelegation(delegate)` → `TransactionResult`

### Batch statics (on `Token`)

- `Token.delegateDecryptionBatch(tokens[], delegate, expirationDate?)` → `Map<Address, TransactionResult | ZamaError>`
- `Token.revokeDelegationBatch(tokens[], delegate)` → `Map<Address, TransactionResult | ZamaError>`

Uses `Promise.allSettled` internally. Per-token results with partial success semantics.

### Read methods (on `ReadonlyToken`)

- `isDelegated(delegator, delegate)` → `boolean`
  - Uses `getUserDecryptionDelegationExpirationDate` (avoids needing a specific handle)
  - Returns `expirationDate > 0 && expirationDate >= now`
- `getDelegationExpiry(delegator, delegate)` → `bigint`
  - Raw uint64 value (0 = inactive, uint64.max = permanent)

### Delegated decryption (on `ReadonlyToken`)

- `decryptBalanceAs(delegator, options?)` → `bigint`
  - Flow: get delegator's balance handle → delegate's own keypair via `credentials.allow()` → `createDelegatedUserDecryptEIP712(...)` → wallet signature → `delegatedUserDecrypt(...)` → return bigint
  - Balance cache keyed by `(tokenAddress, delegator, handle)` to avoid conflicts
  - No delegated signature caching for MVP

## Error Codes

New `ZamaErrorCode` entries:

- `DELEGATION_SELF_NOT_ALLOWED` — delegate === msg.sender
- `DELEGATION_COOLDOWN` — one-per-block restriction
- `DELEGATION_NOT_FOUND` — no active delegation exists
- `DELEGATION_EXPIRED` — delegation has expired

`DELEGATION_NOT_PROPAGATED` is intentionally omitted — the ~10-15 block coprocessor delay is not reliably detectable. Covered in troubleshooting docs instead.

## Credential Flow for Delegated Decryption

Reuses existing `CredentialsManager` for delegate's keypair/signature. The difference is calling `createDelegatedUserDecryptEIP712` (which includes `delegatorAddress`) instead of `createEIP712`. Handled inline in `decryptBalanceAs`, not by modifying CredentialsManager.

## Files

**New:**

- `packages/sdk/src/abi/acl.abi.ts`
- `packages/sdk/src/contract/acl.ts`
- `packages/sdk/src/token/__tests__/delegation.test.ts`

**Modified:**

- `packages/sdk/src/token/token.ts` — write methods + batch statics
- `packages/sdk/src/token/readonly-token.ts` — read methods + `decryptBalanceAs`
- `packages/sdk/src/token/errors.ts` — 4 new error codes + subclasses
- `packages/sdk/src/token/token.types.ts` — batch result types
- `packages/sdk/src/index.ts` — export new types/errors
- `packages/sdk/etc/*.api.md` — regenerated via api-extractor

**Not modified:**

- Relayer layer (delegation already wired)
- Worker layer (delegation already wired)
- React SDK (hooks already exist)
- CredentialsManager (reused as-is)

## Constraints

- One delegate/revoke per `(delegator, delegate, contractAddress)` per block
- Self-delegation prohibited (delegate !== msg.sender)
- Delegate !== contractAddress
- Minimum expiration: 1 hour in the future
- ~10-15 block propagation delay before gateway knows about delegation
