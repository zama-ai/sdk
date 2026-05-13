# ERC-7730 Descriptor Notes

ERC-7730 is an output target for the Clear Signing Intent Layer, not the source
model. The SDK should keep `ClearSigningIntent` wallet-agnostic and generate
ERC-7730 descriptors from intents only after the semantic model is stable.

Reference: https://eips.ethereum.org/EIPS/eip-7730

Status checked on 2026-05-13: ERC-7730 is still marked as a draft ERC. Treat
all descriptor generation as experimental until wallet support and schema
expectations are validated.

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
types. They should be validated against actual ABI/type encodings before any
descriptor files are emitted.

| Flow                           | Candidate format key                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `confidentialTransfer`         | `confidentialTransfer(address to,bytes32 encryptedAmount,bytes inputProof)`                           |
| `shield` via `transferAndCall` | `transferAndCall(address to,uint256 value,bytes data)`                                                |
| `shield` via `wrap`            | `wrap(address to,uint256 amount)`                                                                     |
| shield approval                | `approve(address spender,uint256 value)`                                                              |
| `unwrap`                       | `unwrap(address from,address to,bytes32 encryptedAmount,bytes inputProof)`                            |
| `unwrapAll`                    | `unwrap(address from,address to,bytes32 encryptedBalance)`                                            |
| `finalizeUnwrap`               | `finalizeUnwrap(bytes32 unwrapRequestIdOrAmount,uint256 unwrapAmountCleartext,bytes decryptionProof)` |
| direct decrypt EIP-712         | `UserDecryptRequestVerification`                                                                      |
| delegated decrypt EIP-712      | `DelegatedUserDecryptRequestVerification`                                                             |

## Do Not Implement Yet

Do not add descriptor generation until these are resolved:

1. Exact schema version and validation tooling to use.
2. Wallet baseline behavior for contract descriptors and EIP-712 descriptors.
3. Whether descriptors should be emitted as static files, generated JSON, or both.
4. How descriptor files bind to deployed wrapper/token addresses across chains.
5. How encrypted FHE fields should use ERC-7730 encryption metadata without
   implying plaintext availability.

Until then, descriptor work should remain limited to documentation and tests
around `ClearSigningIntent`.
