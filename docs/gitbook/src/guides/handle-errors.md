---
title: Handle errors
description: Catch, match, and recover from SDK errors in TypeScript, React, Go, and Rust applications.
---

# Handle errors

All errors thrown by `@zama-fhe/sdk` and `@zama-fhe/react-sdk` extend `ZamaError` and carry a `.code` string for programmatic matching. This guide covers how to catch them, route them to user-friendly messages, and troubleshoot common problems. Go and Rust clients receive the same codes from the daemon, plus [daemon error codes](../native/reference/error-codes.md) for daemon and connection failures.

## Steps

### 1. Understand the error hierarchy

Every SDK error is an instance of `ZamaError`, which extends the native `Error` class. Each subclass has a unique `.code` property:

| Code                                     | TypeScript error class                    | What happened                                                                                                  |
| ---------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `SIGNING_REJECTED`                       | `SigningRejectedError`                    | User rejected the wallet signature                                                                             |
| `SIGNING_FAILED`                         | `SigningFailedError`                      | Wallet signature failed (connectivity or firmware issue)                                                       |
| `ENCRYPTION_FAILED`                      | `EncryptionFailedError`                   | FHE encryption failed in the WASM runtime                                                                      |
| `DECRYPTION_FAILED`                      | `DecryptionFailedError`                   | FHE decryption failed                                                                                          |
| `TRANSACTION_REVERTED`                   | `TransactionRevertedError`                | On-chain transaction reverted (includes failed ERC-20 approvals during shield)                                 |
| `UNSHIELD_ALREADY_FINALIZED`             | `UnshieldAlreadyFinalizedError`           | `resumeUnshield()` called for an unwrap that was already finalized -- funds already arrived, nothing to resume |
| `INVALID_KEYPAIR`                        | `InvalidTransportKeyPairError`            | Relayer rejected transport key pair (stale or malformed)                                                       |
| `KEYPAIR_EXPIRED`                        | `TransportKeyPairExpiredError`            | Transport key pair expired -- user needs to re-sign                                                            |
| `REVOKED_KMS_CONTEXT`                    | `RevokedKmsContextError`                  | Permit's KMS context revoked on-chain; the automatic recovery could not restore a usable permit                |
| `NO_CIPHERTEXT`                          | `NoCiphertextError`                       | No encrypted balance exists for this account                                                                   |
| `RELAYER_REQUEST_FAILED`                 | `RelayerRequestFailedError`               | Relayer HTTP request failed (check `.statusCode`); retryable on back-pressure (429)                            |
| `NOT_ENTITLED`                           | `NotEntitledError`                        | Actor lacks the on-chain ACL grant to decrypt this value — terminal, don't retry                               |
| `RPC_RATE_LIMITED`                       | `RpcRateLimitError`                       | Consumer's RPC provider rate-limited an on-chain read (retryable)                                              |
| `CONFIGURATION`                          | `ConfigurationError`                      | Invalid SDK config or FHE runtime failed to initialize                                                         |
| `INSUFFICIENT_CONFIDENTIAL_BALANCE`      | `InsufficientConfidentialBalanceError`    | Confidential balance too low for transfer or unshield                                                          |
| `INSUFFICIENT_ERC20_BALANCE`             | `InsufficientERC20BalanceError`           | ERC-20 balance too low for shield                                                                              |
| `INSUFFICIENT_ALLOWANCE`                 | `InsufficientAllowanceError`              | ERC-20 allowance too low for a manual `wrap` (approve first)                                                   |
| `BALANCE_CHECK_UNAVAILABLE`              | `BalanceCheckUnavailableError`            | Balance check impossible (no stored permits)                                                                   |
| `ERC20_READ_FAILED`                      | `ERC20ReadFailedError`                    | Public ERC-20 read failed (network or contract error)                                                          |
| `DELEGATION_SELF_NOT_ALLOWED`            | `DelegationSelfNotAllowedError`           | Delegation cannot target self                                                                                  |
| `DELEGATION_COOLDOWN`                    | `DelegationCooldownError`                 | Only one delegate/revoke per tuple per block (retryable)                                                       |
| `DELEGATION_NOT_FOUND`                   | `DelegationNotFoundError`                 | No active delegation for this tuple                                                                            |
| `SIGNER_REQUIRED`                        | `SignerRequiredError`                     | Write/sign/decrypt called without a signer                                                                     |
| `DELEGATION_EXPIRED`                     | `DelegationExpiredError`                  | The delegation has expired                                                                                     |
| `SIGNER_NOT_CONFIGURED`                  | `SignerNotConfiguredError`                | SDK operation needs a signer but none is configured (subclass of `SignerRequiredError`)                        |
| `WALLET_NOT_CONNECTED`                   | `WalletNotConnectedError`                 | Signer exists but has no connected wallet account (subclass of `SignerRequiredError`)                          |
| `WALLET_ACCOUNT_NOT_READY`               | `WalletAccountNotReadyError`              | Async signer adapter hasn't resolved its account yet (subclass of `SignerRequiredError`, retryable)            |
| `CHAIN_MISMATCH`                         | `ChainMismatchError`                      | Signer and provider are on different chains                                                                    |
| `DELEGATION_CONTRACT_IS_SELF`            | `DelegationContractIsSelfError`           | Delegation contract address equals the caller                                                                  |
| `DELEGATION_DELEGATE_EQUALS_CONTRACT`    | `DelegationDelegateEqualsContractError`   | Delegate equals the contract address                                                                           |
| `DELEGATION_DELEGATE_CANNOT_BE_WILDCARD` | `DelegationDelegateCannotBeWildcardError` | Delegate address is the wildcard address                                                                       |
| `DELEGATION_EXPIRATION_TOO_SOON`         | `DelegationExpirationTooSoonError`        | Expiration date less than 1 hour in the future                                                                 |
| `DELEGATION_EXPIRY_UNCHANGED`            | `DelegationExpiryUnchangedError`          | New expiry matches the current value                                                                           |
| `DELEGATION_NOT_PROPAGATED`              | `DelegationNotPropagatedError`            | Delegated decrypt failed transiently (gateway not synced, or delegator ACL read stale) — retry                 |
| `ACL_PAUSED`                             | `AclPausedError`                          | The ACL contract is paused                                                                                     |

