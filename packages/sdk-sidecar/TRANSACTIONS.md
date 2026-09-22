# Sign and broadcast SDK transactions

The signer channel lets your native wallet sign and broadcast a contract write requested by `@zama-fhe/sdk`. Your wallet returns the transaction hash. The TypeScript SDK waits for the receipt and continues its workflow.

This capability belongs to the maintained beta sidecar. Token transaction RPCs are not exposed yet; on-chain delegation writes are (see [`DelegateDecryption`/`RevokeDelegation`](DELEGATIONS.md)). The balance examples configure transaction-capable wallets; SDK-backed integration tests exercise writes through `Token.setOperator`. A live token write step will use the public token API once available.

## Go wallet setup

Call `NewEthereumSigner(privateKey, chainID, backend)` to obtain a `SignerConfig` that signs typed data and broadcasts contract writes. The complete [example wallet setup](../../clients/go/examples/balance/ethereum.go) dials the RPC, verifies the chain, creates the signer configuration and passes it into the SDK.

`backend` is a `bind.ContractTransactor`, which `*ethclient.Client` implements. Pass an optional `EthereumSignerOptions{BroadcastTimeout: ...}` to replace `DefaultBroadcastTimeout`, which is 30 seconds.

The adapter checks the requested account and chain against the configured key and chain ID, before any RPC call. A mismatch returns `SIGNING_FAILED` or `CHAIN_MISMATCH`. These checks are static, so a backend connected to a different chain is not detected. go-ethereum `bind/v2` then builds the transaction: it reads the pending nonce from the node, uses dynamic fees when the chain reports a base fee and a legacy gas price otherwise, estimates omitted gas and signs locally. The adapter keeps no nonce state and serializes nothing, so concurrent writes rely on the node's pending nonce.

Cancellation is honoured at entry and again just before the send. The send itself runs detached from the caller's context, bounded by `BroadcastTimeout`. A shorter timeout on your own HTTP client ends the request earlier. Neither timeout proves the transaction was not submitted. Only a send error or a timeout is uncertain: the adapter returns a `*BroadcastUncertainError` carrying `Hash`, `Cause` and the code `TRANSACTION_OUTCOME_UNKNOWN`. It does not refuse later writes.

Record hashes by wrapping the returned `SignerConfig.WriteContract`, which is a plain `WriteContractFunc`. Your wrapper observes the returned hash natively, or `BroadcastUncertainError.Hash` with its cause.

For a custodian or other wallet, set `SignerConfig.WriteContract` yourself alongside `SignTypedData`. It receives a cancellable context and the correlated contract request, and returns `common.Hash` or an error. Return `ErrSigningRejected` for wallet rejection. Other plain errors are reported as `SIGNING_FAILED`; return an `*SDKError` to choose the code. `SDKContext.AttachWallet` explicitly reattaches both callbacks after channel loss. Neither attaching nor reconnecting retries interrupted operations.

## Rust wallet setup

Enable the `alloy` feature. Call `AlloySigner::new(signer).with_transactions(provider)` to obtain an `AlloyWallet` that signs typed data and broadcasts contract writes. Chain `.broadcast_timeout(duration)` to replace `DEFAULT_BROADCAST_TIMEOUT`, which is 30 seconds. The complete [example wallet setup](../../clients/rust/examples/balance/support.rs) builds the provider and the wallet.

`with_transactions` accepts the `FillProvider` that a `ProviderBuilder` with a wallet returns. The wallet checks the provider's default signer address and the signer's own `chain_id()` against the request, before any RPC call. The EIP-712 signer and the provider's wallet must hold the same key, and a provider connected to a different chain is not detected. It forwards calldata and explicit value/gas, then fills and signs through the provider. Filling and signing failures are certain `SIGNING_FAILED` errors carrying the underlying cause.

