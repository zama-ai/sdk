# Sidecar v1alpha1 contract

The canonical schema is [sidecar.proto](zama/sdk/v1alpha1/sidecar.proto). It exposes the TypeScript SDK's decryption and permit methods through unary RPCs, with a bidirectional channel for external signing. This prototype protocol can change before a stable release. Transport adapts arguments and results; `@zama-fhe/sdk` owns cryptography, credentials, defaults, caching, delegation checks, batching and recovery.

## SDK contexts

`CreateContext` creates an SDK instance from `config_json`, `signer_enabled`, an optional wallet account and storage bindings. Native clients provide typed configuration and manage callback attachment during construction. `CloseContext` ends that instance. `GetInfo` returns the SDK version.

A context owns its configuration and signer lifecycle. The process has no fixed owner or chain. Default memory storage is independent per context. Contexts sharing a storage binding share credentials according to SDK account, chain and scope rules.

For an SDK chain preset, configuration accepts:

```json
{ "chainId": 11155111, "rpcUrl": "https://your-sepolia-rpc.example" }
```

An optional `auth` value uses the SDK's `BearerToken`, `ApiKeyHeader` or `ApiKeyCookie` shape. `permitTTL`, `transportKeyPairTTL`, `transportKeyPairScope` and `registryTTL` are forwarded when supplied. Omitted values retain SDK defaults.

For multiple or custom chains, supply `chains` using SDK chain configurations; `chainId` selects the initial chain and otherwise defaults to the first entry. Do not combine `chains` with the `rpcUrl`/`auth` shorthand. Preset chains inherit SDK protocol configuration. Custom chains require their SDK chain settings.

`UpdateAccount` sets the connected wallet's address and chain, or disconnects the wallet when `account` is absent. A changed account cancels and drains existing operations in that context before changing the wallet snapshot. Repeating the current account leaves active operations running.

The SDK's inherited account-change credential/cache cleanup is asynchronous and outside the sidecar coordinator; it can overlap another SDK instance sharing the same identity and store. Completion of `UpdateAccount` acknowledges the snapshot update, not completion of every SDK lifecycle listener. Do not use it as a barrier for credential cleanup.

## Supported SDK methods

| RPC                           | SDK method                                   |
| ----------------------------- | -------------------------------------------- |
| `DecryptValues`               | `sdk.decryption.decryptValues`               |
| `DelegatedDecryptValues`      | `sdk.decryption.delegatedDecryptValues`      |
| `DecryptPublicValues`         | `sdk.decryption.decryptPublicValues`         |
| `DelegatedBatchDecryptValues` | `sdk.decryption.delegatedBatchDecryptValues` |
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

Private decryption retains SDK credential acquisition, caching, zero-handle behavior and errors. Delegated calls preserve explicit delegator and optional account parameters. Public decryption returns clear values, ABI-encoded values and the decryption proof. Delegated batch results preserve input order, per-entry values or structured SDK errors, and fatal whole-call errors. Empty-input behavior, concurrency and propagation settings retain SDK semantics.

Offline preparation accepts an explicit signer and optional delegator, independently of a connected wallet. The SDK validates permit scope, duration, signature, chain, expiry and transport-key consistency. Signing payloads remain SDK-generated; applications do not supply protocol extra-data constants.

Permit grants retain idempotent coverage and SDK-owned chunking, including empty-input behavior. Permit checks only look up stored coverage; they do not sign or generate keys. Registration and local revocation preserve requester-cache invalidation. Clearing credentials retains signer-level versus shared-key-scope behavior. Transport-key prewarming is a no-op without a connected wallet; explicit shared-scope prewarming and removal preserve SDK scope validation. Local revocation does not invalidate previously issued signatures on-chain.

## Storage bindings and callbacks

`CreateContext.storage` selects a fresh sidecar memory store, a named persistent store, or an application backend ID. Omission selects fresh memory, matching the SDK's Node default. `permit_storage` independently selects a permit store; omission aliases the primary store.

An application backend uses `StorageChannel`, a bidirectional callback channel attached to its context. The initial attachment receives an acknowledgment. Each `StorageAction` carries a request ID, backend ID, method, key and optional operation value. Replies carry a request ID, optional value or error. GET with an absent value means not found; present zero-length bytes remain distinct at the transport boundary. SET and DELETE complete only after the application replies.

Storage callbacks have no SDK operation ID: the SDK also accesses storage from lifecycle listeners outside unary operations. The adapter rejects pending requests on channel loss; it does not translate disconnects into missing values or replay uncertain mutations. Applications can recreate an SDK with the same binding after connection loss. Go also exposes explicit storage-channel reattachment. Native applications can observe termination through Go `WaitChannelFailure` or Rust `wait_channel_closed`; observing a failure does not retry an SDK operation.