### 2. Catch with instanceof

Use standard `try/catch` with `instanceof` to handle specific error types:

{% tabs %}
{% tab title="Core SDK" %}

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
{% tab title="React SDK" %}

Hooks surface the same error classes on `.error` — narrow them with the same `instanceof` checks, no `try/catch` needed:

```tsx
import { ZamaError, SigningRejectedError, EncryptionFailedError } from "@zama-fhe/sdk";
import { useConfidentialTransfer } from "@zama-fhe/react-sdk";

const { error } = useConfidentialTransfer({ address: "0xToken" });

if (error instanceof SigningRejectedError) {
  // User clicked "Reject" in their wallet
} else if (error instanceof EncryptionFailedError) {
  // FHE encryption failed
} else if (error instanceof ZamaError) {
  // Some other SDK error -- check error.code
}
```

{% endtab %}
{% tab title="Go" %}

```go
import (
	"errors"

	zama "github.com/zama-ai/sdk/clients/go/v3"
)

_, err := sdk.DecryptValues(ctx, inputs, zama.DecryptOptions{})
var sdkErr *zama.SDKError
switch {
case err == nil:
	// Decrypted
case errors.As(err, &sdkErr) && sdkErr.Code == zama.CodeSigningRejected:
	// User clicked "Reject" in their wallet
case errors.As(err, &sdkErr) && sdkErr.Code == "DECRYPTION_FAILED":
	// FHE decryption failed
case errors.As(err, &sdkErr) && sdkErr.Code != "":
	// Some other SDK error -- check sdkErr.Code
default:
	// Not an SDK error
}
```

`errors.As` also reaches the code inside a transport `RPCError`. An empty code means the daemon connection or a callback failed.

{% endtab %}
{% tab title="Rust" %}

```rust
match sdk.decryption().decrypt_values(&inputs, None).await {
    Ok(_values) => {} // Decrypted
    Err(error) => match error.sdk_error().map(|details| details.code.as_str()) {
        Some("SIGNING_REJECTED") => {} // User clicked "Reject" in their wallet
        Some("DECRYPTION_FAILED") => {} // FHE decryption failed
        Some(_) => {}                  // Some other SDK error -- check the code
        None => {}                     // Not an SDK error
    },
}
```

`sdk_error()` is `None` when the daemon connection or a callback failed; `error.kind()` names the category.

{% endtab %}
{% endtabs %}

