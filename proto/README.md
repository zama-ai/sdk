# Sidecar v1alpha1 contract

The canonical schema is [sidecar.proto](zama/sdk/v1alpha1/sidecar.proto). It exposes the TypeScript SDK's encryption, decryption, permit and offline transaction methods through unary RPCs, with a bidirectional channel for external signing. This maintained, permanently beta sidecar is intended for external partners; its versioned protocol can evolve. Transport adapts arguments and results; `@zama-fhe/sdk` owns cryptography, credentials, defaults, caching, delegation checks, batching and recovery.

## SDK contexts

`CreateContext` creates an SDK instance from typed `config`, `signer_enabled`, an optional wallet account and storage bindings. Native clients provide typed configuration and manage callback attachment during construction. `CloseContext` ends that instance. `GetInfo.sdk_version` reports the bundled `@zama-fhe/sdk` version. It does not report the internal `@fhevm/sdk` dependency version or the protobuf namespace version.

A context owns its chain configuration, credentials and signer lifecycle. SDK runtime initialization is process-wide: the first SDK configuration fixes the runtime for every context in that process. The process has no fixed owner or chain. Default memory storage is independent per context. Contexts sharing a storage binding share credentials according to SDK account, chain and scope rules.

`ContextConfig.chains` contains typed chain settings. `chain_id` selects the initial chain; omission selects the first entry. Preset chains inherit SDK protocol configuration, while custom chains supply their SDK chain settings.

Each chain's `auth` selects a bearer token, API-key header or API-key cookie. Omitted header and cookie names retain SDK defaults. `permit_ttl` is in days; `transport_key_pair_ttl` and `registry_ttl` are in seconds. Omitted credential options retain SDK defaults.

## Runtime, relayers and providers

`ContextConfig.process_runtime` forwards `wasm_asset_load_mode`, `module_versions`, `single_thread`, `number_of_threads` and fallback `auth` to the SDK runtime. The first SDK configuration in the process wins, including when its runtime options are omitted. Later explicit runtime settings are ignored with an SDK warning on sidecar stderr. Restart the sidecar to apply another runtime configuration; creating another context does not reset it. Unsupported WASM modes, module versions and compatibility policies are rejected before runtime initialization, and the error names the rejected value and the supported values.

`ContextConfig.relayers` maps chain IDs to typed `RelayerConfig` messages. Omission selects the existing SDK `node()` factory for every configured chain. `RelayerMap` wraps the protobuf map so omission remains distinct from an explicitly empty map. An explicit map must contain each configured chain; missing entries retain the SDK configuration error. Options forward `timeout`, `debug`, `batch_rpc_calls`, `module_versions` and `fhe_encryption_key`. Encryption-key material uses raw protobuf bytes. The SDK owns cleartext executor requirements, chain compatibility and relayer validation.

Each `chains` entry accepts typed HTTP `provider` settings for `headers`, `timeout`, `retry_count`, `retry_delay`, `batch` and `polling_interval`. `HttpHeaders` wraps the protobuf map so omission remains distinct from an explicitly empty header set. Timeout, retry delay, batch wait and polling interval are milliseconds. `ProviderBatch` selects either a boolean or typed batch options. These configure the sidecar's public-read viem provider, independently of the application's native Ethereum provider and the relayer backend's internal RPC client. Use an RPC URL with the required access credentials for backend RPC reads; custom JavaScript `network` providers are unsupported. Omitted options retain viem/SDK defaults; explicit zero and false are forwarded.

Arbitrary JavaScript providers, relayer factory functions, fetch hooks, loggers, `onEvent` callbacks, module objects and browser/worker injection points cannot cross this protocol. Use the typed options above for native integrations. Relayer authentication can be configured per chain, with runtime auth as the SDK's process-wide fallback.

## Credential protection

`CreateContext.transport_key_pair_derivation_secret` is an instance option separate from the typed context configuration. Its text/bytes oneof preserves the SDK's string versus `Uint8Array` input. Omission leaves the option absent; a present message without a value requests protection with a missing secret, preserving SDK rejection. Present empty strings and empty bytes also reach SDK validation.

