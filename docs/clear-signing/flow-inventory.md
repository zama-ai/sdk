# Clear Signing Flow Inventory

This document inventories the SDK flows that should feed the Clear Signing
Intent Layer. It records current behavior only. It does not propose API changes
and should be updated when the underlying SDK flow changes.

## Scope

V1 target flows:

| Flow                           | Status   | Primary implementation                                               |
| ------------------------------ | -------- | -------------------------------------------------------------------- |
| `allow`                        | In scope | `ZamaSDK.allow`, `CredentialService.allow`                           |
| `allowAs`                      | In scope | `ZamaSDK.allowAs`, `CredentialService.allow` with delegator scope    |
| `delegateDecryption`           | In scope | `ZamaSDK.delegateDecryption`, `DelegationService.delegateDecryption` |
| `confidentialTransfer`         | In scope | `Token.confidentialTransfer`                                         |
| `shield` via `wrap`            | In scope | `WrappedToken.shield`, `#shieldViaApproveAndWrap`                    |
| `shield` via `transferAndCall` | In scope | `WrappedToken.shield`, `#shieldViaTransferAndCall`                   |
| `unwrap`                       | In scope | `WrappedToken.unwrap`                                                |
| `unwrapAll`                    | In scope | `WrappedToken.unwrapAll`                                             |
| `finalizeUnwrap`               | In scope | `WrappedToken.finalizeUnwrap`                                        |

Explicit V1 exclusions:

| Flow                                          | Reason                                                                                         |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `confidentialTransferFrom`                    | Operator semantics are deferred.                                                               |
| `setOperator`                                 | Advanced operator permissions are deferred.                                                    |
| `revokeDelegation`                            | Not part of the current prompt V1 flow list.                                                   |
| `approveUnderlying` as a standalone user flow | Low-level escape hatch; only shield-related approval semantics are included for V1.            |
| `resumeUnshield`                              | Recovery helper around existing unwrap transaction; can reuse unwrap/finalize semantics later. |

## Visibility Classification

| Visibility  | Meaning                                                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `public`    | Already visible on-chain or provided as plaintext input by the caller.                                                         |
| `encrypted` | Represents a value encrypted for FHE use. Do not display as plaintext.                                                         |
| `derived`   | Computed from public or encrypted flow state. Must describe the derivation.                                                    |
| `internal`  | Protocol plumbing such as handles, proofs, signatures, raw calldata, or key material. Do not include in primary human wording. |

## Flow: `allow`

### Current behavior

`ZamaSDK.allow(contracts)` pre-authorizes direct user decryption for one or
more confidential contracts. It requires signer/provider chain alignment and
delegates to `CredentialService.allow`.

`CredentialService.allow`:

1. Resolves the connected wallet account.
2. Normalizes requested contract addresses.
3. Gets or creates the user's FHE keypair.
4. Reuses cached permits when they already cover the requested contracts.
5. Chunks uncovered contracts into groups of up to 10.
6. Builds a user-decrypt EIP-712 payload per uncovered chunk.
7. Requests a wallet `signTypedData` signature.
8. Stores the signed permit for later user decrypt operations.

### User meaning

Authorize the SDK to decrypt this user's confidential values for the listed
contracts during the permit lifetime.

This is a signing authorization, not an on-chain token transfer and not an
operator approval.

### Raw EIP-712 shape

`USER_DECRYPT_EIP712` uses domain `Decryption`, version `1`, and primary type
`UserDecryptRequestVerification`.

| Field               | Visibility | Notes                                                                          |
| ------------------- | ---------- | ------------------------------------------------------------------------------ |
| `publicKey`         | internal   | FHE public key used for user decryption. Not useful as primary wallet wording. |
| `contractAddresses` | public     | Confidential contracts covered by the permit.                                  |
| `startTimestamp`    | public     | Permit start timestamp.                                                        |
| `durationDays`      | public     | Permit duration.                                                               |
| `extraData`         | internal   | Currently protocol payload. Do not render as user intent.                      |
| signature result    | internal   | Stored permit credential.                                                      |
| private key         | internal   | Never display. Stored encrypted by the credential subsystem.                   |

### Clear signing intent candidate

