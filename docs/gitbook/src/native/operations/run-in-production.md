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

1. Give the daemon a socket directory owned by its UID with mode `0700`, and run the application as the same UID. The daemon refuses to start when the directory is shared with its group or other users. The Compose file and the Kubernetes manifest below set this up.
2. For daemon SQLite storage, provision a private writable volume for this daemon and set `ZAMA_SDK_DAEMON_STORAGE_DIR` to its mount path. The daemon creates one `0700` subdirectory per named store.
3. For application-owned storage, configure the backend in your application. The daemon needs no credential volume.

{% hint style="warning" %}
Two daemons must not share a SQLite credential volume: each named database is locked to one daemon. Replicas can share application-owned storage, but credential coordination does not span daemons, so concurrent replicas can race on the same user's credentials and cause extra signature prompts.
{% endhint %}

## Run with Docker Compose

The [Compose file](https://raw.githubusercontent.com/zama-ai/sdk/beta/packages/sdk-daemon/deploy/compose.yaml) runs the daemon with hardened container settings and keeps its socket and SQLite storage in named volumes. A new named volume copies the image's private directories, so the daemon starts without host directory setup. The image runs the daemon as UID `1000`.

{% code title="packages/sdk-daemon/deploy/compose.yaml" %}

```yaml
# Include this file from your own compose.yaml, or start it alone with: docker compose up -d --wait
name: zama-sdk-daemon

services:
  daemon:
    image: zamafhe/sdk-daemon:${ZAMA_SDK_VERSION:?Set ZAMA_SDK_VERSION to the release that matches your Go or Rust client}
    # Defaults to the image's user; set both to your UID when the socket and storage are host directories.
    user: "${ZAMA_SDK_DAEMON_UID:-1000}:${ZAMA_SDK_DAEMON_GID:-1000}"
    environment:
      ZAMA_SDK_DAEMON_SOCKET_PATH: /run/zama/sdk.sock
      ZAMA_SDK_DAEMON_STORAGE_DIR: /var/lib/zama
    volumes:
      # Named volumes by default: a new one copies the image's private directories (UID 1000, mode 0700).
      # Set these to host directory paths to reach the socket from an application on a Linux host.
      - ${ZAMA_SDK_SOCKET_VOLUME:-socket}:/run/zama
      - ${ZAMA_SDK_STORAGE_VOLUME:-storage}:/var/lib/zama
    read_only: true
    cap_drop: [ALL]
    security_opt: [no-new-privileges:true]
    healthcheck:
      test: ["CMD", "node", "dist/healthcheck.js"]
      interval: 10s
      timeout: 3s
      start_period: 10s
    # Longer than the daemon's 120-second shutdown timeout, so it exits before Docker kills it.
    stop_grace_period: 150s
    restart: unless-stopped

volumes:
  socket:
  storage:
```

{% endcode %}

Include it from your application's `compose.yaml`. Run your application as UID `1000` and mount the socket volume where it connects:

```yaml
include:
  - zama-sdk-daemon.yaml

services:
  app:
    image: your-registry/your-app:APP_VERSION
    user: "1000:1000"
    environment:
      DAEMON_SOCKET: /run/zama/sdk.sock
    volumes:
      - socket:/run/zama:ro
    depends_on:
      daemon:
        condition: service_healthy
```

Download the daemon file next to it, then start both:

```bash
export ZAMA_SDK_VERSION=3.7.0-beta.5
curl -fsSL -o zama-sdk-daemon.yaml "https://raw.githubusercontent.com/zama-ai/sdk/v${ZAMA_SDK_VERSION}/packages/sdk-daemon/deploy/compose.yaml"
docker compose up -d --wait
```

Set `ZAMA_SDK_VERSION` to the version of your Go module or Rust crate. `--wait` returns once the daemon's healthcheck passes. This works on Linux and on Docker Desktop.

### Application on a Linux host

A process on the host can't reach a socket inside a named volume. On a Linux host, point the same file at host directories and run the daemon as your application's UID. Create both directories first: the daemon rejects directories that aren't private to its UID, and Docker would otherwise create them as root.

```bash
export ZAMA_SDK_VERSION=3.7.0-beta.5
curl -fsSL -o zama-sdk-daemon.yaml "https://raw.githubusercontent.com/zama-ai/sdk/v${ZAMA_SDK_VERSION}/packages/sdk-daemon/deploy/compose.yaml"
mkdir -p -m 700 zama-daemon/socket zama-daemon/storage
export ZAMA_SDK_SOCKET_VOLUME=./zama-daemon/socket ZAMA_SDK_STORAGE_VOLUME=./zama-daemon/storage
export ZAMA_SDK_DAEMON_UID="$(id -u)" ZAMA_SDK_DAEMON_GID="$(id -g)"
docker compose -f zama-sdk-daemon.yaml up -d --wait
```

Connect the application to `zama-daemon/socket/sdk.sock`. This doesn't work on Docker Desktop, where host directory ownership doesn't carry into the container.

## Run in Kubernetes

Run the daemon as a second container in your application pod. The [Kubernetes manifest](https://raw.githubusercontent.com/zama-ai/sdk/beta/packages/sdk-daemon/deploy/kubernetes.yaml) shares an `emptyDir` socket volume, runs both containers as UID `1000`, and gives the daemon a `ReadWriteOnce` claim for SQLite storage. Replace `your-registry/your-app:APP_VERSION` with your application image, then apply it with the daemon release that matches your client:

{% code title="packages/sdk-daemon/deploy/kubernetes.yaml" %}

```yaml
# Apply with: envsubst '$ZAMA_SDK_VERSION' < kubernetes.yaml | kubectl apply -f -
# Replace the app image with your own; it must run as the same UID as the daemon.
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: zama-daemon-storage
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 1Gi
---
apiVersion: v1
kind: Pod
metadata:
  name: my-app
spec:
  # Longer than the daemon's 120-second shutdown timeout, so it exits before the kubelet kills it.
  terminationGracePeriodSeconds: 150
  securityContext:
    runAsNonRoot: true
    runAsUser: 1000
    runAsGroup: 1000
    fsGroup: 1000
  initContainers:
    # The daemon only accepts a socket directory private to its UID, which an emptyDir root is not.
    - name: socket-dir
      image: zamafhe/sdk-daemon:${ZAMA_SDK_VERSION}
      command: ["mkdir", "-p", "-m", "0700", "/run/zama/socket"]
      volumeMounts:
        - { name: zama-socket, mountPath: /run/zama }
      securityContext: &restricted
        allowPrivilegeEscalation: false
        readOnlyRootFilesystem: true
        capabilities: { drop: [ALL] }
  containers:
    - name: zama-daemon
      image: zamafhe/sdk-daemon:${ZAMA_SDK_VERSION}
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
      image: your-registry/your-app:APP_VERSION
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

{% endcode %}

```bash
curl -fsSLO https://raw.githubusercontent.com/zama-ai/sdk/beta/packages/sdk-daemon/deploy/kubernetes.yaml
export ZAMA_SDK_VERSION=3.7.0-beta.5
envsubst '$ZAMA_SDK_VERSION' < kubernetes.yaml | kubectl apply -f -
```

The init container creates a private socket directory inside the shared volume; the daemon checks only that directory. The liveness probe runs the healthcheck bundled in the image and uses the socket path from the container environment.

For several replicas with SQLite storage, give each pod its own `ReadWriteOnce` claim, for example through a StatefulSet `volumeClaimTemplates` entry. Never mount one claim into several pods. With application-owned storage, remove the `zama-storage` volume, the claim, and `ZAMA_SDK_DAEMON_STORAGE_DIR`.

The liveness probe checks that the daemon answers on its socket. It doesn't check RPC or relayer reachability, so gate traffic on checks made by your application.

## Back up daemon SQLite storage

Treat the storage directory and every backup of it as sensitive. Each named store is a separate database in its own subdirectory.

1. Stop application writers and the daemon. The daemon holds each database lock while it runs.
2. Back up the whole storage directory with your backup tooling, preserving ownership and `0700` permissions.
   With the Compose file, the storage is the `storage` named volume, prefixed with your Compose project name. For example: `docker run --rm -v myapp_storage:/data:ro -v "$PWD":/backup alpine tar czf /backup/zama-storage.tgz -C /data .`
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