Go uses `SDKConfig.TransportKeyPairDerivationSecret` with `TextDerivationSecret`, `BytesDerivationSecret` or `MissingDerivationSecret`. Rust uses builder `.transport_key_pair_derivation_secret(...)` with `DerivationSecret::text`, `::bytes` or `::missing`. Neither native client implements key derivation or wrapping. The SDK validates secret length, protects transport private keys and decides credential reuse or recovery.

Secrets stay outside persisted configuration and error payloads. The SDK owns secret import and memory handling. High-level native secret wrappers redact diagnostic formatting; generated protocol messages contain the wire value and must not be logged. Secret fields carry `debug_redact` annotations, but the pinned protobuf-go runtime does not honor them in `String()` output. To reuse protected credentials after restart, retain the credential backend and provide the same secret from your application. Omitting a secret when stored credentials require it retains SDK failure behavior; it does not silently downgrade protection. Protection of transport keys does not encrypt arbitrary application storage or permit metadata.

## Account updates

`UpdateAccount` sets the connected wallet's address and chain, or disconnects the wallet when `account` is absent. A changed account cancels and drains existing operations in that context before changing the wallet snapshot. Repeating the current account leaves active operations running.

The SDK's inherited account-change credential/cache cleanup is asynchronous and outside the sidecar coordinator; it can overlap another SDK instance sharing the same identity and store. Completion of `UpdateAccount` acknowledges the snapshot update, not completion of every SDK lifecycle listener. Do not use it as a barrier for credential cleanup.

## Supported SDK methods

| RPC                           | SDK method                                   |
| ----------------------------- | -------------------------------------------- |
| `DecryptValues`               | `sdk.decryption.decryptValues`               |
| `DelegatedDecryptValues`      | `sdk.decryption.delegatedDecryptValues`      |
| `DecryptPublicValues`         | `sdk.decryption.decryptPublicValues`         |
| `DelegatedBatchDecryptValues` | `sdk.decryption.delegatedBatchDecryptValues` |
| `PrepareTransaction`          | `sdk.offline.prepare`                        |
| `PreparePermit`               | `sdk.offline.preparePermit`                  |
| `RegisterPermit`              | `sdk.permits.registerPermit`                 |
| `GrantPermit`                 | `sdk.permits.grantPermit`                    |
| `GrantDelegationPermit`       | `sdk.permits.grantDelegationPermit`          |
| `HasPermit`                   | `sdk.permits.hasPermit`                      |
| `HasDelegationPermit`         | `sdk.permits.hasDelegationPermit`            |
| `RevokePermits`               | `sdk.permits.revokePermits`                  |
| `ClearPermits`                | `sdk.permits.clear`                          |
| `WarmTransportKeyPair`        | `sdk.permits.warmTransportKeyPair`           |
| `WarmTransportKeyPairScope`   | `sdk.permits.warmTransportKeyPairScope`      |
| `RevokeTransportKeyPair`      | `sdk.permits.revokeTransportKeyPair`         |
| `Encrypt`                     | `sdk.encrypt`                                |

Private decryption retains SDK credential acquisition, caching, zero-handle behavior and errors. Delegated calls preserve explicit delegator and optional account parameters. Public decryption returns clear values, ABI-encoded values and the decryption proof. Delegated batch results preserve input order, per-entry values or structured SDK errors, and fatal whole-call errors. Empty-input behavior, concurrency and propagation settings retain SDK semantics.

Offline permit preparation accepts an explicit signer and optional delegator, independently of a connected wallet. The SDK validates permit scope, duration, signature, chain, expiry and transport-key consistency. Preparation returns an opaque `prepared_permit` byte envelope and separate `typed_data_json` to sign. Registration takes the unchanged envelope and signature; applications do not parse the envelope or supply protocol extra-data constants.

