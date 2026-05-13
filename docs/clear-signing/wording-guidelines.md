# Clear Signing Wording Guidelines

This document defines initial wording rules for Clear Signing intents. The
wording is intentionally centralized and conservative so product, security, UX,
and wallet partner reviews can update it later without changing builder logic.

## Goals

Clear signing wording must help a user understand:

1. What action they are taking.
2. Which values are public, encrypted, derived, or internal.
3. Which permissions are granted.
4. Which permissions are not granted.
5. Which transaction is only one phase of a larger flow.

Clear signing wording must not:

1. Pretend encrypted values are plaintext.
2. Hide meaningful permissions.
3. Treat raw calldata as the user intent when a safer semantic description is available.
4. Couple SDK wording to a single wallet.
5. Make ERC-7730 the source of truth.

## Visibility Labels

Every field in a `ClearSigningIntent` must carry one visibility label.

| Label       | Definition                                                                 | Display rule                                                                      |
| ----------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `public`    | Visible on-chain or passed to the SDK as safe plaintext context.           | Can appear in primary wording.                                                    |
| `encrypted` | Opaque encrypted value, ciphertext handle, or encrypted balance reference. | May appear as "encrypted amount" or "hidden encrypted value", never as plaintext. |
| `derived`   | Computed from public or flow context.                                      | Can appear if the derivation is clear and safe.                                   |
| `internal`  | Protocol plumbing or sensitive material.                                   | Hidden from primary wording; advanced/raw context only.                           |

## General Wording Rules

### Prefer human intent

Use wording that describes what the user is trying to do.

Good:

```text
Shield public tokens into a confidential balance.
```

Avoid:

```text
Call wrap().
```

Low-level function names may appear in advanced details, not as the primary
title when a clearer intent exists.

### Never overclaim encrypted values

If the only available value is encrypted, do not display a plaintext amount.

Good:

```text
Amount: Hidden encrypted amount
```

Bad:

```text
Amount: 100 confidential USDC
```

Exception: if an intent builder receives plaintext SDK call context before
encryption, it may include that plaintext as a `public` SDK input field, but it
must still mark the calldata handle as `encrypted`.

### Separate SDK-known values from calldata-visible values

Some flows start with plaintext SDK inputs and then submit encrypted calldata.
Builders must keep these separate.

Recommended labels:

| Situation                                                          | Label               |
| ------------------------------------------------------------------ | ------------------- |
| Plaintext amount passed to SDK before encryption                   | `Amount`            |
| Encrypted handle submitted on-chain                                | `Encrypted amount`  |
| Existing encrypted balance handle                                  | `Encrypted balance` |
| Public amount in ERC-20 transfer, approval, wrap, or finalize call | `Public amount`     |

### Avoid permission ambiguity

Permissions must say what they grant and what they do not grant.

Good:

```text
Allow another wallet to view confidential data.
This does not allow spending, transferring, or moving your tokens.
```

Bad:

```text
Delegate token access.
```

### Mention multi-step status

Unshield flows are multi-step. Wording must identify first-phase and final-phase
transactions.

Good for `unwrap`:

```text
Start converting a confidential amount into public tokens.
Finalization is still required.
```

Good for `finalizeUnwrap`:

```text
Complete a pending unshield and receive public tokens.
```

## Canonical Terms

Use these terms consistently unless product review changes them.

| Concept                               | Preferred wording                               | Avoid                               |
| ------------------------------------- | ----------------------------------------------- | ----------------------------------- |
| Public ERC-20 to confidential balance | `shield`                                        | `deposit privately` as primary term |
| Confidential balance to public ERC-20 | `unshield`                                      | `withdraw` alone                    |
| First unshield phase                  | `request unshield`                              | `complete withdrawal`               |
| Final unshield phase                  | `finalize unshield`                             | `decrypt tokens`                    |
| Encrypted amount handle               | `encrypted amount`                              | raw handle as amount                |
| Existing encrypted balance handle     | `encrypted balance`                             | raw handle as amount                |
| Decryption delegation                 | `view confidential data`                        | `token access`                      |
| Decryption authorization              | `authorize confidential data decryption`        | `approve tokens`                    |
| Wrapper spending approval             | `approve wrapper to spend public ERC-20 tokens` | `approve confidential transfer`     |

## Prohibited Wording

Do not use these phrases in primary user-facing output.

