# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the Zama SDK, please report it responsibly.

**Do not open a public GitHub issue for security vulnerabilities.**

Instead, please email: **security@zama.ai**

Include the following in your report:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to acknowledge reports within **48 hours** and provide an initial assessment within **5 business days**.

## Scope

The following areas are in scope for security reports:

### FHE Credential Management

- **Key derivation** — AES-GCM keys derived from wallet signatures via PBKDF2 (see `CredentialsManager`)
- **Credential storage** — encrypted private keys stored via `GenericStorage` (IndexedDB in browsers)
- **EIP-712 signatures** — authorization scoping (contract addresses, expiration)

### Signer Adapters

- **Type safety** — ensuring `Hex`/`Address` types prevent injection of malformed data
- **Transaction construction** — contract call builders producing correct ABI-encoded calls

### Web Worker / WASM

- **Worker isolation** — message passing between main thread and Web Worker

## Out of Scope

- Vulnerabilities in third-party dependencies (viem, ethers, wagmi) — report these upstream
- Vulnerabilities in the underlying fhEVM smart contracts — report to the [fhEVM repository](https://github.com/zama-ai/fhevm)
- Vulnerabilities in `@zama-fhe/relayer-sdk` — report separately to Zama

## Security Considerations for SDK Users

### Credential Storage

FHE private keys are encrypted with AES-GCM before storage. The encryption key is derived from the wallet's EIP-712 signature using PBKDF2 (600,000 iterations). However:

- **Browser storage** (IndexedDB) is accessible to same-origin scripts. Ensure your application follows CSP best practices.
- **Custom storage backends** — if implementing `GenericStorage`, ensure the backend provides appropriate access controls.

### EIP-712 Authorization

Decrypt credentials are scoped to specific contract addresses and have a configurable expiration (`durationDays`). Use the shortest practical duration for your use case.

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 0.x     | Yes       |

## Acknowledgments

We appreciate the security research community's efforts in helping keep the Zama ecosystem secure. Reporters of valid vulnerabilities will be credited (with permission) in release notes.
