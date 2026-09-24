# Observe SDK operations from Go and Rust

Attach event handlers before starting SDK operations. The balance examples keep subscription setup in separate files and run the shared encryption, balance, offline signing and delegation sequence from one entry point.

## Go

Use [events.go](../../clients/go/examples/balance/events.go) as a complete subscription helper. It accepts the SDK context and output writer explicitly. Call `SubscribeEvents` before your workflow and defer the returned subscription's `Close` method. For managed construction, set `SDKConfig.Events` to your `EventHandlers`.

Handle `OnEvent`, `OnWalletAccountChanged` and `OnProgress` independently. Use `EventCorrelation.OperationID` to associate a notification with its RPC operation. The event's `SDKOperationID` is the SDK's separate multi-phase identifier.

Call `WaitChannelFailure(ctx, EventChannel)` to observe subscription termination. Reattach explicitly after failure if appropriate for your application. A new subscription receives future events only.

## Rust

Implement `EventHandler` as shown in [events.rs](../../clients/rust/examples/balance/events.rs), then pass it to `.events(handler)` on the SDK builder. Match `Notification::Lifecycle`, `WalletAccountChanged` and `Progress` in `on_notification`.

Call `wait_channel_closed(CallbackChannel::Events)` to observe termination. Close the managed SDK when its workflow ends. After a channel failure, build another SDK using the same storage binding when you need to preserve application-owned credentials.

## Run the examples

Follow the [configuration and build instructions](README.md#configure-the-examples), then run each complete sequence:

```sh
dc run --rm go
dc run --rm rust
```

The examples log lifecycle kinds alongside the encryption, balance, offline signing and delegation results. Their diagnostics handlers select safe metadata explicitly; they do not dump decrypted event results or error messages.

Token operations are not yet exposed by the sidecar. The examples include typed progress handling, but these operations do not produce transfer/shield/unshield progress. Adding those steps depends on the Token capability. The SDK-backed tests exercise the progress adapter in the meantime.

## Handle callback failures

Return an error from a notification handler when your local sink fails. The client acknowledges the error, and SDK orchestration continues. Go recovers handler panics as `CALLBACK_FAILED`; a Rust handler panic terminates the event subscription. Process notifications promptly: the server allows at most 256 unacknowledged deliveries and terminates the subscription when another is attempted. Native clients also bound their local queues. See the [wire contract](../../proto/README.md#cleanup-and-backpressure) for cancellation, output limits and cleanup behavior.

Return-valued callbacks such as batch decryption fallbacks are not part of this channel yet; they arrive with Token coverage.

## Verify without a wallet

From the repository root:

```sh
pnpm sidecar:build
pnpm sidecar:test
(cd clients/go && go test -race ./... && go vet ./...)
(cd clients/go/examples/balance && go test -race ./... && go vet ./...)
cargo test --manifest-path clients/rust/Cargo.toml --all-features --all-targets --locked
cargo clippy --manifest-path clients/rust/Cargo.toml --all-features --all-targets --locked -- -D warnings
```

These checks cover SDK decryption event equivalence, SDK-backed token progress ordering, native callback replies, cancellation and bounded delivery. They use synthetic fixtures. Live example runs require the wallet and RPC configuration from the setup guide.

Run both complete native examples against local synthetic Ethereum and SDK fixtures:

```sh
SIDECAR_NATIVE_TESTS=1 pnpm exec vitest run --config packages/sdk-sidecar/vitest.config.ts packages/sdk-sidecar/test/native-examples.test.ts
```

This check builds both example binaries, supplies a synthetic wallet in a temporary directory, and runs their shared setup and complete encryption, balance, offline signing and delegation sequence. It does not contact a live chain. Subscription close cancels queued notifications, so the last diagnostics message can still be pending when the example exits.
