# Clear Signing Intent Layer

This directory documents the first clear-signing increment for the high-level
SDK. The current implementation introduces a wallet-agnostic semantic intent
model, conservative rendering/validation helpers, SDK runtime previews, and
React hooks. It also includes experimental ERC-7730 descriptor drafts and
fixtures for Ledger/wallet-native review.

## Objective

The SDK already knows the user-facing operation before it encrypts values or
builds calldata. The clear-signing layer captures that SDK-side context as a
`ClearSigningIntent` so wallet, UI, tests, or future descriptor tooling can show
what the user is about to authorize without treating encrypted handles as
plaintext.

The intent model is the source of truth. ERC-7730 remains an output target: the
SDK sends normal transactions and typed-data signatures, while a compatible
wallet resolves descriptors from its trusted source.

## Contents

| File/Directory                | Purpose                                                 |
| ----------------------------- | ------------------------------------------------------- |
| `flow-inventory.md`           | V1 flow coverage and excluded flows.                    |
| `wording-guidelines.md`       | Central wording, visibility rules, and warnings.        |
| `eip712-inventory.md`         | Direct and delegated decrypt typed-data mappings.       |
| `erc7730-descriptor-notes.md` | ERC-7730 mapping notes, descriptor status, and caveats. |
| `ledger-dsk-poc-plan.md`      | Ledger DSK path, originToken/CAL gates, and POC plan.   |
| `erc7730/`                    | Experimental descriptor drafts and local SDK fixtures.  |
| `usage-examples.md`           | Public builder, renderer, and validation examples.      |
| `examples/intents.ts`         | Type-checkable local examples.                          |

## Implementation

The public API lives in `@zama-fhe/sdk/clear-signing` and is also re-exported
from the main `@zama-fhe/sdk` entry point.

The implementation provides:

1. Pure intent builders for supported SDK flows.
2. Internal wording constants to keep later review changes localized.
3. Visibility metadata for public, encrypted, derived, and internal fields.
4. A renderer that hides internal fields by default and safely displays
   encrypted values.
5. Validation helpers that reject unsafe intent shapes before rendering or
   descriptor export.
6. Runtime intent previews on `ZamaSDK`, `Token`, and `WrappedToken`.
7. Optional `onClearSigningIntent` callbacks on supported SDK operation
   options.
8. React mutation hooks that generate clear-signing intents without submitting
   the underlying operation.

## ERC-7730 Boundary

The repository now contains static descriptor drafts under `erc7730/`. They are
not bundled into the runtime SDK and they are not published to the public
registry yet.

Use them as reviewable artefacts for descriptor correctness, fixtures, and
eventual registry submission. Do not treat them as proof that MetaMask, Rabby,
Ledger Wallet, or any other wallet will render the flows until the descriptors
are validated with official tooling and available through a wallet-supported
descriptor source.