{% hint style="info" %}
The "no `try/catch`" note applies to the declarative `.error` field shown above. If you instead `await` a mutation's `mutateAsync(...)` directly (as several guides do for shield/unshield/transfer), that promise **rejects** on failure — wrap those calls in `try/catch`, or read the hook's `.error` field rather than awaiting.
{% endhint %}

Always check the most specific types first and fall back to `ZamaError` last.

### 3. Use matchZamaError for cleaner code

Instead of `instanceof` chains, use `matchZamaError` to route errors by code. This helper is framework-neutral — it works the same on a caught error in the core SDK and on a hook's `.error` in React (see the reusable React component in step 6):

```ts
import { matchZamaError } from "@zama-fhe/sdk";

matchZamaError(error, {
  SIGNING_REJECTED: () => toast("Please approve the transaction"),
  ENCRYPTION_FAILED: () => toast("Encryption failed -- please retry"),
  TRANSACTION_REVERTED: (e) => toast(`Transaction failed: ${e.message}`),
  INSUFFICIENT_CONFIDENTIAL_BALANCE: (e) => toast(`Need ${e.requested}, have ${e.available}`),
  INSUFFICIENT_ERC20_BALANCE: (e) => toast(`Need ${e.requested}, have ${e.available}`),
  BALANCE_CHECK_UNAVAILABLE: () => toast("Sign to verify your balance first"),
  ERC20_READ_FAILED: () => toast("Could not read token balance -- check your connection"),
  _: () => toast("Something went wrong"),
});
```

The `_` wildcard catches any `ZamaError` not explicitly handled. If the error is not a `ZamaError` at all (and no `_` is provided), `matchZamaError` returns `undefined`.

Each handler receives the error class for its code, so subclass fields are available without a cast — `INSUFFICIENT_CONFIDENTIAL_BALANCE` hands you an `InsufficientConfidentialBalanceError` with `.available` / `.requested`, `RELAYER_REQUEST_FAILED` an error with `.statusCode`, and so on.

### 4. Handle specific errors

Here is a quick reference for the most common errors and how to respond:

