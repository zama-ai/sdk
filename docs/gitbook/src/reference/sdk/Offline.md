---
title: Offline
description: Build unsigned transactions for out-of-process signing - the offline counterpart of the atomic Token methods.
---

# Offline

`sdk.offline` builds unsigned transactions that the caller signs and broadcasts out-of-process. It works without a configured signer.

For the workflow (handoff, custody integration, multi-transaction batches), see the [Offline signing](../../guides/offline.md) guide.

## Import

Accessed as a namespace on the `ZamaSDK` instance:

```ts
import { ZamaSDK } from "@zama-fhe/sdk";

const sdk = new ZamaSDK(config); // signer optional
const prepared = await sdk.offline.prepare(request, options);
```

## Methods

### prepare

```ts
prepare<K extends TransactionKind>(
  request: Extract<PrepareTransactionRequest, { kind: K }>,
  options?: PrepareOptions,
): Promise<PreparedFor<K>>
```

Builds the unsigned transaction for `request` without signing or broadcasting. The return type narrows to the request's `kind`.

```ts
const prepared = await sdk.offline.prepare({
  kind: "ConfidentialTransfer",
  from: "0xCustodyWallet",
  token: "0xConfidentialToken",
  to: "0xRecipient",
  amount: 1000n,
});
```

Returns a `PreparedTransaction`. All three fields are JSON-safe, so the object crosses a process boundary as-is:

| Field        | Type              | Meaning                                                         |
| ------------ | ----------------- | --------------------------------------------------------------- |
| `kind`       | `TransactionKind` | the request kind, echoed back                                   |
| `from`       | `Address`         | transaction sender; the custodian picks the signing key with it |
| `unsignedTx` | `Hex`             | RLP-encoded unsigned EIP-1559 transaction, ready to sign        |

**Throws:**

- `ConfigurationError` - invalid request, or the provider's chain differs from the configured chain
- `EncryptionFailedError` - encryption produced no result (encrypting kinds)
- `DecryptionFailedError` - fallback for an unclassified public-decryption failure (`FinalizeUnwrap`); classified failures preserve their specific [SDK error](./errors.md)
- `DelegationExpirationTooSoonError` / `DelegationSelfNotAllowedError` / `DelegationDelegateEqualsContractError` - delegation guards (`DelegateDecryption`)
- `TransactionRevertedError` - gas estimation reverted, for example when `Wrap` is prepared before its approval mines

### preparePermit

```ts
preparePermit(request: PreparePermitRequest): Promise<PreparedPermit>
```

