---
title: Delegated decryption
description: Grant another address the right to decrypt confidential balances, then read those balances as a delegate, in TypeScript, React, Go, or Rust.
---

# Delegated decryption

Delegation lets one address grant another address the right to decrypt its confidential balances. The delegate never receives the delegator's private keys — they use their own transport key pair and a delegated EIP-712 flow to prove they have permission.

Common use cases:

- **Portfolio dashboards** — a read-only service decrypts balances across wallets without holding keys.
- **Auditors** — a third party verifies holdings without the token owner being online.

This guide uses `sdk.delegations` and `token.decryptBalanceAs` in the core SDK, or the `useDelegateDecryption` and `useDecryptBalanceAs` hooks in React. Before starting, make sure your project is set up following the [Configuration](./configuration.md) guide.

## Example

{% hint style="info" %}
Available in the Core SDK and React SDK.
{% endhint %}

A complete delegation flow — grant, then decrypt as delegate (the SDK rides out ACL propagation for you):

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { createConfig, ZamaSDK } from "@zama-fhe/sdk";
import { sepolia } from "@zama-fhe/sdk/chains";

const sdk = new ZamaSDK(config); // config from createConfig()
const token = sdk.createToken("0xConfidentialToken");

// 1. Delegator grants decryption rights
const { txHash } = await sdk.delegations.delegateDecryption({
  contractAddress: token.address,
  delegateAddress: "0xDelegate",
});

// 2. Delegate reads the delegator's balance — no wait needed. Propagation
//    usually completes within ~10 blocks (a few seconds), and the SDK retries
//    across that window internally.
const balance = await token.decryptBalanceAs({ delegatorAddress: "0xDelegator" });
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useDelegateDecryption, useDecryptBalanceAs } from "@zama-fhe/react-sdk";

const TOKEN = "0xConfidentialToken";

// 1. Delegator grants decryption rights
const { mutateAsync: delegate } = useDelegateDecryption(TOKEN);
await delegate({ delegateAddress: "0xDelegate" });

// 2. Delegate reads the delegator's balance — the SDK rides out ACL propagation
const { mutateAsync: decryptAs } = useDecryptBalanceAs(TOKEN);
const balance = await decryptAs({ delegatorAddress: "0xDelegator" });
```

{% endtab %}
{% endtabs %}

## Steps

### 1. Grant delegation

The token owner grants a delegate the right to decrypt their balance for a specific contract. Each call grants delegation for a single `(contractAddress, delegateAddress)` pair and submits one on-chain transaction, returning `{ txHash, receipt }`.

{% tabs %}
{% tab title="Core SDK" %}

```ts
// Permanent delegation (no expiration)
await sdk.delegations.delegateDecryption({
  contractAddress: token.address,
  delegateAddress: "0xDelegate",
});

// Delegation with an expiration date
await sdk.delegations.delegateDecryption({
  contractAddress: token.address,
  delegateAddress: "0xDelegate",
  expirationDate: new Date("2027-12-31T00:00:00Z"),
});
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useDelegateDecryption } from "@zama-fhe/react-sdk";

const { mutateAsync: delegate } = useDelegateDecryption("0xConfidentialToken");

// Permanent delegation (no expiration)
await delegate({ delegateAddress: "0xDelegate" });

// Delegation with an expiration date
await delegate({ delegateAddress: "0xDelegate", expirationDate: new Date("2027-12-31T00:00:00Z") });
```

{% endtab %}
{% tab title="Go" %}

```go
// Permanent delegation (no expiration)
_, err := sdk.DelegateDecryption(ctx, zama.DelegateDecryptionParams{
	ContractAddress: token,
	DelegateAddress: delegate,
})
if err != nil {
	return err
}

// Delegation with an expiration date
expiry := time.Date(2027, time.December, 31, 0, 0, 0, 0, time.UTC)
_, err = sdk.DelegateDecryption(ctx, zama.DelegateDecryptionParams{
	ContractAddress: token,
	DelegateAddress: delegate,
	ExpirationDate:  &expiry,
})
if err != nil {
	return err
}
```

{% endtab %}
{% tab title="Rust" %}

```rust
use std::time::{Duration, UNIX_EPOCH};
use zama_sdk::DelegateDecryptionParams;

