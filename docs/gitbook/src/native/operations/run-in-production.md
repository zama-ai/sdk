---
description: Deploy the Zama SDK daemon next to a Go or Rust application on your infrastructure.
---

# Deploy in production

{% hint style="warning" %}
The daemon and its Go and Rust clients are experimental. The wire protocol can change between minor versions, so upgrade the daemon image and the clients together.
{% endhint %}

Deploy one daemon per Go or Rust application instance. Run both on the same host or in the same Kubernetes pod, as the same UID, sharing a private Unix socket directory.

## Prerequisites

- Select the daemon image tag and client version from [Client and daemon compatibility](../reference/client-and-daemon-compatibility.md).
- Reserve one trust domain for each application-and-daemon pair. Read the [daemon trust model](../concepts/trust-boundary.md).
- Allow the daemon outbound access to your chain RPC endpoints and relayer.
- Choose a credential storage backend in [Configuration](../../guides/configuration.md), and provision any derivation secret through your secrets manager.

There is no network listener. Keep the application and its daemon on the same host or in the same pod, and don't expose the socket through a network proxy.

## Prepare the socket and storage

1. Create a socket directory owned by the application UID with mode `0700`. The daemon refuses to start when the directory is shared with its group or other users.
2. For daemon SQLite storage, provision a private writable volume for this daemon and set `ZAMA_SDK_DAEMON_STORAGE_DIR` to its mount path. The daemon creates one `0700` subdirectory per named store.
3. For application-owned storage, configure the backend in your application. The daemon needs no credential volume.

{% hint style="warning" %}
Two daemons must not share a SQLite credential volume: each named database is locked to one daemon. Replicas can share application-owned storage, but credential coordination does not span daemons, so concurrent replicas can race on the same user's credentials and cause extra signature prompts.
{% endhint %}

## Run on a host

This command starts the daemon on a Linux host for an application running under your current UID, with daemon SQLite storage enabled:

```bash
export ZAMA_DAEMON_ROOT="${PWD}/zama-daemon"
mkdir -p "$ZAMA_DAEMON_ROOT/socket" "$ZAMA_DAEMON_ROOT/storage"
chmod 700 "$ZAMA_DAEMON_ROOT/socket" "$ZAMA_DAEMON_ROOT/storage"

docker run -d \
  --name zama-daemon \
  --user "$(id -u):$(id -g)" \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges:true \
  --stop-timeout 150 \
  --env ZAMA_SDK_DAEMON_SOCKET_PATH=/run/zama/sdk.sock \
  --env ZAMA_SDK_DAEMON_STORAGE_DIR=/var/lib/zama \
  --mount "type=bind,src=$ZAMA_DAEMON_ROOT/socket,dst=/run/zama" \
  --mount "type=bind,src=$ZAMA_DAEMON_ROOT/storage,dst=/var/lib/zama" \
  zamafhe/sdk-daemon:VERSION
```

Replace `VERSION` with the release that matches your client. Connect the application to `$ZAMA_DAEMON_ROOT/socket/sdk.sock`. Drop the storage mount and `ZAMA_SDK_DAEMON_STORAGE_DIR` when you use application-owned storage.

For a containerized application, mount the same socket directory into its container and run it as the same UID. On Docker Desktop, share a named volume between the containers; the host can't reach a socket inside the Linux VM through a bind mount.

## Run in Kubernetes

Run the daemon as a second container in your application pod. This pod spec shares an `emptyDir` socket volume, runs both containers as UID `1000`, and gives the daemon a persistent volume for SQLite storage:

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  terminationGracePeriodSeconds: 150
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
  initContainers:
    - name: socket-dir
      image: zamafhe/sdk-daemon:VERSION
      command: ["mkdir", "-p", "-m", "0700", "/run/zama/socket"]
      volumeMounts:
        - { name: zama-socket, mountPath: /run/zama }
      securityContext: &restricted
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities: { drop: [ALL] }
  containers:
    - name: zama-daemon
      image: zamafhe/sdk-daemon:VERSION
      env:
        - { name: ZAMA_SDK_DAEMON_SOCKET_PATH, value: /run/zama/socket/sdk.sock }
        - { name: ZAMA_SDK_DAEMON_STORAGE_DIR, value: /var/lib/zama }
      volumeMounts:
        - { name: zama-socket, mountPath: /run/zama }
        - { name: zama-storage, mountPath: /var/lib/zama }
      livenessProbe:
        exec:
          command: ["node", "dist/healthcheck.js"]
        periodSeconds: 10
        timeoutSeconds: 5
      securityContext: *restricted
    - name: app
      image: your-registry/your-app:VERSION
      env:
        - { name: DAEMON_SOCKET, value: /run/zama/socket/sdk.sock }
      volumeMounts:
        - { name: zama-socket, mountPath: /run/zama }
      securityContext: *restricted
  volumes:
    - name: zama-socket
      emptyDir: {}
    - name: zama-storage
      persistentVolumeClaim:
        claimName: zama-daemon-storage
```

The init container creates a private socket directory inside the shared volume; the daemon checks only that directory. The liveness probe runs the healthcheck bundled in the image and uses the socket path from the container environment.

For several replicas with SQLite storage, give each pod its own `ReadWriteOnce` claim, for example through a StatefulSet `volumeClaimTemplates` entry. Never mount one claim into several pods. With application-owned storage, remove the `zama-storage` volume and variable.

The liveness probe checks that the daemon answers on its socket. It doesn't check RPC or relayer reachability, so gate traffic on checks made by your application.

## Back up daemon SQLite storage

Treat the storage directory and every backup of it as sensitive. Each named store is a separate database in its own subdirectory.

1. Stop application writers and the daemon. The daemon holds each database lock while it runs.
2. Back up the whole storage directory with your backup tooling, preserving ownership and `0700` permissions.
3. Keep the derivation secret, if you use one, in your secrets manager. The backup doesn't contain it.

To restore, copy the backup into a private volume for one stopped daemon, check that the daemon UID owns it, then start the matching client and daemon versions. Recreate SDK contexts with the original store names and derivation secret, and confirm a decryption succeeds without a new wallet signature before returning to service.

For application-owned storage, use your backend's own backup and restore procedure while its writers are stopped.

## Verify the deployment

1. Confirm the daemon log contains `Daemon ready.` and the container keeps running.
2. Confirm the liveness probe or container healthcheck passes.
3. From your application, create an SDK context with its production configuration and run an operation that reaches the RPC endpoint and relayer your workload uses.
4. Restart the daemon, recreate the SDK context, and confirm stored credentials are reused without a new wallet signature.
5. Confirm your application records operation latency and error codes, and detects callback-channel failures.

Use [Monitor and troubleshoot](monitor-and-troubleshoot.md) for operational signals and [Upgrade the daemon](upgrade-and-recover.md) for replacements.
