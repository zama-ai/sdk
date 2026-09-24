# Encrypt inputs, decrypt a balance, prepare an offline transaction and manage on-chain delegation from Rust or Go

Use the maintained, permanently beta sidecar of `@zama-fhe/sdk` for external partner applications. Run it in Docker and drive it from a native Rust or Go application. Each entry point encrypts contract inputs, decrypts a balance, asks the SDK to prepare a transaction that the application signs locally, then grants and revokes an on-chain decryption delegation. Both examples print:

```text
Encrypted input 0: 0x<handle>
Encrypted input 1: 0x<handle>
Encrypted input 2: 0x<handle>
Input proof: 0x<proof bytes>
User Address: <wallet address>
Token: <name> (<token address>) https://eth-sepolia.blockscout.com/token/<token address>
Encrypted balance: <ciphertext handle>
Decrypted balance: <raw amount>
Prepared transaction: SetOperator
Signed transaction: 0x<signed transaction bytes>
Signed transaction hash: 0x<transaction hash>
Not broadcast; the caller submits the signed bytes.
Delegate: <delegate address>
Delegation before: <state>
Delegation granted: <0x transaction hash>
Delegation after grant: <state>
Waiting for the next block before revoking.
Delegation revoked: <0x transaction hash>
Delegation after revoke: <state>
```

If the delegation is already active before the demo runs, the delegation
step instead prints `Delegation before: <state>` followed by
`Existing delegation left in place; the demo only revokes what it granted.`
and skips granting and revoking.

The encryption step passes typed plaintext inputs and explicit user/contract addresses to `sdk.encrypt`. The native application reads the token using Alloy or go-ethereum. It passes the encrypted handle to `sdk.decryption.decryptValues` through the sidecar. The SDK requests a wallet signature only when its credential flow needs one. The delegation step broadcasts two real Sepolia transactions from the test wallet (grant then revoke) and needs gas; it never revokes a delegation it did not itself grant. The grant uses a 2-hour expiry, and the demo waits for the chain to advance a block past the grant before revoking: the ACL contract accepts only one delegate or revoke per tuple per block, so the demo needs two mined transactions with a block in between.

## Configure the examples

Run the commands from the repository root with Docker Compose installed. Copy the template, keeping any existing local configuration:

```sh
cp -n .env.sidecar.example .env.sidecar.local
```

Fill `.env.sidecar.local` with your Sepolia RPC URL, wallet address, confidential token address and test wallet private key. Leave `RELAYER_API_KEY` empty for the public Sepolia relayer. `DELEGATE_ADDRESS` is optional; it defaults to `0x2222222222222222222222222222222222222222` and must differ from the owner address. These values configure the example application; the sidecar has no process-wide owner or chain.

The file is mounted only into the native examples. The sidecar does not receive it.

```sh
chmod 600 .env.sidecar.local
export SIDECAR_UID="$(id -u)"
export SIDECAR_GID="$(id -g)"

dc() {
  docker compose --env-file .env.sidecar.local \
    -f packages/sdk-sidecar/compose.yaml "$@"
}
```

> [!WARNING]
> Use a test wallet. Only the native example containers receive the example configuration file. The sidecar handles plaintext and stores decryption credentials; protect its socket and chosen credential store. See the [trust boundary](SECURITY.md).

## Build and start

```sh
dc --profile examples build
dc up --wait sidecar
dc ps
```

The sidecar should report healthy. Node runs inside its container. The Go and Rust example containers need network access to read the Sepolia RPC; they communicate with the sidecar through the private shared Unix socket.

## Run both examples

```sh
dc run --rm go
dc run --rm rust
```

