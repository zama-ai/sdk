---
description: Environment variables that configure the Zama SDK daemon used by Go and Rust applications.
---

# Daemon configuration

The daemon reads its process configuration from environment variables at startup. Chain, relayer, and storage choices belong to each SDK context and are set by your application; see [Configuration](../../guides/configuration.md).

## Process environment

| Variable                                     | Default              | Purpose                                                                                                                                          |
| -------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ZAMA_SDK_DAEMON_SOCKET_PATH`                | Required; no default | Absolute path of the Unix socket the daemon listens on. Its parent directory must be private to the daemon UID.                                  |
| `ZAMA_SDK_DAEMON_STORAGE_DIR`                | Unset                | Absolute path of the directory holding daemon SQLite credential stores. Contexts that select named persistent storage fail while it is unset.    |
| `ZAMA_SDK_DAEMON_MAX_MESSAGE_BYTES`          | `4194304`            | Largest request or response message, in bytes. Set the matching limit in the client.                                                             |
| `ZAMA_SDK_DAEMON_MAX_CONCURRENT_STREAMS`     | Unset (no limit)     | Maximum concurrent gRPC streams per connection. Each attached signer, application storage, or event channel holds one stream.                    |
| `ZAMA_SDK_DAEMON_MAX_CONTEXTS`               | Unset (no limit)     | Maximum open SDK contexts. Creating another context fails with `RESOURCE_EXHAUSTED`.                                                             |
| `ZAMA_SDK_DAEMON_MAX_OPERATIONS_PER_CONTEXT` | Unset (no limit)     | Maximum in-flight operations per SDK context. Another operation fails with `RESOURCE_EXHAUSTED`.                                                 |
| `ZAMA_SDK_DAEMON_SHUTDOWN_TIMEOUT_MS`        | `120000`             | Longest wait, in milliseconds, for running SDK work after `SIGTERM` or `SIGINT`. Past it, the daemon removes its socket and exits with status 1. |

Numeric limits must be positive integers. The daemon exits at startup when a path is relative or a limit is invalid.

The client message limit is set with Go `DialOptions.MaxMessageBytes` or Rust `Client::with_message_limit`.