// Permanent delegation (no expiration)
sdk.delegations()
    .delegate_decryption(DelegateDecryptionParams {
        contract_address: token,
        delegate_address: delegate,
        expiration_date_ms: None,
    })
    .await?;

// Delegation with an expiration date (2027-12-31T00:00:00Z)
let expiry = UNIX_EPOCH + Duration::from_secs(1_830_211_200);
let params = DelegateDecryptionParams::expiring_at(token, delegate, expiry)?;
sdk.delegations().delegate_decryption(params).await?;
```

{% endtab %}
{% endtabs %}

{% hint style="warning" %}
The expiration date must be **at least 1 hour in the future**. Passing a closer date throws `DelegationExpirationTooSoonError` (`DELEGATION_EXPIRATION_TOO_SOON`) before the transaction is sent.
{% endhint %}

### 2. ACL propagation (handled for you)

After the delegation transaction is mined, the Zama Gateway (on Arbitrum) syncs the ACL state via cross-chain event propagation — usually within ~10 blocks (a few seconds). You don't need to wait or poll: the delegated-decrypt path rides out that window with a bounded internal retry (~30s), so a decrypt issued right after granting simply waits for sync.

{% hint style="info" %}
`DelegationNotPropagatedError` (`DELEGATION_NOT_PROPAGATED`) only surfaces if propagation outlasts the retry budget (rare) — or if you opt out of the wait with `waitForPropagation: false` on `sdk.decryption.delegatedDecryptValues` to fail fast instead.
{% endhint %}

### 3. Decrypt as delegate

The delegate reads the delegator's balance. The delegate signs with their own wallet, and the relayer verifies the on-chain delegation before decrypting.

{% tabs %}
{% tab title="Core SDK" %}

```ts
const balance = await token.decryptBalanceAs({ delegatorAddress: "0xDelegator" });

// When the balance holder differs from the delegator, pass accountAddress explicitly:
const other = await token.decryptBalanceAs({
  delegatorAddress: "0xDelegator",
  accountAddress: "0xBalanceHolder",
});
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useDecryptBalanceAs } from "@zama-fhe/react-sdk";

const { mutateAsync: decryptAs, data: balance } = useDecryptBalanceAs("0xConfidentialToken");

await decryptAs({ delegatorAddress: "0xDelegator" });

// When the balance holder differs from the delegator, pass accountAddress explicitly:
await decryptAs({ delegatorAddress: "0xDelegator", accountAddress: "0xBalanceHolder" });
```

{% endtab %}
{% tab title="Go" %}

Pass the encrypted balance your application read from the token contract.

```go
inputs := []zama.EncryptedInput{{EncryptedValue: encryptedBalance, ContractAddress: token}}
balances, err := sdk.DelegatedDecryptValues(ctx, inputs, delegator, zama.DelegatedDecryptOptions{})
if err != nil {
	return err
}
balance := balances[encryptedBalance].Integer

// When the balance holder differs from the delegator, pass AccountAddress explicitly:
other, err := sdk.DelegatedDecryptValues(ctx, inputs, delegator, zama.DelegatedDecryptOptions{
	AccountAddress: &balanceHolder,
})
if err != nil {
	return err
}
```

{% endtab %}
{% tab title="Rust" %}

Pass the encrypted balance your application read from the token contract.

```rust
use zama_sdk::{ClearValue, DelegatedOptions, EncryptedInput};

let inputs = [EncryptedInput {
    encrypted_value: encrypted_balance,
    contract_address: token,
}];
let balances = sdk
    .decryption()
    .delegated_decrypt_values(&inputs, delegator, DelegatedOptions::default())
    .await?;
let balance = balances.get(&encrypted_balance);

