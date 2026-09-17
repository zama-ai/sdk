# Approve and broadcast SDK transactions

The signer channel lets your native wallet approve, sign and broadcast a contract write requested by `@zama-fhe/sdk`. Your wallet returns the transaction hash. The TypeScript SDK waits for the receipt and continues its workflow.

This capability belongs to the maintained beta sidecar. Token and delegation transaction RPCs are not exposed yet. The balance examples configure transaction-capable wallets; SDK-backed integration tests exercise writes through `Token.setOperator`. A live write step will use the public token/delegation API once available.

## Go wallet setup

Use `NewEthereumSigner` with a go-ethereum client and a `WritePolicy`. The complete [example wallet setup](../../clients/go/examples/balance/ethereum.go) dials the RPC, verifies the chain, creates the wallet and passes its signer configuration into the SDK.

The adapter accepts a private key, chain ID, `EthereumTransactionBackend` and `WritePolicy`. An `ethclient.Client` implements the backend. `WritePolicy.Approve` receives `ContractWriteRequest` before signing; returning an error stops submission. Return `ErrSigningRejected` for wallet rejection. Other plain errors are reported as `SIGNING_FAILED`; return an `*SDKError` to choose the code. The optional `WritePolicy.Submitting` receives the signed transaction before broadcast; persist its hash, because a callback cancelled or lost after the node accepted the transaction cannot report it. The adapter uses legacy gas-price transactions, checks the wallet account and RPC chain, estimates omitted gas, signs locally and returns the signed transaction hash after submission succeeds. Once a transaction is signed, the adapter detaches the broadcast from the caller's context and bounds it at 30 seconds, so cancelling an operation cannot stop a send that is already under way.

For a custodian or other wallet, set `SignerConfig.WriteContract` to a `WriteContractFunc` alongside `SignTypedData`. It receives a cancellable context and the correlated contract request, and returns `common.Hash` or an error. `SDKContext.AttachWallet` explicitly reattaches both callbacks after channel loss. Neither attaching nor reconnecting retries interrupted operations.

Share one signer configuration across contexts using the same wallet and chain. Its nonce coordination covers that adapter instance. Other applications or wallet instances using the account need application-owned nonce coordination.

If submission fails after calling the RPC, `BroadcastUncertainError` includes the signed hash. It reports `TRANSACTION_OUTCOME_UNKNOWN`, the one code that means a broadcast may already have happened; return it from a custom `WriteContractFunc` for the same situation. The adapter then refuses subsequent writes with `SIGNING_FAILED` naming that hash, since those writes never reached the RPC. Reconcile the hash and the pending account nonce before creating a fresh adapter. A dropped or replaced transaction leaves the adapter's cached nonce ahead of the account, so rebuild the adapter after replacing or abandoning a signed transaction too. An RPC error alone does not prove the transaction was rejected.

## Rust wallet setup

Enable the `alloy` feature. Call `AlloySigner::new(signer).with_transactions(provider, policy)` to obtain an `AlloyWallet` that signs typed data and broadcasts contract writes. The complete [example wallet setup](../../clients/rust/examples/balance/support.rs) creates an Alloy wallet provider and a `WritePolicy` that restricts approvals to the configured token.

`with_transactions` accepts the `FillProvider` a `ProviderBuilder` with a wallet returns, and a `WritePolicy`. An async closure taking `ContractWriteRequest` and `CancellationToken` and yielding `Result<(), SdkError>` is an approval-only policy; return `SdkError::signing_rejected` to decline. Implement the trait instead to receive `approve(&ContractWriteRequest, &CancellationToken)`, so a custodian prompt can be interrupted, and `submitting`, which passes the signed `TxEnvelope` before broadcast so the application can persist the hash. The wallet checks the wallet address and RPC chain, forwards calldata and explicit value/gas, fills and signs through the provider, and only then broadcasts. Filling and signing failures are certain `SIGNING_FAILED` errors; only the broadcast itself can be uncertain. Once the transaction is signed, the wallet ignores cancellation and broadcasts under a 30-second adapter-owned timeout; a timeout reports `TRANSACTION_OUTCOME_UNKNOWN` and blocks later writes. It returns `B256` without waiting for a receipt.

For a custodian, implement `Signer` and override `write_contract` alongside `sign_typed_data`. It takes a `ContractWriteRequest` and a `CancellationToken`, which the crate re-exports. A cancelled token means the SDK stopped waiting and no reply is sent, so return before signing rather than mid-broadcast. Existing typed-data-only signers reply `SIGNER_NOT_CONFIGURED` when asked to write.

Share one wallet across contexts using the same account and chain; writes are serialized per wallet instance. Other applications or wallet instances using the account need application-owned nonce coordination. Build the provider the way the example does, with `ProviderBuilder::new().disable_recommended_fillers().with_gas_estimation().with_blob_gas_estimation().with_simple_nonce_management().fetch_chain_id().wallet(signer)`. Alloy's default cached nonce manager runs concurrently with the other fillers, so it can advance past a failed fill and gap later writes. Appending `with_simple_nonce_management()` to the recommended fillers is not enough, because it joins a second nonce filler beside the cached one. After an uncertain submission, the wallet refuses subsequent writes with `SIGNING_FAILED` naming that hash. Reconcile the transaction and account nonce, then rebuild both the provider and wallet so cached nonce state cannot survive the failure.