Native stores receive opaque values. The TypeScript codec prefixes serialized values with `ZAMA-KV` and a version byte (`1`), followed by V8 serialization. This preserves SDK value types, including binary values and bigints. Native applications store and return those bytes unchanged; the encoding is not a Rust/Go object format. Unsupported envelope versions fail explicitly. The format is an internal credential encoding, not a portable export API.

Binding identity controls coordination within one sidecar. Reusing a native application-storage binding shares its identity across contexts; independently created bindings are isolated. Stable named bindings identify adapters accessing the same durable namespace. They do not implement locking across different sidecar processes.

## Values and optional arguments

Addresses are 20 raw bytes; encrypted handles are 32 raw bytes. `ClearValue` preserves the SDK value type with distinct bigint, number, boolean, string and undefined variants. Bigints use canonical decimal strings and never pass through floating-point conversion. The number variant uses a protobuf double, matching JavaScript numbers.

Optional scalar presence is significant. Omitted duration, timeout, maximum concurrency and propagation options remain omitted; explicit zero and false reach the SDK unchanged. Missing delegated account uses the SDK's delegator default.

`RevokePermits.contracts` is a message wrapper: absent means no argument; present with zero addresses means an explicit empty array. Go preserves this as a nil versus non-nil empty slice. Rust uses `Option`.

## Signing and operation lifecycle

Every SDK operation has a context ID and a client-generated operation ID. Clients can submit concurrent calls; the runtime coordinates credential operations sharing a storage identity and signer or key scope. There is no process-wide busy rejection.

`SignerChannel` attaches to a signer-enabled context and acknowledges attachment before delivering actions. Each action includes operation/action IDs, the wallet account and SDK EIP-712 typed data. Replies return signature bytes or a structured signing error; `SIGNING_REJECTED` represents wallet rejection.

Cancellation frames stop pending wallet callbacks. Unknown or stale replies receive an action-scoped error and do not cancel unrelated work. Clients do not automatically replay signing requests after reconnection.

A disconnected signer channel aborts operations waiting for its outstanding signing actions. The SDK context remains available for independent work. Go supports explicit signer reattachment; Rust applications recreate their managed SDK with the same storage binding. Closing the context ends its operations and SDK instance. Operation IDs do not provide durable resumption or exactly-once submission.

Cancellation does not roll back completed SDK storage changes. SDK work that cannot be interrupted may continue until it settles; credential mutation coordination remains held during that work. Go callers provide a cancellable context. Rust callers can cancel by dropping the operation future and can configure a deadline.

## Errors and transport limits

SDK errors retain their code, message, retryability and optional retry delay. Unary RPCs carry these in `zama-error-code`, `zama-error-retryable` and `zama-error-retry-after-seconds` trailers. Batch items and signer messages use the corresponding `SdkError` fields. Use the SDK code for application decisions; gRPC status also represents transport failures.

Go exposes `RPCError` and preserves `status.Code`. Rust exposes `RpcError` with the SDK details and underlying tonic status. Neither client automatically retries SDK operations or signing requests.

The server and both clients default to 4 MiB messages. The limit is configurable at each endpoint. Concurrent-stream, context and operation ceilings are optional deployment settings; there is no fixed 16-stream limit. Signer and storage channels each occupy an HTTP/2 stream. Writers honor stream backpressure rather than treating a temporarily full output buffer as failure.

RPC deadlines are independent of SDK relayer timeouts. Storage failures do not prevent unrelated metadata or public-decryption calls.

## Remaining API coverage

Encryption, Token/WrappedToken operations, registry access, delegation transactions, transaction-signing callbacks and SDK event subscriptions are not exposed in this slice. Injection of arbitrary JavaScript providers, loggers and SDK event callbacks remains outside this wire API. Native storage implementations are supported through the storage bridge. This is partial SDK coverage; the methods above delegate their SDK behavior rather than reconstructing token flows.

The native balance examples perform Ethereum contract reads in Alloy/go-ethereum and pass the resulting encrypted handle to general decryption. Full token lifecycle and web examples require additional SDK methods.

## Equivalence verification

Shared scenarios compare direct SDK calls with sidecar calls using deterministic provider and relayer fixtures and real SDK credential/decryption logic. They compare values, errors and signer interactions across signerless calls, multiple contexts/accounts, direct and delegated permits, omitted options, acquisition/reuse/recovery, public proofs, batch failures, cancellation and concurrent reads.

Go and Rust wire tests cover typed values, callback correlation, rejection and deadlines. Native recovery tests use the production context factory and retain application-owned credentials across sidecar runtime replacement. Sidecar CI runs these checks without live wallet or RPC configuration. Live examples read encrypted balances using native Ethereum libraries and invoke general decryption; persistent reuse and restart scenarios remain in tests.

## Regenerate bindings

Generated bindings ship with both clients. From the repository root:

```sh
pnpm sidecar:generate
sh clients/go/generate.sh
cargo run --manifest-path clients/rust/Cargo.toml -p zama-sdk-sidecar-codegen --locked
```

Use the [sidecar setup guide](../packages/sdk-sidecar/README.md) for build, test and live example commands.
