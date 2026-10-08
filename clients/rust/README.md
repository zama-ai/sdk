# Zama SDK for Rust

Use the Zama SDK from Rust to encrypt inputs for confidential smart contracts and decrypt the results your account is authorized to read. The client talks to a local SDK daemon that runs alongside your application over a private Unix socket.

The daemon and its Go and Rust clients are experimental. The wire protocol can change between minor versions, so upgrade the daemon image and the clients together.

## Installation

```sh
cargo add zama_sdk@=3.7.0-beta.6
```

Run the `zamafhe/sdk-daemon` image at exactly the same version as the client. Enable the `alloy` feature for the Alloy signing and transaction adapters.

## Documentation

Start with the Rust quick start in the [Zama SDK documentation](https://docs.zama.org/protocol/sdk/beta/overview#go-and-rust). It covers installing the client, starting the daemon, configuration, wallets, and production deployment.

The crate reference is on [docs.rs](https://docs.rs/zama_sdk).

To build or test the client, see [Contributing](https://github.com/zama-ai/sdk/blob/main/CONTRIBUTING.md#daemon-and-native-clients).