Permit grants retain idempotent coverage and SDK-owned chunking, including empty-input behavior. Permit checks only look up stored coverage; they do not sign or generate keys. Registration and local revocation preserve requester-cache invalidation. Clearing credentials retains signer-level versus shared-key-scope behavior. Transport-key prewarming is a no-op without a connected wallet; explicit shared-scope prewarming and removal preserve SDK scope validation. Local revocation does not invalidate previously issued signatures on-chain.

## Encryption

`Encrypt` delegates to `sdk.encrypt`. Each input is a protobuf oneof with one arm per SDK type: `ebool` carries a protobuf boolean, `ebool_bigint` carries a boolean written as a decimal bigint, `euint8` through `euint256` carry canonical signed decimal strings, and `eaddress` carries 20 bytes. The boolean and bigint boolean arms remain distinct. The adapter checks wire encodings only: a typed arm is present, integers use canonical decimal, byte lengths match. The SDK owns value-range validation.

Both `contract_address` and `user_address` are required 20-byte addresses. They bind the inputs to the target contract and producing user. The user address is explicit even in a signer-enabled context; the adapter never substitutes the wallet account. The context retains the SDK's chain selection.

`timeout_ms` is an optional uint32 in whole milliseconds. Omission keeps the SDK default. Zero is a zero-millisecond budget, not "no timeout", and reaches the SDK unchanged. The RPC deadline is independent of it; the deadline and cancellation feed the SDK abort signal through the shared operation lifecycle. Encryption does not acquire credential storage locks or request wallet signatures.

Results contain `encrypted_values`, one ordered 32-byte handle per input, and opaque `input_proof` bytes. Native clients reject a response whose value count does not match the input count, and preserve these bytes without numeric conversion. Ciphertexts can differ across equivalent calls; compare their semantics, order and binding instead of byte equality.

## Offline transaction preparation

`PrepareTransaction` calls `sdk.offline.prepare(request, options?)`. It takes an explicit `from` address and needs no signer channel. Preparation reads chain state and may contact the relayer; offline refers to signing ownership, not network availability.

The transaction oneof covers every SDK kind: `ConfidentialTransfer`, `ConfidentialTransferFrom`, `SetOperator`, `Unwrap`, `UnwrapAll`, `FinalizeUnwrap`, `ApproveUnderlying`, `Wrap`, `TransferAndCall`, `DelegateDecryption` and `RevokeDelegation`. Request fields keep their SDK meaning. Each request is one transaction; native clients do not select shielding routes or reconstruct Token workflows.

Amounts, gas limits and both EIP-1559 fee values are canonical base-10 strings, so arbitrary precision survives the wire. Nonce, operator expiry (seconds) and delegation expiry (milliseconds) are unsigned 64-bit integers; values above the SDK safe integer range are rejected before reaching the SDK. An omitted options message stays omitted. Nonce and gas limit have independent presence, and the fee pair is supplied together. Explicit zero reaches SDK validation unchanged. `SetOperator.until` is required on the wire; the sidecar rejects omission instead of defaulting an expiry, matching the SDK contract.

`TransferAndCall.recipient_data` distinguishes omission from empty bytes. `DelegateDecryption.expiration_date_ms` omission keeps the SDK's permanent-delegation default; the SDK validates the minimum lead time. Go accepts `*time.Time` and rejects dates outside the millisecond range its time type can represent; Rust accepts `Option<u64>` milliseconds. Neither client chooses an expiry.

The response carries the SDK's kind, sender and unsigned EIP-1559 bytes unchanged. This RPC signs nothing and broadcasts nothing. The caller verifies the sender and payload, signs with its own key or custodian, and broadcasts through its own provider. Permit preparation and registration stay separate RPCs.

Preparation uses the existing operation lifecycle and error trailers. The SDK method accepts no abort signal: cancellation ends the caller's wait, and started SDK work drains before context disposal or account changes. Requests are never replayed automatically.

## Storage bindings and callbacks