| Property       | Candidate                                                                                                         |
| -------------- | ----------------------------------------------------------------------------------------------------------------- |
| Kind           | `allow`                                                                                                           |
| Title          | `Authorize confidential data decryption`                                                                          |
| Summary        | `Allow this wallet to decrypt confidential values for selected contracts.`                                        |
| Primary fields | Contract addresses, start time, duration                                                                          |
| Warning        | `This authorizes decryption for the listed contracts. It does not transfer tokens or grant spending permissions.` |

### Open questions

| Question                                                                                      | Impact                                                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Should contract addresses be labeled as "contracts" or "confidential contracts" in V1 output? | Wording only. Current SDK conventions favor "contracts" for SDK-level operations. |
| Should the generated FHE public key appear in advanced/details output?                        | It is raw context, but should remain `internal` by default.                       |

## Flow: `allowAs`

### Current behavior

`ZamaSDK.allowAs(delegator, contracts)` pre-authorizes delegated user decryption
for one or more confidential contracts after the delegator has granted ACL
delegation to the connected signer.

It requires signer/provider chain alignment and delegates to
`CredentialService.allow(contracts, delegator)`.

`CredentialService.allow` in delegator scope:

1. Resolves the connected delegate wallet account.
2. Normalizes requested contract addresses and the delegator address.
3. Gets or creates the delegate wallet's FHE keypair.
4. Reuses cached delegated permits when they already cover the requested contracts.
5. Chunks uncovered contracts into groups of up to 10.
6. Builds a delegated user-decrypt EIP-712 payload per uncovered chunk.
7. Requests a wallet `signTypedData` signature from the connected delegate wallet.
8. Stores the signed permit for later delegated user decrypt operations.

### User meaning

Authorize the connected delegate wallet to decrypt confidential values for the
listed contracts on behalf of the delegator, provided the required ACL
delegation exists.

This signature does not create the ACL delegation. It is not an on-chain token
transfer and not an operator approval.

### Raw EIP-712 shape

`DELEGATED_USER_DECRYPT_EIP712` uses domain `Decryption`, version `1`, and
primary type `DelegatedUserDecryptRequestVerification`.

| Field               | Visibility | Notes                                                                 |
| ------------------- | ---------- | --------------------------------------------------------------------- |
| `publicKey`         | internal   | FHE public key used for delegated user decryption.                    |
| `contractAddresses` | public     | Confidential contracts covered by the delegated credential.           |
| `delegatorAddress`  | public     | Wallet whose confidential data may be decrypted if delegation exists. |
| `startTimestamp`    | public     | Credential start timestamp.                                           |
| `durationDays`      | public     | Credential duration.                                                  |
| `extraData`         | internal   | Currently protocol payload. Do not render as user intent.             |
| signature result    | internal   | Stored delegated permit credential.                                   |
| private key         | internal   | Never display. Stored encrypted by the credential subsystem.          |

### Clear signing intent candidate

| Property       | Candidate                                                                                                          |
| -------------- | ------------------------------------------------------------------------------------------------------------------ |
| Kind           | `allowAs`                                                                                                          |
| Title          | `Authorize delegated confidential data decryption`                                                                 |
| Summary        | `Allow this wallet to decrypt delegated confidential values for selected contracts.`                               |
| Primary fields | Contract addresses, delegator wallet, start time, duration                                                         |
| Warning        | `This uses an existing delegation for decryption only. It does not transfer tokens or grant spending permissions.` |

### Open questions

| Question                                                                                        | Impact                                                                             |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Should the wording say "delegator wallet" or "wallet that granted access"?                      | Wording only. "Delegator" is precise but may be less user-friendly.                |
| Should the connected delegate wallet be displayed explicitly when it is the active signer?      | Product/wallet UX. It may be redundant in a wallet modal but useful in app UI.     |
| Should missing ACL delegation be called out here or left to runtime validation and error paths? | Runtime validation already handles it; wording should not imply delegation exists. |

## Flow: `delegateDecryption`

### Current behavior

`ZamaSDK.delegateDecryption({ contractAddress, delegateAddress, expirationDate })`
requires an aligned wallet account, then calls
`DelegationService.delegateDecryption`.

`DelegationService.delegateDecryption`:

1. Rejects expiration dates less than 1 hour in the future.
2. Normalizes contract, delegate, and delegator addresses.
3. Rejects self-delegation.
4. Rejects delegation to the contract address itself.
5. Resolves the ACL contract address from the relayer.
6. Uses `uint64.max` for no explicit expiration.
7. Reads the current delegation expiry as a pre-flight no-op check.
8. Writes `delegateForUserDecryption(delegate, contract, expiry)` to the ACL.
9. Waits for the transaction receipt.

### User meaning

Allow another wallet to decrypt confidential values for a specific confidential
contract.

This only grants decryption/viewing capability. It does not transfer tokens,
spend tokens, move funds, or grant operator permissions.

### Contract call

| Field                         | Visibility | Notes                                                                   |
| ----------------------------- | ---------- | ----------------------------------------------------------------------- |
| ACL contract address          | public     | Actual transaction target.                                              |
| confidential contract address | public     | Contract whose confidential data can be decrypted by the delegate.      |
| delegator address             | public     | Connected wallet account, represented by `msg.sender` in the ACL write. |
| delegate address              | public     | Wallet receiving decryption rights.                                     |
| expiration timestamp          | public     | `uint64.max` means no explicit expiration.                              |
| transaction hash              | internal   | Raw execution result.                                                   |

### Clear signing intent candidate

| Property          | Candidate                                                            |
| ----------------- | -------------------------------------------------------------------- |
| Kind              | `delegateDecryption`                                                 |
| Title             | `Allow another wallet to view confidential data`                     |
| Summary           | `Grant decryption access for one confidential contract.`             |
| Primary fields    | Confidential contract, delegate wallet, expiration                   |
| Mandatory warning | `This does not allow spending, transferring, or moving your tokens.` |

### Open questions

| Question                                                                                                            | Impact                                                               |
| ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Should "view confidential balance" be token-specific or should V1 keep "confidential data" for non-token contracts? | Product wording. SDK-level operation is contract-generic.            |
| Should permanent delegation be rendered as "No expiration" or "Until revoked"?                                      | Wording only. "Until revoked" may be clearer but should be reviewed. |

## Flow: `confidentialTransfer`

### Current behavior

`Token.confidentialTransfer(to, amount, options)` transfers confidential tokens
to a recipient.

The SDK:

1. Requires a signer.
2. Requires signer/provider chain alignment.
3. Normalizes the recipient address.
4. Optionally validates the sender's confidential balance by decrypting it.
5. Encrypts the plaintext `amount` as `euint64` via the relayer.
6. Gets an encrypted amount handle and input proof.
7. Writes `confidentialTransfer(to, encryptedAmountHandle, inputProof)`.
8. Waits for the transaction receipt.

### User meaning

Send confidential tokens to a recipient. The recipient address is public. The
amount is encrypted in the contract call.

The SDK knows the plaintext amount at the time it builds the encryption request
because the caller passes it as a plaintext `bigint`. Clear signing output must
still distinguish between:

1. Plaintext user input available to the SDK before encryption.
2. Encrypted on-chain argument visible to wallets in calldata.

### Contract call

| Field                   | Visibility | Notes                                                                     |
| ----------------------- | ---------- | ------------------------------------------------------------------------- |
| token contract address  | public     | Transaction target.                                                       |
| recipient address       | public     | Public calldata.                                                          |
| caller address          | public     | Connected wallet account.                                                 |
| plaintext amount input  | public     | SDK input, not calldata. Safe only if sourced from this SDK call context. |
| encrypted amount handle | encrypted  | Calldata argument. Never render as the plaintext amount.                  |
| input proof             | internal   | Protocol proof.                                                           |

### Clear signing intent candidate

| Property         | Candidate                                                       |
| ---------------- | --------------------------------------------------------------- |
| Kind             | `confidentialTransfer`                                          |
| Title            | `Send confidential tokens`                                      |
| Summary          | `Transfer an encrypted token amount to a public recipient.`     |
| Primary fields   | Token contract, recipient, amount if available from SDK context |
| Encrypted fields | Encrypted amount handle                                         |
| Internal fields  | Input proof                                                     |

### Open questions