// When the balance holder differs from the delegator, pass account_address explicitly:
let other = sdk
    .decryption()
    .delegated_decrypt_values(
        &inputs,
        delegator,
        DelegatedOptions {
            account_address: Some(balance_holder),
            ..Default::default()
        },
    )
    .await?;
```

{% endtab %}
{% endtabs %}

Clear values are cached in storage, keyed by `(accountAddress, token, encryptedValue)`. Every on-chain balance change produces a new encrypted value, so stale cache entries are never served.

### 4. Check delegation status (optional)

Query whether a delegation is currently active between a delegator and a delegate, along with its expiry:

{% tabs %}
{% tab title="Core SDK" %}

```ts
const { isActive, expiryTimestamp } = await sdk.delegations.getStatus({
  contractAddress: token.address,
  delegatorAddress: "0xDelegator",
  delegateAddress: "0xDelegate",
});
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useDelegationStatus } from "@zama-fhe/react-sdk";

const { data } = useDelegationStatus({
  contractAddress: "0xConfidentialToken",
  delegatorAddress: "0xDelegator",
  delegateAddress: "0xDelegate",
});

// data?.isActive, data?.expiryTimestamp
```

{% endtab %}
{% tab title="Go" %}

```go
status, err := sdk.GetDelegationStatus(ctx, zama.DelegationQuery{
	ContractAddress:  token,
	DelegatorAddress: delegator,
	DelegateAddress:  delegate,
})
if err != nil {
	return err
}

// status.IsActive, status.ExpiryTimestamp
```

{% endtab %}
{% tab title="Rust" %}

```rust
use zama_sdk::DelegationQuery;

let status = sdk
    .delegations()
    .get_status(DelegationQuery {
        contract_address: token,
        delegator_address: delegator,
        delegate_address: delegate,
    })
    .await?;

// status.is_active, status.expiry_timestamp
```

{% endtab %}
{% endtabs %}

### 5. Batch decryption across tokens (optional)

Decrypt balances across multiple tokens in a single call. The result is a `Map<Address, bigint>`.

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { Token } from "@zama-fhe/sdk";

const tokens = addresses.map((a) => sdk.createToken(a));

// Without `onError`, a single failing token rejects the whole call and discards the
// map. Pass `onError` for a partial result: it's called once per failed token and its
// return value becomes that token's entry. `maxConcurrency` caps parallel decryptions.
const balances = await Token.batchDecryptBalancesAs(tokens, {
  delegatorAddress: "0xDelegator",
  maxConcurrency: 3,
  onError: (err, addr) => {
    console.error(addr, err);
    return 0n;
  },
});

for (const [address, balance] of balances) {
  console.log(`${address}: ${balance}`);
}
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useMemo } from "react";
import { useBatchDecryptBalancesAs, useZamaSDK } from "@zama-fhe/react-sdk";

// Build Token instances with the SDK factory, not `useToken` — hooks can't be called in a loop.
const sdk = useZamaSDK();
const tokens = useMemo(() => addresses.map((a) => sdk.createToken(a)), [sdk, addresses]);

const { mutateAsync: batchDecryptAs } = useBatchDecryptBalancesAs(tokens);

try {
  const balances = await batchDecryptAs({ delegatorAddress: "0xDelegator" });
  // balances is a Map<Address, bigint>. Any single token failing rejects the whole call.
} catch (err) {
  console.error(err);
}
```

{% endtab %}
{% tab title="Go" %}

Pass one encrypted balance per token. Each item carries its own value or error, so one failing token does not reject the batch.

```go
maxConcurrency := uint32(3)
items, err := sdk.DelegatedBatchDecryptValues(ctx, inputs, delegator, zama.DelegatedBatchOptions{
	MaxConcurrency: &maxConcurrency,
})
if err != nil {
	return err
}

for _, item := range items {
	if item.Error != nil {
		fmt.Println(item.ContractAddress, item.Error)
		continue
	}
	fmt.Printf("%s: %s\n", item.ContractAddress, item.Value.Integer)
}
```

{% endtab %}
{% tab title="Rust" %}

Pass one encrypted balance per token. Each item carries its own value or error, so one failing token does not reject the batch.