Cancellation is honoured at entry and again just before the send. Once the send starts, cancellation can no longer stop it; it runs under the broadcast timeout. A shorter transport timeout on your provider ends the request earlier, and neither timeout proves the transaction was not submitted. A send error or a timeout reports `TRANSACTION_OUTCOME_UNKNOWN` with the transaction hash and the cause. The wallet holds no mutex and no failure latch, so it never refuses a later write. Nonces and concurrency come entirely from the provider's fillers. Record hashes by wrapping the wallet in your own `Signer`.

The example builds its provider with `ProviderBuilder::new().disable_recommended_fillers().with_gas_estimation().with_blob_gas_estimation().with_simple_nonce_management().fetch_chain_id().wallet(signer)`. Alloy's cached nonce manager can advance past a failed fill and gap later writes, and appending `with_simple_nonce_management()` to the recommended fillers joins a second nonce filler beside the cached one. This is an example configuration with documented limitations, not a recommendation: choose the fillers your deployment needs.

For a custodian, implement `Signer` and override `write_contract(request, cancel)` alongside `sign_typed_data`. The crate re-exports `CancellationToken`. A cancelled token means the SDK stopped waiting and no reply is sent, so return before signing rather than mid-broadcast. Existing typed-data-only signers reply `SIGNER_NOT_CONFIGURED` when asked to write.

## Request fields

Both native request types include operation/action IDs and the wallet's account/chain snapshot. Treat these IDs as correlation identifiers, not durable idempotency keys.

`address` is the destination and `data` is canonical ABI-encoded calldata from TypeScript. Broadcast those bytes unchanged. `abi`, `function_name` and `args` describe the contract call. JSON represents SDK bigint arguments as decimal strings, including nested arrays and tuples; ordinary numbers, strings and booleans remain JSON values. Use the ABI to interpret integer strings. The native application does not reconstruct SDK token routing, encryption or validation.

`value` preserves absence separately from explicit zero: Go uses nullable `*big.Int`; Rust uses `Option<BigInt>`. For `gas`, Go treats omitted and zero alike and lets `bind/v2` estimate, because a zero gas limit means automatic estimation there; Rust estimates only when `gas` is omitted and forwards an explicit zero unchanged. The built-in adapters require values to fit `uint256` and gas to fit `uint64`. A custom wallet can apply its own supported transaction policy. Fees and nonces belong to the native wallet because they are not fields of `GenericSigner.writeContract`.

## Pre-broadcast reverts

The node can reject a write during gas estimation, before anything is broadcast. Built-in adapters detect this and forward the node's revert data instead of a broadcast failure: the Go adapter returns `*ExecutionRevertError{Data, Cause}` from `WriteContractFunc`; the Rust adapter returns `SdkError::execution_reverted(message, data)`. A custom wallet callback does the same to get this treatment; any other pre-broadcast failure keeps `SIGNING_FAILED`.

The bridge relays this as an `execution_revert` signer reply. The sidecar decodes the revert data against the request ABI when the ABI declares the error and reports a certain `TRANSACTION_REVERTED` failure, the same as any other reverted write. Hash tracking and the `TRANSACTION_OUTCOME_UNKNOWN` rules below are unchanged: an `execution_revert` reply means nothing was broadcast, so there is no hash to reconcile.

## Failure and cancellation

