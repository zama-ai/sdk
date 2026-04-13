---
title: Error types
description: All SDK error classes, codes, and the matchZamaError utility.
---

# Error types

All SDK errors extend `ZamaError` and carry a `.code` string you can match on. Catch them with `instanceof` or use `matchZamaError` for exhaustive handling.

## Import

```ts
import {
  ZamaError,
  matchZamaError,
  SigningRejectedError,
  SigningFailedError,
  EncryptionFailedError,
  DecryptionFailedError,
  ApprovalFailedError,
  TransactionRevertedError,
  InvalidKeypairError,
  KeypairExpiredError,
  NoCiphertextError,
  RelayerRequestFailedError,
  ConfigurationError,
  InsufficientConfidentialBalanceError,
  InsufficientERC20BalanceError,
  BalanceCheckUnavailableError,
  ERC20ReadFailedError,
  DelegationSelfNotAllowedError,
  DelegationDelegateEqualsContractError,
  DelegationExpiryUnchangedError,
  DelegationNotFoundError,
  DelegationExpiredError,
  DelegationCooldownError,
  DelegationContractIsSelfError,
  DelegationExpirationTooSoonError,
  DelegationNotPropagatedError,
  AclPausedError,
} from "@zama-fhe/sdk";
```

## matchZamaError

Pattern-match on error codes instead of chaining `instanceof` checks. Returns the handler's return value, or `undefined` if the error is not a `ZamaError` and no `_` wildcard is provided.

```ts
import { matchZamaError } from "@zama-fhe/sdk";

const message = matchZamaError(error, {
  SIGNING_REJECTED: () => "Please approve the transaction in your wallet",
  ENCRYPTION_FAILED: () => "Encryption failed — try again",
  TRANSACTION_REVERTED: (e) => `Transaction failed: ${e.message}`,
  NO_CIPHERTEXT: () => "No confidential balance — shield tokens first",
  INSUFFICIENT_CONFIDENTIAL_BALANCE: (e) => `Insufficient balance: ${e.available} available`,
  INSUFFICIENT_ERC20_BALANCE: (e) => `Not enough tokens: ${e.available} available`,
  BALANCE_CHECK_UNAVAILABLE: () => "Sign to verify your balance first",
  ERC20_READ_FAILED: () => "Could not read token balance -- check your connection",
  _: (e) => `Unexpected error: ${e}`,
});
```

| Parameter  | Type                                                                 | Description                             |
| ---------- | -------------------------------------------------------------------- | --------------------------------------- |
| `error`    | `unknown`                                                            | The caught error                        |
| `handlers` | `Record<ErrorCode, (e: ZamaError) => T> & { _?: (e: unknown) => T }` | Map of error codes to handler functions |

The `_` wildcard catches any `ZamaError` not explicitly handled.

## Error summary

