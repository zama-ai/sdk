# ERC-7730 Descriptor Drafts

This directory contains experimental ERC-7730 descriptor drafts for the SDK's
clear-signing V1 flows. They are repository-local review artefacts, not a
published wallet integration yet.

The target registry shape is:

```text
registry/zama/
  calldata-*.json
  eip712-*.json
fixtures/
  sepolia-v1.json
```

## Current Scope

The first descriptor set covers:

| Flow                                      | Descriptor                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `allow` / `allowAs`                       | `registry/zama/eip712-decryption-permits.json`                                                                      |
| `delegateDecryption`                      | `registry/zama/calldata-acl-user-decryption.json`                                                                   |
| `shield` via `approve` + `wrap`           | `registry/zama/calldata-erc20-shield-entrypoints.json` and `registry/zama/calldata-confidential-token-wrapper.json` |
| `shield` via `transferAndCall`            | `registry/zama/calldata-erc20-shield-entrypoints.json`                                                              |
| `confidentialTransfer`                    | `registry/zama/calldata-confidential-token-wrapper.json`                                                            |
| `unwrap` / `unwrapAll` / `finalizeUnwrap` | `registry/zama/calldata-confidential-token-wrapper.json`                                                            |

## Important Limits

ERC-7730 describes what a wallet can render from the signed payload. For
confidential token flows, some values are FHE handles rather than plaintext:

- `confidentialTransfer` signs an encrypted amount handle and an input proof.
- `unwrap` signs an encrypted amount handle and an input proof.
- `unwrapAll` signs the existing encrypted balance handle.
- `finalizeUnwrap` signs the clear decrypted amount and can display the amount.

The SDK/app-level preview can show plaintext amounts before encryption because
the SDK receives the plaintext input. A wallet-native ERC-7730 renderer cannot
show plaintext unless the wallet can decrypt or otherwise trust that plaintext
context.

## Registry Readiness

The descriptor files pass local shape checks and the official ERC-7730 CLI, but
they are not yet registry-ready as-is. See `sourcify-verification.md` for the
current Sourcify verification matrix and the contracts that must be verified or
removed before public registry submission.

## Validation

The SDK test suite includes a local descriptor/fixture consistency check:

```bash
pnpm clear-signing:check
```

The official CLI should also be run before review:

```bash
uvx erc7730 lint --v2 docs/clear-signing/erc7730/registry/zama/*.json
```

Without an Etherscan API key, the CLI may warn that it cannot fetch ABIs for
deployment addresses. That is acceptable for local descriptor iteration, but
the registry submission path still requires verified ABIs.

The ethereum.org tutorial recommends short `intent` values, richer
`interpolatedIntent` sentences, ordered display fields, explicit `#.` paths for
decoded parameters, and validation through the official CLI before registry
submission.

Before submitting to the public registry, copy these files into a PR targeting
`ethereum/clear-signing-erc7730-registry`, update `$schema` to the registry's
relative schema path, and verify the covered contracts on Sourcify. Registry CI
will reject descriptors whose contract ABI cannot be checked.