| Situation                                                                         | Behavior                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom callback rejects the write                                                 | Return `SIGNING_REJECTED`; no broadcast is attempted.                                                                                                                                                                                                           |
| Account or chain mismatch                                                         | Built-in adapters stop before any RPC call with `SIGNING_FAILED` or `CHAIN_MISMATCH`.                                                                                                                                                                           |
| Failure before submission                                                         | Certain `SIGNING_FAILED` with the underlying cause; the adapter does not retry.                                                                                                                                                                                 |
| Node rejects the simulated write (gas estimation)                                 | Certain `TRANSACTION_REVERTED`; the sidecar decodes the revert data against the request ABI when possible, and nothing was broadcast.                                                                                                                           |
| Send fails or its outcome is lost                                                 | Uncertain `TRANSACTION_OUTCOME_UNKNOWN` with the signed hash; reconcile before the next write.                                                                                                                                                                  |
| Pending write loses its signer channel                                            | The bridge reports nonretryable `TRANSACTION_OUTCOME_UNKNOWN`.                                                                                                                                                                                                  |
| Invalid or mismatched transaction reply                                           | The bridge reports nonretryable `TRANSACTION_OUTCOME_UNKNOWN`.                                                                                                                                                                                                  |
| Cancellation, account update, deadline or context close, no write dispatched      | The bridge cancels pending callbacks and reports `CANCELLED`.                                                                                                                                                                                                   |
| Cancellation, account update, deadline or context close, write already dispatched | The bridge reports nonretryable `TRANSACTION_OUTCOME_UNKNOWN`; a submitted transaction can still be mined. The message names the transaction hash when the wallet returned one. Native adapters stop before the send; once it starts they run it to completion. |
| Hash received successfully, then receipt lookup fails or reverts                  | The SDK owns receipt handling and its transaction error. The bridge does not resubmit.                                                                                                                                                                          |

Callback errors retain their SDK code and retry metadata. Failures known to precede broadcast reuse SDK codes such as `SIGNING_REJECTED`, `SIGNING_FAILED`, `CHAIN_MISMATCH` and `SIGNER_NOT_CONFIGURED`, so applications handle them like an in-process signer. `TRANSACTION_OUTCOME_UNKNOWN` is the one sidecar-specific code. An in-process SDK user can also be left unsure whether a transaction was submitted, by an RPC failure or a process crash; the sidecar adds the cases where the callback channel is lost or the operation is cancelled while the wallet holds a write. Codes outside the SDK taxonomy survive the SDK's transaction error wrapper at the transport boundary. Native clients can observe a transport error or context cancellation before the unary SDK error arrives. Interpret those failures as uncertain whenever a transaction callback had started, regardless of the outer error code. Nothing replays a signer action or an SDK operation automatically.

A callback wrapper and an SDK-operation caller see different amounts of detail. Natively, your wrapper reads the hash, `BroadcastUncertainError.Hash` and the cause. After protobuf conversion, the SDK-operation caller receives only the error code and its message.

> [!WARNING]
> Cancellation stops waiting; it cannot reverse a broadcast. A cancelled operation, disconnected channel or missing hash is not evidence that no transaction exists. Wrap the write callback to persist every hash you send, and reconcile that record before retrying.

After an uncertain send, the adapters do not coordinate anything on your behalf. The next write reads one node's pending nonce, which cannot distinguish a lost transaction from an accepted one. That write may therefore reuse the nonce and collide with the earlier transaction, or advance past it and leave a gap. A process crash during a send is covered by nothing: no hash is recorded and no error is reported. Reconcile the account and its pending transactions before submitting again.

## Validate locally

From the repository root, after the [development setup](README.md#develop-and-test):

```sh
pnpm sidecar:test
(cd clients/go && go test -race ./... && go vet ./...)
(cd clients/go/examples/balance && go test -race ./... && go vet ./...)
cargo test --manifest-path clients/rust/Cargo.toml --all-features --all-targets --locked
cargo clippy --manifest-path clients/rust/Cargo.toml --all-features --all-targets --locked -- -D warnings
```

These tests use synthetic wallets and RPC fixtures. They cover SDK parity, contract arguments, callback correlation, rejection, receipt failures, concurrent writes, cancellation around submission, send failures and broadcast timeouts. No funded wallet is required.

The existing demo entry points keep wallet setup separate from SDK usage. Run `dc run --rm go` or `dc run --rm rust` using the [shared example configuration](README.md#configure-the-examples). Each runs the balance sequence; transaction setup is ready for a future SDK write step. Do not replace that step with hand-written token contract calls.