Builds the unsigned EIP-712 typed data for a decryption permit, without signing it — the offline counterpart to [`permits.grantPermit`](./ZamaSDK.md#permits-grantpermit). Hand `prepared.eip712` to an out-of-process signer for `eth_signTypedData_v4`, then pass the returned signature to [`permits.registerPermit`](./ZamaSDK.md#permits-registerpermit).

A permit is not a transaction: nothing is broadcast, and registering the signature is a local operation, not a relayer round-trip — so this is its own method rather than a `prepare()` request kind.

```ts
const prepared = await sdk.offline.preparePermit({
  signer: "0xCustodyWallet",
  contracts: ["0xConfidentialToken"],
});
```

`request` fields:

| Field          | Type        | Default                                       | Meaning                                             |
| -------------- | ----------- | --------------------------------------------- | --------------------------------------------------- |
| `signer`       | `Address`   | required                                      | address expected to sign the returned `eip712`      |
| `contracts`    | `Address[]` | required, max 10, no chunking                 | contract addresses to authorize                     |
| `delegator`    | `Address`   | none — self permit; must differ from `signer` | delegator address, for a delegated permit           |
| `durationDays` | `number`    | the SDK's configured `permitTTL`, max 365     | permit validity window in days, a V1 protocol limit |

Signer-optional, like `prepare`: `request.signer` is an explicit address, not a connected wallet account — resolving the transport key pair needs no configured signer. It is signer-offline, not network-offline: building the typed data still reads the chain's KMS signers context on-chain, so the provider must be reachable.

Returns a `PreparedPermit`. Every field is JSON-safe, so the object crosses a process boundary as-is:

| Field           | Type                     | Meaning                                                                  |
| --------------- | ------------------------ | ------------------------------------------------------------------------ |
| `version`       | `1`                      | permit format version; pins the V1 shape so a future V2 flow is additive |
| `eip712`        | `SerializedPermitEip712` | the EIP-712 typed data to sign with `eth_signTypedData_v4`               |
| `signerAddress` | `Address`                | checksummed `request.signer`                                             |

**Throws:**

- `ConfigurationError` - `request.contracts` is empty or exceeds 10 addresses, `request.delegator` equals `request.signer` (self-delegation), or `request.durationDays` exceeds the V1 permit maximum of 365 days
- `TransportKeyPairChangedError` - a concurrent `permits.revokeTransportKeyPair()` rotated the transport key pair while this call was generating one

See [`permits.registerPermit`](./ZamaSDK.md#permits-registerpermit) for the second phase and its typed errors, and the [Offline signing guide](../../guides/offline.md#offline-permits) for the full workflow.

## Request kinds

Each request is a discriminated union member on `kind`. `from` is always the transaction sender.

### Transfers and operators

- `{ kind: "ConfidentialTransfer"; from; token; to; amount: bigint }`
- `{ kind: "ConfidentialTransferFrom"; from; token; owner; to; amount: bigint }`
- `{ kind: "SetOperator"; from; token; operator; until: number }`

Amounts are cleartext; encryption happens during `prepare`. `ConfidentialTransferFrom` debits `owner` and requires `from` to be an approved operator. `SetOperator.until` is a required Unix timestamp: the offline payload is signed later, so no relative default is applied; pass a past value to revoke.

### Shield

- `{ kind: "TransferAndCall"; from; underlying; wrapper; amount: bigint; recipientData?: Hex }`
- `{ kind: "ApproveUnderlying"; from; underlying; spender; amount: bigint }`
- `{ kind: "Wrap"; from; wrapper; to; amount: bigint }`

`TransferAndCall` is the single-transaction shield for ERC-1363 underlyings; `recipientData` is the recipient as 20 raw bytes (not ABI-encoded), or `"0x"`/omitted to self-shield. `ApproveUnderlying` + `Wrap` is the two-transaction path; on this path, some underlyings such as USDT require an `amount: 0n` reset first when a non-zero allowance exists.

### Unshield

- `{ kind: "Unwrap"; from; token; to; amount: bigint }`
- `{ kind: "UnwrapAll"; from; token; to }`
- `{ kind: "FinalizeUnwrap"; from; wrapper; unwrapRequestIdOrAmount: Hex }`

`Unwrap` encrypts the amount; `UnwrapAll` uses the on-chain confidential balance instead. `FinalizeUnwrap` runs the public decryption during `prepare`; `unwrapRequestIdOrAmount` comes from the phase-1 receipt's `UnwrapRequested` event (`findUnwrapRequested`, see [Event decoders](./event-decoders.md)).

### Delegation

- `{ kind: "DelegateDecryption"; from; contractAddress; delegateAddress; expirationDate?: Date }`
- `{ kind: "RevokeDelegation"; from; contractAddress; delegateAddress }`

`expirationDate` must be at least 1 hour in the future; omit for permanent.

## PrepareOptions

Omitted fields fall back to live chain state:

| Field      | Type                                                     | Default                   |
| ---------- | -------------------------------------------------------- | ------------------------- |
| `nonce`    | `number`                                                 | pending transaction count |
| `gasLimit` | `bigint`                                                 | estimated                 |
| `fees`     | `{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }` | estimated                 |

`fees` carries both values in one object so they can only be pinned as a pair. Dependent transactions prepared before their predecessor mines must pin `nonce` and `gasLimit`; see the [batching warning](../../guides/offline.md#multi-transaction-flows) in the guide.

## Related

- [Offline signing guide](../../guides/offline.md) - the full workflow, including [offline permits](../../guides/offline.md#offline-permits)
- [GenericProvider](./GenericProvider.md) - `prepareTransaction`, the provider hook behind `prepare`
- [Event decoders](./event-decoders.md) - `findUnwrapRequested` and friends
- [WrappedToken](./WrappedToken.md) - the atomic shield/unshield counterparts
- [ZamaSDK](./ZamaSDK.md#permits-registerpermit) - `permits.registerPermit`, the second phase of the offline permit flow