| Phrase                                            | Reason                                                        |
| ------------------------------------------------- | ------------------------------------------------------------- |
| `Delegate token access`                           | Ambiguous; could imply spending or transfer rights.           |
| `Transfer encrypted amount of 100`                | Confuses encrypted calldata with plaintext context.           |
| `Withdraw complete` for `unwrap`                  | `unwrap` is only phase one.                                   |
| `Private recipient`                               | Recipient addresses in current V1 flows are public.           |
| `Hidden recipient`                                | Recipient addresses in current V1 flows are public.           |
| `Approve confidential tokens` for shield approval | The approval is for public ERC-20 spending by the wrapper.    |
| `Decrypt your tokens`                             | Tokens are not decrypted; values are decrypted or unshielded. |

## Flow Wording Registry Draft

These entries are the initial wording source for future builders. Builders
should reference centralized constants rather than embedding strings inline.

### `allow`

| Element | Text                                                                                                              |
| ------- | ----------------------------------------------------------------------------------------------------------------- |
| Title   | `Authorize confidential data decryption`                                                                          |
| Summary | `Allow this wallet to decrypt confidential values for selected contracts.`                                        |
| Warning | `This authorizes decryption for the listed contracts. It does not transfer tokens or grant spending permissions.` |

Suggested fields:

| Field              | Visibility | Label                  |
| ------------------ | ---------- | ---------------------- |
| Contract addresses | `public`   | `Authorized contracts` |
| Start timestamp    | `public`   | `Starts at`            |
| Duration           | `public`   | `Duration`             |
| FHE public key     | `internal` | `FHE public key`       |
| EIP-712 extra data | `internal` | `Protocol extra data`  |

### `allowAs`

| Element | Text                                                                                                               |
| ------- | ------------------------------------------------------------------------------------------------------------------ |
| Title   | `Authorize delegated confidential data decryption`                                                                 |
| Summary | `Allow this wallet to decrypt delegated confidential values for selected contracts.`                               |
| Warning | `This uses an existing delegation for decryption only. It does not transfer tokens or grant spending permissions.` |

Suggested fields:

| Field              | Visibility | Label                  |
| ------------------ | ---------- | ---------------------- |
| Contract addresses | `public`   | `Authorized contracts` |
| Delegator address  | `public`   | `Delegator wallet`     |
| Start timestamp    | `public`   | `Starts at`            |
| Duration           | `public`   | `Duration`             |
| FHE public key     | `internal` | `FHE public key`       |
| EIP-712 extra data | `internal` | `Protocol extra data`  |

### `delegateDecryption`

| Element           | Text                                                                 |
| ----------------- | -------------------------------------------------------------------- |
| Title             | `Allow another wallet to view confidential data`                     |
| Summary           | `Grant decryption access for one confidential contract.`             |
| Mandatory warning | `This does not allow spending, transferring, or moving your tokens.` |

Suggested fields:

| Field             | Visibility | Label                    |
| ----------------- | ---------- | ------------------------ |
| Contract address  | `public`   | `Confidential contract`  |
| Delegate address  | `public`   | `Wallet allowed to view` |
| Delegator address | `public`   | `Granting wallet`        |
| Expiration        | `public`   | `Access expires`         |
| ACL address       | `public`   | `ACL contract`           |

Expiration wording:

| Value              | Text                                  |
| ------------------ | ------------------------------------- |
| Explicit timestamp | `Access expires at {date}`            |
| `uint64.max`       | `Access remains active until revoked` |

### `confidentialTransfer`

| Element | Text                                                        |
| ------- | ----------------------------------------------------------- |
| Title   | `Send confidential tokens`                                  |
| Summary | `Transfer an encrypted token amount to a public recipient.` |

Suggested fields:

| Field                  | Visibility  | Label                |
| ---------------------- | ----------- | -------------------- |
| Token contract         | `public`    | `Confidential token` |
| Recipient              | `public`    | `Recipient`          |
| SDK plaintext amount   | `public`    | `Amount`             |
| Calldata amount handle | `encrypted` | `Encrypted amount`   |
| Input proof            | `internal`  | `Input proof`        |

Fallback amount text when only calldata is available:

```text
Hidden encrypted amount
```

### `shield`

| Element | Text                                                          |
| ------- | ------------------------------------------------------------- |
| Title   | `Shield public tokens`                                        |
| Summary | `Convert public ERC-20 tokens into a confidential balance.`   |
| Warning | `After shielding, the balance is represented confidentially.` |

Suggested fields:

| Field            | Visibility            | Label                            |
| ---------------- | --------------------- | -------------------------------- |
| Underlying token | `public`              | `Public token`                   |
| Wrapper contract | `public`              | `Confidential wrapper`           |
| Amount           | `public`              | `Public amount`                  |
| Recipient        | `public` or `derived` | `Confidential balance recipient` |
| Shield path      | `derived`             | `Shield route`                   |

Approval-specific warning:

```text
This may first approve the wrapper to spend public ERC-20 tokens.
```