| Error class                             | Code                                  | Description                                                  |
| --------------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| `SigningRejectedError`                  | `SIGNING_REJECTED`                    | User rejected the wallet signature                           |
| `SigningFailedError`                    | `SIGNING_FAILED`                      | Wallet signature failed (connectivity, firmware)             |
| `EncryptionFailedError`                 | `ENCRYPTION_FAILED`                   | FHE encryption failed in the Web Worker                      |
| `DecryptionFailedError`                 | `DECRYPTION_FAILED`                   | FHE decryption failed                                        |
| `ApprovalFailedError`                   | `APPROVAL_FAILED`                     | ERC-20 approval transaction failed                           |
| `TransactionRevertedError`              | `TRANSACTION_REVERTED`                | On-chain transaction reverted                                |
| `InvalidKeypairError`                   | `INVALID_KEYPAIR`                     | Relayer rejected FHE keypair (stale or malformed)            |
| `KeypairExpiredError`                   | `KEYPAIR_EXPIRED`                     | FHE keypair expired — user must re-sign                      |
| `NoCiphertextError`                     | `NO_CIPHERTEXT`                       | No encrypted balance for this account                        |
| `RelayerRequestFailedError`             | `RELAYER_REQUEST_FAILED`              | Relayer HTTP request failed                                  |
| `ConfigurationError`                    | `CONFIGURATION`                       | Invalid SDK configuration or FHE worker failed to initialize |
| `InsufficientConfidentialBalanceError`  | `INSUFFICIENT_CONFIDENTIAL_BALANCE`   | Confidential balance too low for transfer or unshield        |
| `InsufficientERC20BalanceError`         | `INSUFFICIENT_ERC20_BALANCE`          | ERC-20 balance too low for shield                            |
| `BalanceCheckUnavailableError`          | `BALANCE_CHECK_UNAVAILABLE`           | Balance validation impossible (no cached credentials)        |
| `ERC20ReadFailedError`                  | `ERC20_READ_FAILED`                   | Public ERC-20 read failed (network or contract error)        |
| `DelegationSelfNotAllowedError`         | `DELEGATION_SELF_NOT_ALLOWED`         | Delegate equals connected wallet                             |
| `DelegationDelegateEqualsContractError` | `DELEGATION_DELEGATE_EQUALS_CONTRACT` | Delegate equals contract address                             |
| `DelegationExpiryUnchangedError`        | `DELEGATION_EXPIRY_UNCHANGED`         | New expiry matches the current value                         |
| `DelegationNotFoundError`               | `DELEGATION_NOT_FOUND`                | No active delegation exists                                  |
| `DelegationExpiredError`                | `DELEGATION_EXPIRED`                  | Delegation has expired                                       |
| `DelegationCooldownError`               | `DELEGATION_COOLDOWN`                 | Same-block delegate/revoke not allowed                       |
| `DelegationContractIsSelfError`         | `DELEGATION_CONTRACT_IS_SELF`         | Contract address equals caller                               |
| `DelegationExpirationTooSoonError`      | `DELEGATION_EXPIRATION_TOO_SOON`      | Expiration date less than 1 hour in the future               |
| `DelegationNotPropagatedError`          | `DELEGATION_NOT_PROPAGATED`           | Delegation exists on L1 but hasn't synced to gateway yet     |
| `AclPausedError`                        | `ACL_PAUSED`                          | ACL contract is paused                                       |

## Error details

### SigningRejectedError

**Code:** `SIGNING_REJECTED`

Thrown when the user clicks "Reject" in their wallet popup during an EIP-712 signature request (keypair generation or session signing).

```ts
try {
  await token.balanceOf();
} catch (error) {
  if (error instanceof SigningRejectedError) {
    showPrompt("Approve the signature to decrypt your balance");
  }
}
```

**How to handle:** Re-prompt the user. The operation can be retried immediately.

### SigningFailedError

**Code:** `SIGNING_FAILED`

The wallet attempted to sign but failed for a reason other than user rejection — network issues, hardware wallet firmware problems, or RPC timeouts.

```ts
matchZamaError(error, {
  SIGNING_FAILED: (e) => console.error("Wallet signing error:", e.message),
});
```

**How to handle:** Check wallet connectivity and firmware version. Retry after the underlying issue is resolved.

### EncryptionFailedError

**Code:** `ENCRYPTION_FAILED`

FHE encryption failed inside the Web Worker. Usually caused by missing WASM support or restrictive CSP headers.

```ts
matchZamaError(error, {
  ENCRYPTION_FAILED: () => showError("Encryption failed — check browser compatibility"),
});
```

**How to handle:** Verify your Content Security Policy includes `wasm-unsafe-eval`. Check that the browser supports WebAssembly.

### DecryptionFailedError

**Code:** `DECRYPTION_FAILED`

FHE decryption failed. Can occur after an interrupted unshield or when the keypair state is corrupted.

```ts
matchZamaError(error, {
  DECRYPTION_FAILED: () => showError("Decryption failed — try refreshing"),
});
```

**How to handle:** If this happens after a page reload during unshield, use `loadPendingUnshield()` and `resumeUnshield()` to recover. Otherwise, calling `sdk.revokeSession()` and retrying forces a fresh keypair.

### ApprovalFailedError

**Code:** `APPROVAL_FAILED`

The ERC-20 `approve` transaction failed. This is the approval step before shielding, not the confidential operator approval.

```ts
matchZamaError(error, {
  APPROVAL_FAILED: () => showError("Token approval failed"),
});
```

**How to handle:** Check the user has sufficient gas and the token contract allows approvals. Retry the shield operation.

### TransactionRevertedError

**Code:** `TRANSACTION_REVERTED`

An on-chain transaction reverted. The error `.message` includes the revert reason when available.

```ts
matchZamaError(error, {
  TRANSACTION_REVERTED: (e) => showError(`Transaction reverted: ${e.message}`),
});
```

**How to handle:** Inspect the revert reason. Common causes: insufficient balance, expired operator approval, or attempting to finalize an already-finalized unwrap.

### InvalidKeypairError