```rust
use zama_sdk::{ClearValue, DelegatedBatchOptions};

let items = sdk
    .decryption()
    .delegated_batch_decrypt_values(
        &inputs,
        delegator,
        DelegatedBatchOptions {
            max_concurrency: Some(3),
            ..Default::default()
        },
    )
    .await?;

for item in items {
    match item.result {
        Ok(ClearValue::BigInt(balance)) => println!("{}: {balance}", item.contract_address),
        Ok(other) => println!("{}: {other:?}", item.contract_address),
        Err(error) => eprintln!("{}: {}", item.contract_address, error.code),
    }
}
```

{% endtab %}
{% endtabs %}

### 6. Delegate for all contracts with the wildcard address (optional)

Instead of granting delegation one contract at a time, pass `WILDCARD_CONTRACT` as `contractAddress`. The delegation then applies to any confidential contract, including ones deployed later. It does not widen access: the delegate can only read what the delegator can already read on each contract. `WILDCARD_CONTRACT` is only valid as `contractAddress`. `getStatus` and `getExpiry` for a specific contract also reflect a wildcard-only grant, so existing status checks keep working.

{% tabs %}
{% tab title="Core SDK" %}

```ts
import { WILDCARD_CONTRACT } from "@zama-fhe/sdk";

await sdk.delegations.delegateDecryption({
  contractAddress: WILDCARD_CONTRACT,
  delegateAddress: "0xDelegate",
});
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { WILDCARD_CONTRACT } from "@zama-fhe/sdk";
import { useDelegateDecryption } from "@zama-fhe/react-sdk";

const { mutateAsync: delegate } = useDelegateDecryption(WILDCARD_CONTRACT);
await delegate({ delegateAddress: "0xDelegate" });
```

{% endtab %}
{% endtabs %}

{% hint style="info" %}
Wildcard and per-contract delegations to the same delegate can coexist — `ACL.sol` honors both. If a per-contract grant would be redundant because the delegate already holds an active wildcard grant, `delegateDecryption` logs a warning; it still submits the transaction.
{% endhint %}

### 7. Revoke delegation (optional)

{% tabs %}
{% tab title="Core SDK" %}

```ts
await sdk.delegations.revokeDelegation({
  contractAddress: token.address,
  delegateAddress: "0xDelegate",
});
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { useRevokeDelegation } from "@zama-fhe/react-sdk";

const { mutateAsync: revoke } = useRevokeDelegation("0xConfidentialToken");

await revoke({ delegateAddress: "0xDelegate" });
```

{% endtab %}
{% tab title="Go" %}

```go
_, err := sdk.RevokeDelegation(ctx, zama.RevokeDelegationParams{
	ContractAddress: token,
	DelegateAddress: delegate,
})
if err != nil {
	return err
}
```

{% endtab %}
{% tab title="Rust" %}

```rust
use zama_sdk::RevokeDelegationParams;

sdk.delegations()
    .revoke_delegation(RevokeDelegationParams {
        contract_address: token,
        delegate_address: delegate,
    })
    .await?;
```

{% endtab %}
{% endtabs %}

### 8. Handle errors (optional)

Delegation operations can throw several error types. The most common:

{% tabs %}
{% tab title="Core SDK" %}

```ts
import {
  DelegationNotPropagatedError,
  DelegationExpirationTooSoonError,
  SigningRejectedError,
  DecryptionFailedError,
  TransactionRevertedError,
} from "@zama-fhe/sdk";

try {
  await sdk.delegations.delegateDecryption({
    contractAddress: token.address,
    delegateAddress: "0xDelegate",
  });
} catch (error) {
  if (error instanceof DelegationExpirationTooSoonError) {
    // expiration date is less than 1 hour in the future
  } else if (error instanceof TransactionRevertedError) {
    // on-chain transaction failed
  }
}

try {
  const balance = await token.decryptBalanceAs({ delegatorAddress: "0xDelegator" });
} catch (error) {
  if (error instanceof SigningRejectedError) {
    // user cancelled the wallet prompt — do not retry automatically
  } else if (error instanceof DelegationNotPropagatedError) {
    // delegation still hadn't synced after the SDK's internal retry — rare; retry shortly
  } else if (error instanceof DecryptionFailedError) {
    // delegated decryption failed
  }
}
```

