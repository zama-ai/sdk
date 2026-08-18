---
title: useRegisterPermit
description: Mutation hook that verifies and persists the signature an out-of-process signer produced for a prepared decryption permit.
---

# useRegisterPermit

Mutation hook that verifies and persists the signature an out-of-process signer produced for a [`usePreparePermit`](./usePreparePermit.md) payload — the second phase of the offline permit flow. No wallet account required: the permit is scoped by `prepared.signerAddress` (and `prepared.delegatorAddress`, if present), not a connected signer. Automatically invalidates [`useHasPermit`](./useHasPermit.md) queries on success.

## Import

```ts
import { useRegisterPermit } from "@zama-fhe/react-sdk";
```

## Usage

```tsx
import { usePreparePermit, useRegisterPermit } from "@zama-fhe/react-sdk";

function CustodyPermitFlow({
  custodyAddress,
  tokenAddress,
}: {
  custodyAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
}) {
  const { mutateAsync: preparePermit } = usePreparePermit();
  const { mutateAsync: registerPermit, isPending } = useRegisterPermit();

  const handleAuthorize = async () => {
    const prepared = await preparePermit({ signer: custodyAddress, contracts: [tokenAddress] });
    const signature = await custodyApi.signTypedData(prepared.eip712);
    await registerPermit({ prepared, signature });
  };

  return (
    <button onClick={handleAuthorize} disabled={isPending}>
      {isPending ? "Registering..." : "Complete offline authorization"}
    </button>
  );
}
```

## Parameters

`useRegisterPermit` takes no configuration parameters.

## Mutation variables

### params

`RegisterPermitParams`

| Field       | Type             | Meaning                                                     |
| ----------- | ---------------- | ----------------------------------------------------------- |
| `prepared`  | `PreparedPermit` | the payload `usePreparePermit` returned                     |
| `signature` | `Hex`            | the `eth_signTypedData_v4` signature over `prepared.eip712` |

```tsx
await registerPermit({ prepared, signature });
```

## Return Type

Returns a standard TanStack Query `UseMutationResult<void, Error, RegisterPermitParams>`.

{% include ".gitbook/includes/mutation-result.md" %}

**Throws:**

- `ConfigurationError` - `prepared` doesn't match the `PreparedPermit` shape (e.g. it crossed a process boundary and was corrupted)
- `PreparedPermitChainMismatchError` - `prepared.chainId` doesn't match the currently active chain
- `PreparedPermitExpiredError` - the permit's validity window has already elapsed
- `TransportKeyPairChangedError` - the transport key pair changed since `preparePermit` ran; call `preparePermit` again
- `SigningFailedError` - the signature is invalid or malformed
- `PreparedPermitMismatchError` - `prepared`'s unsigned metadata (chain, contracts, timing, delegator) does not match what the signature actually covers

## Related

- [`usePreparePermit`](./usePreparePermit.md) -- build the unsigned typed data this hook registers a signature for
- [`useGrantPermit`](./useGrantPermit.md) -- the atomic, wallet-connected counterpart
- [Offline signing guide](../../guides/offline.md#offline-permits) -- the full offline permit workflow
- [ZamaSDK reference](../sdk/ZamaSDK.md#permits-registerpermit) -- `sdk.permits.registerPermit`'s full signature and typed errors