## Request fields

Both native request types include operation/action IDs and the wallet's account/chain snapshot. Treat these IDs as correlation identifiers, not durable idempotency keys.

`address` is the destination and `data` is canonical ABI-encoded calldata from TypeScript. Broadcast those bytes unchanged. `abi`, `function_name` and `args` describe the contract call for approval. JSON represents SDK bigint arguments as decimal strings, including nested arrays and tuples; ordinary numbers, strings and booleans remain JSON values. Use the ABI to interpret integer strings. The native application does not reconstruct SDK token routing, encryption or validation.

`value` and `gas` preserve absence separately from explicit zero: Go uses nullable `*big.Int`; Rust uses `Option<BigInt>`. The built-in adapters require values to fit `uint256` and gas to fit `uint64`. A custom wallet can apply its own supported transaction policy. Fees and nonces belong to the native wallet because they are not fields of `GenericSigner.writeContract`.

## Failure and cancellation

| Situation                                                                         | Behavior                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Approval rejected                                                                 | Return `SIGNING_REJECTED`; no broadcast is attempted.                                                                                                                                                                                                              |
| Account or chain mismatch                                                         | Built-in adapters stop before submission with `SIGNING_FAILED` or `CHAIN_MISMATCH`.                                                                                                                                                                                |
| Failure before submission                                                         | Return the callback error; the adapter does not retry.                                                                                                                                                                                                             |
| RPC submission fails or its outcome is lost                                       | Treat it as uncertain; reconcile before another attempt.                                                                                                                                                                                                           |
| Write requested while an earlier submission is unreconciled                       | Built-in adapters refuse with `SIGNING_FAILED`; that write never reached the RPC.                                                                                                                                                                                  |
| Pending write loses its signer channel                                            | The bridge reports nonretryable `TRANSACTION_OUTCOME_UNKNOWN`.                                                                                                                                                                                                     |
| Invalid or mismatched transaction reply                                           | The bridge reports nonretryable `TRANSACTION_OUTCOME_UNKNOWN`.                                                                                                                                                                                                     |
| Cancellation, account update, deadline or context close, no write dispatched      | The bridge cancels pending callbacks and reports `CANCELLED`.                                                                                                                                                                                                      |
| Cancellation, account update, deadline or context close, write already dispatched | The bridge reports nonretryable `TRANSACTION_OUTCOME_UNKNOWN`; an already submitted transaction can still be mined. Native adapters stop a write that is not yet signed and send no reply; once it is signed they broadcast to completion under their own timeout. |
| Hash received successfully, then receipt lookup fails or reverts                  | The SDK owns receipt handling and its transaction error. The bridge does not resubmit.                                                                                                                                                                             |

Callback errors retain their SDK code and retry metadata. Failures known to precede broadcast reuse SDK codes such as `SIGNING_REJECTED`, `SIGNING_FAILED`, `CHAIN_MISMATCH` and `SIGNER_NOT_CONFIGURED`, so applications handle them like an in-process signer. `TRANSACTION_OUTCOME_UNKNOWN` is the one sidecar-specific code: an in-process signer can neither lose its callback channel mid-broadcast nor be cancelled while the wallet holds a write. Codes outside the SDK taxonomy survive the SDK's transaction error wrapper at the transport boundary. Unknown internal errors retain the SDK's usual wrapping. Native clients can observe a transport/channel error or context cancellation before the unary SDK error arrives. A cancelled operation whose write was already dispatched fails with `TRANSACTION_OUTCOME_UNKNOWN` rather than `CANCELLED`. Interpret those failures as uncertain whenever a transaction callback had started, regardless of the outer error code. No client automatically replays signer actions or SDK operations.

> [!WARNING]
> Cancellation stops waiting; it cannot reverse a broadcast. A cancelled operation, disconnected channel or missing hash is not evidence that no transaction exists. Persist every signed transaction from `Submitting`/`submitting`, or your custom wallet's equivalent, and reconcile that record before retrying.

## Validate locally

From the repository root, after the [development setup](README.md#develop-and-test):

```sh
pnpm sidecar:test
(cd clients/go && go test -race ./... && go vet ./...)
(cd clients/go/examples/balance && go test -race ./... && go vet ./...)
cargo test --manifest-path clients/rust/Cargo.toml --all-features --all-targets --locked
cargo clippy --manifest-path clients/rust/Cargo.toml --all-features --all-targets --locked -- -D warnings
```

These tests use synthetic wallets and RPC fixtures. They cover SDK parity, contract arguments, callback correlation, rejection, receipt failures, concurrent writes and interrupted broadcasts. No funded wallet is required.

The existing demo entry points keep wallet setup separate from SDK usage. Run `dc run --rm go` or `dc run --rm rust` using the [shared example configuration](README.md#configure-the-examples). Each runs the balance sequence; transaction setup is ready for a future SDK write step. Do not replace that step with hand-written token contract calls.
