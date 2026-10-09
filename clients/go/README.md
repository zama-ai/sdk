# Zama SDK for Go

Use the Zama SDK from Go to encrypt inputs for confidential smart contracts and decrypt the results your account is authorized to read. The client talks to a local SDK daemon that runs alongside your application over a private Unix socket.

The daemon and its Go and Rust clients are experimental. The wire protocol can change between minor versions, so upgrade the daemon image and the clients together.

## Installation

```sh
go get github.com/zama-ai/sdk/clients/go/v3@v3.7.0-beta.8
```

Run the `ghcr.io/zama-ai/sdk-daemon` image at exactly the same version as the client.

## Documentation

Start with the Go quick start in the [Zama SDK documentation](https://docs.zama.org/protocol/sdk/beta/overview#go-and-rust). It covers installing the client, starting the daemon, configuration, wallets, and production deployment.

Run `go doc -all github.com/zama-ai/sdk/clients/go/v3` for the package reference.

To build or test the client, see [Contributing](https://github.com/zama-ai/sdk/blob/main/CONTRIBUTING.md#daemon-and-native-clients).
