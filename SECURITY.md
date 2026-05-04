# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the Zama SDK, please report it responsibly.

**Do not open a public GitHub issue.** Use one of the following private channels:

- **Preferred:** open a draft GitHub Security Advisory at <https://github.com/zama-ai/sdk/security/advisories/new>.
- **Alternate:** email <security@zama.ai>.

Please include:

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

We aim to acknowledge reports within **48 hours** and provide an initial assessment within **5 business days**.

## Scope

In scope:

- The published `@zama-fhe/sdk` and `@zama-fhe/react-sdk` packages from this repo.
- The browser FHE worker assumes WASM is loaded from `cdn.zama.org` over HTTPS with an SHA-384 integrity check, not bundled — keep that in mind when modelling the trust boundary.

## Out of Scope

- Vulnerabilities in third-party dependencies (`viem`, `ethers`, `wagmi`, etc.) — please report those to the upstream projects.
- Vulnerabilities in the underlying Zama Protocol contracts — see the [fhEVM security policy](https://github.com/zama-ai/fhevm/security/policy).
- Vulnerabilities in `@zama-fhe/relayer-sdk` (the legacy low-level SDK) — same channels as this policy: a draft advisory on its repo if enabled, or <security@zama.ai>.

## Supported Versions

We provide security fixes for the two most recent major release lines of `@zama-fhe/sdk` and `@zama-fhe/react-sdk`.

## Acknowledgments

We appreciate the security research community's efforts in helping keep the Zama ecosystem secure. Reporters of valid vulnerabilities will be credited (with permission) in release notes.
