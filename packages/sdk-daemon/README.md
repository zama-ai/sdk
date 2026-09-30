# Zama SDK daemon

The daemon runs the Zama SDK for Go and Rust applications. Your application talks to it over a private Unix socket through the Go or Rust client.

The daemon and its Go and Rust clients are experimental. The wire protocol can change between minor versions, so upgrade the daemon image and the clients together.

Run one daemon per application instance, on the same host or in the same Kubernetes pod, under the same UID. Run the image at exactly the same version as your client.

```sh
docker run -d --name zama-daemon \
  --user "$(id -u):$(id -g)" \
  --env ZAMA_SDK_DAEMON_SOCKET_PATH=/run/zama/sdk.sock \
  --mount "type=bind,src=$PWD/zama-daemon-socket,dst=/run/zama" \
  zamafhe/sdk-daemon
```

The socket directory must exist, belong to your UID, and have mode `0700`.

## Documentation

The [Zama SDK documentation](https://docs.zama.org/protocol/sdk/beta/overview#go-and-rust) covers the Go and Rust quick starts, configuration, production deployment on a host or in Kubernetes, and upgrades.

To build or test the daemon, see [Contributing](https://github.com/zama-ai/sdk/blob/main/CONTRIBUTING.md#daemon-and-native-clients).