Max approval warning:

```text
This approval may allow the wrapper to spend more than this shield amount.
```

### `unwrap`

| Element | Text                                                                          |
| ------- | ----------------------------------------------------------------------------- |
| Title   | `Request unshield`                                                            |
| Summary | `Start converting a confidential amount into public tokens.`                  |
| Warning | `This starts the unshield process. A finalize transaction is still required.` |

Suggested fields:

| Field                  | Visibility  | Label                    |
| ---------------------- | ----------- | ------------------------ |
| Wrapper contract       | `public`    | `Confidential wrapper`   |
| Recipient              | `public`    | `Public token recipient` |
| SDK plaintext amount   | `public`    | `Amount`                 |
| Calldata amount handle | `encrypted` | `Encrypted amount`       |
| Input proof            | `internal`  | `Input proof`            |

Fallback amount text when only calldata is available:

```text
Hidden encrypted amount
```

### `unwrapAll`

| Element | Text                                                                          |
| ------- | ----------------------------------------------------------------------------- |
| Title   | `Request unshield of entire confidential balance`                             |
| Summary | `Start converting your entire confidential balance into public tokens.`       |
| Warning | `This starts the unshield process. A finalize transaction is still required.` |

Mandatory phrase:

```text
entire confidential balance
```

Suggested fields:

| Field                    | Visibility  | Label                    |
| ------------------------ | ----------- | ------------------------ |
| Wrapper contract         | `public`    | `Confidential wrapper`   |
| Recipient                | `public`    | `Public token recipient` |
| Balance handle           | `encrypted` | `Encrypted balance`      |
| Entire-balance indicator | `derived`   | `Amount`                 |

Recommended amount text:

```text
Entire confidential balance
```

### `finalizeUnwrap`

| Element | Text                                                     |
| ------- | -------------------------------------------------------- |
| Title   | `Finalize unshield`                                      |
| Summary | `Complete a pending unshield and receive public tokens.` |

Suggested fields:

| Field                          | Visibility            | Label                      |
| ------------------------------ | --------------------- | -------------------------- |
| Wrapper contract               | `public`              | `Confidential wrapper`     |
| Unwrap request ID              | `public` or `derived` | `Pending unshield request` |
| Legacy encrypted amount handle | `encrypted`           | `Encrypted amount`         |
| Clear amount                   | `public`              | `Public amount`            |
| Decryption proof               | `internal`            | `Decryption proof`         |

## Warning Rules

Warnings are required when user misunderstanding could create security or UX
risk.

| Condition                    | Warning                                                                                                           |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Decryption delegation        | `This does not allow spending, transferring, or moving your tokens.`                                              |
| Direct decrypt authorization | `This authorizes decryption for the listed contracts. It does not transfer tokens or grant spending permissions.` |
| First unshield phase         | `This starts the unshield process. A finalize transaction is still required.`                                     |
| Shield with approval route   | `This may first approve the wrapper to spend public ERC-20 tokens.`                                               |
| Shield with max approval     | `This approval may allow the wrapper to spend more than this shield amount.`                                      |

## Snapshot Test Expectations

Snapshot tests for intent output should be treated as security-sensitive.

Snapshots should include:

1. Intent `kind`.
2. Title and summary.
3. Fields with labels and visibility.
4. Warnings.
5. Minimal raw context markers, not full ABI blobs unless necessary.

Safety assertions should verify:

1. `encrypted` fields are never displayed with plaintext labels such as `Amount: 100`.
2. Ciphertext handles are labeled as encrypted or internal.
3. Input proofs and decryption proofs are internal.
4. `delegateDecryption` includes the anti-spending warning.
5. `unwrapAll` includes "entire confidential balance".
6. `unwrap` includes the finalize-required warning.

## Future Centralization Shape

The initial implementation should keep wording in a single internal SDK module,
for example:

```text
packages/sdk/src/clear-signing/wording.ts
```

Suggested shape:

```ts
const clearSigningWording: ClearSigningWording = {
  allow: {
    title: "Authorize confidential data decryption",
    summary: "Allow this wallet to decrypt confidential values for selected contracts.",
    warnings: {
      noSpending:
        "This authorizes decryption for the listed contracts. It does not transfer tokens or grant spending permissions.",
    },
  },
  delegateDecryption: {
    title: "Allow another wallet to view confidential data",
    summary: "Grant decryption access for one confidential contract.",
    warnings: {
      noSpending: "This does not allow spending, transferring, or moving your tokens.",
    },
  },
};
```

Builders should consume these constants rather than hardcoding display strings.
The wording registry should not be exported as public API until the phrases have
completed product, security, UX, and wallet partner review.