**Code:** `INVALID_KEYPAIR`

The relayer rejected the FHE keypair. This happens when the keypair is malformed or was generated for a different chain.

```ts
matchZamaError(error, {
  INVALID_KEYPAIR: () => {
    sdk.revokeSession();
    showPrompt("Session expired — sign again to continue");
  },
});
```

**How to handle:** Revoke the session and prompt the user to re-sign. The SDK generates a fresh keypair on the next operation.

### KeypairExpiredError

**Code:** `KEYPAIR_EXPIRED`

The FHE keypair exceeded its TTL (default: 24 hours). The user needs to sign again to generate a new one.

```ts
matchZamaError(error, {
  KEYPAIR_EXPIRED: () => showPrompt("Session expired — sign to refresh"),
});
```

**How to handle:** Prompt the user to re-sign. Adjust `keypairTTL` in the SDK constructor if the default TTL of 30 days is not appropriate.

### NoCiphertextError

**Code:** `NO_CIPHERTEXT`

The account has no encrypted balance on-chain — it has never shielded tokens for this contract. This is different from a zero balance.

```ts
try {
  const balance = await token.balanceOf();
  showBalance(balance); // could be 0n
} catch (error) {
  if (error instanceof NoCiphertextError) {
    showEmptyState("Shield tokens to get started");
  }
}
```

**How to handle:** Show an empty state in your UI prompting the user to shield tokens. Do not display "0" — there is no balance to show.

### RelayerRequestFailedError

**Code:** `RELAYER_REQUEST_FAILED`

The HTTP request to the relayer failed. The error exposes `.statusCode` for further diagnosis.

```ts
matchZamaError(error, {
  RELAYER_REQUEST_FAILED: (e) => {
    if (e.statusCode === 401) showError("Authentication failed");
    else showError("Relayer unavailable — try again later");
  },
});
```

**How to handle:** Check `relayerUrl` in your transport config. If using API key authentication, verify the `auth` option. Check relayer service health.

## "No balance" vs "zero balance"

These are distinct states:

- **`NoCiphertextError`** — the account has never shielded tokens. There is no encrypted balance to decrypt. Show an empty state like "No confidential balance".
- **Balance of `0n`** — the account has shielded before but currently holds zero. Show "Balance: 0".

```ts
try {
  const balance = await token.balanceOf();
  showBalance(balance); // 0n is a valid balance
} catch (error) {
  if (error instanceof NoCiphertextError) {
    showEmptyState("Shield tokens to get started");
  }
}
```

### ConfigurationError

**Code:** `CONFIGURATION`

Thrown when the SDK configuration is invalid (e.g. forbidden chain ID, unsupported signer type) or when the FHE worker fails to initialize (e.g. missing WASM support, terminated relayer).

```ts
matchZamaError(error, {
  CONFIGURATION: (e) => console.error("Configuration error:", e.message),
});
```

**How to handle:** Check your transport config, CSP headers, and that the relayer has not been terminated. If the error mentions worker initialization, verify WASM support and `wasm-unsafe-eval` in your CSP.

### InsufficientConfidentialBalanceError

**Code:** `INSUFFICIENT_CONFIDENTIAL_BALANCE`

The decrypted confidential balance is less than the requested amount. Thrown by `confidentialTransfer()` and `unshield()` before submitting the transaction. Exposes structured details for UI display.

| Property    | Type      | Description                                |
| ----------- | --------- | ------------------------------------------ |
| `requested` | `bigint`  | Amount the caller requested                |
| `available` | `bigint`  | Decrypted balance at the time of the check |
| `token`     | `Address` | Token contract address                     |

```ts
import { InsufficientConfidentialBalanceError } from "@zama-fhe/sdk";

try {
  await token.confidentialTransfer("0xRecipient", 1000n);
} catch (error) {
  if (error instanceof InsufficientConfidentialBalanceError) {
    showError(`Insufficient balance: you have ${error.available}, need ${error.requested}`);
  }
}
```

**How to handle:** Show the user their current balance and the shortfall. No retry will help until the balance increases (via shielding or receiving a transfer).

### InsufficientERC20BalanceError

**Code:** `INSUFFICIENT_ERC20_BALANCE`

The public ERC-20 balance is less than the requested shield amount. Thrown by `shield()` before submitting the transaction. This is a public read with no signing requirement, so it works for all wallet types.

