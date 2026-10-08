---
description: Replace the Zama SDK daemon and its Go or Rust client without losing stored credentials.
---

# Upgrade the daemon

Upgrade the daemon and your Go or Rust application as one pair. The daemon image and the client must run the same version; see [Client and daemon compatibility](../reference/client-and-daemon-compatibility.md).

## Choose a rollout

The rollout you can use depends on where credentials live:

| Credential storage                | Rollout                                   | Why                                                                                                            |
| --------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Application-owned storage         | Rolling or blue/green, with no downtime   | Old and new pairs read the same backend. Overlapping pairs can race on one user's credentials.                 |
| Daemon SQLite on a per-pod volume | Stop the old pair, then start the new one | Each database is locked to one daemon. In Kubernetes, use the `Recreate` strategy with `ReadWriteOnce` claims. |
| Daemon memory                     | Either                                    | Nothing is retained; users sign again after the upgrade.                                                       |

SDK contexts and in-flight operations never move between daemons. The new pair creates its own SDK contexts.

## Replace the pair

1. Keep the current application and daemon images available for rollback.
2. Stop sending new operations to the old pair and let in-flight operations finish.
3. Close the application's SDK contexts and client connections.
4. Send `SIGTERM` to the old daemon and wait for it to exit. It waits up to `ZAMA_SDK_DAEMON_SHUTDOWN_TIMEOUT_MS` (120 seconds by default) for SDK work that is still running, then logs `SHUTDOWN_DEADLINE_EXCEEDED` and exits with status 1. Set your platform's stop grace period above this timeout so the daemon exits before it is killed; the deployment examples use 150 seconds.
5. Start the new daemon and application with the same storage configuration and derivation secret.
6. Recreate SDK contexts, then run an operation that reaches your RPC endpoint and relayer before resuming traffic.

A forced stop during a write can leave its outcome unknown. Follow [Resolve uncertain transaction outcomes](../guides/uncertain-transaction-outcomes.md) before repeating it.

## Roll back

Stop the new pair and start the previous images with the same storage and derivation secret. If the new version wrote credentials the previous version can't read, restore the storage backup taken before the upgrade; see [Back up daemon SQLite storage](run-in-production.md#back-up-daemon-sqlite-storage). Never run the old and new daemons against one SQLite volume at the same time.
