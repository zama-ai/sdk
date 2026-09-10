# Decrypt a confidential balance from Rust or Go

Run `@zama-fhe/sdk` in a Docker sidecar and decrypt a balance from a native Rust or Go application. Both examples print:

```text
User Address: <wallet address>
Token: <name> (<token address>) https://eth-sepolia.blockscout.com/token/<token address>
Encrypted balance: <ciphertext handle>
Decrypted balance: <raw amount>
```

The native application reads the token using Alloy or go-ethereum. It passes the encrypted handle to `sdk.decryption.decryptValues` through the sidecar. The SDK requests a wallet signature only when its credential flow needs one.

## Configure the examples

Run the commands from the repository root with Docker Compose installed. Copy the template, keeping any existing local configuration:

```sh
cp -n .env.sidecar.example .env.sidecar.local
```

Fill `.env.sidecar.local` with your Sepolia RPC URL, wallet address, confidential token address and test wallet private key. Leave `RELAYER_API_KEY` empty for the public Sepolia relayer. These values configure the example application; the sidecar has no process-wide owner or chain.

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

Use the [Go example](../../clients/go/examples/balance/main.go) or [Rust example](../../clients/rust/examples/balance/main.rs) as a starting point. Each loads its wallet locally and creates an SDK with typed configuration, a signer adapter and application-owned memory storage. The client manages callback channels. Neither example sends blockchain transactions.

The encrypted balance is the contract's ciphertext handle. The decrypted value is the raw amount for that same handle, without decimal formatting.

## Rebuild and restart

After changing code, rebuild and recreate the sidecar:

```sh
dc --profile examples build
dc up --force-recreate --wait sidecar
dc run --rm go
dc run --rm rust
```

The examples store credentials in their own process memory. Each `dc run` starts a new process and therefore a new store. A sidecar restart preserves application-owned credentials only while that application/store remains alive, or when its backend is persistent.

The default Compose setup mounts only the socket into the sidecar. It does not require a credential volume. Stop it with `dc down`.

## Integrate your application

Use [clients/go](../../clients/go) or [clients/rust](../../clients/rust). Generated bindings are checked in; application builds require neither Node nor a protobuf compiler. Images and language packages are not published yet.

Create one SDK context for each configuration and signer lifecycle your application needs. Pass a configuration such as:

```json
{ "chainId": 11155111, "rpcUrl": "https://your-sepolia-rpc.example" }
```

Supply a signer for private decryption. The Go private-key helper and optional Rust Alloy adapter handle EIP-712 signing; custom signing implementations remain supported. A context without a signer supports public decryption and the SDK's signer-independent offline and permit operations. Close contexts when finished.

Observe callback-channel termination with Go `WaitChannelFailure(ctx, SignerChannel)` / `StorageChannel`, or Rust `wait_channel_closed(CallbackChannel::Signer)` / `CallbackChannel::Storage`. Go supports explicit reattachment. In Rust, close the failed SDK and build another with the same storage binding. Interrupted operations are not retried automatically.

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

## Transport configuration

Messages default to a 4 MiB maximum in the server and both clients. Configure larger batches using `SIDECAR_MAX_MESSAGE_BYTES` and the matching native client option: Go `DialOptions.MaxMessageBytes`, or Rust `Client::with_message_limit`.

`SIDECAR_MAX_CONCURRENT_STREAMS`, `SIDECAR_MAX_CONTEXTS` and `SIDECAR_MAX_OPERATIONS_PER_CONTEXT` optionally set deployment resource limits. The sidecar does not impose the prototype's fixed 16-stream, 64-context or 128-operation caps by default. Each active signer or application-storage channel uses one stream.

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

To verify application-owned credentials across replacement of the SDK runtime, run `SIDECAR_NATIVE_TESTS=1 pnpm sidecar:test`. This launches both native test drivers, retains their memory stores, replaces the TypeScript runtime, and checks that fresh handles decrypt without another signature.

These checks use synthetic data. The Docker commands above exercise live RPC reads, signing and decryption with your configured wallet.

The Go example is a separate module. Regenerate its typed contract bindings with `(cd clients/go/examples/balance && go generate ./contracts)`. Sidecar CI checks both native clients, binding generation, and SDK equivalence without a live wallet or RPC.
