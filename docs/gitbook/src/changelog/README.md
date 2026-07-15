---
title: Changelog
description: Notable changes, new features, and breaking changes for each release of the Zama SDK.
---

# Changelog

This section documents the notable changes, new features, and breaking changes in each version of `@zama-fhe/sdk` and `@zama-fhe/react-sdk` across the current `v3` line, with explanations and copy-pasteable examples. Patch releases are grouped under their minor-version page.

The two packages share a version number and are released together, so a single entry covers both the core SDK and the React hooks.

## Release history

| Version              | Date       | Highlights                                                                                                        |
| -------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| [**3.3.x**](v3-3.md) | 2026-07-08 | `confidentialTransferAndCall`, pending-unshield recovery, typed decryption errors; `@fhevm/sdk` backend migration |
| [**3.2.0**](v3-2.md) | 2026-06-24 | Configurable, silent-by-default logging; upgrade codemods; `Wrap` event decoding fix                              |
| [**3.1.0**](v3-1.md) | 2026-06-22 | `createConfig`, transport factories, provider/signer split, `Token`/`WrappedToken`, top-level primitives          |
| [**3.0.x**](v3-0.md) | 2026-05-28 | First stable `v3` line; upgraded wrapper + registry contract support                                              |

## How versions work

The SDK follows [semantic versioning](https://semver.org/):

- **Major** (`3.x.x`) — breaking changes to the public API.
- **Minor** (`x.1.x`) — new features, backward compatible.
- **Patch** (`x.x.1`) — bug fixes, backward compatible.

Breaking changes are always called out in a highlighted box at the top of the relevant page, with a migration snippet.

## Where to go next

If you're upgrading across a major version, start with the [Migrate from v2 to v3](../guides/migrate-v2-to-v3.md) guide.

🟨 Go to [**3.3.0**](v3-3.md) for the latest release.

🟨 Go to the [**SDK reference**](../reference/sdk/README.md) for the full core API surface.

🟨 Go to the [**React reference**](../reference/react/README.md) for all hooks.

## Help center

Ask technical questions, discuss with the community, or report a bug.

- [Community forum](https://community.zama.org/c/zama-protocol/15)
- [Discord channel](https://discord.com/invite/zama)
- [Open an issue](https://github.com/zama-ai/sdk/issues) on the SDK repository