| Code                                | Error class                            | Recommended action                                                                                                                                                                                                                                                                                                            |
| ----------------------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SIGNING_REJECTED`                  | `SigningRejectedError`                 | Show a retry prompt. The user needs to approve the wallet signature.                                                                                                                                                                                                                                                          |
| `SIGNING_FAILED`                    | `SigningFailedError`                   | Check wallet connectivity. Hardware wallets may need a firmware update.                                                                                                                                                                                                                                                       |
| `ENCRYPTION_FAILED`                 | `EncryptionFailedError`                | Check your CSP headers -- WASM execution needs `wasm-unsafe-eval`.                                                                                                                                                                                                                                                            |
| `DECRYPTION_FAILED`                 | `DecryptionFailedError`                | May indicate an interrupted unshield. Check for pending state with `getPendingUnshield()`.                                                                                                                                                                                                                                    |
| `TRANSACTION_REVERTED`              | `TransactionRevertedError`             | Inspect the revert reason. Common causes: insufficient balance, expired approval.                                                                                                                                                                                                                                             |
| `INVALID_KEYPAIR`                   | `InvalidTransportKeyPairError`         | The transport key pair is stale. Clear credentials and prompt for a fresh signature.                                                                                                                                                                                                                                          |
| `KEYPAIR_EXPIRED`                   | `TransportKeyPairExpiredError`         | Same as above -- the transport key pair TTL has elapsed.                                                                                                                                                                                                                                                                      |
| `REVOKED_KMS_CONTEXT`               | `RevokedKmsContextError`               | The SDK already evicted the dead permit. With a `SigningFailedError` as `cause`, the re-grant failed and the scope's other permits were kept: establish a new permit (for offline permits, [re-prepare and register](offline.md#offline-permits)). Otherwise retry after ~15 minutes (the on-chain validity check is cached). |
| `NO_CIPHERTEXT`                     | `NoCiphertextError`                    | Not an error per se. The account has never shielded. Show an empty state in your UI.                                                                                                                                                                                                                                          |
| `RELAYER_REQUEST_FAILED`            | `RelayerRequestFailedError`            | Verify `relayerUrl` in your config. If using API key auth, check the `auth` option. On a 429, see "Retry transient failures" below.                                                                                                                                                                                           |
| `RPC_RATE_LIMITED`                  | `RpcRateLimitError`                    | See "Retry transient failures" below -- consider a higher-throughput RPC endpoint.                                                                                                                                                                                                                                            |
| `DELEGATION_NOT_PROPAGATED`         | `DelegationNotPropagatedError`         | See "Retry transient failures" below.                                                                                                                                                                                                                                                                                         |
| `NOT_ENTITLED`                      | `NotEntitledError`                     | Terminal -- don't retry. Wait for an on-chain ACL grant (`FHE.allow`), or a backfill once it lands.                                                                                                                                                                                                                           |
| `CONFIGURATION`                     | `ConfigurationError`                   | Invalid SDK configuration or FHE runtime failed to initialize. Check your transport config and CSP headers.                                                                                                                                                                                                                   |
| `INSUFFICIENT_CONFIDENTIAL_BALANCE` | `InsufficientConfidentialBalanceError` | Show the user their balance and the shortfall. The operation needs more confidential tokens.                                                                                                                                                                                                                                  |
| `INSUFFICIENT_ERC20_BALANCE`        | `InsufficientERC20BalanceError`        | Show the user their public token balance. They need more tokens before shielding.                                                                                                                                                                                                                                             |
| `INSUFFICIENT_ALLOWANCE`            | `InsufficientAllowanceError`           | Only from a manual `wrap()`. Call `approveUnderlying()` for the amount first, then retry. Prefer `shield()`, which approves automatically.                                                                                                                                                                                    |
| `BALANCE_CHECK_UNAVAILABLE`         | `BalanceCheckUnavailableError`         | Call `sdk.permits.grantPermit([token.address])` to sign permits, or pass `skipBalanceCheck: true` to bypass (useful for smart wallets).                                                                                                                                                                                       |
| `ERC20_READ_FAILED`                 | `ERC20ReadFailedError`                 | Check network connectivity and RPC endpoint. Retry the shield operation.                                                                                                                                                                                                                                                      |
| `SIGNER_REQUIRED`                   | `SignerRequiredError`                  | Connect a wallet. The operation requires a signer but the SDK was configured without one.                                                                                                                                                                                                                                     |
| `DELEGATION_SELF_NOT_ALLOWED`       | `DelegationSelfNotAllowedError`        | Cannot delegate to yourself. Use a different delegate address.                                                                                                                                                                                                                                                                |
| `DELEGATION_COOLDOWN`               | `DelegationCooldownError`              | Wait for the next block before retrying delegate/revoke on the same tuple.                                                                                                                                                                                                                                                    |
| `DELEGATION_NOT_FOUND`              | `DelegationNotFoundError`              | No active delegation exists. Verify the delegator, delegate, and contract addresses.                                                                                                                                                                                                                                          |
| `DELEGATION_EXPIRED`                | `DelegationExpiredError`               | The delegation has expired. Create a new delegation.                                                                                                                                                                                                                                                                          |
| `SIGNER_NOT_CONFIGURED`             | `SignerNotConfiguredError`             | The SDK was built without a signer. Pass one to `createConfig`, or connect a wallet.                                                                                                                                                                                                                                          |
| `WALLET_NOT_CONNECTED`              | `WalletNotConnectedError`              | A signer exists but no wallet account is connected. Prompt the user to connect.                                                                                                                                                                                                                                               |
| `WALLET_ACCOUNT_NOT_READY`          | `WalletAccountNotReadyError`           | The wallet adapter is still resolving its account. Wait for the connection to settle, then retry.                                                                                                                                                                                                                             |
| `CHAIN_MISMATCH`                    | `ChainMismatchError`                   | The wallet is on a different chain than the operation targets. Prompt the user to switch networks.                                                                                                                                                                                                                            |

### 5. Distinguish "no balance" from "zero balance"

{% hint style="info" %}
Available in the Core SDK and React SDK.
{% endhint %}

This is a common source of confusion. They require different UI treatments:

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { NoCiphertextError } from "@zama-fhe/sdk";

try {
  const balance = await token.balanceOf(address);
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
{% tab title="React SDK" %}

```tsx
import { NoCiphertextError } from "@zama-fhe/sdk";
import { useConfidentialBalance } from "@zama-fhe/react-sdk";

const { data: balance, error } = useConfidentialBalance({ address: "0xToken", account });

