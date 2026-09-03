---
title: Delegated decryption
description: Grant another address the right to decrypt confidential balances, then read those balances as a delegate.
---

# Delegated decryption

Delegation lets one address grant another address the right to decrypt its confidential balances. The delegate never receives the delegator's private keys — they use their own transport key pair and a delegated EIP-712 flow to prove they have permission.

Common use cases:

- **Portfolio dashboards** — a read-only service decrypts balances across wallets without holding keys.
- **Auditors** — a third party verifies holdings without the token owner being online.

This guide uses `sdk.delegations` and `token.decryptBalanceAs` in the core SDK, or the `useDelegateDecryption` and `useDecryptBalanceAs` hooks in React. Before starting, make sure your project is set up following the [Configuration](./configuration.md) guide.

## Example

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
{% endtabs %}

{% hint style="warning" %}
The expiration date must be **at least 1 hour in the future**. Passing a closer date throws `DelegationExpirationTooSoonError` before the transaction is sent.
{% endhint %}

### 2. ACL propagation (handled for you)

After the delegation transaction is mined, the Zama Gateway (on Arbitrum) syncs the ACL state via cross-chain event propagation — usually within ~10 blocks (a few seconds). You don't need to wait or poll: the delegated-decrypt path rides out that window with a bounded internal retry (~30s), so a decrypt issued right after granting simply waits for sync.

{% hint style="info" %}
`DelegationNotPropagatedError` only surfaces if propagation outlasts the retry budget (rare) — or if you opt out of the wait with `waitForPropagation: false` on `sdk.decryption.delegatedDecryptValues` to fail fast instead.
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
{% endtabs %}

### 6. Delegate for all contracts with the wildcard address (optional)

Instead of granting delegation one contract at a time, pass `WILDCARD_CONTRACT` as `contractAddress` to cover every confidential contract the delegator owns — current and future. This is a plain ACL delegation to a reserved sentinel address; `ACL.sol` recognizes it and honors it for any contract checked via `isHandleDelegatedForUserDecryption`, not just the literal sentinel.

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

{% hint style="warning" %}
Once a delegate holds a wildcard grant, per-contract delegations to that same delegate are redundant — the wildcard already covers them. The SDK does not track prior grants across calls to detect the overlap, so avoid combining them yourself.
{% endhint %}

{% hint style="info" %}
**A second, related "wildcard" exists at the permit layer.** This section covers wildcard _delegation_ — an on-chain ACL grant from the delegator that lets a delegate skip naming each contract. `@zama-fhe/sdk` also has a wildcard _permit_ (`WILDCARD_PERMIT`), which lets the delegate skip naming each contract on their own signed permit instead. The two compose: decrypting on someone's behalf needs an active delegation covering the contract (specific or wildcard, this section) _and_ a permit covering it, held by the delegate (auto-signed per contract on each delegated decrypt, or granted up front as `WILDCARD_PERMIT` via `sdk.permits.grantDelegationPermit`). Granting one does not grant the other. See [Wildcard (V2) permits](../concepts/permit-model.md#wildcard-v2-permits) for the permit side.
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
{% endtabs %}

See [Handle errors](./handle-errors.md) for full error-handling patterns and [Error types](../reference/sdk/errors.md) for the complete list.

## Next steps

- [Delegations reference](../reference/sdk/delegation.md) — full `Delegations` namespace API
- [useDelegateDecryption](../reference/react/useDelegateDecryption.md) — React hook to grant delegation
- [useDecryptBalanceAs](../reference/react/useDecryptBalanceAs.md) — React hook to decrypt as a delegate
- [useDelegationStatus](../reference/react/useDelegationStatus.md) — React hook to query delegation status