| Property    | Type      | Description                              |
| ----------- | --------- | ---------------------------------------- |
| `requested` | `bigint`  | Amount the caller requested to shield    |
| `available` | `bigint`  | ERC-20 balance at the time of the check  |
| `token`     | `Address` | Underlying ERC-20 token contract address |

```ts
import { InsufficientERC20BalanceError } from "@zama-fhe/sdk";

try {
  await token.shield(1000n);
} catch (error) {
  if (error instanceof InsufficientERC20BalanceError) {
    showError(`Not enough tokens: you have ${error.available}, need ${error.requested}`);
  }
}
```

**How to handle:** Show the user their public token balance and the shortfall. They need to acquire more tokens before shielding.

### BalanceCheckUnavailableError

**Code:** `BALANCE_CHECK_UNAVAILABLE`

Balance validation could not be performed. For confidential operations (`confidentialTransfer`, `unshield`), this means no cached credentials exist and the SDK cannot decrypt the balance without prompting a wallet signature. For `shield`, this means the ERC-20 balance read failed.

```ts
matchZamaError(error, {
  BALANCE_CHECK_UNAVAILABLE: () =>
    showPrompt("Sign to verify your balance, or use skipBalanceCheck"),
});
```

**How to handle:** Either call `token.allow()` first to cache credentials, or pass `skipBalanceCheck: true` to bypass validation (useful for smart wallets that cannot produce EIP-712 signatures).

### ERC20ReadFailedError

**Code:** `ERC20_READ_FAILED`

A public ERC-20 read (e.g. `balanceOf`) failed due to a network or contract error. Thrown by `shield()` when the pre-flight balance check cannot read the underlying token balance. This is distinct from `BalanceCheckUnavailableError`, which indicates missing credentials for confidential balance decryption.

```ts
matchZamaError(error, {
  ERC20_READ_FAILED: () => showError("Could not read token balance -- check your connection"),
});
```

**How to handle:** Check network connectivity and RPC endpoint health. The underlying ERC-20 contract may also be paused or unreachable. Retry the shield operation.

### DelegationSelfNotAllowedError

**Code:** `DELEGATION_SELF_NOT_ALLOWED`

Thrown when attempting to delegate decryption to your own address. The ACL contract rejects `delegate === msg.sender`.

```ts
matchZamaError(error, {
  DELEGATION_SELF_NOT_ALLOWED: () => showError("Cannot delegate to yourself"),
});
```

**How to handle:** Use a different delegate address.

### DelegationCooldownError

**Code:** `DELEGATION_COOLDOWN`

Only one delegate or revoke operation is allowed per `(delegator, delegate, contract)` tuple per block.

```ts
matchZamaError(error, {
  DELEGATION_COOLDOWN: () => showError("Please wait for the next block before retrying"),
});
```

**How to handle:** Wait for the next block before retrying the operation.

### DelegationNotFoundError

**Code:** `DELEGATION_NOT_FOUND`

No active delegation exists for the given `(delegator, delegate, contract)` tuple. Thrown when attempting to revoke a non-existent delegation.

```ts
matchZamaError(error, {
  DELEGATION_NOT_FOUND: () => showError("No active delegation found"),
});
```

**How to handle:** Verify the delegator, delegate, and contract addresses are correct.

### DelegationExpiredError

**Code:** `DELEGATION_EXPIRED`

The delegation has expired and can no longer be used for decryption.

```ts
matchZamaError(error, {
  DELEGATION_EXPIRED: () => showPrompt("Delegation expired — create a new one"),
});
```

**How to handle:** Create a new delegation.

### DelegationExpirationTooSoonError

**Code:** `DELEGATION_EXPIRATION_TOO_SOON`

Thrown client-side before submitting a `delegateDecryption` transaction when the expiration date is less than 1 hour in the future. This mirrors the on-chain `ExpirationDateBeforeOneHour` revert in the ACL contract.

```ts
matchZamaError(error, {
  DELEGATION_EXPIRATION_TOO_SOON: () =>
    showError("Expiration must be at least 1 hour in the future"),
});
```

**How to handle:** Choose a later expiration date (at least 1 hour from now) or omit it for a permanent delegation.

### DelegationDelegateEqualsContractError

**Code:** `DELEGATION_DELEGATE_EQUALS_CONTRACT`

Thrown client-side before submitting a `delegateDecryption` transaction when the delegate address equals the token contract address.

```ts
matchZamaError(error, {
  DELEGATION_DELEGATE_EQUALS_CONTRACT: () => showError("Cannot delegate to the contract itself"),
});
```

