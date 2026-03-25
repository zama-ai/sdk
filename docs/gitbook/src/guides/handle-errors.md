---
title: Handle Errors
description: Catch, match, and recover from SDK errors in your application.
---

# Handle Errors

All errors thrown by `@zama-fhe/sdk` and `@zama-fhe/react-sdk` extend `ZamaError` and carry a `.code` string for programmatic matching. This guide covers how to catch them, route them to user-friendly messages, and troubleshoot common problems.

## Steps

### 1. Understand the error hierarchy

Every SDK error is an instance of `ZamaError`, which extends the native `Error` class. Each subclass has a unique `.code` property:

| Error                           | Code                          | What happened                                            |
| ------------------------------- | ----------------------------- | -------------------------------------------------------- |
| `SigningRejectedError`          | `SIGNING_REJECTED`            | User rejected the wallet signature                       |
| `SigningFailedError`            | `SIGNING_FAILED`              | Wallet signature failed (connectivity or firmware issue) |
| `EncryptionFailedError`         | `ENCRYPTION_FAILED`           | FHE encryption failed in the Web Worker                  |
| `DecryptionFailedError`         | `DECRYPTION_FAILED`           | FHE decryption failed                                    |
| `ApprovalFailedError`           | `APPROVAL_FAILED`             | ERC-20 approval transaction failed                       |
| `TransactionRevertedError`      | `TRANSACTION_REVERTED`        | On-chain transaction reverted                            |
| `InvalidKeypairError`           | `INVALID_KEYPAIR`             | Relayer rejected FHE keypair (stale or malformed)        |
| `KeypairExpiredError`           | `KEYPAIR_EXPIRED`             | FHE keypair expired -- user needs to re-sign             |
| `NoCiphertextError`             | `NO_CIPHERTEXT`               | No encrypted balance exists for this account             |
| `RelayerRequestFailedError`     | `RELAYER_REQUEST_FAILED`      | Relayer HTTP request failed (check `.statusCode`)        |
| `ConfigurationError`            | `CONFIGURATION`               | Invalid SDK config or FHE worker failed to initialize    |
| `DelegationSelfNotAllowedError` | `DELEGATION_SELF_NOT_ALLOWED` | Delegation cannot target self                            |
| `DelegationCooldownError`       | `DELEGATION_COOLDOWN`         | Only one delegate/revoke per tuple per block             |
| `DelegationNotFoundError`       | `DELEGATION_NOT_FOUND`        | No active delegation for this tuple                      |
| `DelegationExpiredError`        | `DELEGATION_EXPIRED`          | The delegation has expired                               |

### 2. Catch with instanceof

Use standard `try/catch` with `instanceof` to handle specific error types:

{% tabs %}
{% tab title="SDK" %}

```ts
import { ZamaError, SigningRejectedError, EncryptionFailedError } from "@zama-fhe/sdk";

try {
  await token.confidentialTransfer(to, amount);
} catch (error) {
  if (error instanceof SigningRejectedError) {
    // User clicked "Reject" in their wallet
  } else if (error instanceof EncryptionFailedError) {
    // FHE encryption failed
  } else if (error instanceof ZamaError) {
    // Some other SDK error -- check error.code
  } else {
    // Not an SDK error
  }
}
```

{% endtab %}
{% endtabs %}

Always check the most specific types first and fall back to `ZamaError` last.

### 3. Use matchZamaError for cleaner code

Instead of `instanceof` chains, use `matchZamaError` to route errors by code:

{% tabs %}
{% tab title="SDK" %}

```ts
import { matchZamaError } from "@zama-fhe/sdk";

matchZamaError(error, {
  SIGNING_REJECTED: () => toast("Please approve the transaction"),
  ENCRYPTION_FAILED: () => toast("Encryption failed -- please retry"),
  TRANSACTION_REVERTED: (e) => toast(`Transaction failed: ${e.message}`),
  _: () => toast("Something went wrong"),
});
```

{% endtab %}
{% endtabs %}

The `_` wildcard catches any `ZamaError` not explicitly handled. If the error is not a `ZamaError` at all (and no `_` is provided), `matchZamaError` returns `undefined`.

### 4. Handle specific errors

Here is a quick reference for the most common errors and how to respond:

