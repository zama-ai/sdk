---
title: useBatchPreparePermits
description: Mutation hook that builds unsigned EIP-712 typed data for decryption permits covering any number of contracts, one permit per 10.
---

# useBatchPreparePermits

[`usePreparePermit`](./usePreparePermit.md) for any number of contracts. A permit holds at most 10, so `data` is an array with one `PreparedPermit` per chunk of 10 (a single element for 10 or fewer). Hand each `eip712` to the external signer for `eth_signTypedData_v4`, then pass the signed pairs to [`useBatchRegisterPermits`](./useBatchRegisterPermits.md).

## Import

```ts
import { useBatchPreparePermits } from "@zama-fhe/react-sdk";
```

## Usage

```tsx
import { useBatchPreparePermits } from "@zama-fhe/react-sdk";

function PrepareCustodyPermits({
  custodyAddress,
  tokenAddresses,
}: {
  custodyAddress: `0x${string}`;
  tokenAddresses: `0x${string}`[];
}) {
  const { mutateAsync: batchPreparePermits, isPending } = useBatchPreparePermits();

  const handlePrepare = async () => {
    const prepared = await batchPreparePermits({
      signer: custodyAddress,
      contracts: tokenAddresses,
    });
    // Hand each prepared[i].eip712 to the custody API for eth_signTypedData_v4,
    // then pass the { prepared, signature } pairs to useBatchRegisterPermits.
    return prepared;
  };

  return (
    <button onClick={handlePrepare} disabled={isPending}>
      {isPending ? "Preparing..." : "Prepare offline permits"}
    </button>
  );
}
```

## Parameters

`useBatchPreparePermits` takes no configuration parameters.

## Mutation variables

### request

`PreparePermitRequest` — the same fields as [`usePreparePermit`](./usePreparePermit.md#request), without the 10-address limit on `contracts`.

## Return Type

Returns a standard TanStack Query `UseMutationResult<PreparedPermit[], Error, PreparePermitRequest>`. `data` is an array of `PreparedPermit` — every field is JSON-safe, so it crosses a process boundary as-is.

{% include ".gitbook/includes/mutation-result.md" %}

**Throws:**

- `ConfigurationError` - `request.contracts` is empty, `request.delegator` equals `request.signer`, or `request.durationDays` exceeds the V1 permit maximum of 365 days
- `TransportKeyPairChangedError` - a concurrent `permits.revokeTransportKeyPair()` rotated the transport key pair while this call was generating one

## Related

- [`useBatchRegisterPermits`](./useBatchRegisterPermits.md) -- verify and persist the signatures returned for the prepared permits
- [`usePreparePermit`](./usePreparePermit.md) -- the single-permit form
- [Offline signing guide](../../guides/offline.md#offline-permits) -- the full offline permit workflow
- [Offline reference](../sdk/Offline.md#batchpreparepermits) -- `sdk.offline.batchPreparePermits`'s full signature and typed errors
