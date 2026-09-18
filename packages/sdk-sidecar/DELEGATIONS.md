# Manage on-chain decryption delegation

`@zama-fhe/sdk` lets a contract owner grant another address the right to decrypt values on their behalf. The sidecar exposes that as five RPCs backed by `sdk.delegations`.

> [!WARNING]
> On-chain delegation is not the same thing as a **delegation permit** (`GrantDelegationPermit` / `HasDelegationPermit`). A delegation permit is a local credential: it lets the SDK sign decryption requests for a delegator without asking the wallet again. The RPCs on this page change ACL state on the host chain instead. Granting a permit does not grant delegation, and granting delegation does not create or require a permit.

## RPCs

| RPC                   | SDK method                           | Needs a signer |
| --------------------- | ------------------------------------ | -------------- |
| `DelegateDecryption`  | `sdk.delegations.delegateDecryption` | Yes            |
| `RevokeDelegation`    | `sdk.delegations.revokeDelegation`   | Yes            |
| `IsDelegationActive`  | `sdk.delegations.isActive`           | No             |
| `GetDelegationExpiry` | `sdk.delegations.getExpiry`          | No             |
| `GetDelegationStatus` | `sdk.delegations.getStatus`          | No             |

`DelegateDecryption` and `RevokeDelegation` write to the ACL contract. The delegator is always the connected signer account; there is no field for it on the wire. The SDK resolves the delegator from the signer account, and the sidecar only omits the field.

The three read RPCs take an explicit `contract_address`, `delegator_address` and `delegate_address` in `DelegationQueryRequest` and work without a signer attached to the context.

## One change per block

The ACL contract accepts one delegate or revoke per `(delegator, delegate, contract)` tuple per block. A second write to the same tuple in the same block reverts with `AlreadyDelegatedOrRevokedInSameBlock`, whether the second write is a grant or a revoke. The native examples wait for the chain to advance past the block observed right after the grant receipt before revoking.

## Expiry

`DelegateDecryption.expiration_date_ms` is optional Unix time in whole milliseconds on the wire.

- Omitted: requests a permanent delegation. On chain this is stored as `2^64 - 1`.
- Present: the SDK converts it to whole seconds before writing it to the ACL. It must be at least 1 hour in the future; the SDK rejects a sooner date with `DELEGATION_EXPIRATION_TOO_SOON`.

`GetDelegationExpiry` and `GetDelegationStatus` return the raw ACL expiry as `expiry_timestamp`, in whole seconds:

- `0` means no delegation exists for that tuple.
- `2^64 - 1` means permanent.
- Any other value is compared against the chain's current block timestamp to decide `is_active` (or the return of `IsDelegationActive`). An expiry in the past is inactive but distinct from `0`: it means a delegation existed and lapsed.

## Errors