{% endtab %}
{% tab title="React SDK" %}

```tsx
import { DelegationNotPropagatedError, SigningRejectedError } from "@zama-fhe/sdk";
import { useDecryptBalanceAs } from "@zama-fhe/react-sdk";

const { mutateAsync: decryptAs, error } = useDecryptBalanceAs("0xConfidentialToken");

// The mutation's `error` is a ZamaError subclass — narrow it with `instanceof`:
if (error instanceof SigningRejectedError) {
  // user cancelled the wallet prompt — do not retry automatically
} else if (error instanceof DelegationNotPropagatedError) {
  // delegation still hadn't synced after the SDK's internal retry — rare; retry shortly
}
```

{% endtab %}
{% tab title="Go" %}

```go
var sdkErr *zama.SDKError

_, err := sdk.DelegateDecryption(ctx, zama.DelegateDecryptionParams{
	ContractAddress: token,
	DelegateAddress: delegate,
})
if errors.As(err, &sdkErr) {
	switch sdkErr.Code {
	case "DELEGATION_EXPIRATION_TOO_SOON":
		// expiration date is less than 1 hour in the future
	case "TRANSACTION_REVERTED":
		// on-chain transaction failed
	}
}

_, err = sdk.DelegatedDecryptValues(ctx, inputs, delegator, zama.DelegatedDecryptOptions{})
if errors.As(err, &sdkErr) {
	switch sdkErr.Code {
	case zama.CodeSigningRejected:
		// user cancelled the wallet prompt: do not retry automatically
	case "DELEGATION_NOT_PROPAGATED":
		// delegation still hadn't synced after the SDK's internal retry: rare, retry shortly
	case "DECRYPTION_FAILED":
		// delegated decryption failed
	}
}
```

{% endtab %}
{% tab title="Rust" %}

```rust
use zama_sdk::{DelegateDecryptionParams, DelegatedOptions};

let granted = sdk
    .delegations()
    .delegate_decryption(DelegateDecryptionParams {
        contract_address: token,
        delegate_address: delegate,
        expiration_date_ms: None,
    })
    .await;
if let Err(error) = granted {
    match error.sdk_error().map(|details| details.code.as_str()) {
        Some("DELEGATION_EXPIRATION_TOO_SOON") => {
            // expiration date is less than 1 hour in the future
        }
        Some("TRANSACTION_REVERTED") => {
            // on-chain transaction failed
        }
        _ => {}
    }
}

let decrypted = sdk
    .decryption()
    .delegated_decrypt_values(&inputs, delegator, DelegatedOptions::default())
    .await;
if let Err(error) = decrypted {
    match error.sdk_error().map(|details| details.code.as_str()) {
        Some("SIGNING_REJECTED") => {
            // user cancelled the wallet prompt: do not retry automatically
        }
        Some("DELEGATION_NOT_PROPAGATED") => {
            // delegation still hadn't synced after the SDK's internal retry: rare, retry shortly
        }
        Some("DECRYPTION_FAILED") => {
            // delegated decryption failed
        }
        _ => {}
    }
}
```

{% endtab %}
{% endtabs %}

See [Handle errors](./handle-errors.md) for full error-handling patterns and [Error types](../reference/sdk/errors.md) for the complete list.

## Next steps

- [Delegations reference](../reference/sdk/delegation.md) — full `Delegations` namespace API
- [useDelegateDecryption](../reference/react/useDelegateDecryption.md) — React hook to grant delegation
- [useDecryptBalanceAs](../reference/react/useDecryptBalanceAs.md) — React hook to decrypt as a delegate
- [useDelegationStatus](../reference/react/useDelegationStatus.md) — React hook to query delegation status
- [Go client API](../native/reference/go-client.md) and [Rust client API](../native/reference/rust-client.md)