`CreateContext.storage` selects a fresh sidecar memory store, a named persistent store, or an application backend ID. Omission selects fresh memory, matching the SDK's Node default. `permit_storage` independently selects a permit store; omission aliases the primary store.

An application backend uses `StorageChannel`, a bidirectional callback channel attached to its context. The initial attachment receives an acknowledgment. Each `StorageAction` carries a request ID, backend ID, method, key and optional operation value. Replies carry a request ID and exactly one result: `value`, `not_found`, `ack` or `error`. GET returns `value` or `not_found`; present zero-length bytes remain distinct from absence. SET and DELETE return `ack` after completing the operation. A missing result or a result incompatible with the requested method is rejected.

Storage callbacks have no SDK operation ID: the SDK also accesses storage from lifecycle listeners outside unary operations. The adapter rejects pending requests on channel loss; it does not translate disconnects into missing values or replay uncertain mutations. Applications can recreate an SDK with the same binding after connection loss. Go also exposes explicit storage-channel reattachment. Native applications can observe termination through Go `WaitChannelFailure` or Rust `wait_channel_closed`; observing a failure does not retry an SDK operation.

Native stores receive opaque values. The TypeScript codec prefixes serialized values with `ZAMA-KV` and a version byte (`1`), followed by V8 serialization. This preserves SDK value types, including binary values and bigints. Native applications store and return those bytes unchanged; the encoding is not a Rust/Go object format. Unsupported envelope versions fail explicitly. The format is an internal credential encoding, not a portable export API.

Binding identity controls coordination within one sidecar. Reusing a native application-storage binding shares its identity across contexts; independently created bindings are isolated. Stable named bindings identify adapters accessing the same durable namespace. They do not implement locking across different sidecar processes.

## Values and optional arguments

Addresses are 20 raw bytes; encrypted handles are 32 raw bytes. `ClearValue` preserves the SDK value type with distinct bigint, number, boolean, string and undefined variants. Bigints use canonical decimal strings and never pass through floating-point conversion. The number variant uses `uint32` for SDK euint8/euint16/euint32 results. Wider encrypted integers use the bigint variant. Undefined uses an empty message marker.

Optional scalar presence is significant. Durations, timeouts, concurrency and retry delays use unsigned integers. Timeouts are milliseconds; permit durations are days; retry delays are seconds. Omitted values retain SDK defaults, and an explicit zero timeout is a zero-millisecond budget, not "no timeout". Maximum concurrency uses positive values for a limit and zero for unlimited concurrency. Explicit false propagation settings reach the SDK unchanged. Missing delegated account uses the SDK's delegator default.

`RevokePermits.contracts` is a message wrapper: absent means no argument; present with zero addresses means an explicit empty array. Go preserves this as a nil versus non-nil empty slice. Rust uses `Option`.

## Signing and operation lifecycle

Every SDK operation has a context ID and a client-generated operation ID. Clients can submit concurrent calls; the runtime coordinates credential operations sharing a storage identity and signer or key scope. There is no process-wide busy rejection.

`SignerChannel` attaches to a signer-enabled context and acknowledges attachment before delivering actions. Each action includes operation/action IDs, the wallet account and SDK EIP-712 typed data. Replies require exactly one result: signature bytes or a structured signing error; `SIGNING_REJECTED` represents wallet rejection.

Cancellation frames stop pending wallet callbacks. Unknown or stale replies receive an action-scoped error and do not cancel unrelated work. Clients do not automatically replay signing requests after reconnection.

A disconnected signer channel aborts operations waiting for its outstanding signing actions. The SDK context remains available for independent work. Go supports explicit signer reattachment; Rust applications recreate their managed SDK with the same storage binding. Closing the context ends its operations and SDK instance. Operation IDs do not provide durable resumption or exactly-once submission.

Cancellation does not roll back completed SDK storage changes. SDK work that cannot be interrupted may continue until it settles; credential mutation coordination remains held during that work. Go callers provide a cancellable context. Rust callers can cancel by dropping the operation future and can configure a deadline.