The sidecar does not add delegation-specific error codes. It forwards the SDK's codes verbatim in the `zama-error-code` trailer (see [the wire contract's error section](../../proto/README.md#errors-and-transport-limits)). Codes these RPCs surface:

| Code                                  | When                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `INVALID_ARGUMENT`                    | Missing delegation message, a malformed 20-byte address, or an expiration date outside the representable range. |
| `SIGNER_NOT_CONFIGURED`               | `DelegateDecryption` or `RevokeDelegation` on a context with no signer.                                         |
| `CHAIN_MISMATCH`                      | The signer and provider are on different chains.                                                                |
| `DELEGATION_EXPIRATION_TOO_SOON`      | Explicit expiry is less than 1 hour in the future.                                                              |
| `DELEGATION_SELF_NOT_ALLOWED`         | The delegate equals the delegator (the connected wallet).                                                       |
| `DELEGATION_DELEGATE_EQUALS_CONTRACT` | The delegate equals the contract address.                                                                       |
| `DELEGATION_EXPIRY_UNCHANGED`         | The new expiry equals the delegation's current expiry.                                                          |
| `DELEGATION_NOT_FOUND`                | `RevokeDelegation` when the current expiry is `0` (nothing to revoke).                                          |
| `TRANSACTION_REVERTED`                | The ACL contract reverted the write, or the wallet's gas estimation rejected it before broadcast.               |

`TRANSACTION_OUTCOME_UNKNOWN` is the one sidecar-specific code, not an SDK delegation code. It surfaces when the operation is cancelled or the signer channel is lost after the wallet has broadcast a delegation write; see [transaction callbacks](TRANSACTIONS.md#failure-and-cancellation) for the full table of when it applies.

### Pre-broadcast reverts

A delegate or revoke can fail before anything is broadcast: the node rejects the simulated write during gas estimation. The native wallet reports this as a revert instead of a broadcast hash, and the SDK surfaces it the same way it surfaces any other reverted write: code `TRANSACTION_REVERTED`, with a message naming the function and contract and carrying the decoded error name and arguments when the request ABI declares the error, or `unrecognized error 0x…` with the 4-byte selector otherwise.

The SDK maps these ACL revert names to delegation error codes when the revert decodes:

| ACL error name                         | SDK code                              |
| -------------------------------------- | ------------------------------------- |
| `AlreadyDelegatedOrRevokedInSameBlock` | `DELEGATION_COOLDOWN`                 |
| `NotDelegatedYet`                      | `DELEGATION_NOT_FOUND`                |
| `SenderCannotBeDelegate`               | `DELEGATION_SELF_NOT_ALLOWED`         |
| `DelegateCannotBeContractAddress`      | `DELEGATION_DELEGATE_EQUALS_CONTRACT` |
| `ExpirationDateAlreadySetToSameValue`  | `DELEGATION_EXPIRY_UNCHANGED`         |
| `EnforcedPause`                        | `ACL_PAUSED`                          |
| `SenderCannotBeContractAddress`        | `DELEGATION_CONTRACT_IS_SELF`         |

The SDK ACL ABI declares functions only, so ACL reverts decode to their 4-byte selector; the SDK maps named ACL errors when its ABI carries the error entries.

## Transaction result

`DelegateDecryptionResponse.transaction` and `RevokeDelegationResponse.transaction` carry a `TransactionResult`: the broadcast `transaction_hash` and the mined receipt's `logs` (each with an optional emitter `address`, `topics` and `data`). This mirrors the SDK's own `TransactionResult` shape unchanged.

## Native examples

```go
query := sidecar.DelegationQuery{ContractAddress: token, DelegatorAddress: owner, DelegateAddress: delegate}
status, err := sdk.GetDelegationStatus(ctx, query)

expiry := time.Now().Add(2 * time.Hour)
granted, err := sdk.DelegateDecryption(ctx, sidecar.DelegateDecryptionParams{
	ContractAddress: token,
	DelegateAddress: delegate,
	ExpirationDate:  &expiry,
})
```

```rust
let query = DelegationQuery { contract_address: token, delegator_address: owner, delegate_address: delegate };
let status = sdk.delegations().get_status(query).await?;

let granted = sdk
    .delegations()
    .delegate_decryption(DelegateDecryptionParams::expiring_at(
        token,
        delegate,
        SystemTime::now() + Duration::from_secs(2 * 60 * 60),
    )?)
    .await?;
```

The full sequence, including the block wait before revoking and status formatting, lives in [`clients/go/examples/balance/delegation.go`](../../clients/go/examples/balance/delegation.go) and [`clients/rust/examples/balance/delegation.rs`](../../clients/rust/examples/balance/delegation.rs).

## Writes and events

`DelegateDecryption` and `RevokeDelegation` request their write the same way every other SDK write does: over the signer channel to your native wallet adapter. See [transaction callbacks](TRANSACTIONS.md) for wallet setup, request fields and failure/cancellation behavior. The SDK, not the sidecar, waits for the receipt before the RPC returns. `@zama-fhe/sdk` emits transaction lifecycle events for these operations inside the sidecar process; the sidecar exposes no event channel.