Use the [Go example](../../clients/go/examples/balance/main.go) or [Rust example](../../clients/rust/examples/balance/main.rs) as a starting point. Each entry point loads shared configuration, connects its wallet/provider, creates an SDK context, then runs the encryption, balance and offline steps. Setup lives in Go `config.go`/`ethereum.go` and Rust `support.rs`; `balance.go`/`balance.rs` receive SDK, provider, token and owner dependencies explicitly. Application-owned memory storage is the example default. The client manages callback channels. The encryption step sends `1000` as `euint64`, `true` as `ebool`, and the user address as `eaddress`, built with Go `Euint64`/`Ebool`/`Eaddress` or Rust `EncryptInput::Uint64`/`Bool`/`Address`. It prints one `Encrypted input <i>` line per returned handle, then the input proof.

The offline step in `offline.go`/`offline.rs` asks the SDK to prepare a `SetOperator` revocation (`until: 1`), checks the prepared `TransactionKind` enum and that the prepared sender matches the local key, and signs the unsigned EIP-1559 bytes with the native Ethereum library. Signing keys stay in the application, and submitting the signed bytes is the caller's responsibility.

The delegation step in `delegation.go`/`delegation.rs` runs after the offline step and uses the same wallet's transaction signing and broadcasting adapter to grant and revoke an on-chain decryption delegation for real, through [`sdk.delegations`](DELEGATIONS.md). A write step for token transactions still requires the upcoming token RPCs. See [transaction callbacks](TRANSACTIONS.md) and [manage on-chain delegation](DELEGATIONS.md) for custom wallets and failure handling.

The encrypted balance is the contract's ciphertext handle. The decrypted value is the raw amount for that same handle, without decimal formatting.

## Rebuild and restart

After changing code, rebuild and recreate the sidecar:

```sh
dc --profile examples build
dc up --force-recreate --wait sidecar
dc run --rm go
dc run --rm rust
```

With the default `CREDENTIAL_STORAGE=application-memory`, the examples store credentials in their own process memory. Each `dc run` starts a new process and therefore a new store. A sidecar restart preserves application-owned credentials only while that application/store remains alive, or when its backend is persistent.

The default Compose setup mounts only the socket into the sidecar. It does not require a credential volume. Stop it with `dc down`.

## Integrate your application

Use [clients/go](../../clients/go) or [clients/rust](../../clients/rust). Generated bindings are checked in; application builds require neither Node nor a protobuf compiler. Images and language packages are not published yet.

Create one SDK context for each configuration and signer lifecycle your application needs. Build the configuration with Go `NewSDKConfig(chainID, rpcURL)` or Rust `SdkConfig::new(chain_id, rpc_url)`. Both clients encode the typed protobuf configuration directly; your application does not serialize SDK configuration as JSON.

Supply a signer for private decryption. The Go Ethereum adapter and the optional Rust Alloy adapter sign EIP-712 typed data and broadcast contract writes; custom wallet callbacks remain supported. A context without a signer supports encryption, public decryption and the SDK's signer-independent offline and permit operations. Close contexts when finished.

Observe callback-channel termination with Go `WaitChannelFailure(ctx, SignerChannel)` / `StorageChannel` / `EventChannel`, or Rust `wait_channel_closed(CallbackChannel::Signer)` / `CallbackChannel::Storage` / `CallbackChannel::Events`. Go supports explicit reattachment. In Rust, close the failed SDK and build another with the same storage binding. Interrupted operations are not retried automatically.

For a local deployment, place the native application and sidecar in the same Linux environment with matching UID and a private shared socket directory. Docker Desktop uses a named volume between containers; a macOS host cannot access the Linux VM's socket through a normal bind mount.

The [wire contract](../../proto/README.md) describes supported methods, context updates, errors, cancellation and remaining API coverage.

## Choose credential storage

Storage is an SDK-instance choice. Permits use the same backend unless you explicitly choose a separate permit store.

| Choice                   | Where credentials live                         | Lifetime                                           |
| ------------------------ | ---------------------------------------------- | -------------------------------------------------- |
| Default sidecar memory   | The SDK instance in the sidecar                | Until that instance is closed or the sidecar exits |
| Named persistent storage | An optional sidecar SQLite volume              | Across SDK instances and sidecar restarts          |
| Application storage      | A Rust/Go backend supplied by your application | Controlled by your backend                         |

