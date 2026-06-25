---
title: Delegated decryption
description: Grant another address the right to decrypt confidential balances, then read those balances as a delegate.
---

# Delegated decryption

Delegation lets one address grant another address the right to decrypt its confidential balances. The delegate never receives the delegator's private keys — they use their own transport key pair and a delegated EIP-712 flow to prove they have permission.

Common use cases:

- **Portfolio dashboards** — a read-only service decrypts balances across wallets without holding keys.
- **Auditors** — a third party verifies holdings without the token owner being online.

This guide uses `sdk.delegations` and `token.decryptBalanceAs`. Before starting, make sure your project is set up following the [Configuration](./configuration.md) guide.

## Example

A complete delegation flow — grant, wait for propagation, then decrypt as delegate:

{% tabs %}
{% tab title="SDK" %}

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

// 2. Wait 1–2 minutes for gateway propagation

// 3. Delegate reads the delegator's balance
const balance = await token.decryptBalanceAs({
  delegatorAddress: "0xDelegator",
});
```

{% endtab %}
{% endtabs %}

## Steps

### 1. Grant delegation

The token owner calls `sdk.delegations.delegateDecryption` to allow a delegate to decrypt their balance for a specific contract.

{% tabs %}
{% tab title="SDK" %}

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
{% endtabs %}

Both calls return `{ txHash, receipt }`.

{% hint style="warning" %}
The expiration date must be **at least 1 hour in the future**. Passing a closer date throws `DelegationExpirationTooSoonError` before the transaction is sent.
{% endhint %}

Each call grants delegation for a single `(contractAddress, delegateAddress)` pair and submits one on-chain transaction.

### 2. Wait for gateway propagation

{% hint style="warning" %}
After the delegation transaction is mined, wait **1–2 minutes** before calling `decryptBalanceAs`. The delegation is recorded on L1 immediately, but the gateway (on Arbitrum) must sync the ACL state via cross-chain event propagation. Attempting delegated decryption before propagation completes throws `DelegationNotPropagatedError`.
{% endhint %}

### Waiting for a delegation to become usable

The grant is recorded on the host chain immediately, but delegated decryption
only works once the gateway syncs it cross-chain. To wait proactively instead of
catching `DelegationNotPropagatedError`, poll the readiness query:

```ts
// Core SDK
let ready = false;
while (!ready) {
  ready = await sdk.delegations.isPropagated(
    [{ encryptedValue, contractAddress }],
    delegatorAddress,
  );
  if (!ready) await new Promise((r) => setTimeout(r, 2000));
}
```

```tsx
// React
const { data: ready } = useIsDelegationPropagated(
  { encryptedInputs: [{ encryptedValue, contractAddress }], delegatorAddress },
  { enabled: true, refetchInterval: 2000 },
);
```

`isPropagated` returns `false` while the grant is still syncing and `true` once
it is usable. A missing or expired grant throws instead — propagation readiness
assumes the grant already exists on the host chain.

### 3. Decrypt as delegate

The delegate calls `token.decryptBalanceAs` to read the delegator's balance. The delegate signs with their own wallet, and the relayer verifies the on-chain delegation before decrypting.

{% tabs %}
{% tab title="SDK" %}

```ts
const balance = await token.decryptBalanceAs({
  delegatorAddress: "0xDelegator",
});
```

{% endtab %}
{% endtabs %}

When the balance holder differs from the delegator, pass `accountAddress` explicitly:

```ts
const balance = await token.decryptBalanceAs({
  delegatorAddress: "0xDelegator",
  accountAddress: "0xBalanceHolder",
});
```

Clear values are cached in storage, keyed by `(accountAddress, token, encryptedValue)`. Every on-chain balance change produces a new encrypted value, so stale cache entries are never served.

### 4. Batch decryption across tokens (optional)

Decrypt balances across multiple tokens in a single call:

{% tabs %}
{% tab title="SDK" %}

```ts
import { Token } from "@zama-fhe/sdk";

const tokens = addresses.map((a) => sdk.createToken(a));

const balances = await Token.batchDecryptBalancesAs(tokens, {
  delegatorAddress: "0xDelegator",
});

// balances is a Map<Address, bigint>
for (const [address, balance] of balances) {
  console.log(`${address}: ${balance}`);
}
```

{% endtab %}
{% endtabs %}

Handle errors for individual tokens with `onError`:

```ts
const balances = await Token.batchDecryptBalancesAs(tokens, {
  delegatorAddress: "0xDelegator",
  maxConcurrency: 3,
  onError: (err, addr) => {
    console.error(addr, err);
    return 0n;
  },
});
```

### 5. Revoke delegation (optional)

```ts
await sdk.delegations.revokeDelegation({
  contractAddress: token.address,
  delegateAddress: "0xDelegate",
});
```

### 6. Handle errors (optional)

Delegation operations can throw several error types. The most common:

{% tabs %}
{% tab title="SDK" %}

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
  const balance = await token.decryptBalanceAs({
    delegatorAddress: "0xDelegator",
  });
} catch (error) {
  if (error instanceof SigningRejectedError) {
    // user cancelled the wallet prompt — do not retry automatically
  } else if (error instanceof DelegationNotPropagatedError) {
    // delegation hasn't synced to the gateway yet — retry after 1–2 minutes
  } else if (error instanceof DecryptionFailedError) {
    // delegated decryption failed
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
