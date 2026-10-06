---
title: SDK usage telemetry
description: What the SDK reports to the Zama-hosted relayer, when, and how to turn it off.
---

# SDK usage telemetry

The SDK attaches a small, fixed set of `x-zama-sdk-*` HTTP headers to the relayer requests it already makes. On the **Zama-hosted relayer** they tell Zama which SDK version and which high-level operations are in use, so the SDK team can see adoption and per-operation error rates. Nothing is sent to any third party, and no header ever carries end-user data.

Telemetry is on by default. You can turn it off with one config flag.

## What is sent

| Header                 | Example value           | Meaning                                                                                        |
| ---------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `x-zama-sdk-version`   | `3.7.0`                 | The `@zama-fhe/sdk` version (`@zama-fhe/react-sdk` ships the same version).                    |
| `x-zama-sdk-layer`     | `core` / `react`        | `react` when the SDK is driven by `ZamaProvider`, `core` otherwise.                            |
| `x-zama-sdk-runtime`   | `browser` / `node`      | `browser` for the `web()` transport, `node` for `node()`.                                      |
| `x-zama-sdk-operation` | `confidential-transfer` | The high-level SDK operation the request belongs to (see below). Omitted on the FHE key fetch. |

The headers ride on the requests the SDK makes anyway: input-proof generation (`encrypt`), user and public decryption, and the FHE key fetch. They add no extra requests.

**Never sent:** wallet addresses, encrypted values or handles, amounts, transaction hashes, or any user or session identifier. The relayer already sees the request itself; the headers only label it.

### Operation values

| `x-zama-sdk-operation`   | Sent by                                                                              |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `confidential-transfer`  | `Token.confidentialTransfer` and its `From` / `AndCall` variants                     |
| `unshield`               | `WrappedToken.unshield`, `unshieldAll`, `resumeUnshield`, `unwrap`, `finalizeUnwrap` |
| `decrypt-balance`        | `Token.balanceOf`, `decryptBalanceAs`, `batchBalancesOf`, `batchDecryptBalancesAs`   |
| `vault-deposit`          | `Vault.deposit`                                                                      |
| `vault-redeem`           | `Vault.redeem`                                                                       |
| `vault-join`             | `VaultBatcher.join`                                                                  |
| `vault-balance`          | `VaultBatcher.depositOf`                                                             |
| `encrypt`                | `sdk.encrypt` / `useEncrypt`                                                         |
| `user-decrypt`           | `sdk.decryption.decryptValues` / `useDecryptValues`                                  |
| `delegated-user-decrypt` | `sdk.decryption.delegatedDecryptValues` / `delegatedBatchDecryptValues`              |
| `public-decrypt`         | `sdk.decryption.decryptPublicValues` / `useDecryptPublicValues`                      |
| `offline-prepare`        | `sdk.offline.prepare` (only kinds that encrypt or decrypt)                           |

Calls made directly on `sdk.relayer` carry the version, layer and runtime headers but no operation.

Of the `prepare` kinds, only `ConfidentialTransfer`, `ConfidentialTransferFrom`, `Unwrap` and `FinalizeUnwrap` reach the relayer. The other kinds, and `sdk.offline.preparePermit` / `batchPreparePermits`, never call it, so they produce no telemetry.

Shielding (`WrappedToken.shield`) never calls the relayer, so it produces no telemetry at all.

## Where it is sent

The headers go to whatever `relayerUrl` the chain configures. The SDK does not inspect the host, so a self-hosted relayer receives them too and simply ignores them, and nothing is logged there unless you capture it yourself. The `cleartext()` transport makes no relayer requests.

If browser traffic reaches the relayer through [your own backend proxy](./authentication.md), the headers arrive at the proxy. Forward them to the upstream relayer, as the proxy example in that guide does; a proxy that rebuilds the request with its own header set drops them.

## Turning it off

Set `telemetry: false` in `createConfig`:

```ts
const config = createConfig({
  chains: [sepolia],
  relayers: { [sepolia.id]: web() },
  publicClient,
  walletClient,
  telemetry: false,
});
```

On Node.js, the `node()` transport also honours the `ZAMA_SDK_TELEMETRY` environment variable. Set it to `0` (or `false`) to turn telemetry off for the whole process, for example in CI:

```bash
ZAMA_SDK_TELEMETRY=0 node server.js
```

Either switch removes every `x-zama-sdk-*` header from every request.