The examples use `ApplicationStorage(NewMemoryStorage())` in Go and `ApplicationStorage::new(MemoryStorage::default())` in Rust. Reuse the same binding across SDK instances to share the backend and its coordination identity.

For a custom backend, implement [Go Storage](../../clients/go/storage.go) or [Rust NativeStorage](../../clients/rust/src/storage.rs). The interface accepts keys and opaque bytes, with a distinct missing-value result. For example, an application can store those bytes in a PostgreSQL `bytea` column while retaining its database connection and authentication locally. The native application does not deserialize SDK credentials.

Use Go `NamedApplicationStorage` or Rust `ApplicationStorage::shared` for adapters accessing the same durable namespace. A matching name coordinates credential operations within one sidecar; it does not provide distributed database locking across multiple sidecars. Backend methods must support concurrent calls. Rust futures and Go contexts carry callback cancellation when the storage channel closes.

Select Go `PersistentStorage("partner")` or Rust `Storage::Persistent("partner".into())` to use sidecar persistence. That deployment must set `SIDECAR_STORAGE_DIR` and mount a private writable directory there. Named stores are isolated; reusing a name intentionally shares the store. The default Compose example does not configure this option.

Set Go `SDKConfig.PermitStorage` or Rust builder `.permit_storage(...)` to separate permits from transport keys. Omission preserves the SDK default of sharing the primary store.

## Configure SDK options

Set only the options your application needs. Leaving them absent preserves SDK and provider defaults. Both examples accept these settings in `.env.sidecar.local`:

```dotenv
CREDENTIAL_STORAGE=application-memory
SDK_SINGLE_THREAD=true
SDK_BATCH_RPC_CALLS=true
SDK_RPC_TIMEOUT_MS=10000
```

`SDK_SINGLE_THREAD` configures the SDK process runtime. Start a fresh sidecar when changing it: the first SDK configuration in that process wins, even when it omits runtime options. Later explicit runtime settings produce an SDK warning on sidecar stderr. `SDK_BATCH_RPC_CALLS` configures the Sepolia node relayer. `SDK_RPC_TIMEOUT_MS` configures HTTP requests made by the sidecar provider; it does not change the native application's RPC client.

Select `CREDENTIAL_STORAGE=sidecar-memory` for the SDK instance's memory store. For sidecar persistence, select `CREDENTIAL_STORAGE=persistent` and set `CREDENTIAL_STORE_NAME`, then configure the private storage volume described above.

