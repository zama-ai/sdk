---
title: Error Types
description: All SDK error classes, codes, and the matchZamaError utility.
---

# Error Types

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
  _: (e) => `Unexpected error: ${e}`,
});
```

| Parameter  | Type                                                                 | Description                             |
| ---------- | -------------------------------------------------------------------- | --------------------------------------- |
| `error`    | `unknown`                                                            | The caught error                        |
| `handlers` | `Record<ErrorCode, (e: ZamaError) => T> & { _?: (e: unknown) => T }` | Map of error codes to handler functions |

The `_` wildcard catches any `ZamaError` not explicitly handled.

## Error summary

| Error class                 | Code                     | Description                                       |
| --------------------------- | ------------------------ | ------------------------------------------------- |
| `SigningRejectedError`      | `SIGNING_REJECTED`       | User rejected the wallet signature                |
| `SigningFailedError`        | `SIGNING_FAILED`         | Wallet signature failed (connectivity, firmware)  |
| `EncryptionFailedError`     | `ENCRYPTION_FAILED`      | FHE encryption failed in the Web Worker           |
| `DecryptionFailedError`     | `DECRYPTION_FAILED`      | FHE decryption failed                             |
| `ApprovalFailedError`       | `APPROVAL_FAILED`        | ERC-20 approval transaction failed                |
| `TransactionRevertedError`  | `TRANSACTION_REVERTED`   | On-chain transaction reverted                     |
| `InvalidKeypairError`       | `INVALID_KEYPAIR`        | Relayer rejected FHE keypair (stale or malformed) |
| `KeypairExpiredError`       | `KEYPAIR_EXPIRED`        | FHE keypair expired — user must re-sign           |
| `NoCiphertextError`         | `NO_CIPHERTEXT`          | No encrypted balance for this account             |
| `RelayerRequestFailedError` | `RELAYER_REQUEST_FAILED` | Relayer HTTP request failed                       |
| `ConfigurationError`        | `CONFIGURATION`          | Invalid SDK configuration                         |

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

**How to handle:** Prompt the user to re-sign. Adjust `keypairTTL` in the SDK constructor if the default TTL is too short.

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

## Common problems

| Symptom                                   | Cause                                       | Fix                                                                                        |
| ----------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `SigningRejectedError` on every decrypt   | Wallet rejects EIP-712 signature            | Verify wallet supports `eth_signTypedData_v4`. Hardware wallets may need firmware updates. |
| Balance always `undefined`                | Encrypted handle is zero (never shielded)   | Catch `NoCiphertextError` and show an empty state.                                         |
| `EncryptionFailedError`                   | Web Worker cannot load WASM                 | Add `wasm-unsafe-eval` to your CSP headers.                                                |
| `DecryptionFailedError` after page reload | Unshield was interrupted mid-flow           | Call `loadPendingUnshield()` on mount, then `resumeUnshield()` to complete.                |
| `TransactionRevertedError` on finalize    | Unwrap already finalized or invalid tx hash | Check unwrap state. If already finalized, call `clearPendingUnshield()`.                   |
| `RelayerRequestFailedError`               | Wrong relayer URL or missing auth           | Verify `relayerUrl` in transport config. Check the `auth` option if using API key auth.    |

## Related

- [Error handling guide](/guides/handle-errors) — practical patterns for catching and displaying errors
- [ZamaSDK](/reference/sdk/ZamaSDK) — SDK constructor and session management