**How to handle:** Use a different delegate address.

### DelegationExpiryUnchangedError

**Code:** `DELEGATION_EXPIRY_UNCHANGED`

Thrown client-side (after an RPC read) when the new expiration date matches the current on-chain value. Saves gas by skipping a no-op transaction.

```ts
matchZamaError(error, {
  DELEGATION_EXPIRY_UNCHANGED: () => showInfo("Delegation already has this expiration date"),
});
```

**How to handle:** No action needed — the delegation is already configured as requested.

### DelegationContractIsSelfError

**Code:** `DELEGATION_CONTRACT_IS_SELF`

Caught from the on-chain `SenderCannotBeContractAddress` revert. The contract address passed to the delegation call equals the caller address.

```ts
matchZamaError(error, {
  DELEGATION_CONTRACT_IS_SELF: () => showError("Contract address cannot be the caller address"),
});
```

**How to handle:** Verify the contract address parameter is the token contract, not the caller's address.

### DelegationNotPropagatedError

**Code:** `DELEGATION_NOT_PROPAGATED`

Thrown when `decryptBalanceAs` fails with an HTTP 500 in a delegated context. The most likely cause is that the delegation was recently granted on L1 but hasn't propagated to the gateway (on Arbitrum) yet — cross-chain sync typically takes 1–2 minutes.

```ts
matchZamaError(error, {
  DELEGATION_NOT_PROPAGATED: () => showInfo("Delegation is still syncing — retry in 1–2 minutes"),
});
```

**How to handle:** Wait 1–2 minutes after the delegation transaction is mined, then retry. If the error persists, the gateway or relayer may be experiencing an unrelated issue.

### AclPausedError

**Code:** `ACL_PAUSED`

Caught from the on-chain `EnforcedPause` revert. The ACL contract is paused, temporarily disabling all delegation operations.

```ts
matchZamaError(error, {
  ACL_PAUSED: () => showError("Delegation is temporarily disabled"),
});
```

**How to handle:** Wait for the ACL contract to be unpaused. This is an operator-level action — contact the protocol team if this persists.

{% hint style="info" %}
The SDK automatically maps known ACL Solidity revert reasons to typed `ZamaError` subclasses via `matchAclRevert()`. Unmapped reverts fall through to `TransactionRevertedError`. See the [delegation error reference](/reference/sdk/delegation#on-chain-revert-errors) for the full mapping.
{% endhint %}

## Common problems

| Symptom                                   | Cause                                       | Fix                                                                                        |
| ----------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `SigningRejectedError` on every decrypt   | Wallet rejects EIP-712 signature            | Verify wallet supports `eth_signTypedData_v4`. Hardware wallets may need firmware updates. |
| Balance always `undefined`                | Encrypted handle is zero (never shielded)   | Catch `NoCiphertextError` and show an empty state.                                         |
| `ConfigurationError` on first operation   | FHE worker failed to initialize             | Check CSP headers (`wasm-unsafe-eval`), transport config, and WASM support.                |
| `EncryptionFailedError`                   | FHE encryption failed during an operation   | Add `wasm-unsafe-eval` to your CSP headers.                                                |
| `DecryptionFailedError` after page reload | Unshield was interrupted mid-flow           | Call `loadPendingUnshield()` on mount, then `resumeUnshield()` to complete.                |
| `TransactionRevertedError` on finalize    | Unwrap already finalized or invalid tx hash | Check unwrap state. If already finalized, call `clearPendingUnshield()`.                   |
| `RelayerRequestFailedError`               | Wrong relayer URL or missing auth           | Verify `relayerUrl` in transport config. Check the `auth` option if using API key auth.    |
| `InsufficientConfidentialBalanceError`    | Confidential balance < requested amount     | Show the user their balance and the shortfall. Wait for incoming transfers or shield more. |
| `InsufficientERC20BalanceError`           | ERC-20 balance < requested shield amount    | Show the user their public token balance. They need to acquire more tokens.                |
| `BalanceCheckUnavailableError`            | No cached credentials for balance check     | Call `token.allow()` first, or pass `skipBalanceCheck: true`.                              |
| `ERC20ReadFailedError`                    | ERC-20 balanceOf read failed                | Check network connectivity and RPC endpoint. Retry the shield.                             |

## Related

- [Error handling guide](/guides/handle-errors) — practical patterns for catching and displaying errors
- [ZamaSDK](/reference/sdk/ZamaSDK) — SDK constructor and session management