if (error instanceof NoCiphertextError) {
  // No encrypted balance exists -- "no balance"
  return <EmptyState label="Shield tokens to get started" />;
}
// balance can still be 0n -- render "Balance: 0" in that case
```

{% endtab %}
{% endtabs %}

See [Check Balances](check-balances.md) for more detail on balance handling patterns.

### 6. Use matchZamaError in React components

The `matchZamaError` helper works the same way in React. Here is a reusable error component:

```tsx
import { matchZamaError } from "@zama-fhe/sdk";

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

When `matchZamaError` returns `undefined` (because the error is not a `ZamaError`), the component falls back to `error.message`.

### 7. Common problems troubleshooting

| What you see                                                             | Why                                                          | Fix                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SigningRejectedError` (`SIGNING_REJECTED`) on every decrypt             | Wallet rejected the EIP-712 signature                        | Make sure the wallet supports `eth_signTypedData_v4`. Some hardware wallets need a firmware update.                                                                                                                   |
| Balance always `undefined`                                               | Encrypted value is zero (never shielded)                     | Check if the user has shielded tokens first. Catch `NoCiphertextError` (`NO_CIPHERTEXT`).                                                                                                                             |
| `ConfigurationError` (`CONFIGURATION`) on first operation                | FHE runtime failed to initialize                             | Check your CSP headers -- the FHE runtime needs `wasm-unsafe-eval`. Check transport config.                                                                                                                           |
| `EncryptionFailedError` (`ENCRYPTION_FAILED`)                            | FHE encryption failed during an operation                    | Check your CSP headers -- the FHE runtime needs `wasm-unsafe-eval`.                                                                                                                                                   |
| `DecryptionFailedError` (`DECRYPTION_FAILED`) after page reload          | Unshield was interrupted                                     | Use `getPendingUnshield()` on mount to detect and `resumeUnshield()` to complete it.                                                                                                                                  |
| `UnshieldAlreadyFinalizedError` (`UNSHIELD_ALREADY_FINALIZED`) on resume | Unwrap was already finalized before the resume attempt       | Funds already arrived -- treat as completion, not failure. `useResumeUnshield` refreshes balances automatically; if calling `resumeUnshield()` directly, catch this error and dismiss the prompt instead of retrying. |
| `RelayerRequestFailedError` (`RELAYER_REQUEST_FAILED`)                   | Relayer URL wrong or auth missing                            | Verify `relayerUrl` in your transport config. If using API key auth, check the `auth` option.                                                                                                                         |
| Go or Rust error with no SDK code                                        | The daemon connection or a callback channel failed           | Follow [Monitor and troubleshoot](../native/operations/monitor-and-troubleshoot.md) and [Recover from disconnections](../native/guides/recover-from-disconnections.md).                                               |
| Go or Rust error with a daemon code, such as `CONTEXT_NOT_FOUND`         | The daemon rejected the request or closed a callback channel | Look up the code in [Daemon error codes](../native/reference/error-codes.md).                                                                                                                                         |

### 8. Retry transient failures

Five causes are transient — the operation can simply be retried, ideally with backoff: `RpcRateLimitError` (`RPC_RATE_LIMITED`), `RelayerRequestFailedError` (`RELAYER_REQUEST_FAILED`, only on a 429, or an `@fhevm/sdk` relayer timeout), `DelegationNotPropagatedError` (`DELEGATION_NOT_PROPAGATED`), `DelegationCooldownError` (`DELEGATION_COOLDOWN`), and `WalletAccountNotReadyError` (`WALLET_ACCOUNT_NOT_READY`). Rather than hardcoding that set of codes, use `isRetryable(error)` and `retryAfterSeconds(error)` — they stay correct as the taxonomy grows, since every `ZamaError` declares its own `.retryable`.

| Cause                                                        | `retryAfterSeconds`                               | Notes                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `RpcRateLimitError` (`RPC_RATE_LIMITED`)                     | Usually `undefined` (viem/ethers own the backoff) | Consider a higher-throughput RPC endpoint.                                                              |
| `RelayerRequestFailedError` (`RELAYER_REQUEST_FAILED`)       | Set on a 429 with a `Retry-After` header          | Retryable on `.statusCode === 429` or an `@fhevm/sdk` relayer timeout; other statuses are terminal.     |
| `DelegationNotPropagatedError` (`DELEGATION_NOT_PROPAGATED`) | `undefined`                                       | The SDK already rides out the propagation window internally; only surfaces if it's exceeded.            |
| `DelegationCooldownError` (`DELEGATION_COOLDOWN`)            | `undefined`                                       | Per-block timing gate; resolves on the next block.                                                      |
| `WalletAccountNotReadyError` (`WALLET_ACCOUNT_NOT_READY`)    | `undefined`                                       | Async signer adapters (e.g. `EthersSigner`) refresh once internally; only surfaces if still unresolved. |

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { isRetryable, retryAfterSeconds } from "@zama-fhe/sdk";

async function decryptWithRetry(fn: () => Promise<bigint>, maxAttempts = 3): Promise<bigint> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (!isRetryable(error) || attempt >= maxAttempts) {
        throw error; // terminal, or out of attempts -- surface it
      }
      const delaySeconds = retryAfterSeconds(error) ?? attempt * 2; // backoff when the server gives no hint
      await new Promise((resolve) => setTimeout(resolve, delaySeconds * 1000));
    }
  }
}
```

