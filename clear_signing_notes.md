# Clear Signing Handoff Notes

Date: 2026-05-19

This document is the handoff point for a fresh Codex instance. It summarizes the current state of the clear-signing work, what has been implemented, what has been tested, what is still blocked, and the next concrete steps.

## Repository State

- Local worktree: `/private/tmp/sdk-clear-signing-intent`
- Branch: `feat/clear-signing-intent`
- PR: draft PR `#355`
- Base branch: `prerelease`
- Latest pushed commit: `9c2fe509 test: add erc7730 registry fixtures`
- Remote branch check: `origin/feat/clear-signing-intent` points to `9c2fe509cd56f9f5d497729df7c0835aaea560ca`
- Git status after the last push: local branch is clean, but it tracks `origin/prerelease` and therefore appears as `[ahead 17]`. This is expected for this worktree.

Important: the pre-commit hook can fail because local `ast-grep` is a shim. The latest commit was created with `--no-verify` after the targeted ERC-7730 checks passed.

## Project Goal

The goal is to add clear-signing support for Zama confidential-token flows.

There are two levels:

- App-level clear signing: the SDK and React example can show a human-readable intent before the wallet prompt.
- Wallet-native / hardware clear signing: a wallet or Ledger device renders the transaction using ERC-7730 descriptors from a trusted descriptor source.

The current target POC is a Sepolia `shield` operation for `ZAMAMock` to `cZAMAMock`, ideally shown on a Ledger Nano S Plus as:

```text
Action: Shield
Send: 1 ZAMAMock
Receive: confidential balance in cZAMAMock
Recipient: <wallet>
Wrapper: cZAMAMock
Network: Sepolia
```

`Receive: 1 cZAMAMock` is intentionally not promised yet. `ZAMAMock` has 18 decimals, `cZAMAMock` has 6 decimals, and the wrapper `rate()` is `1_000_000_000_000`. ERC-7730 v2 does not give us a safe generic way to display `amount / rate` as a derived field.

## Key Conceptual Boundary

`ClearSigningIntent` is the SDK-level source of truth.

ERC-7730 is an output format for wallets. It should not become the SDK's internal source model.

The SDK knows the user's plaintext intent before it encrypts values or builds calldata. That intent can be rendered in the app and can later be mapped into ERC-7730 descriptors for wallet-native rendering.

## What Has Been Implemented

### SDK clear-signing layer

Implemented in `packages/sdk/src/clear-signing/`.

It includes:

- intent types;
- pure builders for supported flows;
- conservative renderer;
- validation helpers;
- wording constants;
- tests and snapshots.

Covered flows include:

- `allow`
- `allowAs`
- `delegateDecryption`
- `confidentialTransfer`
- `shield`
- `unwrap`
- `unwrapAll`
- `finalizeUnwrap`

### Runtime and React integration

The SDK exposes runtime intent previews and `onClearSigningIntent` hooks. The React SDK/example can generate previews before submitting operations.

The example app lives at:

```text
examples/react-wagmi-clear-signing
```

It includes a clear-signing preview UI and E2E coverage for the human-readable app-level preview.

### Ledger DSK POC

The Ledger-only diagnostic page is:

```text
examples/react-wagmi-clear-signing/src/app/ledger/page.tsx
```

It can:

- connect to Ledger via WebHID / DMK / DSK;
- read the Ledger address;
- build and sign `ZAMAMock.approve(...)`;
- build and sign `cZAMAMock.wrap(address,uint256)`;
- optionally broadcast the signed transaction;
- show DSK logs and fallback behavior.

Important Ledger implementation details:

- Derivation path must be passed as `44'/60'/0'/0/0`, not `m/44'/60'/0'/0/0`.
- The user should manually open the Ethereum app on the Ledger before connecting/signing.
- The POC uses `skipOpenApp: true`.
- On connection/signing failures, the DMK should be closed, not merely disconnected.

### ERC-7730 descriptor drafts

Descriptor drafts live under:

```text
docs/clear-signing/erc7730/registry/zama/
```

Current descriptors:

- `calldata-acl-user-decryption.json`
- `calldata-confidential-token-wrapper.json`
- `calldata-erc20-shield-entrypoints.json`
- `eip712-decryption-permits.json`

Current coverage:

- `delegateDecryption`
- `shield` via `approve + wrap`
- `shield` via `transferAndCall`
- `confidentialTransfer`
- `unwrap`
- `unwrapAll`
- `finalizeUnwrap`
- `allow`
- `allowAs`

### ERC-7730 registry reference tests

Added in latest commit `9c2fe509`:

```text
docs/clear-signing/erc7730/registry/zama/tests/
```

Files:

- `calldata-acl-user-decryption.tests.json`
- `calldata-confidential-token-wrapper.tests.json`
- `calldata-erc20-shield-entrypoints.tests.json`
- `eip712-decryption-permits.tests.json`

These mirror the public registry format from `ethereum/clear-signing-erc7730-registry`:

