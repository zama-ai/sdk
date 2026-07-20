---
title: Alpha
description: Unreleased changes on the prerelease (alpha) line — not yet in a stable release. Currently the internal @fhevm/sdk backend migration and its FHE runtime/client tuning knobs.
---

# Alpha

{% hint style="warning" %}
**Unreleased.** The changes on this page are on the prerelease (`alpha`) line and are **not yet available in a stable release**. They ship with the next stable release, at which point this page is retitled to that version and folded into the version list above. Treat everything here as a preview — details may still change before release.
{% endhint %}

The SDK's internal FHE backend moved from `@zama-fhe/relayer-sdk` to `@fhevm/sdk` `1.x`. The high-level surface is unchanged — `createConfig`, `Token` / `WrappedToken`, `sdk.encrypt`, `sdk.decryption.*`, and the React hooks all behave exactly as before, so **`Token` and hooks apps need no changes**. What the new backend adds is a richer set of FHE runtime and per-chain tuning knobs on `createConfig`, documented below.

{% hint style="info" %}
**Expect a wallet signature after upgrading.** The new backend persists the full signed [permit](../concepts/permit-model.md) (the EIP-712 payload and its signature) where earlier versions stored only the raw signature, and the two formats are not interchangeable. Permits cached by an earlier version fail validation on read and are discarded rather than migrated, so the first decryption on each chain after upgrading prompts the user to sign a permit once more. Subsequent decrypts reuse the stored permit silently.
{% endhint %}

## FHE runtime and client tuning

`createConfig` accepts a process-wide `runtime` object — the `@fhevm/sdk` runtime config. It configures the FHE engine itself (applied once per process): how the WASM assets load, threading, module versions, and a fallback relayer `auth`.

```ts
const config = createConfig({
  chains: [sepolia],
  publicClient,
  walletClient,
  relayers: { [sepolia.id]: web() },
  runtime: {
    // How the TFHE/KMS WASM is loaded (default "auto")
    wasmAssetLoadMode: "auto",
    // Set true to force single-threaded WASM (no SharedArrayBuffer)
    singleThread: false,
    // Size of the multi-threaded WASM worker pool (defaults to hardware concurrency)
    numberOfThreads: 8,
    // Fallback auth applied to every chain's relayer requests.
    auth: { type: "ApiKeyHeader", value: process.env.RELAYER_API_KEY! },
  },
});
```

Every field of `runtime` is optional:

| Option              | Type                                               | Default              | Purpose                                                                                                                                                                         |
| ------------------- | -------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wasmAssetLoadMode` | `WasmAssetLoadMode`                                | `"auto"`             | How the TFHE/KMS WASM assets are fetched and instantiated (modes below).                                                                                                        |
| `singleThread`      | `boolean`                                          | `false`              | Force single-threaded WASM. Required when `SharedArrayBuffer` is unavailable (no [cross-origin isolation headers](../guides/encrypt-decrypt.md)).                               |
| `numberOfThreads`   | `number`                                           | hardware concurrency | Size of the multi-threaded WASM worker pool. Ignored when `singleThread` is `true`.                                                                                             |
| `moduleVersions`    | `"auto"` \| `{ tfhe?; kms?; checkCompatibility? }` | `"auto"`             | Pin the TFHE/KMS WASM module versions instead of auto-resolving from the chain's on-chain protocol version. `checkCompatibility` is `"throw"` (default) \| `"warn"` \| `"off"`. |
| `locateFile`        | `(file: string) => URL`                            | —                    | Remap where the WASM assets are served from — set this when self-hosting them.                                                                                                  |
| `auth`              | `{ type; value; … }`                               | —                    | Process-wide fallback relayer authentication, applied to any chain that doesn't set its own `auth`.                                                                             |

The runtime's `logger` field is managed by the SDK — pass your logger via `createConfig`'s top-level `logger` instead.

`wasmAssetLoadMode` controls how the FHE WASM assets are fetched and instantiated:

| Mode                  | Behavior                                                                                        |
| --------------------- | ----------------------------------------------------------------------------------------------- |
| `auto` (default)      | Pick the best mode available in the current environment.                                        |
| `embedded-base64`     | Use the WASM inlined as base64 — no separate network fetch. Useful under strict CSP or offline. |
| `verified-blob`       | Fetch the WASM, verify its integrity, then instantiate from the verified blob.                  |
| `precheck-direct-url` | Load directly from the asset URL after a precheck request.                                      |
| `trusted-direct-url`  | Load directly from the asset URL with no precheck (fastest, least defensive).                   |

`runtime.auth` is a process-wide fallback; a per-chain `auth` on the chain preset takes precedence for that chain. Note the discriminator differs by scope: `runtime.auth` uses `@fhevm/sdk`'s native `type` field (`{ type: "ApiKeyHeader", value }`), whereas a chain's `auth` uses the SDK's `__type` field. See [Authentication](../guides/authentication.md) for the auth methods.

{% hint style="warning" %}
**`runtime` is applied once per process and can't be changed afterward.** The `@fhevm/sdk` runtime is a process-global singleton, applied by the first `createConfig` call. A later `createConfig` never reconfigures it — the original stays in effect, and a warning is logged (`"runtime configuration is already set and cannot be changed."`). Set `runtime` on your first `createConfig`; per-chain tuning that must vary belongs in each transport factory's `options`, not in `runtime`.
{% endhint %}

Each transport factory (`web()` / `node()` / `cleartext()`) also takes an optional `options` object that tunes the `@fhevm/sdk` client for that one chain, at construction:

```ts
web({
  // Batch the client's version-resolution RPC reads into one request (default false)
  batchRpcCalls: true,
  // Reuse a pre-fetched public key to skip the ~50 MB fetch on init
  fheEncryptionKey,
  // Pin TFHE/KMS WASM versions, or auto-resolve (default)
  moduleVersions: "auto",
  // Default per-request timeout for this chain's relayer round-trips
  timeout: 60_000,
});
```

`timeout` and `debug` set request defaults for every relayer round-trip on that chain, and a per-call value overrides them. See [Authentication](../guides/authentication.md) for the auth methods and [Configuration](../guides/configuration.md) for the full config reference.

## Bug fixes

- **Correct Hoodi `KMSVerifier` preset address.** The [Hoodi testnet](../guides/configuration.md#1-pick-your-chains) preset shipped a stale `KMSVerifier` address; it now points at the deployed contract, so decryption on Hoodi works with the built-in preset.

{% hint style="info" %}
Only code that constructs low-level relayer objects directly should review its usage against the new backend before upgrading. Staying on `createConfig` + `Token` / `WrappedToken` + the React hooks keeps you fully insulated.
{% endhint %}