{% endtab %}
{% tab title="React SDK" %}

Feed the same helpers into React Query's `retry` and `retryDelay` — per hook, or globally on your `QueryClient`:

```tsx
import { isRetryable, retryAfterSeconds } from "@zama-fhe/sdk";
import { useConfidentialBalance } from "@zama-fhe/react-sdk";

const { data } = useConfidentialBalance(
  { address: "0xToken", account },
  {
    retry: (attempt, error) => isRetryable(error) && attempt < 3,
    retryDelay: (attempt, error) => (retryAfterSeconds(error) ?? attempt * 2) * 1000,
  },
);
```

{% endtab %}
{% tab title="Go" %}

```go
import (
	"context"
	"errors"
	"math/big"
	"time"

	zama "github.com/zama-ai/sdk/clients/go/v3"
)

func decryptWithRetry(ctx context.Context, fn func(context.Context) (*big.Int, error), maxAttempts int) (*big.Int, error) {
	for attempt := 1; ; attempt++ {
		value, err := fn(ctx)
		if err == nil {
			return value, nil
		}
		var sdkErr *zama.SDKError
		if !errors.As(err, &sdkErr) || !sdkErr.Retryable || attempt >= maxAttempts {
			return nil, err // terminal, or out of attempts -- surface it
		}
		delay := time.Duration(attempt*2) * time.Second // backoff when the server gives no hint
		if sdkErr.RetryAfterSeconds != nil {
			delay = time.Duration(*sdkErr.RetryAfterSeconds) * time.Second
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(delay):
		}
	}
}
```

Never repeat a write on `Retryable` alone: when `zama.IsOutcomeUnknown(err)` is true, it might have been submitted. [Resolve the outcome](../native/guides/uncertain-transaction-outcomes.md) first.

{% endtab %}
{% tab title="Rust" %}

```rust
use std::{future::Future, time::Duration};
use zama_sdk::{BigInt, Result};

async fn decrypt_with_retry<F, Fut>(mut fetch: F, max_attempts: u32) -> Result<BigInt>
where
    F: FnMut() -> Fut,
    Fut: Future<Output = Result<BigInt>>,
{
    let mut attempt = 1;
    loop {
        let error = match fetch().await {
            Ok(value) => return Ok(value),
            Err(error) => error,
        };
        let retry_after = match error.sdk_error() {
            Some(details) if details.retryable && attempt < max_attempts => {
                details.retry_after_seconds
            }
            _ => return Err(error), // terminal, or out of attempts -- surface it
        };
        let delay_seconds = retry_after.unwrap_or(attempt * 2); // backoff when the server gives no hint
        tokio::time::sleep(Duration::from_secs(delay_seconds.into())).await;
        attempt += 1;
    }
}
```

Never repeat a write on `retryable` alone: when `error.is_outcome_unknown()` is true, it might have been submitted. [Resolve the outcome](../native/guides/uncertain-transaction-outcomes.md) first.

{% endtab %}
{% endtabs %}

Never retry when `isRetryable(error)` is `false` -- a `NotEntitledError`, for example, means the ACL grant is missing and retrying just busy-loops.

`isRetryable()` reflects the SDK's own classification, not a guarantee about the underlying cause: a network blip the SDK can't structurally recognize still falls back to a non-retryable `DecryptionFailedError`.

## Next steps

- See [Error types reference](../reference/sdk/errors.md) for the full error type reference.
- See [Hooks](../reference/react/query-keys.md) for error handling patterns with React Query.
- For interrupted unshields specifically, see [Unshield Tokens](unshield-tokens.md).