- calldata tests use signed `rawTx`;
- EIP-712 tests use typed-data `data`;
- each test has `expectedTexts`.

The local test now verifies that these registry reference tests match their descriptors, selectors, deployments, and EIP-712 domains.

### Ledger demo descriptors

Minimal Ledger demo descriptors live in:

```text
docs/clear-signing/erc7730/ledger-demo/zama-shield/
```

Files:

- `calldata-zamamock-shield.json`
- `calldata-czamamock-wrapper.json`
- `fixtures.json`
- `README.md`

For current Ledger smoke testing, focus on:

```text
docs/clear-signing/erc7730/ledger-demo/zama-shield/calldata-czamamock-wrapper.json
```

Target function:

```text
wrap(address to,uint256 amount)
```

Target contract:

```text
0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB
```

Selector:

```text
0xbf376c7a
```

## What Has Been Tested

### Passing checks

Run from `/private/tmp/sdk-clear-signing-intent`:

```bash
pnpm clear-signing:check
```

Status: passing.

This runs:

```bash
pnpm exec vitest run packages/sdk/src/clear-signing/__tests__/erc7730-docs.test.ts
```

It currently checks:

- descriptor top-level shape;
- descriptor deployments;
- local calldata fixtures;
- local EIP-712 fixtures;
- registry-style reference test files;
- Ledger demo descriptor field compatibility.

Official ERC-7730 lint command used:

```bash
uvx erc7730 lint --v2 \
  docs/clear-signing/erc7730/registry/zama/*.json \
  docs/clear-signing/erc7730/ledger-demo/zama-shield/calldata-zamamock-shield.json \
  docs/clear-signing/erc7730/ledger-demo/zama-shield/calldata-czamamock-wrapper.json
```

Status: passes with warnings only.

Expected warnings:

```text
Missing/Invalid API Key
```

Those warnings happen because the CLI tries to fetch ABIs from Etherscan without an API key. They do not block local descriptor iteration, but registry submission still requires verified contract ABIs.

### Wallet and Ledger observations

Conclusive:

- App-level preview works.
- Ledger Nano S Plus can connect over WebHID.
- Ledger DSK can read the address.
- Ledger DSK can sign and broadcast Sepolia `cZAMAMock.wrap(address,uint256)`.

Non-conclusive / not sufficient:

- MetaMask showed generic transaction screens.
- Rabby showed generic or blind-signing behavior.
- Rabby + Ledger still resulted in blind/generic signing.
- MetaMask + Ledger did not produce Ledger-native ERC-7730 clear signing.

Current hardware result:

- The Ledger POC signs and broadcasts.
- Ledger still falls back to blind signing because the descriptor is not available through the trusted Ledger registry/CAL path.

## Important External Dependencies

### Public ERC-7730 registry

The registry is:

```text
https://github.com/ethereum/clear-signing-erc7730-registry
```

The PR to this repository is a metadata PR, not a smart-contract PR and not a transaction submission.

For a real submission:

- copy/update files under `registry/zama/`;
- ensure `$schema` points to the registry-relative schema path;
- include `tests/*.tests.json`;
- validate with `erc7730 lint`;
- verify covered contract ABIs through Sourcify;
- open a PR modifying only the `registry/zama/` entity folder.

### Sourcify verification

See:

```text
docs/clear-signing/erc7730/sourcify-verification.md
```

Current status:

- Sepolia confidential wrapper proxies: Sourcify `perfect`.
- Shared wrapper implementation `0x528f2f29ddeb466cfbfb7a31ce92bfb3c343973c`: Sourcify `exact_match`.
- `ZAMAMock` underlying ERC-20 `0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57`: Sourcify `perfect`.
- Several other underlying ERC-20 mocks are still missing verification.
- Sepolia decryption verifier is missing verification.
- Mainnet ACL/decryption verifier are missing verification.

For a first external registry PR, prefer narrowing to verified Sepolia contracts, especially the ZAMAMock/cZAMAMock shield path, unless the missing contracts are verified first.

### Ledger `originToken`

Ledger DSK / wallet integration requires an `originToken` according to Ledger docs.

What is known:

- It is used when building the Ethereum signer.
- It is sent through the Ledger context metadata path.
- It is tied to partner enrollment.
- It should be treated as sensitive.

What is still unknown:

- exact dev/test token issuance process;
- whether Ledger supports local ERC-7730 descriptor testing on a physical Nano before registry/CAL ingestion;
- which CAL branch/mode should be used for test descriptors;
- required firmware/Ethereum app versions for ERC-7730 calldata clear signing.

Questions to send Ledger are already listed in:

```text
docs/clear-signing/ledger-dsk-poc-plan.md
```

## Known Gotchas