| Error                           | Recommended action                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `SigningRejectedError`          | Show a retry prompt. The user needs to approve the wallet signature.                                       |
| `SigningFailedError`            | Check wallet connectivity. Hardware wallets may need a firmware update.                                    |
| `EncryptionFailedError`         | Check your CSP headers -- the Web Worker needs `wasm-unsafe-eval`.                                         |
| `DecryptionFailedError`         | May indicate an interrupted unshield. Check for pending state with `loadPendingUnshield()`.                |
| `TransactionRevertedError`      | Inspect the revert reason. Common causes: insufficient balance, expired approval.                          |
| `InvalidKeypairError`           | The FHE keypair is stale. Revoke the session and prompt for a fresh signature.                             |
| `KeypairExpiredError`           | Same as above -- the keypair TTL has elapsed.                                                              |
| `NoCiphertextError`             | Not an error per se. The account has never shielded. Show an empty state in your UI.                       |
| `RelayerRequestFailedError`     | Verify `relayerUrl` in your config. If using API key auth, check the `auth` option. Inspect `.statusCode`. |
| `ConfigurationError`            | Invalid SDK configuration or FHE worker failed to initialize. Check your transport config and CSP headers. |
| `DelegationSelfNotAllowedError` | Cannot delegate to yourself. Use a different delegate address.                                             |
| `DelegationCooldownError`       | Wait for the next block before retrying delegate/revoke on the same tuple.                                 |
| `DelegationNotFoundError`       | No active delegation exists. Verify the delegator, delegate, and contract addresses.                       |
| `DelegationExpiredError`        | The delegation has expired. Create a new delegation.                                                       |

### 5. Distinguish "no balance" from "zero balance"

This is a common source of confusion. They require different UI treatments:

{% tabs %}
{% tab title="SDK" %}

```ts
import { NoCiphertextError } from "@zama-fhe/sdk";

try {
  const balance = await token.balanceOf();
  // balance could be 0n -- that means "zero balance"
  showBalance(balance);
} catch (error) {
  if (error instanceof NoCiphertextError) {
    // No encrypted balance exists -- "no balance"
    showEmptyState("Shield tokens to get started");
  }
}
```

{% endtab %}
{% endtabs %}

See [Check Balances](check-balances.md) for more detail on balance handling patterns.

### 6. Use matchZamaError in React components

The `matchZamaError` helper works the same way in React. Here is a reusable error component:

{% tabs %}
{% tab title="React" %}

```tsx
import { matchZamaError } from "@zama-fhe/react-sdk";

function ErrorMessage({ error }: { error: Error | null }) {
  if (!error) return null;

  const message = matchZamaError(error, {
    SIGNING_REJECTED: () => "Transaction cancelled -- please approve in your wallet.",
    ENCRYPTION_FAILED: () => "Encryption failed -- please try again.",
    TRANSACTION_REVERTED: () => "Transaction failed on-chain -- check your balance.",
    _: () => "Something went wrong.",
  });

  return <p className="error">{message ?? error.message}</p>;
}
```

{% endtab %}
{% endtabs %}

When `matchZamaError` returns `undefined` (because the error is not a `ZamaError`), the component falls back to `error.message`.

### 7. Common problems troubleshooting

| What you see                              | Why                                         | Fix                                                                                                 |
| ----------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `SigningRejectedError` on every decrypt   | Wallet rejected the EIP-712 signature       | Make sure the wallet supports `eth_signTypedData_v4`. Some hardware wallets need a firmware update. |
| Balance always `undefined`                | Encrypted handle is zero (never shielded)   | Check if the user has shielded tokens first. Catch `NoCiphertextError`.                             |
| `ConfigurationError` on first operation   | FHE worker failed to initialize             | Check your CSP headers -- the worker needs `wasm-unsafe-eval`. Check transport config.              |
| `EncryptionFailedError`                   | FHE encryption failed during an operation   | Check your CSP headers -- the worker needs `wasm-unsafe-eval`.                                      |
| `DecryptionFailedError` after page reload | Unshield was interrupted                    | Use `loadPendingUnshield()` on mount to detect and `resumeUnshield()` to complete it.               |
| `TransactionRevertedError` on finalize    | Unwrap already finalized or tx hash invalid | Check the unwrap tx. If already finalized, clear the pending state with `clearPendingUnshield()`.   |
| `RelayerRequestFailedError`               | Relayer URL wrong or auth missing           | Verify `relayerUrl` in your transport config. If using API key auth, check the `auth` option.       |

## Next steps

- See [Error types reference](/reference/sdk/errors) for the full error type reference.
- See [Hooks](/reference/react/query-keys) for error handling patterns with React Query.
- For interrupted unshields specifically, see [Unshield Tokens](unshield-tokens.md).
