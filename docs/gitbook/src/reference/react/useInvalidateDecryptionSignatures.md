---
title: useInvalidateDecryptionSignatures
description: Mutation hook that invalidates every decryption signature the connected signer has signed before a given timestamp.
---

# useInvalidateDecryptionSignatures

Mutation hook that invalidates every decryption signature the connected signer has signed before a given timestamp, via the on-chain ACL contract. Any decryption request whose permit predates the new cutoff is rejected by the KMS Connector afterward — the recourse when a permissive/wildcard permit or its signing key is compromised, or on a multisig (ERC-1271/Safe) owner rotation. Call this on every multisig signer rotation and on suspected signing-key compromise.

On success, the connected signer's locally-stored permits for the current chain are cleared automatically — they would now only fail against the KMS Connector.

## Import

```ts
import { useInvalidateDecryptionSignatures } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useInvalidateDecryptionSignatures } from "@zama-fhe/react-sdk";

function InvalidateAllButton() {
  const { mutateAsync: invalidate, isPending } = useInvalidateDecryptionSignatures();

  async function handleInvalidate() {
    const { txHash } = await invalidate({});
    console.log("Invalidated in", txHash);
  }

  return (
    <button onClick={handleInvalidate} disabled={isPending}>
      {isPending ? "Invalidating..." : "Invalidate All Signatures"}
    </button>
  );
}
```

{% endtab %}
{% endtabs %}

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time.

### timestamp

`Date` (optional)

Oldest timestamp that remains valid. Omit to invalidate everything signed up to now.

```ts
await invalidate({}); // invalidate everything up to now
await invalidate({ timestamp: new Date("2026-01-01") }); // invalidate up to a specific time
```

## Return Type

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [`sdk.permits.invalidateDecryptionSignatures`](../sdk/ZamaSDK.md#permits-invalidatedecryptionsignatures) -- underlying SDK method
- [`useRevokePermits`](./useRevokePermits.md) -- local-only permit removal, does not reach the KMS
- [Security model — Revocation](../../concepts/security-model.md#revocation) -- how this compares to the other two revocation mechanisms