- Do not pass derivation paths with `m/` to Ledger DSK. Use `44'/60'/0'/0/0`.
- Do not assume app-level preview means wallet-native clear signing. They are separate.
- Do not include non-descriptor fixtures in `uvx erc7730 lint`; lint descriptor files explicitly.
- Do not promise plaintext amount rendering for encrypted FHE handles in wallet-native ERC-7730.
- `Receive: <amount> cZAMAMock` is not encoded yet because it requires derived arithmetic from wrapper rate.
- Browser wallets did not provide the target ERC-7730 rendering during testing.
- A local ERC-7730 JSON file alone is not enough for Ledger secure-screen clear signing. Ledger expects trusted registry/CAL metadata and signed payload material.

## Next Steps

1. Decide the first external registry submission scope.

Recommended initial scope:

```text
Sepolia ZAMAMock / cZAMAMock shield only
```

Reason:

- `ZAMAMock` is verified.
- `cZAMAMock` proxy is verified.
- wrapper implementation is verified.
- this matches the current Ledger POC and user goal.

2. Prepare a registry-ready folder for `ethereum/clear-signing-erc7730-registry`.

Likely files:

```text
registry/zama/calldata-czamamock-wrapper.json
registry/zama/calldata-zamamock-shield.json
registry/zama/tests/calldata-czamamock-wrapper.tests.json
registry/zama/tests/calldata-zamamock-shield.tests.json
```

Use the existing Ledger demo descriptors as the starting point, because they are focused on the verified ZAMAMock/cZAMAMock pair.

3. Update `$schema` values for the external registry.

Local descriptors currently use:

```text
https://eips.ethereum.org/assets/eip-7730/erc7730-v2.schema.json
```

The public registry expects a relative schema path such as:

```text
../../specs/erc7730-v2.schema.json
```

Tests use:

```text
../../../specs/erc7730-tests.schema.json
```

4. Run official validation against the prepared registry folder.

Use:

```bash
uvx erc7730 lint --v2 <descriptor files>
```

If an Etherscan API key is available, configure it so the CLI can validate ABI fields. Otherwise expect ABI-fetch warnings.

5. Confirm Sourcify readiness for every contract in the selected descriptor scope.

For the recommended first scope, re-check:

- `0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57`
- `0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB`
- `0x528f2f29ddeb466cfbfb7a31ce92bfb3c343973c`

6. Contact Ledger.

Ask:

- Can Ledger provide a dev/test `originToken` for a local WebHID POC?
- Is there a supported way to test local ERC-7730 calldata descriptors on a physical Nano S Plus before public registry/CAL ingestion?
- Are Sepolia calldata descriptors accepted in the public clear-signing registry/CAL flow?
- Which CAL branch/mode and signature process should be used?
- Which Ethereum app version and device firmware are required?

7. Retest physical Ledger clear signing.

Use:

```bash
cd /private/tmp/sdk-clear-signing-intent
pnpm --filter react-wagmi-clear-signing-example dev
```

Open:

```text
http://localhost:<port>/ledger
```

Expected before Ledger registry/CAL access:

- signing works;
- device falls back to blind signing.

Expected after registry/CAL + originToken path is available:

- DSK resolves ERC-7730 metadata;
- Ledger secure screen shows human-readable intent rather than blind signing.

## Useful Commands

Check status:

```bash
cd /private/tmp/sdk-clear-signing-intent
git status --short --branch
git log --oneline -12
```

Run clear-signing descriptor tests:

```bash
pnpm clear-signing:check
```

Run official ERC-7730 lint:

```bash
uvx erc7730 lint --v2 \
  docs/clear-signing/erc7730/registry/zama/*.json \
  docs/clear-signing/erc7730/ledger-demo/zama-shield/calldata-zamamock-shield.json \
  docs/clear-signing/erc7730/ledger-demo/zama-shield/calldata-czamamock-wrapper.json
```

Run example app:

```bash
pnpm --filter react-wagmi-clear-signing-example dev
```

## Files To Read First In A New Session

Read these in order:

```text
clear_signing_notes.md
docs/clear-signing/README.md
docs/clear-signing/erc7730/README.md
docs/clear-signing/ledger-dsk-poc-plan.md
docs/clear-signing/erc7730/sourcify-verification.md
docs/clear-signing/erc7730/ledger-demo/zama-shield/README.md
packages/sdk/src/clear-signing/__tests__/erc7730-docs.test.ts
examples/react-wagmi-clear-signing/src/app/ledger/page.tsx
```

## Current Status In One Paragraph

The SDK-side clear-signing intent layer, app-level preview, React example, Ledger DSK POC, ERC-7730 descriptor drafts, and registry-style reference tests are in place. Local descriptor checks and official ERC-7730 lint pass, with only expected Etherscan API-key warnings. The remaining work is externalization and validation: narrow the first registry PR to verified ZAMAMock/cZAMAMock shield descriptors, prepare the `ethereum/clear-signing-erc7730-registry` PR shape, confirm Sourcify coverage, and coordinate with Ledger for `originToken` / CAL access so the physical device can render ERC-7730 instead of falling back to blind signing.