The native API also supports runtime WASM loading, module versions, thread count and fallback auth; per-chain node/cleartext relayers and their typed options; and provider headers, retries, batching and polling. Use [Go configuration types](../../clients/go/config_options.go) or [Rust configuration types](../../clients/rust/src/config_options.rs). Encryption-key material uses raw byte slices or vectors. Explicitly empty relayer and header maps remain distinct from omitted maps. Prefetched FHE encryption keys are commonly about 50 MiB, so increase both the server and native client message limits before sending one. See the [wire configuration contract](../../proto/README.md#runtime-relayers-and-providers) for option names and unsupported JavaScript injection points.

## Protect stored transport keys

Provide `TRANSPORT_KEY_PAIR_DERIVATION_SECRET` in the example configuration from a secrets manager or cryptographically secure random source. The SDK accepts strings of at least 64 characters, or byte inputs of at least 32 bytes through the native API. A length check does not establish randomness. The examples forward text exactly; they do not decode it as hex.

Leave the variable absent to omit credential protection. An explicitly empty value reaches SDK validation and fails. In application code, use Go `TextDerivationSecret`/`BytesDerivationSecret` or Rust `DerivationSecret::text`/`::bytes`. To express protection enabled without an available secret, use Go `MissingDerivationSecret()` or Rust `DerivationSecret::missing()`; the SDK rejects this configuration.

Retain the same secret and credential backend when recreating an SDK or restarting the sidecar. Secrets are instance inputs, never stored with credentials. Keep them out of application logs. The SDK handles wrapping, unwrapping, validation and recovery. Protected stored credentials without their required secret fail according to SDK behavior.

Run the same single command for each complete demo after changing setup:

```sh
dc run --rm go
dc run --rm rust
```

The balance workflow currently reads the encrypted handle with the native Ethereum library and uses SDK decryption. Integration with `Token.balanceOf` and other token steps is deferred until those native public APIs are exposed. On-chain delegation is exposed through the delegation step described above. Credential reuse and restart behavior are exercised through SDK-backed integration tests.

## Transport configuration

Messages default to a 4 MiB maximum in the server and both clients. Larger batches and prefetched FHE encryption keys require `SIDECAR_MAX_MESSAGE_BYTES` on the server plus the matching native client option: Go `DialOptions.MaxMessageBytes`, or Rust `Client::with_message_limit`. Set both limits above the encoded request size; prefetched keys are commonly about 50 MiB.

`SIDECAR_MAX_CONCURRENT_STREAMS`, `SIDECAR_MAX_CONTEXTS` and `SIDECAR_MAX_OPERATIONS_PER_CONTEXT` optionally set deployment resource limits. The sidecar does not impose the prototype's fixed 16-stream, 64-context or 128-operation caps by default. Each active signer, application-storage or event channel uses one stream.

## Develop and test

With Node 24+, pnpm 11.1.2, Go 1.27.1 and Rust 1.98.1 installed:

```sh
pnpm install
pnpm sidecar:generate
sh clients/go/generate.sh
cargo run --manifest-path clients/rust/Cargo.toml -p zama-sdk-sidecar-codegen --locked
pnpm sidecar:build
pnpm sidecar:test
(cd clients/go && go test -race ./... && go vet ./...)
(cd clients/go/examples/balance && go test -race ./... && go vet ./...)
cargo test --manifest-path clients/rust/Cargo.toml --all-features --all-targets --locked
cargo clippy --manifest-path clients/rust/Cargo.toml --all-features --all-targets --locked -- -D warnings
```

Run `SIDECAR_NATIVE_TESTS=1 pnpm sidecar:test` for the native integration suite. It verifies protected application-owned credentials across replacement of the SDK runtime: both native drivers retain their memory stores and decrypt fresh handles without another signature. It also builds and runs both complete examples against synthetic RPC and SDK fixtures, including caller configuration, storage callbacks, signing, optional credential protection, encryption and the offline step, and checks the recovered signer of the locally signed transaction and that nothing is broadcast. No live wallet or RPC is used.

Offline equivalence tests compare all 11 preparation kinds with the direct SDK, including overrides, defaults and errors. These checks use synthetic data. The Docker commands above exercise live encryption, RPC reads, signing, decryption and local transaction signing with your configured wallet.

The Go example is a separate module. Regenerate its typed contract bindings with `(cd clients/go/examples/balance && go generate ./contracts)`. Sidecar CI checks both native clients, binding generation, and SDK equivalence without a live wallet or RPC.

To run only native encryption and the complete example sequences with synthetic configuration:

```sh
SIDECAR_NATIVE_TESTS=1 pnpm --filter @zama-fhe/sdk-sidecar exec vitest run --config vitest.config.ts test/native-encryption.test.ts test/native-examples.test.ts
```

Encryption checks cover lossless values, explicit binding addresses, timeout presence (omitted keeps the SDK default, zero is a zero-millisecond budget), SDK errors, canonical backend rejection and cancellation. The complete examples also exercise shared runtime/provider settings and protected credentials. Synthetic encryption proofs are inspectable fixture data; live cryptographic verification remains separate.

## Event subscriptions

Both native examples attach metadata-only lifecycle diagnostics before running the shared encryption, balance, offline preparation and delegation sequence. Subscription helpers remain separate from workflow steps. See [event delivery and diagnostics](EVENTS.md) for ordering, cleanup, backpressure and the explicitly unresolved Token batch-fallback integration.
