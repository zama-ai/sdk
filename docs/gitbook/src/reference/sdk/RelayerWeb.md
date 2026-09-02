---
title: web() transport
description: Browser relayer transport that runs FHE operations via bundled WASM.
---

# `web()` transport

The `web()` transport factory configures a chain to run FHE operations in the browser. It drives `@fhevm/sdk`, which handles encryption, decryption, and transport key pair management via bundled WASM — multi-threaded through an internal worker pool when cross-origin isolation is available. Encryption runs in a dedicated Web Worker by default; see [`offloadEncrypt`](#offloadencrypt).

## Import

```ts
import { web } from "@zama-fhe/sdk/web";
```

## Usage

```ts
import { createConfig } from "@zama-fhe/sdk/viem";
import { web } from "@zama-fhe/sdk/web";
import { sepolia } from "@zama-fhe/sdk/chains";

const config = createConfig({
  chains: [sepolia],
  publicClient,
  walletClient,
  relayers: { [sepolia.id]: web() },
});
```

## Parameters

`web()` accepts an optional options object forwarded to `@fhevm/sdk` — per-client tuning such as `batchRpcCalls` (batch RPC requests) and `fheEncryptionKey` (supply a pre-fetched FHE encryption key). Most apps omit it and call `web()` bare; WASM execution and FHE-artifact caching are handled internally, with no special cross-origin headers required.

### `offloadEncrypt`

`"auto" | boolean | undefined`

Controls where encryption runs. `web()` runs encryption in a dedicated Web Worker, so `encryptValue()` and `encryptValues()` do not block the page's main thread.

| Value              | Behavior                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `"auto"` (default) | Offload when the environment can spawn a module worker; fall back to the main thread otherwise. |
| `true`             | Require the offload; reject the encryption when the worker is unavailable.                      |
| `false`            | Always encrypt on the calling thread.                                                           |

```ts
web({ offloadEncrypt: true });
```

The worker is unavailable when it cannot spawn (a restrictive `worker-src` CSP, a bundler that did not emit the worker script), misses a lifecycle deadline, or crashes.

A worker that dies after it came up is treated as transient: the encryptions it took down finish on the calling thread, and the next one spawns a fresh worker. A second crash settles the SDK on the calling thread for good, so a broken environment does not spawn a replacement worker per call.

`sdk.dispose()` (and `sdk.terminate()`, which calls it) releases the worker: encryptions already running finish over it, and it is terminated once the last one settles. Encrypting again afterwards spawns a fresh worker, so disposing an SDK you still hold is safe, and it is also the way to give a fallen-back SDK the worker path back.

#### Fallback warning

Under `"auto"`, each fallback prints one `console.warn` (no logger configuration needed) naming the cause. When you pass a `logger` to `createConfig`, it receives the same message. A fallback means encryption blocks the main thread again, so it is worth fixing in the deployment.

Realms with no `Worker` global at all (server-side rendering, Node, the CommonJS build) encrypt on the calling thread silently: no worker is ever attempted there, so there is nothing to warn about.

#### Strict mode

With `offloadEncrypt: true`, the SDK never falls back to the main thread. Every worker failure rejects the encryption with [`EncryptOffloadUnavailableError`](./errors.md#encryptoffloadunavailableerror) (`ENCRYPT_OFFLOAD_UNAVAILABLE`), so the app can surface it instead of hanging. A rejection leaves the SDK usable: the next encryption attempts a fresh worker. The rejection happens on the first encryption, never at config time, so `createConfig()` is safe to run during server-side rendering, where no `Worker` global exists.

#### CSP requirement

Serving the app under a Content Security Policy requires:

```
worker-src 'self' blob:;
```

`blob:` is not optional: the TFHE WASM spawns its own nested sub-workers from blob URLs inside the encrypt worker. Without it the worker fails to start, and the transport falls back to the main thread (`"auto"`) or rejects (`true`).

### `offloadWorker`

`string | URL | (() => Worker) | undefined`

Escape hatch for the built-in worker spawn: a bundler that doesn't emit or rewrite the SDK's `new Worker(new URL(...))` expression inside `node_modules` (Vite dev-mode pre-bundling, older webpack), or a CSP that only allows worker sources the app itself serves.

Pass a string or `URL` to spawn a worker from a path you control. Copy the worker file from `node_modules/@zama-fhe/sdk/dist/esm/encrypt.worker.js` into your public/static directory, or resolve it through the package's `@zama-fhe/sdk/encrypt.worker.js` export in a copy step:

```ts
web({ offloadWorker: "/encrypt.worker.js" });
```

Or pass a factory to build the worker yourself, so your own bundler sees and rewrites the `new Worker(new URL(...))` expression:

```ts
web({
  offloadWorker: () =>
    new Worker(new URL("./workers/encrypt.js", import.meta.url), { type: "module" }),
});
```

The factory must construct a fresh worker on every call and hand it over exclusively: the SDK owns the worker's lifecycle, terminating it on `dispose()` and respawning it after a crash. A memoized or shared worker is dead for every later call, and two clients sharing one worker collide on operation ids and cancel each other's work.

### `offloadTimeouts`

`{ spawn?: number; init?: number } | undefined`

Watchdog deadlines for the encrypt worker's lifecycle steps, in milliseconds. `spawn` bounds worker startup; default `10_000`. `init` bounds the worker-side client initialization (the on-chain version reads and WASM compilation, run inside the worker realm); default `300_000`. The FHE key is fetched on the calling thread, under the chain's `auth`, and handed to the worker.

A missed deadline discards the presumed-stuck worker. The operation then finishes on the calling thread, or rejects under `offloadEncrypt: true`.

Individual encrypt operations are not watched: a worker computing a ZK proof runs for as long as it needs, and `@fhevm/sdk`'s own relayer request timeout governs it instead. An `AbortSignal` passed to an encrypt call takes effect between phases (before dispatch, and during the relayer round-trip), not during proof generation; the worker's event loop is blocked by the WASM computation, so an abort landing mid-proof is observed once the proof finishes.

```ts
web({ offloadTimeouts: { init: 600_000 } });
```

Cross-origin isolation headers (`Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`) remain worthwhile: they enable multi-threaded WASM inside the worker, shortening encryption itself.

## Return Type

`WebRelayerConfig` — a relayer config object you assign per chain in `createConfig({ relayers })`. You do not construct or interact with it directly.

## Related

- [`node()` transport](./RelayerNode.md) — the Node.js variant, running FHE on the calling thread
- [`cleartext()` transport](./RelayerCleartext.md) — the development variant, no FHE
- [ZamaSDK](./ZamaSDK.md) — pass the config to the SDK constructor
- [Configuration guide](../../guides/configuration.md) — authentication and network presets