| Question                                                                                                                | Impact                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Should the primary wording include the plaintext amount when the intent is generated before encryption from SDK inputs? | Security/product review needed. The amount is known to the SDK but not visible in calldata. |
| How should generated descriptors handle wallets that only see calldata and not SDK-side raw context?                    | Descriptor strategy. Do not overclaim from calldata alone.                                  |

## Flow: `shield` via `transferAndCall`

### Current behavior

`WrappedToken.shield(amount, options)` automatically selects this path when the
underlying ERC-20 supports ERC-1363.

The SDK:

1. Requires an aligned wallet account.
2. Resolves the underlying ERC-20 address.
3. Reads and validates the public ERC-20 balance.
4. Determines the shield recipient: `options.to` or the connected wallet.
5. Writes `transferAndCall(underlying, wrapper, amount, data)`.
6. Uses `data = 0x` for self-shield, or raw 20-byte recipient address for shield-to-other.
7. Waits for the transaction receipt.

The wrapper's `onTransferReceived` callback mints confidential tokens to the
recipient.

### User meaning

Shield public ERC-20 tokens into a confidential balance in a single transaction.

The amount is public because it is an ERC-20 transfer amount. The recipient of
the resulting confidential balance is public or derived from public call data.

### Contract call

| Field                     | Visibility     | Notes                                                       |
| ------------------------- | -------------- | ----------------------------------------------------------- |
| underlying ERC-20 address | public         | Transaction target.                                         |
| wrapper address           | public         | ERC-1363 transfer recipient and confidential token wrapper. |
| public amount             | public         | ERC-20 transfer amount.                                     |
| connected wallet          | public         | ERC-20 sender.                                              |
| shield recipient          | public/derived | `data` address when present, otherwise sender.              |
| `data` payload            | derived        | Raw recipient encoding. Render as recipient, not as hex.    |

### Clear signing intent candidate

| Property       | Candidate                                                     |
| -------------- | ------------------------------------------------------------- |
| Kind           | `shield`                                                      |
| Title          | `Shield public tokens`                                        |
| Summary        | `Convert public ERC-20 tokens into a confidential balance.`   |
| Primary fields | Underlying token, wrapper, public amount, recipient           |
| Warning        | `After shielding, the balance is represented confidentially.` |

### Open questions

| Question                                                              | Impact                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------ |
| Should the wallet output mention ERC-1363 or hide the routing detail? | Human intent should lead; route can be advanced/raw context. |

## Flow: `shield` via `approve` and `wrap`

### Current behavior

`WrappedToken.shield(amount, options)` selects this fallback when the underlying
ERC-20 does not support ERC-1363.

The SDK:

1. Requires an aligned wallet account.
2. Resolves the underlying ERC-20 address.
3. Reads and validates the public ERC-20 balance.
4. Checks current allowance from user to wrapper.
5. Unless `approvalStrategy` is `skip`, submits approval if allowance is too low.
6. Resets non-zero allowance to zero before approval when needed.
7. Approves either exact `amount` or max `uint256` according to `approvalStrategy`.
8. Writes `wrap(recipient, amount)` on the wrapper.
9. Waits for the wrap receipt.

### User meaning

Shield public ERC-20 tokens into a confidential balance. This route may require
an ERC-20 spending approval for the wrapper before the shield transaction.

The shield amount remains public in both the approval and wrap calls.

### Contract calls

Approval call:

| Field                     | Visibility | Notes                                      |
| ------------------------- | ---------- | ------------------------------------------ |
| underlying ERC-20 address | public     | Transaction target for `approve`.          |
| wrapper address           | public     | Spender approved to pull ERC-20 tokens.    |
| approval amount           | public     | Exact amount, zero reset, or max approval. |
| current allowance         | public     | Read-only preflight value.                 |

Wrap call:

| Field             | Visibility | Notes                           |
| ----------------- | ---------- | ------------------------------- |
| wrapper address   | public     | Transaction target for `wrap`.  |
| recipient address | public     | Confidential balance recipient. |
| public amount     | public     | Amount being shielded.          |

### Clear signing intent candidate

| Property             | Candidate                                                                    |
| -------------------- | ---------------------------------------------------------------------------- |
| Kind                 | `shield`                                                                     |
| Title                | `Shield public tokens`                                                       |
| Summary              | `Convert public ERC-20 tokens into a confidential balance.`                  |
| Primary fields       | Underlying token, wrapper, public amount, recipient                          |
| Approval warning     | `This may first approve the wrapper to spend public ERC-20 tokens.`          |
| Max approval warning | `This approval may allow the wrapper to spend more than this shield amount.` |

