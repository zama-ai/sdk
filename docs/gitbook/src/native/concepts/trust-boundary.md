---
description: Understand signing authority and credential access in Go and Rust daemon deployments.
---

# Daemon trust model

The daemon is a trusted part of your application. It receives plaintext encryption inputs, decrypts outputs, and uses transport private keys, even when credentials live in application-owned storage.

## Signing authority

The wallet private key stays in your Go or Rust application, or its external signing service. The daemon sends signing requests to your application over the SDK context's signer channel. Your application decides whether to sign and returns a signature or an error.

{% hint style="danger" %}
**Your application must validate every typed-data request before signing it.** Check the domain name and version, `chainId`, `verifyingContract`, the expected signer, and `primaryType` against your own configuration. With that check in place, a compromised daemon cannot obtain a signature your application did not approve. Without it, your wallet signs whatever the daemon sends.

The built-in adapters (Go `NewEthereumSigner` and `NewPrivateKeySigner`, Rust `AlloySigner`) do not validate typed data. They check only the requested account and chain. Apply the same rule to contract writes: allow only the destinations and functions the SDK calls. [Validate signing requests](../guides/attach-wallet.md#validate-signing-requests) lists the expected values and shows a validating wrapper.
{% endhint %}

A signed decryption permit authorizes the transport public key in its payload. The SDK creates and stores the corresponding private key. Keeping the wallet private key outside the daemon does not remove the daemon's access to decryption credentials or plaintext.

Delegation grant and revoke operations can broadcast transactions through your application's signer. Offline preparation returns transaction data for your application to sign and submit separately. Deleting local credentials does not invalidate previously issued signatures or revoke on-chain delegation.

## Socket access

{% hint style="warning" %}
Serve one trust domain per daemon. Every process with socket access can create SDK contexts and call credential-management operations. SDK contexts are not an authorization boundary.
{% endhint %}

The socket directory must belong to the daemon's UID and exclude group and other access. The application runs as that same UID. There is no TCP listener, application authentication, or per-context access control.

Processes with the same UID, host administrators, and operators with container control are outside this isolation boundary.

## Stored credentials

Treat credential stores and backups as sensitive material. The daemon does not add at-rest encryption to SQLite or the credential bytes sent to application-owned storage.

The SDK can protect stored transport keys using a derivation secret supplied by your application. Keep the required secret available when recreating SDK contexts. The daemon never stores the secret with the credentials, but it holds the secret in process memory while the SDK context is open. Set it up in [Configuration](../../guides/configuration.md).

Named SQLite stores require a local filesystem with reliable locking and a private volume per daemon. Application-owned storage can be shared across replicas, but credential coordination does not span daemons. Concurrent credential changes can race.

## Logs and diagnostics

The daemon emits SDK warning and error messages as plain text without their attached data objects. It does not log request payloads, signatures, keys, or balances. Your application controls its own logs; avoid logging plaintext, credentials, signing payloads, and secrets.

Apply these boundaries when you [deploy the daemon in production](../operations/run-in-production.md).
