---
title: SDK usage telemetry
description: What the SDK reports to the Zama-hosted relayer, when, and how to turn it off.
---

# SDK usage telemetry

The SDK attaches a small, fixed set of `x-zama-sdk-*` HTTP headers to the relayer requests it already makes. On the **Zama-hosted relayer** they tell Zama which SDK version and which high-level operations are in use, so the SDK team can see adoption and per-operation error rates. Nothing is sent to any third party, and no header ever carries end-user data.

Telemetry is on by default. One config option switches it to query parameters, for proxies that drop custom headers, or turns it off.

## What is sent

| Header                 | Example value           | Meaning                                                                                 |
| ---------------------- | ----------------------- | --------------------------------------------------------------------------------------- |
| `x-zama-sdk-version`   | `3.7.0`                 | The `@zama-fhe/sdk` version (`@zama-fhe/react-sdk` ships the same version).             |
| `x-zama-sdk-layer`     | `core` / `react`        | `react` when the SDK is driven by `ZamaProvider`, `core` otherwise.                     |
| `x-zama-sdk-runtime`   | `web` / `node`          | `web` for the `web()` transport, `node` for `node()`.                                   |
| `x-zama-sdk-operation` | `confidential-transfer` | The public SDK method the request belongs to (see below). Omitted on the FHE key fetch. |

The headers ride on the requests the SDK makes anyway: input-proof generation (`encrypt`), user and public decryption, and the FHE key fetch. They add no extra requests.

With `telemetry: "query"` (see [below](#sending-query-parameters-instead-of-headers)) the same four fields travel as `zama_sdk_*` query parameters instead: `x-zama-sdk-version` becomes `zama_sdk_version`, and so on, with identical values. The relayer accepts either form.

**Never sent:** wallet addresses, encrypted values or handles, amounts, transaction hashes, or any user or session identifier. The relayer already sees the request itself; the headers only label it.

### Operation values

Each public method that reaches the relayer sends its own value. When a method makes several relayer requests, such as the balance check, encryption and decryption of an unshield, all of them carry that method's value. React hooks send the value of the method they call.

| `x-zama-sdk-operation`                | Sent by                                           |
| ------------------------------------- | ------------------------------------------------- |
| `balance-of`                          | `Token.balanceOf`                                 |
| `decrypt-balance-as`                  | `Token.decryptBalanceAs`                          |
| `batch-balances-of`                   | `Token.batchBalancesOf`                           |
| `batch-decrypt-balances-as`           | `Token.batchDecryptBalancesAs`                    |
| `confidential-transfer`               | `Token.confidentialTransfer`                      |
| `confidential-transfer-from`          | `Token.confidentialTransferFrom`                  |
| `confidential-transfer-and-call`      | `Token.confidentialTransferAndCall`               |
| `confidential-transfer-from-and-call` | `Token.confidentialTransferFromAndCall`           |
| `unshield`                            | `WrappedToken.unshield`                           |
| `unshield-all`                        | `WrappedToken.unshieldAll`                        |
| `resume-unshield`                     | `WrappedToken.resumeUnshield`                     |
| `unwrap`                              | `WrappedToken.unwrap`                             |
| `finalize-unwrap`                     | `WrappedToken.finalizeUnwrap`                     |
| `vault-deposit`                       | `Vault.deposit`                                   |
| `vault-redeem`                        | `Vault.redeem`                                    |
| `vault-join`                          | `VaultBatcher.join`                               |
| `vault-deposit-of`                    | `VaultBatcher.depositOf`                          |
| `vault-group-deposit`                 | `VaultGroup.deposit`                              |
| `vault-group-redeem`                  | `VaultGroup.redeem`                               |
| `encrypt`                             | `sdk.encrypt`                                     |
| `decrypt-values`                      | `sdk.decryption.decryptValues`                    |
| `delegated-decrypt-values`            | `sdk.decryption.delegatedDecryptValues`           |
| `delegated-batch-decrypt-values`      | `sdk.decryption.delegatedBatchDecryptValues`      |
| `decrypt-public-values`               | `sdk.decryption.decryptPublicValues`              |
| `offline-confidential-transfer`       | `sdk.offline.prepare`, `ConfidentialTransfer`     |
| `offline-confidential-transfer-from`  | `sdk.offline.prepare`, `ConfidentialTransferFrom` |
| `offline-unwrap`                      | `sdk.offline.prepare`, `Unwrap`                   |
| `offline-finalize-unwrap`             | `sdk.offline.prepare`, `FinalizeUnwrap`           |

Calls made directly on `sdk.relayer` carry the version, layer and runtime headers but no operation.

Shielding (`WrappedToken.shield`) never calls the relayer, so it produces no telemetry at all.

## Where it is sent

The headers go to whatever `relayerUrl` the chain configures. The SDK does not inspect the host, so a self-hosted relayer receives them too and simply ignores them, and nothing is logged there unless you capture it yourself. The `cleartext()` transport makes no relayer requests.

If browser traffic reaches the relayer through [your own backend proxy](./authentication.md), the headers arrive at the proxy. Forward them to the upstream relayer, as the proxy example in that guide does; a proxy that rebuilds the request with its own header set drops them. When you cannot change what the proxy forwards, switch to query parameters instead.

## Sending query parameters instead of headers

Some deployments forward the request URL unchanged but lose custom headers on the way: for example a proxy that rebuilds the request with its own header set, a strict `Access-Control-Allow-Headers` list on the relayer or proxy, or a gateway that drops headers it does not know. For those deployments, set `telemetry: "query"` in `createConfig`. The SDK then sends the same four fields as `zama_sdk_*` query parameters and no `x-zama-sdk-*` headers:

```ts
const config = createConfig({
  chains: [sepolia],
  relayers: { [sepolia.id]: web() },
  publicClient,
  walletClient,
  telemetry: "query",
});
```

The parameters are appended to every relayer request URL, so they end up in request logs and anywhere else URLs are stored, and the URL changes with each operation, which splits log grouping or caching keyed on the URL. Keep the default `"header"` mode unless your proxy needs the query form.

## Turning it off

Set `telemetry: "off"` in `createConfig` (`false` still works and means the same):

```ts
const config = createConfig({
  chains: [sepolia],
  relayers: { [sepolia.id]: web() },
  publicClient,
  walletClient,
  telemetry: "off",
});
```

On Node.js, the `node()` transport also honours the `ZAMA_SDK_TELEMETRY` environment variable for the whole process. It takes the same values as `telemetry`, case-insensitive: `header`, `query` or `off` (`0` and `false` also mean `off`). It can switch between `header` and `query` or turn telemetry off, but it cannot turn on what the config disabled, and an unrecognised value is ignored. For example, in CI:

```bash
ZAMA_SDK_TELEMETRY=off node server.js
```

With `telemetry: "off"` or `ZAMA_SDK_TELEMETRY=off`, no request carries an `x-zama-sdk-*` header or a `zama_sdk_*` query parameter.
