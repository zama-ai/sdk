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
  TransactionRevertedError,
  InvalidTransportKeyPairError,
  TransportKeyPairExpiredError,
  NoCiphertextError,
  RelayerRequestFailedError,
  NotEntitledError,
  RpcRateLimitError,
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
  SignerRequiredError,
  SignerNotConfiguredError,
  WalletNotConnectedError,
  WalletAccountNotReadyError,
  ChainMismatchError,
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
  INSUFFICIENT_CONFIDENTIAL_BALANCE: (e) => `Need ${e.requested}, have ${e.available}`,
  INSUFFICIENT_ERC20_BALANCE: (e) => `Need ${e.requested}, have ${e.available}`,
  BALANCE_CHECK_UNAVAILABLE: () => "Sign to verify your balance first",
  ERC20_READ_FAILED: () => "Could not read token balance -- check your connection",
  _: (e) => `Unexpected error: ${e}`,
});
```

| Parameter  | Type                                                                           | Description                             |
| ---------- | ------------------------------------------------------------------------------ | --------------------------------------- |
| `error`    | `unknown`                                                                      | The caught error                        |
| `handlers` | `{ [K in ErrorCode]?: (e: ErrorForCode[K]) => T } & { _?: (e: unknown) => T }` | Map of error codes to handler functions |

The `_` wildcard catches any `ZamaError` not explicitly handled. Each handler receives the error class for its code, so subclass fields like `InsufficientConfidentialBalanceError.available` or `RelayerRequestFailedError.statusCode` are available without a cast.

## Error summary

| Error class                             | Code                                  | Description                                                                                                                       |
| --------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `SigningRejectedError`                  | `SIGNING_REJECTED`                    | User rejected the wallet signature                                                                                                |
| `SigningFailedError`                    | `SIGNING_FAILED`                      | Wallet signature failed (connectivity, firmware)                                                                                  |
| `EncryptionFailedError`                 | `ENCRYPTION_FAILED`                   | FHE encryption failed in the Web Worker                                                                                           |
| `DecryptionFailedError`                 | `DECRYPTION_FAILED`                   | FHE decryption failed                                                                                                             |
| `TransactionRevertedError`              | `TRANSACTION_REVERTED`                | On-chain transaction reverted (includes failed ERC-20 approvals during shield)                                                    |
| `InvalidTransportKeyPairError`          | `INVALID_KEYPAIR`                     | Relayer rejected transport key pair (stale or malformed)                                                                          |
| `TransportKeyPairExpiredError`          | `KEYPAIR_EXPIRED`                     | Transport key pair expired — user must re-sign                                                                                    |
| `NoCiphertextError`                     | `NO_CIPHERTEXT`                       | No encrypted balance for this account                                                                                             |
| `RelayerRequestFailedError`             | `RELAYER_REQUEST_FAILED`              | Relayer HTTP request failed                                                                                                       |
| `NotEntitledError`                      | `NOT_ENTITLED`                        | Direct signer lacks ACL permission to decrypt this encrypted value (don't retry; delegated path → `DelegationNotPropagatedError`) |
| `RpcRateLimitError`                     | `RPC_RATE_LIMITED`                    | Consumer's RPC provider rate-limited an on-chain read (HTTP 429 / -32005; retry)                                                  |
| `ConfigurationError`                    | `CONFIGURATION`                       | Invalid SDK configuration or FHE worker failed to initialize                                                                      |
| `InsufficientConfidentialBalanceError`  | `INSUFFICIENT_CONFIDENTIAL_BALANCE`   | Confidential balance too low for transfer or unshield                                                                             |
| `InsufficientERC20BalanceError`         | `INSUFFICIENT_ERC20_BALANCE`          | ERC-20 balance too low for shield                                                                                                 |
| `BalanceCheckUnavailableError`          | `BALANCE_CHECK_UNAVAILABLE`           | Balance validation impossible (no stored permits)                                                                                 |
| `ERC20ReadFailedError`                  | `ERC20_READ_FAILED`                   | Public ERC-20 read failed (network or contract error)                                                                             |
| `DelegationSelfNotAllowedError`         | `DELEGATION_SELF_NOT_ALLOWED`         | Delegate equals connected wallet                                                                                                  |
| `DelegationDelegateEqualsContractError` | `DELEGATION_DELEGATE_EQUALS_CONTRACT` | Delegate equals contract address                                                                                                  |
| `DelegationExpiryUnchangedError`        | `DELEGATION_EXPIRY_UNCHANGED`         | New expiry matches the current value                                                                                              |
| `DelegationNotFoundError`               | `DELEGATION_NOT_FOUND`                | No active delegation exists                                                                                                       |
| `DelegationExpiredError`                | `DELEGATION_EXPIRED`                  | Delegation has expired                                                                                                            |
| `DelegationCooldownError`               | `DELEGATION_COOLDOWN`                 | Same-block delegate/revoke not allowed                                                                                            |
| `DelegationContractIsSelfError`         | `DELEGATION_CONTRACT_IS_SELF`         | Contract address equals caller                                                                                                    |
| `DelegationExpirationTooSoonError`      | `DELEGATION_EXPIRATION_TOO_SOON`      | Expiration date less than 1 hour in the future                                                                                    |
| `DelegationNotPropagatedError`          | `DELEGATION_NOT_PROPAGATED`           | Delegated decrypt failed transiently (gateway not synced yet, or delegator ACL read stale) — retry                                |
| `SignerNotConfiguredError`              | `SIGNER_NOT_CONFIGURED`               | SDK operation needs a signer but none is configured                                                                               |
| `WalletNotConnectedError`               | `WALLET_NOT_CONNECTED`                | Signer exists but has no connected wallet account                                                                                 |
| `WalletAccountNotReadyError`            | `WALLET_ACCOUNT_NOT_READY`            | Async signer adapter has not resolved its account yet                                                                             |
| `ChainMismatchError`                    | `CHAIN_MISMATCH`                      | Signer and provider are on different chains                                                                                       |
| `AclPausedError`                        | `ACL_PAUSED`                          | ACL contract is paused                                                                                                            |

## Error details

### SignerNotConfiguredError

**Code:** `SIGNER_NOT_CONFIGURED`

Thrown when a write, sign, or decrypt operation is called on an SDK instance configured without a signer. The error carries the `operation` name that was attempted.

```ts
import { SignerNotConfiguredError } from "@zama-fhe/sdk";

