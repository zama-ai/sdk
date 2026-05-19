# ERC-7730 Descriptor Drafts

This directory contains ERC-7730 artefacts for the SDK clear-signing work.
`registry/zama/` is the registry-ready subset aligned with the public Ethereum
registry PR. Broader SDK flow drafts live under `experimental/zama/` and remain
repository-local review artefacts.

The target registry shape is:

```text
registry/zama/
  calldata-*.json
  tests/
    *.tests.json
experimental/zama/
  calldata-*.json
  eip712-*.json
  tests/
    *.tests.json
fixtures/
  sepolia-v1.json
ledger-demo/
  zama-shield/
```

## Registry-Ready Scope

`registry/zama/` mirrors the current public registry submission shape for
`ethereum/clear-signing-erc7730-registry` PR #2583:

| Flow                             | Descriptor                                      | Status         |
| -------------------------------- | ----------------------------------------------- | -------------- |
| `shield` approval step           | `registry/zama/calldata-zamamock-sepolia.json`  | Registry-ready |
| `shield` wrapper step via `wrap` | `registry/zama/calldata-czamamock-sepolia.json` | Registry-ready |

This scope is intentionally limited to the verified Sepolia `ZAMAMock` /
`cZAMAMock` pair. `transferAndCall` is not included because the current
`ZAMAMock` deployment does not support the ERC-1363 shield path.

The `approve` descriptor is intentionally generic for
`approve(address spender,uint256 amount)`: it displays the actual `spender`
instead of hiding or constraining it to the wrapper. This keeps the descriptor
correct for every valid ERC-20 approval and avoids relying on conditional
visibility semantics that differ across current tools.

## Experimental Scope

`experimental/zama/` keeps broader SDK descriptor drafts for future review:

| Flow                                      | Descriptor                                                                                                                  |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `allow` / `allowAs`                       | `experimental/zama/eip712-decryption-permits.json`                                                                          |
| `delegateDecryption`                      | `experimental/zama/calldata-acl-user-decryption.json`                                                                       |
| `shield` via `approve` + `wrap`           | `experimental/zama/calldata-erc20-shield-entrypoints.json` and `experimental/zama/calldata-confidential-token-wrapper.json` |
| `shield` via `transferAndCall`            | `experimental/zama/calldata-erc20-shield-entrypoints.json`                                                                  |
| `confidentialTransfer`                    | `experimental/zama/calldata-confidential-token-wrapper.json`                                                                |
| `unwrap` / `unwrapAll` / `finalizeUnwrap` | `experimental/zama/calldata-confidential-token-wrapper.json`                                                                |

These files are not registry-ready as-is. Some covered contracts still need
Sourcify verification, and some flows require more careful wording or fixture
generation before public submission.

## Ledger ZAMA Shield Demo

`ledger-demo/zama-shield/` contains minimal descriptors and calldata fixtures
for testing a Ledger Nano S Plus clear-signing flow with the verified Sepolia
`ZAMAMock` / `cZAMAMock` pair.

The target display is:

```text
Action:  Shield
Send:    100 ZAMAMock
Receive: cZAMAMock confidential balance
Recipient: <wallet>
Wrapper: cZAMAMock
```

The exact received amount is not encoded in the descriptor yet because
`ZAMAMock` has 18 decimals, `cZAMAMock` has 6 decimals, and the wrapper uses
`rate() = 1_000_000_000_000`. ERC-7730 v2 does not define arithmetic for
derived fields such as `amount / rate`.

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

The descriptor files in `registry/zama/` are the only SDK-local files currently
considered registry-ready. They are aligned with the public Ethereum registry
PR and use registry-relative `$schema` paths.

`registry/zama/tests/` mirrors the public registry's reference test format. It
contains signed calldata transactions and EIP-712 typed data samples with
`expectedTexts` so wallet implementers can check that a renderer surfaces the
intended labels and values.

The descriptor files in `experimental/zama/` still pass SDK-local consistency
checks, but they should not be submitted publicly without a separate review.
See `sourcify-verification.md` for the verification matrix and the contracts
that must be verified or removed before future submissions.

## Validation

The SDK test suite includes a local descriptor/fixture consistency check:

```bash
pnpm clear-signing:check
```

The official CLI should also be run before review:

```bash
uvx erc7730 lint --v2 docs/clear-signing/erc7730/registry/zama/*.json
```

For the experimental drafts, lint only descriptor files:

```bash
uvx erc7730 lint --v2 docs/clear-signing/erc7730/experimental/zama/*.json
```

The Ledger demo directory also contains non-descriptor fixtures, so lint its two
descriptor files explicitly:

```bash
uvx erc7730 lint --v2 \
  docs/clear-signing/erc7730/ledger-demo/zama-shield/calldata-zamamock-shield.json \
  docs/clear-signing/erc7730/ledger-demo/zama-shield/calldata-czamamock-wrapper.json
```

Without an Etherscan API key, the CLI may warn that it cannot fetch ABIs for
deployment addresses. That is acceptable for local descriptor iteration, but
the registry submission path still requires verified ABIs.

The example app also contains a Sourcify-backed preview check for the
registry-ready subset:

```bash
pnpm --filter react-wagmi-clear-signing-example erc7730:sourcify-check
```

This command uses `@ethereum-sourcify/clear-signing` with embedded local
descriptors and asserts that the Sourcify display model contains every
`expectedTexts` entry from `registry/zama/tests/`. It also checks an arbitrary
`approve` spender so the approval descriptor remains generic and cannot regress
to wrapper-specific wording.

For visual inspection, run the clear-signing example app and use the main
Sepolia demo. The clear-signing console renders a runtime ERC-7730 wallet
preview with `@ethereum-sourcify/clear-signing` whenever the SDK intent carries
calldata for an operation covered by local descriptors. For the current
registry-ready scope, the shield flow shows separate `approve` and `wrap`
transactions. Operations without a local descriptor are shown as not covered
instead of being approximated.

The ethereum.org tutorial recommends short `intent` values, richer
`interpolatedIntent` sentences, ordered display fields, explicit `#.` paths for
decoded parameters, and validation through the official CLI before registry
submission.

Before submitting future experimental descriptors to the public registry, copy
only the reviewed files into `registry/zama/`, update `$schema` to the
registry's relative schema path, and verify the covered contracts on Sourcify.
Registry CI will reject descriptors whose contract ABI cannot be checked.
