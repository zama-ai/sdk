# ERC-7730 Descriptor Notes

ERC-7730 is an output target for the Clear Signing Intent Layer, not the source
model. The SDK should keep `ClearSigningIntent` wallet-agnostic and generate
ERC-7730 descriptors from intents only after the semantic model is stable.

Reference: https://eips.ethereum.org/EIPS/eip-7730

Status checked on 2026-05-19: ERC-7730 remains a fast-moving wallet integration
surface. The current `registry/zama/` subset passes local checks, the official
ERC-7730 validator, and Sourcify's TypeScript renderer. Treat broader
descriptors in `experimental/zama/` as experimental until they receive the same
level of validation and are accepted by a wallet-supported descriptor source.

## Current Standard Shape

ERC-7730 describes a JSON file with:

| Section           | Purpose                                                                           |
| ----------------- | --------------------------------------------------------------------------------- |
| `$schema`         | Versioned schema reference. Current specification text points to v2.              |
| `context`         | Binding constraints, such as deployments and applicable contract/message context. |
| `metadata`        | Trusted display constants once context binding has succeeded.                     |
| `display.formats` | Per-function or per-message display instructions.                                 |

The standard supports both EVM calldata and EIP-712 messages, which maps to the
SDK's two relevant raw contexts:

| SDK raw context           | ERC-7730 target                     |
| ------------------------- | ----------------------------------- |
| `rawContext.contractCall` | Contract calldata descriptor entry. |
| `rawContext.typedData`    | EIP-712 message descriptor entry.   |

## Mapping Principles

1. Generate descriptors from `ClearSigningIntent`, not directly from calldata.
2. Preserve `visibility` in descriptor generation decisions.
3. Use ERC-7730 `intent` and `interpolatedIntent` only with fields that are safe
   to interpolate.
4. Do not interpolate encrypted fields unless the descriptor also provides a
   safe encrypted fallback.
5. Put handles and proofs in advanced/raw context, not primary wallet wording.

## Safe Initial Descriptor Targets

These are the safest candidates for first descriptor drafts because their
primary fields are public:

| Flow                           | Reason                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------- |
| `shield` via `transferAndCall` | Public ERC-20 amount, public wrapper, public recipient derivation.            |
| `shield` via `wrap`            | Public amount and recipient; approval warning still required at intent layer. |
| `delegateDecryption`           | Public contract/delegate/expiration and clear no-spending warning.            |
| `finalizeUnwrap`               | Final clear amount is public in the finalization call.                        |

## Higher-Risk Descriptor Targets

These need extra care because calldata contains encrypted values:

| Flow                        | Risk                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------ |
| `confidentialTransfer`      | Amount handle is encrypted; plaintext amount only exists in SDK-side context.        |
| `unwrap`                    | Amount handle is encrypted; first phase is not final withdrawal.                     |
| `unwrapAll`                 | Balance handle is encrypted; must render as entire confidential balance, not amount. |
| `allow` / `allowAs` EIP-712 | Payload grants decrypt credentials; must not look like token approval.               |

## Candidate Format Keys

These keys are derived from current contract builders and EIP-712 primary
types. The local `erc7730-docs.test.ts` check validates their selectors against
the SDK ABI signatures used by the fixtures.

| Flow                           | Format key                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------- |
| `confidentialTransfer`         | `confidentialTransfer(address to,bytes32 encryptedAmount,bytes inputProof)`                 |
| `shield` via `transferAndCall` | `transferAndCall(address to,uint256 value,bytes data)`                                      |
| `shield` via `wrap`            | `wrap(address to,uint256 amount)`                                                           |
| shield approval                | `approve(address spender,uint256 amount)`                                                   |
| `unwrap`                       | `unwrap(address from,address to,bytes32 encryptedAmount,bytes inputProof)`                  |
| `unwrapAll`                    | `unwrap(address from,address to,bytes32 amount)`                                            |
| `finalizeUnwrap`               | `finalizeUnwrap(bytes32 unwrapRequestId,uint64 burntAmountCleartext,bytes decryptionProof)` |
| direct decrypt EIP-712         | `UserDecryptRequestVerification`                                                            |
| delegated decrypt EIP-712      | `DelegatedUserDecryptRequestVerification`                                                   |

## Current Descriptor Status

The SDK repository now separates descriptor artefacts by readiness:

| Directory                    | Status         | Purpose                                                                                                             |
| ---------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------- |
| `erc7730/registry/zama/`     | Registry-ready | Mirrors the current public Ethereum registry PR for Sepolia `ZAMAMock` / `cZAMAMock` shield via `approve` + `wrap`. |
| `erc7730/experimental/zama/` | Experimental   | Keeps broader SDK flow drafts for future review: decrypt permits, delegation, transfers, unwrap, finalize.          |
| `erc7730/fixtures/`          | SDK-local      | Exercises the experimental descriptor set against synthetic Sepolia fixtures.                                       |

Resolved locally:

1. Static files are preferred over runtime descriptor generation for V1 because
   they are easier to audit and review.
2. The registry-ready subset is narrowed to verified Sepolia
   `ZAMAMock` / `cZAMAMock` contracts and matches the Ethereum registry PR.
3. The broader SDK drafts are isolated from the registry-ready folder so they
   can evolve without implying public submission readiness.
4. Local tests verify selector, deployment, and field coverage consistency for
   both the registry-ready and experimental descriptor families.
5. The registry-ready `approve` descriptor is generic and displays the actual
   spender. This avoids relying on conditional hidden-field constraints whose
   spelling and behavior currently differ between the registry validator and
   Sourcify's renderer.
6. The example app's main clear-signing console and the
   `erc7730:sourcify-check` script render the registry-ready descriptors with
   `@ethereum-sourcify/clear-signing`. The UI path uses calldata carried by
   SDK intents, while the script keeps fixture-based validation available for
   repeatable checks.

Still required before future public registry submissions:

1. Run the official ERC-7730 validator/tooling and Sourcify-backed preview check
   against the selected descriptor files.
2. Confirm Sourcify/ABI readiness for every covered contract.
3. Review final wording with Zama before external submission.
4. Confirm wallet-native behavior on a supported Ledger path after descriptors
   are available through that wallet's trusted source.
