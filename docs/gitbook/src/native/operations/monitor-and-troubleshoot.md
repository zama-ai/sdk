---
description: Monitor daemon-backed Go and Rust operations and diagnose daemon failures.
---

# Monitor and troubleshoot

Monitor daemon-backed operations from your Go or Rust application. Record elapsed time and returned error codes for each operation, and monitor daemon container liveness separately.

## Available signals

| Signal                                           | Meaning                                                                                                               |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Container healthcheck                            | The daemon answers `GetInfo` on its socket. It does not check RPC or relayer reachability.                            |
| `Daemon ready.` on stdout                        | The daemon has started its socket server.                                                                             |
| Startup failure line on stderr and exit code `1` | Configuration or startup failed.                                                                                      |
| SDK warning and error messages on stderr         | Plain-text SDK diagnostics, without attached data objects.                                                            |
| Client errors                                    | SDK or daemon code, message, retryability, and a retry delay when available. Transport failures may lack an SDK code. |

The daemon does not expose a metrics endpoint or structured request logs. Use application-observed operation latencies and errors as the service-level signals. Use the socket healthcheck as a liveness probe.

In Go, inspect `SDKError` and `RPCError`. In Rust, inspect `ClientError::kind()` and `ClientError::sdk_error()`. Include operation names and error codes in your metrics without including plaintext values, credentials, or signing payloads.

## Daemon exits at startup

1. Read the startup failure line on stderr.
2. Confirm `ZAMA_SDK_DAEMON_SOCKET_PATH` is an absolute path and its parent exists.
3. Check that the socket directory belongs to the daemon UID and has no group or other permissions.
4. Confirm another daemon is not listening on the configured socket.
5. Check configured values against the [configuration reference](../reference/daemon-configuration.md), then restart.

The daemon reclaims an owned stale socket only after confirming no listener is active. Do not delete a live socket to start a second daemon.

## Healthcheck passes but SDK operations fail

1. Inspect the client error code and operation latency.
2. Check the SDK context's chain configuration, RPC endpoint, relayer configuration, and authentication.
3. Verify outbound connectivity from the daemon's environment to those endpoints.
4. Check whether your application's signer or storage callback channel has terminated.

An available socket does not mean upstream services are available. Restarting a healthy daemon will not correct an upstream outage or invalid credentials.

## Named persistence cannot open

The client reports `STORAGE_NOT_PRIVATE` when the storage directory or a credential file isn't private to the daemon UID, and `STORAGE_OPEN_FAILED` for any other open failure. The daemon also writes the code to stderr.

1. Confirm `ZAMA_SDK_DAEMON_STORAGE_DIR` points to the intended private writable volume.
2. Verify directory and credential-file ownership and permissions under the daemon UID.
3. Confirm no other daemon uses the same credential volume.
4. Confirm the filesystem supports reliable local SQLite locking.

A named database opens when an SDK context first selects it, so a successful startup or healthcheck doesn't prove persistent storage works.

## Client reports `STORAGE_FAILED`

1. Pause application operations that use the affected store.
2. Correct the underlying filesystem problem, such as unavailable storage or exhausted space.
3. Restart the daemon and recreate SDK contexts with the same store names and derivation secret.
4. Run a decryption before restoring traffic.

After a SQLite access failure, that store rejects every further access until the daemon restarts. Operations that don't use credentials keep working.

## Signatures are requested unexpectedly

Check whether the application reused the same durable store and derivation secret. Memory storage is lost when its owning process or SDK context ends.

For replicas sharing application-owned storage, inspect concurrent operations on the same user. Coordination is local to each daemon, so races can produce additional signature requests or conflicting credential updates. Application backend methods must support concurrent calls.

## Callback channel closes or a transaction times out

Observe channel termination through the client and follow [Recover from disconnections](../guides/recover-from-disconnections.md). The clients never replay interrupted operations.

A timeout or cancellation doesn't prove that a credential change or broadcast didn't happen. Check the outcome before retrying; for writes, follow [Resolve uncertain transaction outcomes](../guides/uncertain-transaction-outcomes.md).

## Daemon restarted unexpectedly

SDK contexts belong to the daemon process and don't survive a restart.

1. Confirm the daemon is running again and its healthcheck passes.
2. Recreate SDK contexts and callback channels with the same storage configuration and derivation secret.
3. Check interrupted credential operations and transactions before retrying them.
4. Run an operation that reaches your RPC endpoint and relayer, then resume traffic.

Daemon memory storage is lost at restart. Application memory storage survives only while your application process keeps running. Lost credentials mean users sign again.
