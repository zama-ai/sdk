# Delegation E2E Tests Design

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add end-to-end Playwright tests proving that delegated decryption works through the full stack: UI component → React SDK → Token/ReadonlyToken → RelayerSDK → mock cleartext relayer → hardhat.

**Scope:** Happy-path only — delegator shields, delegates to delegate, delegate decrypts delegator's balance. Edge cases (revoke, expiry, self-delegation) are covered by unit tests.

---

## 1. React SDK: Thread `aclAddress` through ZamaProvider

`ZamaProvider` currently creates `new ZamaSDK({...})` without `aclAddress`. Add:

- Optional `aclAddress?: Address` prop to `ZamaProviderProps`
- Pass it to the `ZamaSDK` constructor
- This makes `useToken()` / `useReadonlyToken()` return instances with ACL support

**Files:**

- `packages/react-sdk/src/provider.tsx`

## 2. Test Apps: Pass ACL Address

Both test apps read contract addresses from hardhat deployments. Add `aclAddress` to the ZamaProvider config.

ACL address (hardhat): `0x50157CFfD6bBFA2DECe204a89ec419c23ef5755D`

**Files:**

- `packages/test-nextjs/src/providers.tsx`
- `packages/test-nextjs/src/constants.ts`
- `packages/test-vite/src/providers.tsx`
- `packages/test-vite/src/constants.ts`

## 3. Mock Relayer: Delegated Decrypt Support

The mock relayer (`relayer-sdk.js` Web Worker script) and the Playwright route handler (`fhevm.ts`) don't handle delegated decrypt endpoints.

### fhevm.ts — Add two routes:

- `POST /createDelegatedEIP712` → calls `fhevm.createDelegatedUserDecryptEIP712(publicKey, contractAddresses, delegatorAddress, startTimestamp, durationDays)`
- `POST /delegatedUserDecrypt` → calls `fhevm.delegatedUserDecrypt({handles, contractAddress, signedContractAddresses, privateKey, publicKey, signature, delegatorAddress, delegateAddress, startTimestamp, durationDays})`

### relayer-sdk.js — Add two methods to mock instance:

- `createDelegatedUserDecryptEIP712(publicKey, contractAddresses, delegatorAddress, startTimestamp, durationDays)` — sync XHR POST to `/createDelegatedEIP712`
- `delegatedUserDecrypt(handleContractPairs, privateKey, publicKey, signature, signedContractAddresses, delegatorAddress, delegateAddress, startTimestamp, durationDays)` — async fetch to `/delegatedUserDecrypt`

**Files:**

- `packages/playwright/fixtures/fhevm.ts`
- `packages/playwright/fixtures/relayer-sdk.js`

## 4. Test Component: DelegationPanel

A new component with two sections:

### Section 1: Delegate

- Input: delegate address (`data-testid="delegate-input"`)
- Button: "Delegate" (`data-testid="delegate-button"`)
- Calls `token.delegateDecryption(delegate)` via `useToken()`
- Shows success tx hash (`data-testid="delegate-success"`)

### Section 2: Decrypt as Delegate

- Input: delegator address (`data-testid="delegator-input"`)
- Button: "Decrypt as Delegate" (`data-testid="decrypt-delegate-button"`)
- Calls `readonlyToken.decryptBalanceAs(delegator)` via `useReadonlyToken()`
- Shows decrypted balance (`data-testid="delegated-balance"`)

**Props:** `tokenAddress: Address`, optional `defaultDelegate?: Address`, `defaultDelegator?: Address`

**Files:**

- `packages/test-components/src/delegation-panel.tsx`
- `packages/test-components/src/index.ts` (add export)

## 5. Test App Pages: `/delegation`

Thin page wrappers reading URL params: `?token=`, `?delegate=`, `?delegator=`

**Files:**

- `packages/test-nextjs/src/app/delegation/page.tsx`
- `packages/test-vite/src/pages/delegation.tsx`
- `packages/test-vite/src/routes.tsx` (add route)

## 6. Playwright Fixture: ACL Address

Add `acl` to the contracts fixture object from `deployments.json`.

**Files:**

- `packages/playwright/fixtures/test.ts`

## 7. Playwright Spec: `delegation.spec.ts`

**Test: "should self-delegate and decrypt balance via delegated path"**

Uses self-delegation (account #0 delegates to itself) to exercise the full delegated
decrypt path end-to-end with a single wallet. The on-chain ACL permits self-delegation.

1. Shield 1000 USDT (navigate to `/shield`, fill amount, click shield, wait for success)
2. Navigate to `/delegation?token=cUSDT&delegate=<account0>` (self-delegation)
3. Click "Delegate" → wait for `delegate-success` to contain `Tx: 0x`
4. Fill delegator input with account #0's address
5. Click "Decrypt as Delegate" → wait for `delegated-balance` to show `1000`

This tests: ACL contract write, mock `createDelegatedUserDecryptEIP712`, mock
`delegatedUserDecrypt`, and the full `decryptBalanceAs` SDK flow.

**Files:**

- `packages/playwright/tests/delegation.spec.ts`

## Test Accounts

- Account #0: `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` (private key in constants.ts)
- Account #1: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` (hardhat default account #1)
