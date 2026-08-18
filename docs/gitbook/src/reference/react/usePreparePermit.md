---
title: usePreparePermit
description: Mutation hook that builds the unsigned EIP-712 typed data for a decryption permit, without signing it.
---

# usePreparePermit

Mutation hook that builds the unsigned EIP-712 typed data for a decryption permit, without signing it — for custody partners (HSM, policy engines, out-of-process signers) that cannot sign in-process. Hand `data.eip712` to the external signer for `eth_signTypedData_v4`, then pass the returned signature to [`useRegisterPermit`](./useRegisterPermit.md).

Prefer [`useGrantPermit`](./useGrantPermit.md) unless signing must happen out-of-process: this is the offline, low-level counterpart — one permit per call, no widening or chunking against existing permits.

## Import

```ts
import { usePreparePermit } from "@zama-fhe/react-sdk";
```

## Usage

```tsx
import { usePreparePermit } from "@zama-fhe/react-sdk";

function PrepareCustodyPermit({
  custodyAddress,
  tokenAddress,
}: {
  custodyAddress: `0x${string}`;
  tokenAddress: `0x${string}`;
}) {
  const { mutateAsync: preparePermit, isPending } = usePreparePermit();

  const handlePrepare = async () => {
    const prepared = await preparePermit({ signer: custodyAddress, contracts: [tokenAddress] });
    // Hand prepared.eip712 to the custody API for eth_signTypedData_v4,
    // then pass the returned signature to useRegisterPermit.
    return prepared;
  };

  return (
    <button onClick={handlePrepare} disabled={isPending}>
      {isPending ? "Preparing..." : "Prepare offline permit"}
    </button>
  );
}
```

## Parameters

`usePreparePermit` takes no configuration parameters.

## Mutation variables

### request

`PreparePermitRequest`

| Field          | Type        | Default                                       | Meaning                                             |
| -------------- | ----------- | --------------------------------------------- | --------------------------------------------------- |
| `signer`       | `Address`   | required                                      | address expected to sign the returned `eip712`      |
| `contracts`    | `Address[]` | required, max 10, no chunking                 | contract addresses to authorize                     |
| `delegator`    | `Address`   | none — self permit; must differ from `signer` | delegator address, for a delegated permit           |
| `durationDays` | `number`    | the SDK's configured `permitTTL`, max 365     | permit validity window in days, a V1 protocol limit |

Signer-optional: `request.signer` is an explicit address, not a connected wallet account — building the typed data needs no configured signer, only a reachable provider (it reads the chain's KMS signers context on-chain).

```tsx
const prepared = await preparePermit({
  signer: custodyAddress,
  contracts: [tokenAddress],
  // delegator: ownerAddress,   // omit for a self permit
  // durationDays: 30,          // defaults to the SDK's configured permitTTL
});
```

## Return Type

Returns a standard TanStack Query `UseMutationResult<PreparedPermit, Error, PreparePermitRequest>`. `data` is a `PreparedPermit` — every field is JSON-safe, so it crosses a process boundary as-is.

{% include ".gitbook/includes/mutation-result.md" %}

**Throws:**

- `ConfigurationError` - `request.contracts` is empty or exceeds 10 addresses, `request.delegator` equals `request.signer`, or `request.durationDays` exceeds the V1 permit maximum of 365 days
- `TransportKeyPairChangedError` - a concurrent `permits.revokeTransportKeyPair()` rotated the transport key pair while this call was generating one

## Related

- [`useRegisterPermit`](./useRegisterPermit.md) -- verify and persist the signature returned for a prepared permit
- [`useGrantPermit`](./useGrantPermit.md) -- the atomic, wallet-connected counterpart
- [Offline signing guide](../../guides/offline.md#offline-permits) -- the full offline permit workflow
- [Offline reference](../sdk/Offline.md#preparepermit) -- `sdk.offline.preparePermit`'s full signature and typed errors
