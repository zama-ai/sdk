# Sidecar trust boundary

The sidecar runs `@zama-fhe/sdk` decryption and credential operations for application-created SDK contexts. Each context has its own configuration and optional signer. Contexts provide SDK lifecycle separation; they are not an authorization boundary between mutually untrusted tenants.

## Signing authority

The wallet private key stays in the Rust or Go application, or its external signing service. When the SDK needs a signature, the sidecar sends the EIP-712 payload over that context's signer channel. The application returns a signature or an error. The examples use standard Ethereum signing libraries; applications can supply their own wallet approval policy.

The SDK resolves protocol addresses and the current KMS context. A signed permit authorizes the transport public key in that payload. The SDK creates the corresponding private key and stores it in the selected backend. The sidecar retrieves and uses that key and receives decrypted plaintext, including when persistence lives entirely in the native application. Keeping the wallet key outside the container does not make the sidecar an untrusted component.

Offline preparation and registration remain available without a connected signer. No transaction-writing operation is exposed in this increment. Removing local permits or transport keys does not invalidate previously issued signatures on-chain.

## Local access and storage

Every process with access to the socket can create contexts, access stored credentials through SDK operations, and invoke exposed credential-management methods. The socket and its parent directory are private to the running UID. There is no TCP listener, application authentication, or per-context access-control layer.

Storage defaults to memory scoped to each SDK instance. Applications can select named SQLite persistence or supply their own Rust/Go backend, separately for transport keys and permits. Application-owned storage requires no sidecar credential volume.

For named SQLite persistence, an exclusive process lock prevents concurrent sidecars sharing the same database. Committed credentials survive process restarts. Store names select isolated databases below the configured directory. Stale sockets are reclaimed only after ownership and inactive-listener checks.

The sidecar adds no at-rest encryption to SQLite or the opaque credential payloads passed to native storage. Protect the chosen backend and backups as sensitive material. SQLite requires a local filesystem with reliable locking. Losing credentials can require fresh wallet signatures. Processes with the same UID, host administrator privileges, or Docker control are outside this isolation boundary.

The supplied containers run without root privileges, with read-only root filesystems and no Linux capabilities. Only the example containers mount the example configuration file containing the wallet key. The sidecar needs outbound RPC and relayer access; the examples need outbound RPC access for native contract reads. Build contexts exclude `.env` files.

## Concurrency and failure behavior

Credential operations sharing a storage identity and signer or transport-key scope are coordinated. Application storage binding names must consistently identify the underlying namespace; this coordination does not span sidecar processes. Independent identities and public decryption can run concurrently. Cancelling an RPC does not guarantee that an upstream SDK operation stops immediately; coordination remains held until that work settles.

The SDK asynchronously clears previous-account credentials after an account change. That cleanup can overlap another SDK instance using the same identity and storage. The sidecar preserves this SDK behavior and does not provide stronger cross-instance account-change guarantees.

Signer channel loss rejects pending signature requests. It does not automatically destroy the SDK context or replay signatures. Go applications can explicitly reattach a signer. Rust applications recreate the managed SDK context with the same storage binding. Both clients expose callback-channel termination to the application; interrupted operations need an application decision about retrying.

SDK errors retain their code, message, retryability and retry delay. Unknown internal failures use a generic message. The server does not log request payloads, signatures, keys or balances. Treat application logging of SDK error messages according to your own data-handling policy.

SQLite failures poison that storage instance and return `STORAGE_FAILED` on storage access. Application backend errors return through the callback channel; channel loss rejects pending accesses without replaying them. The SDK retains responsibility for handling storage errors in its credential flow. Restart after fixing storage. Calls that do not access credentials are not blocked solely by a storage failure.

RPC deadlines are configurable independently of SDK relayer timeouts. Wallet signing has no implicit operation deadline. Shutdown waits for underlying SDK work; container termination remains the final bound if that work never settles. A timed-out credential mutation can have completed, so callers must account for an uncertain outcome before retrying.

## Deployment scope

Validate UID mappings, volume retention, outbound access and restart behavior in the partner's environment. Published artifacts, release automation, remote authentication and tenant isolation require separate work. No independent security audit is claimed.
