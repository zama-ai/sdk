# Zama SDK daemon

The daemon runs the Zama SDK for Go and Rust applications. Your application talks to it over a private Unix socket through the Go or Rust client.

The daemon and its Go and Rust clients are experimental. The wire protocol can change between minor versions, so upgrade the daemon image and the clients together.

Run one daemon per application instance, on the same host or in the same Kubernetes pod, under the same UID. Run the image at exactly the same version as your client.

Start it with the Compose file from the release that matches your client, and include that file from your application's `compose.yaml`:

```sh
export ZAMA_SDK_VERSION=3.7.0-beta.7
curl -fsSL -o zama-sdk-daemon.yaml "https://raw.githubusercontent.com/zama-ai/sdk/v${ZAMA_SDK_VERSION}/packages/sdk-daemon/deploy/compose.yaml"
docker compose -f zama-sdk-daemon.yaml up -d --wait
```

[Deploy in production](https://docs.zama.org/protocol/sdk/beta/native/operations/run-in-production) explains how to connect your application to the daemon's socket, on a Linux host or in containers.

## Documentation

The [Zama SDK documentation](https://docs.zama.org/protocol/sdk/beta/overview#go-and-rust) covers the Go and Rust quick starts, configuration, production deployment, and upgrades.

To build or test the daemon, see [Contributing](https://github.com/zama-ai/sdk/blob/main/CONTRIBUTING.md#daemon-and-native-clients).