try {
  await wrappedToken.shield(1000n);
} catch (error) {
  if (error instanceof SignerNotConfiguredError) {
    showConfigurationError("Configure a signer to perform this action");
  }
}
```

**How to handle:** Reconfigure the SDK with a signer.

### WalletNotConnectedError

**Code:** `WALLET_NOT_CONNECTED`

Thrown when a signer adapter is configured but does not currently have a connected wallet account.

**How to handle:** Prompt the user to connect or unlock their wallet.

### ChainMismatchError

**Code:** `CHAIN_MISMATCH`

Thrown when the signer and provider resolve to different chains during an operation. The error carries `operation`, `signerChainId`, and `providerChainId`.

```ts
matchZamaError(error, {
  CHAIN_MISMATCH: () => showError("Wallet is on the wrong network — switch and retry"),
});
```

**How to handle:** Prompt the user to switch their wallet to the chain the operation targets, then retry.

### SigningRejectedError

**Code:** `SIGNING_REJECTED`

Thrown when the user clicks "Reject" in their wallet popup during an EIP-712 signature request (transport key pair generation or session signing).

```ts
try {
  await token.balanceOf(address);
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
matchZamaError(error, { SIGNING_FAILED: (e) => console.error("Wallet signing error:", e.message) });
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

FHE decryption failed. Can occur after an interrupted unshield or when the transport key pair state is corrupted.

```ts
matchZamaError(error, { DECRYPTION_FAILED: () => showError("Decryption failed — try refreshing") });
```

**How to handle:** If this happens after a page reload during unshield, use `loadPendingUnshield()` and `resumeUnshield()` to recover. Otherwise, calling `sdk.permits.clear()` and retrying forces a fresh transport key pair.

### TransactionRevertedError

**Code:** `TRANSACTION_REVERTED`

An on-chain transaction reverted. The error `.message` includes the revert reason when available.

```ts
matchZamaError(error, {
  TRANSACTION_REVERTED: (e) => showError(`Transaction reverted: ${e.message}`),
});
```

**How to handle:** Inspect the revert reason. Common causes: insufficient balance, expired operator approval, or attempting to finalize an already-finalized unwrap.

### InvalidTransportKeyPairError

**Code:** `INVALID_KEYPAIR`

The relayer rejected the transport key pair. This happens when the key pair is malformed or was generated for a different chain.

```ts
matchZamaError(error, {
  INVALID_KEYPAIR: () => {
    sdk.permits.clear();
    showPrompt("Transport key pair rejected — sign again to continue");
  },
});
```

**How to handle:** Clear credentials and prompt the user to re-sign. The SDK generates a fresh transport key pair on the next operation.

### TransportKeyPairExpiredError

**Code:** `KEYPAIR_EXPIRED`

The transport key pair exceeded its TTL (default: 30 days). The user needs to sign again to generate a new one.

```ts
matchZamaError(error, {
  KEYPAIR_EXPIRED: () => showPrompt("Transport key pair expired — sign to refresh"),
});
```

**How to handle:** Prompt the user to re-sign. Adjust `transportKeyPairTTL` in the SDK constructor if the default TTL of 30 days is not appropriate.

### NoCiphertextError

**Code:** `NO_CIPHERTEXT`

The account has no encrypted balance on-chain — it has never shielded tokens for this contract. This is different from a zero balance.

```ts
try {
  const balance = await token.balanceOf(address);
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

The HTTP request to the relayer failed. The error exposes `.statusCode` for further diagnosis. On rate-limited responses (HTTP 429) it also surfaces the relayer's back-pressure: `.retryable` is `true`, and `.retryAfter` carries the server's suggested delay in **seconds** when the response included a `Retry-After` header (otherwise `undefined`).

```ts
matchZamaError(error, {
  RELAYER_REQUEST_FAILED: async (e) => {
    if (e.statusCode === 401) {
      showError("Authentication failed");
    } else if (e.retryable) {
      // Honour the server's delay (seconds) when provided; fall back to your own backoff.
      await sleep((e.retryAfter ?? 1) * 1000);
      retry();
    } else {
      showError("Relayer unavailable — try again later");
    }
  },
});
```

**How to handle:** For a 429, wait `.retryAfter` seconds (when present) before retrying instead of inventing a backoff. Otherwise, check `relayerUrl` in your transport config, verify the `auth` option if using API key authentication, and check relayer service health.

> **Browser note:** back-pressure is reliable server-side. In the browser, the relayer's 429 is served cross-origin without CORS headers, so `.retryAfter` (and sometimes `.statusCode`) may be unavailable — fall back to your own backoff.

### NotEntitledError

**Code:** `NOT_ENTITLED`

The configured signer is not entitled to decrypt the encrypted value: the relayer's ACL check (`persistAllowed`) denied it. This is a **terminal, non-retryable** condition — the account needs an on-chain ACL grant (`FHE.allow`) before it can decrypt. It is distinct from a transient infrastructure failure, so entitlement-aware consumers (e.g. server-side indexers) can branch deterministically instead of pre-checking on-chain out of band or string-matching messages.

The SDK derives this typed error from the relayer's own authoritative ACL check — it adds no extra on-chain reads.

> **Scope:** `NotEntitledError` covers the **direct signer** (user-decrypt path) not being entitled. The rarer "the dapp contract itself is not authorized for this encrypted value" case is a dapp misconfiguration and currently surfaces as `DecryptionFailedError`, so retry-aware consumers should not treat every `DecryptionFailedError` as transient.

> **Delegated path:** on a _delegated_ decrypt, a "not entitled" verdict comes from the **delegator's** `persistAllowed` L1 read, which returns `false` transiently while a just-granted delegation propagates or when the RPC serves a stale block. That case is **not** terminal — it surfaces as the retryable [`DelegationNotPropagatedError`](#delegationnotpropagatederror) instead, mirroring the delegated-500 handling.

The error carries `encryptedValue`, `contractAddress`, and `account`.

```ts
import { NotEntitledError } from "@zama-fhe/sdk";

try {
  await sdk.decryption.decryptValues([{ encryptedValue, contractAddress }]);
} catch (error) {
  if (error instanceof NotEntitledError) {
    // Don't retry — wait for an ACL grant / backfill, then re-attempt.
    markPendingGrant(error.encryptedValue, error.contractAddress);
  }
}
```

**How to handle:** Do not retry the same request. Wait until the encrypted value is granted to the account on-chain (e.g. a later block / backfill), then decrypt again.

### RpcRateLimitError

**Code:** `RPC_RATE_LIMITED`

The consumer's **RPC provider** rate-limited an on-chain read the SDK performs during decryption (e.g. the ACL check) — surfaced as HTTP 429 or the JSON-RPC `-32005` ("limit exceeded") code. This is an RPC-endpoint problem, **not** a decryption or entitlement failure, and the operation is safe to **retry** (ideally with backoff). It is separate from the relayer's own back-pressure, which remains a `RelayerRequestFailedError`. The error exposes `retryAfter` (seconds) when the provider supplies a hint — a numeric value or a `Retry-After` header (e.g. viem's `HttpRequestError`).

```ts
import { RpcRateLimitError } from "@zama-fhe/sdk";

try {
  await sdk.decryption.decryptValues([{ encryptedValue, contractAddress }]);
} catch (error) {
  if (error instanceof RpcRateLimitError) {
    await backoff(error.retryAfter); // seconds; then retry
  }
}
```

**How to handle:** Back off and retry. If it persists, raise your RPC provider's rate limit or switch to a higher-throughput endpoint.

## "No balance" vs "zero balance"

These are distinct states:

- **`NoCiphertextError`** — the account has never shielded tokens. There is no encrypted balance to decrypt. Show an empty state like "No confidential balance".
- **Balance of `0n`** — the account has shielded before but currently holds zero. Show "Balance: 0".

```ts
try {
  const balance = await token.balanceOf(address);
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
matchZamaError(error, { CONFIGURATION: (e) => console.error("Configuration error:", e.message) });
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
  await wrappedToken.shield(1000n);
} catch (error) {
  if (error instanceof InsufficientERC20BalanceError) {
    showError(`Not enough tokens: you have ${error.available}, need ${error.requested}`);
  }
}
```

**How to handle:** Show the user their public token balance and the shortfall. They need to acquire more tokens before shielding.

### BalanceCheckUnavailableError

**Code:** `BALANCE_CHECK_UNAVAILABLE`

Balance validation could not be performed. For confidential operations (`confidentialTransfer`, `unshield`), this means no stored permits exist and the SDK cannot decrypt the balance without prompting a wallet signature. For `shield`, this means the ERC-20 balance read failed.

```ts
matchZamaError(error, {
  BALANCE_CHECK_UNAVAILABLE: () =>
    showPrompt("Sign to verify your balance, or use skipBalanceCheck"),
});
```

**How to handle:** Either call `sdk.permits.grantPermit([token.address])` first to sign permits, or pass `skipBalanceCheck: true` to bypass validation (useful for smart wallets that cannot produce EIP-712 signatures).

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

No active delegation exists for the given `(delegator, delegate, contract)` tuple. Thrown when attempting to revoke a non-existent delegation, and by `decryptBalanceAs` / `batchDecryptBalancesAs` (including on cache hits) when the delegation is missing or has been revoked.

```ts
matchZamaError(error, { DELEGATION_NOT_FOUND: () => showError("No active delegation found") });
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

Thrown on a delegated decrypt when either (a) the relayer returns an HTTP 500, or (b) the delegator fails the on-chain ACL check (`persistAllowed` returns `false`). The most likely cause in both cases is that the delegation was recently granted on L1 but hasn't propagated to the gateway (on Arbitrum) yet — cross-chain sync usually completes within ~10 blocks (a few seconds) — or the consumer's RPC is serving a stale block. Because it is a timing window rather than a permanent denial, it is **retryable** (unlike the terminal [`NotEntitledError`](#notentitlederror) on the direct user-decrypt path).

The delegated-decrypt path rides out this window with a bounded internal retry (~30s), so you rarely see this error — it surfaces only when propagation outlasts the retry budget, or when you opt out with `waitForPropagation: false`.

```ts
matchZamaError(error, {
  DELEGATION_NOT_PROPAGATED: () => showInfo("Delegation is still syncing — retry shortly"),
});
```

**How to handle:** Retry shortly — propagation normally completes within seconds. If the error persists, the gateway or relayer may be experiencing an unrelated issue.

### AclPausedError

**Code:** `ACL_PAUSED`

Caught from the on-chain `EnforcedPause` revert. The ACL contract is paused, temporarily disabling all delegation operations.

```ts
matchZamaError(error, { ACL_PAUSED: () => showError("Delegation is temporarily disabled") });
```

**How to handle:** Wait for the ACL contract to be unpaused. This is an operator-level action — contact the protocol team if this persists.

{% hint style="info" %}
The SDK automatically maps known ACL Solidity revert reasons to typed `ZamaError` subclasses on `delegateDecryption` and `revokeDelegation`. Unmapped reverts fall through to `TransactionRevertedError`. See the [delegation method reference](./delegation.md#methods) for the full mapping.
{% endhint %}

## Common problems

| Symptom                                   | Cause                                        | Fix                                                                                        |
| ----------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `SigningRejectedError` on every decrypt   | Wallet rejects EIP-712 signature             | Verify wallet supports `eth_signTypedData_v4`. Hardware wallets may need firmware updates. |
| Balance always `undefined`                | Encrypted value is zero (never shielded)     | Catch `NoCiphertextError` and show an empty state.                                         |
| `ConfigurationError` on first operation   | FHE worker failed to initialize              | Check CSP headers (`wasm-unsafe-eval`), transport config, and WASM support.                |
| `EncryptionFailedError`                   | FHE encryption failed during an operation    | Add `wasm-unsafe-eval` to your CSP headers.                                                |
| `DecryptionFailedError` after page reload | Unshield was interrupted mid-flow            | Call `loadPendingUnshield()` on mount, then `resumeUnshield()` to complete.                |
| `TransactionRevertedError` on finalize    | Unwrap already finalized or invalid tx hash  | Check unwrap state. If already finalized, call `clearPendingUnshield()`.                   |
| `RelayerRequestFailedError`               | Wrong relayer URL or missing auth            | Verify `relayerUrl` in transport config. Check the `auth` option if using API key auth.    |
| `NotEntitledError` on decrypt             | Account lacks ACL grant for the value        | Don't retry. Wait for an on-chain `FHE.allow` grant / backfill, then decrypt again.        |
| `RpcRateLimitError` on decrypt            | Consumer RPC provider throttled (429/-32005) | Back off and retry. Raise your RPC rate limit or use a higher-throughput endpoint.         |
| `InsufficientConfidentialBalanceError`    | Confidential balance < requested amount      | Show the user their balance and the shortfall. Wait for incoming transfers or shield more. |
| `InsufficientERC20BalanceError`           | ERC-20 balance < requested shield amount     | Show the user their public token balance. They need to acquire more tokens.                |
| `BalanceCheckUnavailableError`            | No stored permits for balance check          | Call `sdk.permits.grantPermit([token.address])` first, or pass `skipBalanceCheck: true`.   |
| `ERC20ReadFailedError`                    | ERC-20 balanceOf read failed                 | Check network connectivity and RPC endpoint. Retry the shield.                             |

## Related

- [Error handling guide](../../guides/handle-errors.md) — practical patterns for catching and displaying errors
- [ZamaSDK](./ZamaSDK.md) — SDK constructor and permit management