### Open questions

| Question                                                                         | Impact                                                                                                                                               |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Should approval and wrap produce separate intents or a single multi-step intent? | Wallets see separate transactions, but human intent is one shield flow. V1 may need both: a high-level flow intent plus per-transaction raw context. |
| How should zero-reset approval be rendered?                                      | It is a safety step, but displaying it as the user's main intent would be misleading.                                                                |

## Flow: `unwrap`

### Current behavior

`WrappedToken.unwrap(amount)` is the low-level first phase of unshielding a
specific amount.

The SDK:

1. Requires a signer.
2. Requires an aligned wallet account.
3. Encrypts the plaintext amount as `euint64` for the wrapper contract.
4. Writes `unwrap(from, to, encryptedAmountHandle, inputProof)`.
5. Waits for the transaction receipt.

The current SDK passes the connected wallet as both `from` and `to`.

### User meaning

Request conversion of a specific confidential token amount into public ERC-20
tokens. This does not complete the public withdrawal by itself. A later
`finalizeUnwrap` transaction completes the process after public decryption
proofs are available.

### Contract call

| Field                   | Visibility | Notes                                                                |
| ----------------------- | ---------- | -------------------------------------------------------------------- |
| wrapper address         | public     | Transaction target.                                                  |
| from address            | public     | Connected wallet.                                                    |
| to address              | public     | Public ERC-20 recipient after finalization.                          |
| plaintext amount input  | public     | SDK input, not calldata. Safe only if sourced from SDK call context. |
| encrypted amount handle | encrypted  | Calldata argument. Do not render as plaintext.                       |
| input proof             | internal   | Protocol proof.                                                      |

### Clear signing intent candidate

| Property       | Candidate                                                                     |
| -------------- | ----------------------------------------------------------------------------- |
| Kind           | `unwrap`                                                                      |
| Title          | `Request unshield`                                                            |
| Summary        | `Start converting a confidential amount into public tokens.`                  |
| Primary fields | Wrapper, recipient, amount if available from SDK context                      |
| Warning        | `This starts the unshield process. A finalize transaction is still required.` |

### Open questions

| Question                                             | Impact                                                     |
| ---------------------------------------------------- | ---------------------------------------------------------- |
| Should V1 output use "unwrap" or "unshield request"? | User-facing docs prefer unshield; low-level API is unwrap. |

## Flow: `unwrapAll`

### Current behavior

`WrappedToken.unwrapAll()` is the low-level first phase of unshielding the entire
confidential balance.

The SDK:

1. Requires a signer.
2. Requires an aligned wallet account.
3. Reads the user's confidential balance handle.
4. Rejects zero balance handles.
5. Writes `unwrap(from, to, encryptedBalanceHandle)`.
6. Waits for the transaction receipt.

No new encryption is performed. The existing encrypted balance handle is used
directly.

### User meaning

Request conversion of the entire confidential balance into public ERC-20 tokens.
This does not complete the public withdrawal by itself. A later
`finalizeUnwrap` transaction completes the process.

### Contract call

| Field                    | Visibility | Notes                                                 |
| ------------------------ | ---------- | ----------------------------------------------------- |
| wrapper address          | public     | Transaction target.                                   |
| from address             | public     | Connected wallet.                                     |
| to address               | public     | Public ERC-20 recipient after finalization.           |
| balance handle           | encrypted  | Existing encrypted balance. Do not display as amount. |
| entire-balance semantics | derived    | Derived from using `unwrapFromBalanceContract`.       |

### Clear signing intent candidate

| Property       | Candidate                                                                     |
| -------------- | ----------------------------------------------------------------------------- |
| Kind           | `unwrapAll`                                                                   |
| Title          | `Request unshield of entire confidential balance`                             |
| Summary        | `Start converting your entire confidential balance into public tokens.`       |
| Primary fields | Wrapper, recipient, entire-balance indicator                                  |
| Warning        | `This starts the unshield process. A finalize transaction is still required.` |

### Mandatory wording requirement