## Errors and transport limits

SDK errors retain their code, message, retryability and optional integer retry delay in seconds. Callback errors use the SDK's canonical retryability for fixed error codes; relayer-request failures retain per-instance retryability. Unary RPCs carry these in `zama-error-code`, `zama-error-retryable` and `zama-error-retry-after-seconds` trailers. Batch items and signer messages use the corresponding `SdkError` fields. Use the SDK code for application decisions; gRPC status also represents transport failures.

Go exposes `RPCError` and preserves `status.Code`. Rust exposes `RpcError` with the SDK details and underlying tonic status. Neither client automatically retries SDK operations or signing requests.

The server and both clients default to 4 MiB messages. Large batches and prefetched FHE encryption keys require a higher limit at both endpoints; prefetched keys are commonly about 50 MiB. Set `SIDECAR_MAX_MESSAGE_BYTES` on the server and the matching Go `DialOptions.MaxMessageBytes` or Rust `Client::with_message_limit` above the encoded request size. Concurrent-stream, context and operation ceilings are optional deployment settings; there is no fixed 16-stream limit. Signer and storage channels each occupy an HTTP/2 stream. Writers honor stream backpressure rather than treating a temporarily full output buffer as failure.

RPC deadlines are independent of SDK relayer timeouts. Storage failures do not prevent unrelated metadata or public-decryption calls.

## Remaining API coverage

Token/WrappedToken operations, registry access, executed delegation transactions, transaction-signing callbacks and SDK event subscriptions are not exposed in this slice. Delegation changes are available only as offline-prepared transactions. Injection of arbitrary JavaScript providers, loggers and SDK event callbacks remains outside this wire API. Native storage implementations are supported through the storage bridge. This is partial SDK coverage; the methods above delegate their SDK behavior rather than reconstructing token flows.

The native balance examples perform Ethereum contract reads in Alloy/go-ethereum and pass the resulting encrypted handle to general decryption. The shared setup now accepts runtime/provider options, storage selection and optional credential protection before the encryption and balance steps. Integration with `Token.balanceOf`, other token lifecycle steps and delegation transactions remains deferred until those public native APIs are exposed. SDK-backed tests exercise credential reuse and restart behavior meanwhile.

## Equivalence verification

Shared scenarios compare direct SDK calls with sidecar calls using deterministic provider and relayer fixtures and real SDK credential/decryption logic. They compare values, errors and signer interactions across signerless calls, multiple contexts/accounts, direct and delegated permits, omitted options, acquisition/reuse/recovery, public proofs, batch failures, cancellation and concurrent reads.

Go and Rust wire tests cover typed values, callback correlation, rejection and deadlines. Native recovery tests use the production context factory and retain application-owned credentials across sidecar runtime replacement. Sidecar CI runs these checks without live wallet or RPC configuration. Live examples read encrypted balances using native Ethereum libraries, invoke general decryption, then prepare and locally sign an operator revocation without broadcasting; persistent reuse and restart scenarios remain in tests. Offline equivalence tests compare every preparation kind, omitted and explicit options, malformed encodings and provider failures against the direct SDK.

Encryption equivalence tests compare direct SDK calls and wire calls across input types, explicit binding addresses, timeout presence, SDK failures and cancellation. Native tests use the real SDK with a synthetic relayer that returns randomized encrypted values and a fixture proof. The relayer URL path of each test context selects its fixture scenario, and the TypeScript driver asserts the SDK-side inputs, addresses and timeout presence of every recorded call. Separate canonical backend checks exercise numeric rejection errors before network access. These fixtures do not verify live cryptographic proofs.

## Regenerate bindings

Generated bindings ship with both clients. From the repository root:

```sh
pnpm sidecar:generate
sh clients/go/generate.sh
cargo run --manifest-path clients/rust/Cargo.toml -p zama-sdk-sidecar-codegen --locked
```

Use the [sidecar setup guide](../packages/sdk-sidecar/README.md) for build, test and live example commands.
