---
title: useBatchRegisterPermits
description: Mutation hook that verifies and persists the signatures an out-of-process signer produced for a list of prepared decryption permits.
---

# useBatchRegisterPermits

[`useRegisterPermit`](./useRegisterPermit.md) for every [`useBatchPreparePermits`](./useBatchPreparePermits.md) payload, each paired with its signature. Permits are registered in order; if one fails, the ones before it stay registered, and because registration is idempotent you can retry with the full list. Automatically invalidates [`useHasPermit`](./useHasPermit.md) queries on success.

## Import

```ts
import { useBatchRegisterPermits } from "@zama-fhe/react-sdk";
```

## Usage

```tsx
import { useBatchPreparePermits, useBatchRegisterPermits } from "@zama-fhe/react-sdk";

function CustodyPermitsFlow({
  signerAddress,
  tokenAddresses,
}: {
  signerAddress: `0x${string}`;
  tokenAddresses: `0x${string}`[];
}) {
  const { mutateAsync: batchPreparePermits } = useBatchPreparePermits();
  const { mutateAsync: batchRegisterPermits, isPending } = useBatchRegisterPermits();

  const handleAuthorize = async () => {
    const prepared = await batchPreparePermits({
      signer: signerAddress,
      contracts: tokenAddresses,
    });
    const signed = await Promise.all(
      prepared.map(async (p) => ({
        prepared: p,
        signature: await custodyApi.signTypedData(p.eip712),
      })),
    );
    await batchRegisterPermits(signed);
  };

  return (
    <button onClick={handleAuthorize} disabled={isPending}>
      {isPending ? "Registering..." : "Complete offline authorization"}
    </button>
  );
}
```

## Parameters

`useBatchRegisterPermits` takes no configuration parameters.

## Mutation variables

### permits

`SignedPreparedPermit[]` — one entry per element `useBatchPreparePermits` returned:

| Field       | Type             | Meaning                                                     |
| ----------- | ---------------- | ----------------------------------------------------------- |
| `prepared`  | `PreparedPermit` | one of the payloads `useBatchPreparePermits` returned       |
| `signature` | `Hex`            | the `eth_signTypedData_v4` signature over `prepared.eip712` |

## Return Type

Returns a standard TanStack Query `UseMutationResult<void, Error, SignedPreparedPermit[]>`.

{% include ".gitbook/includes/mutation-result.md" %}

**Throws:** whatever [`useRegisterPermit`](./useRegisterPermit.md) throws for the failing permit.

## Related

- [`useBatchPreparePermits`](./useBatchPreparePermits.md) -- build the unsigned typed data this hook registers signatures for
- [`useRegisterPermit`](./useRegisterPermit.md) -- the single-permit form
- [Offline signing guide](../../guides/offline.md#offline-permits) -- the full offline permit workflow
- [ZamaSDK reference](../sdk/ZamaSDK.md#permits-batchregisterpermits) -- `sdk.permits.batchRegisterPermits`'s full signature