Any user-facing representation of this flow must explicitly say "entire
confidential balance" or an equivalent phrase. It must not imply that a
plaintext amount is known.

## Flow: `finalizeUnwrap`

### Current behavior

`WrappedToken.finalizeUnwrap(unwrapRequestIdOrAmount)` completes an unwrap after
the first-phase transaction has emitted an unwrap request.

The SDK:

1. Requires a signer.
2. Requires signer/provider chain alignment.
3. Publicly decrypts the unwrap request ID or legacy encrypted amount handle.
4. Extracts the clear unwrap amount from the public decrypt result.
5. Writes `finalizeUnwrap(unwrapRequestIdOrAmount, clearValue, decryptionProof)`.
6. Waits for the transaction receipt.

For high-level `unshield` and `unshieldAll`, the SDK finds the
`UnwrapRequested` event from the first-phase receipt and calls
`finalizeUnwrap(event.unwrapRequestId ?? event.encryptedAmount)`.

### User meaning

Complete a pending unshield and receive public ERC-20 tokens. At this stage the
amount being finalized is public because it is included as a clear value with a
public decryption proof.

### Contract call

| Field                          | Visibility     | Notes                                               |
| ------------------------------ | -------------- | --------------------------------------------------- |
| wrapper address                | public         | Transaction target.                                 |
| unwrap request ID              | public/derived | Upgraded wrapper identifier for the pending unwrap. |
| legacy encrypted amount handle | encrypted      | Legacy fallback input. Do not display as amount.    |
| clear unwrap amount            | public         | Public decrypt result submitted to the wrapper.     |
| decryption proof               | internal       | Public decrypt proof.                               |

### Clear signing intent candidate

| Property        | Candidate                                                         |
| --------------- | ----------------------------------------------------------------- |
| Kind            | `finalizeUnwrap`                                                  |
| Title           | `Finalize unshield`                                               |
| Summary         | `Complete a pending unshield and receive public tokens.`          |
| Primary fields  | Wrapper, public amount when available, pending request identifier |
| Internal fields | Decryption proof                                                  |

### Open questions

| Question                                                                                            | Impact                                                      |
| --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Should the clear amount be shown whenever present, even if the initial unwrap amount was encrypted? | Likely yes: finalization submits the clear amount publicly. |
| How should upgraded request ID vs legacy amount handle be labeled in advanced output?               | Needs descriptor design.                                    |

## Cross-Flow Notes

### `unshield` and `unshieldAll`

The high-level APIs `unshield` and `unshieldAll` orchestrate first-phase unwrap,
receipt parsing, and finalization. Wallets still receive separate transaction
requests. The intent layer should be able to represent both:

1. The high-level user flow: unshield confidential tokens into public tokens.
2. Each concrete transaction: `unwrap` or `finalizeUnwrap`.

### Raw context preservation

Intent builders should preserve raw context for advanced consumers:

| Raw context          | Examples                                                                     |
| -------------------- | ---------------------------------------------------------------------------- |
| Contract call config | `address`, `abi`, `functionName`, `args` from contract builders.             |
| EIP-712 payload      | `domain`, `types`, `primaryType`, `message`.                                 |
| SDK inputs           | Plaintext amount before encryption, selected recipient, selected expiration. |
| Routing decisions    | Shield path: `transferAndCall` or `approveAndWrap`.                          |

Raw context must not automatically become user-facing wording.

### Values that must remain internal by default

| Value                                 | Reason                                       |
| ------------------------------------- | -------------------------------------------- |
| FHE private key                       | Secret key material.                         |
| FHE public key                        | Protocol credential detail, not user intent. |
| Permit signatures                     | Credential material.                         |
| Input proofs                          | Protocol proof.                              |
| Decryption proofs                     | Protocol proof.                              |
| Ciphertext handles                    | Opaque encrypted references.                 |
| `extraData` bytes in EIP-712 payloads | Protocol payload.                            |

### Descriptor implications

ERC-7730 descriptors should be generated from `ClearSigningIntent`, not used as
the source model. Descriptor generation must preserve visibility rules:

1. Do not render encrypted handles as amounts.
2. Do not infer plaintext values from calldata unless they are actually public
   arguments.
3. Prefer human intent over implementation route, while preserving route details
   in raw or advanced context.
