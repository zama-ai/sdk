# Clear Signing EIP-712 Inventory

This document inventories the EIP-712 payloads that can feed the Clear Signing
Intent Layer. It records current SDK behavior and maps typed-data fields to
human semantics and visibility categories.

## Scope

The SDK currently exposes EIP-712 signing through `GenericSigner.signTypedData`.
Application-facing decrypt credentials are built by:

| Flow                                            | Builder                                    | Primary type                              |
| ----------------------------------------------- | ------------------------------------------ | ----------------------------------------- |
| Direct user decrypt authorization               | `relayer.createEIP712`                     | `UserDecryptRequestVerification`          |
| Delegated user decrypt credential authorization | `relayer.createDelegatedUserDecryptEIP712` | `DelegatedUserDecryptRequestVerification` |

Other EIP-712 payloads exist inside the cleartext test relayer for input and
public decrypt proof simulation. Those are relayer-internal and not currently
prompted to the application wallet, so they are not V1 wallet-facing clear
signing targets.

## Direct User Decrypt Authorization

### Current behavior

`ZamaSDK.allow(contracts)` requests this typed-data signature through
`CredentialService.allow(contracts)` when cached permits do not already cover
the requested contracts.

The signature authorizes user decryption for the listed confidential contracts
during the permit lifetime. It is cached as a permit and reused by later
`userDecrypt` calls.

### Typed data

| Property           | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| Domain name        | `Decryption`                                                                |
| Domain version     | `1`                                                                         |
| Verifying contract | Domain `verifyingContract`, preserved as `contractContext.contractAddress`. |
| Primary type       | `UserDecryptRequestVerification`                                            |
| Created by         | `RelayerSDK.createEIP712`                                                   |
| Signed by          | Connected wallet signer                                                     |

### Message fields

| Field               | Visibility | Clear signing meaning                                         |
| ------------------- | ---------- | ------------------------------------------------------------- |
| `publicKey`         | `internal` | FHE public key for the user's decrypt credential.             |
| `contractAddresses` | `public`   | Confidential contracts covered by the permit.                 |
| `startTimestamp`    | `public`   | Permit start time.                                            |
| `durationDays`      | `public`   | Permit lifetime.                                              |
| `extraData`         | `internal` | Protocol extension field. Currently `0x00` in cleartext mode. |

### Intent mapping

| Intent property | Value                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `kind`          | `allow`                                                                                                           |
| Title           | `Authorize confidential data decryption`                                                                          |
| Summary         | `Allow this wallet to decrypt confidential values for selected contracts.`                                        |
| Warning         | `This authorizes decryption for the listed contracts. It does not transfer tokens or grant spending permissions.` |

## Delegated User Decrypt Credential Authorization

### Current behavior

`ZamaSDK.allowAs(delegator, contracts)` requests this typed-data signature
through `CredentialService.allow(contracts, delegator)` for delegated decrypt
sessions. This is used by a delegate wallet after the delegator has granted
on-chain ACL delegation.

This signature does not create the ACL delegation. It creates a local credential
for the connected delegate wallet to decrypt values for the listed contracts on
behalf of the delegator.

### Typed data

| Property           | Value                                                                       |
| ------------------ | --------------------------------------------------------------------------- |
| Domain name        | `Decryption`                                                                |
| Domain version     | `1`                                                                         |
| Verifying contract | Domain `verifyingContract`, preserved as `contractContext.contractAddress`. |
| Primary type       | `DelegatedUserDecryptRequestVerification`                                   |
| Created by         | `RelayerSDK.createDelegatedUserDecryptEIP712`                               |
| Signed by          | Connected delegate wallet signer                                            |

### Message fields

| Field               | Visibility | Clear signing meaning                                                        |
| ------------------- | ---------- | ---------------------------------------------------------------------------- |
| `publicKey`         | `internal` | FHE public key for the delegate's decrypt credential.                        |
| `contractAddresses` | `public`   | Confidential contracts covered by the delegated credential.                  |
| `delegatorAddress`  | `public`   | Wallet whose confidential data may be decrypted if ACL delegation is active. |
| `startTimestamp`    | `public`   | Credential start time.                                                       |
| `durationDays`      | `public`   | Credential lifetime.                                                         |
| `extraData`         | `internal` | Protocol extension field. Currently `0x00` in cleartext mode.                |

### Intent mapping

| Intent property | Value                                                                                                              |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| `kind`          | `allowAs`                                                                                                          |
| Title           | `Authorize delegated confidential data decryption`                                                                 |
| Summary         | `Allow this wallet to decrypt delegated confidential values for selected contracts.`                               |
| Warning         | `This uses an existing delegation for decryption only. It does not transfer tokens or grant spending permissions.` |

## Non-Wallet-Facing Cleartext Relayer EIP-712

The cleartext relayer signs additional typed data with internal mock signers.
These signatures are useful for local development and protocol simulation, but
they are not requested from the user's application wallet in current SDK flows.

| Payload                     | Primary type                | Visibility guidance                                                      |
| --------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| Input verification          | `CiphertextVerification`    | Internal relayer proof context. Do not present as user intent.           |
| Public decrypt verification | `PublicDecryptVerification` | Internal/public proof context. Do not present as a wallet authorization. |

If a future runtime asks the user's wallet to sign these payloads directly, they
must be inventoried separately before clear-signing builders are added.

## Safety Rules

1. `publicKey`, signatures, and `extraData` remain `internal`.
2. `contractAddresses`, `delegatorAddress`, timestamps, and durations are safe
   to render.
3. A delegated decrypt credential must not be described as creating delegation.
4. Neither direct nor delegated decrypt credentials allow token spending,
   transfer, operator approval, or movement of funds.
5. Raw typed data should be preserved in `rawContext.typedData`, but user-facing
   wording must be built from the semantic mapping above.
