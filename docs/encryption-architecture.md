# Encryption Architecture

This document maps every cryptographic operation in the Zama SDK — from credential storage to on-chain FHE operations.

## Overview

```mermaid
graph TB
    subgraph "Client (Browser / Node.js)"
        App[dApp / Server]
        CM[CredentialsManager]
        Signer[Wallet Signer]
        Worker[Web Worker / Worker Thread]
        Storage[(IndexedDB / Memory)]
    end

    subgraph "External"
        Relayer[Relayer KMS]
        Chain[Blockchain]
        CDN[CDN — cdn.zama.org]
    end

    App -->|balanceOf / transfer| CM
    CM -->|signTypedData| Signer
    CM -->|AES-GCM encrypt/decrypt| Storage
    CM -->|encrypt / userDecrypt| Worker
    Worker -->|HTTPS + CSRF| Relayer
    Worker -->|SHA-384 verify| CDN
    App -->|writeContract / readContract| Chain
    Relayer -->|KMS decrypt| Chain
```

## 1. Credential Encryption at Rest

The FHE private key is encrypted with AES-GCM before storage. The encryption key is derived from the wallet's EIP-712 signature via PBKDF2. The signature itself is **never persisted** — it lives only in the in-memory session map.

### Key Derivation

```mermaid
graph LR
    Sig[EIP-712 Signature] -->|raw bytes| PBKDF2
    Addr[Wallet Address] -->|salt| PBKDF2
    PBKDF2 -->|600k iterations, SHA-256| AES[AES-GCM-256 Key]

    style Sig fill:#f96,stroke:#333
    style AES fill:#6f9,stroke:#333
```

| Parameter   | Value                    |
| ----------- | ------------------------ |
| KDF         | PBKDF2                   |
| Hash        | SHA-256                  |
| Iterations  | 600,000                  |
| Salt        | Lowercase wallet address |
| Key length  | 256-bit                  |
| Extractable | `false`                  |

### Encrypt / Decrypt Flow

```mermaid
sequenceDiagram
    participant CM as CredentialsManager
    participant Crypto as Web Crypto API
    participant Store as Storage

    Note over CM: Encrypt (on create)
    CM->>Crypto: importKey(signature, "PBKDF2")
    CM->>Crypto: deriveKey(PBKDF2 → AES-GCM-256)
    CM->>Crypto: getRandomValues(12 bytes) → IV
    CM->>Crypto: encrypt(AES-GCM, key, privateKey)
    CM->>Store: setItem(storeKey, { publicKey, encryptedPrivateKey: { iv, ciphertext }, contractAddresses, startTimestamp, durationDays })
    Note over Store: signature NOT stored

    Note over CM: Decrypt (on load)
    CM->>Store: getItem(storeKey)
    Store-->>CM: { encryptedPrivateKey, ... }
    CM->>Crypto: importKey(sessionSignature, "PBKDF2")
    CM->>Crypto: deriveKey(PBKDF2 → AES-GCM-256)
    CM->>Crypto: decrypt(AES-GCM, key, ciphertext)
    Crypto-->>CM: plaintext privateKey
```

### What Gets Stored vs. What Stays in Memory

```mermaid
graph TB
    subgraph "Persisted to Storage"
        PK[publicKey]
        EPK[encryptedPrivateKey — iv + ciphertext]
        CA[contractAddresses]
        TS[startTimestamp]
        DD[durationDays]
    end

    subgraph "In-Memory Only — Session Map"
        SIG[EIP-712 Signature]
    end

    subgraph "Never Stored"
        PRIVK[FHE Private Key — plaintext]
        AESKEY[Derived AES Key]
    end

    SIG -->|PBKDF2| AESKEY
    AESKEY -->|decrypt| PRIVK
    AESKEY -.->|encrypt| EPK

    style SIG fill:#f96,stroke:#333
    style PRIVK fill:#f66,stroke:#333
    style AESKEY fill:#f66,stroke:#333
```

## 2. Session Signature Lifecycle

The signature lives in a `#sessionSignatures` Map (JS private field) keyed by a truncated SHA-256 hash of the wallet address.

```mermaid
stateDiagram-v2
    [*] --> Locked: Page load

    Locked --> Unlocked: get() / unlock() — wallet signs EIP-712
    Locked --> Unlocked: Legacy migration — stored signature used once

    Unlocked --> Locked: lock() called
    Unlocked --> Locked: clear() called
    Unlocked --> Locked: Page close / refresh

    Unlocked --> Unlocked: get() — reuses cached signature
```

### Re-Sign Flow (New Session, Existing Credentials)

```mermaid
sequenceDiagram
    participant App
    participant CM as CredentialsManager
    participant Store as Storage
    participant Wallet as Wallet Signer
    participant SDK as Relayer SDK

    App->>CM: get(contractAddress)
    CM->>Store: getItem(storeKey)
    Store-->>CM: EncryptedCredentials (no signature)
    CM->>CM: Check #sessionSignatures → empty
    CM->>CM: #isValidWithoutDecrypt → timestamps OK
    CM->>SDK: createEIP712(publicKey, contracts, timestamp, days)
    SDK-->>CM: EIP-712 typed data
    CM->>Wallet: signTypedData(eip712) — wallet popup
    Wallet-->>CM: signature
    CM->>CM: Cache in #sessionSignatures
    CM->>CM: #decryptCredentials(encrypted, signature)
    CM-->>App: StoredCredentials { publicKey, privateKey, signature, ... }
```

### Legacy Migration (One-Time)

```mermaid
sequenceDiagram
    participant CM as CredentialsManager
    participant Store as Storage

    CM->>Store: getItem(storeKey)
    Store-->>CM: LegacyEncryptedCredentials (has signature field)
    CM->>CM: #hasLegacySignature → true
    CM->>CM: Decrypt privateKey using stored signature
    CM->>CM: Cache signature in #sessionSignatures
    CM->>CM: #encryptCredentials (excludes signature)
    CM->>Store: setItem(storeKey, migrated data)
    Note over Store: Signature removed from storage
```

## 3. Store Key Hashing

Wallet addresses are hashed before use as storage keys so the storage backend never sees the raw address.

```mermaid
graph LR
    A[0xAbCd...1234] -->|toLowerCase| B[0xabcd...1234]
    B -->|SHA-256| C[a7f3b2c9e1d4...64 hex chars]
    C -->|slice 0,32| D[a7f3b2c9e1d4f5a6b7c8d9e0f1a2b3c4]

    style D fill:#6cf,stroke:#333
```

## 4. FHE Encryption (Shielding Values)

When a user shields, transfers, or unwraps tokens, plaintext bigint values are FHE-encrypted client-side via WASM before submission to the blockchain.

```mermaid
sequenceDiagram
    participant Token as Token
    participant SDK as RelayerSDK
    participant Worker as Web Worker
    participant WASM as TFHE WASM
    participant Chain as Blockchain

    Token->>SDK: encrypt({ values: [amount], contractAddress, userAddress })
    SDK->>Worker: postMessage(ENCRYPT, payload)
    Worker->>WASM: createEncryptedInput(contract, user)
    Worker->>WASM: input.add64(amount)
    Worker->>WASM: input.encrypt()
    WASM-->>Worker: { handles: Uint8Array[], inputProof: Uint8Array }
    Note over Worker: Zero-copy transfer via Transferable
    Worker-->>SDK: { handles, inputProof }
    SDK-->>Token: { handles, inputProof }
    Token->>Chain: writeContract(transfer(to, handles[0], inputProof))
```

The `inputProof` is a ZK proof (generated inside the WASM) attesting the encrypted input is well-formed. It is verified on-chain by the `InputVerifier` contract.

## 5. FHE User Decrypt (Reading Balances)

To read an encrypted balance, the SDK sends FHE credentials to the relayer KMS, which re-encrypts the on-chain ciphertext under the user's FHE public key. The WASM client then decrypts locally with the private key.

```mermaid
sequenceDiagram
    participant App
    participant Token as ReadonlyToken
    participant CM as CredentialsManager
    participant SDK as RelayerSDK
    participant Worker as Web Worker
    participant WASM as TFHE WASM
    participant Relayer as Relayer KMS
    participant Chain as Blockchain

    App->>Token: balanceOf(owner)
    Token->>Chain: readContract(confidentialBalanceOf)
    Chain-->>Token: encrypted handle (bytes32)
    Token->>CM: get(contractAddress)
    CM-->>Token: { privateKey, publicKey, signature, ... }
    Token->>SDK: userDecrypt({ handles, privateKey, publicKey, signature, ... })
    SDK->>Worker: postMessage(USER_DECRYPT, payload)
    Note over Worker: CSRF token injected into fetch
    Worker->>WASM: sdkInstance.userDecrypt(...)
    WASM->>Relayer: HTTPS POST (handles, pubKey, signature)
    Note over Relayer: Verify EIP-712 signature
    Note over Relayer: KMS re-encrypts ciphertext
    Relayer-->>WASM: Re-encrypted ciphertext
    Note over WASM: Decrypt with FHE privateKey
    WASM-->>Worker: { clearValues: { handle: bigint } }
    Worker-->>SDK: clearValues
    SDK-->>Token: clearValues
    Token-->>App: balance (bigint)
```

## 6. FHE Public Decrypt (Finalize Unwrap)

Public decryption requires no user credentials. The KMS decrypts and returns a proof that can be verified on-chain.

```mermaid
sequenceDiagram
    participant Token as Token
    participant SDK as RelayerSDK
    participant Worker as Web Worker
    participant Relayer as Relayer KMS
    participant Chain as Blockchain

    Token->>SDK: publicDecrypt([burnAmountHandle])
    SDK->>Worker: postMessage(PUBLIC_DECRYPT, { handles })
    Worker->>Relayer: HTTPS POST (handles)
    Relayer-->>Worker: { clearValues, abiEncodedClearValues, decryptionProof }
    Worker-->>SDK: PublicDecryptResult
    SDK-->>Token: { clearValue, decryptionProof }
    Token->>Chain: writeContract(finalizeUnwrap(handle, clearValue, decryptionProof))
    Note over Chain: Verifies decryptionProof on-chain
```

## 7. CDN Bundle Integrity (SHA-384)

The browser worker loads the TFHE WASM SDK from a CDN. The bundle is verified with a pinned SHA-384 hash before execution.

```mermaid
sequenceDiagram
    participant Main as Main Thread
    participant Worker as Web Worker
    participant CDN as cdn.zama.org

    Main->>Worker: INIT { cdnUrl, integrity: "2bd540..." }
    Worker->>Worker: validateCdnUrl(url) — https + cdn.zama.org only
    Worker->>CDN: fetch(cdnUrl)
    CDN-->>Worker: raw script text
    Worker->>Worker: SHA-384(script)
    Worker->>Worker: compare hash === integrity
    alt Hash matches
        Worker->>Worker: importScripts(blobUrl)
        Worker-->>Main: INIT success
    else Hash mismatch
        Worker-->>Main: INIT error — integrity check failed
    end
```

## 8. CSRF Protection

All mutating HTTP requests to the relayer proxy are protected with a CSRF token. The token is refreshed before every operation.

```mermaid
sequenceDiagram
    participant SDK as RelayerSDK
    participant App as App Config
    participant Worker as Web Worker
    participant Relayer as Relayer Proxy

    SDK->>App: getCsrfToken()
    App-->>SDK: token string
    SDK->>Worker: postMessage(UPDATE_CSRF, { csrfToken })
    Worker->>Worker: csrfTokenBase = csrfToken

    Note over Worker: Later, during encrypt/decrypt...
    Worker->>Worker: fetch interceptor checks URL + method
    alt POST/PUT/DELETE/PATCH to relayerUrl
        Worker->>Relayer: headers: { x-csrf-token: csrfTokenBase }, credentials: include
    else GET or non-relayer URL
        Worker->>Relayer: passthrough (no CSRF header)
    end
```

## 9. Worker Message Protocol

All cryptographic operations run off the main thread via a typed message-passing protocol with UUID-tracked request/response pairs.

```mermaid
graph TB
    subgraph "Main Thread"
        RC[RelayerWeb / RelayerNode]
        WC[WorkerClient — BaseWorkerClient]
    end

    subgraph "Worker Thread"
        WH[Message Handler — onmessage]
        WASM[TFHE WASM SDK]
    end

    RC -->|method call| WC
    WC -->|postMessage — { id: UUID, type, payload }| WH
    WH -->|delegates to| WASM
    WASM -->|result| WH
    WH -->|postMessage — { id, success, data }| WC
    WC -->|resolve promise| RC

    style WC fill:#6cf,stroke:#333
    style WH fill:#6cf,stroke:#333
```

### Message Types and Sensitive Data

```mermaid
graph LR
    subgraph "Main → Worker"
        INIT[INIT — csrfToken, cdnUrl, integrity]
        CSRF[UPDATE_CSRF — csrfToken]
        ENC[ENCRYPT — values, addresses]
        UD[USER_DECRYPT — privateKey, publicKey, signature, handles]
        PD[PUBLIC_DECRYPT — handles]
        GK[GENERATE_KEYPAIR]
        E712[CREATE_EIP712 — publicKey, contracts]
        ZK[REQUEST_ZK_PROOF — zkProof]
    end

    subgraph "Worker → Main"
        ENCR[ENCRYPT response — handles, inputProof]
        UDR[USER_DECRYPT response — clearValues]
        PDR[PUBLIC_DECRYPT response — clearValues, proof]
        GKR[KEYPAIR response — publicKey, privateKey]
        E712R[EIP712 response — typed data]
        ZKR[ZK response — inputProof, handles]
    end
```

**Note:** `privateKey` and `signature` cross the postMessage boundary in plaintext as hex strings. This is safe because:

- Web Workers run in the same origin (same-process structured clone)
- Worker threads in Node.js use `worker_threads` (same-process message channel)
- Neither path involves network transmission

## 10. End-to-End: Shield → Transfer → Unshield

```mermaid
sequenceDiagram
    participant User as User Wallet
    participant SDK as Zama SDK
    participant Worker as Worker (WASM)
    participant Relayer as Relayer KMS
    participant Chain as Blockchain

    Note over User,Chain: SHIELD (wrap ERC-20 → encrypted)
    User->>SDK: token.shield(amount)
    SDK->>Chain: approve(wrapper, amount)
    SDK->>Worker: ENCRYPT(amount)
    Worker-->>SDK: { handles, inputProof }
    SDK->>Chain: wrap(handles[0], inputProof)

    Note over User,Chain: TRANSFER (encrypted → encrypted)
    User->>SDK: token.confidentialTransfer(to, amount)
    SDK->>Worker: ENCRYPT(amount)
    Worker-->>SDK: { handles, inputProof }
    SDK->>Chain: confidentialTransfer(to, handles[0], inputProof)

    Note over User,Chain: UNSHIELD (encrypted → ERC-20)
    User->>SDK: token.unshield(amount)
    SDK->>Worker: ENCRYPT(amount)
    Worker-->>SDK: { handles, inputProof }
    SDK->>Chain: unwrap(handles[0], inputProof)
    Chain-->>SDK: UnwrapRequested event → burnAmountHandle

    SDK->>Worker: PUBLIC_DECRYPT(burnAmountHandle)
    Worker->>Relayer: KMS public decrypt
    Relayer-->>Worker: { clearValue, decryptionProof }
    Worker-->>SDK: PublicDecryptResult
    SDK->>Chain: finalizeUnwrap(handle, clearValue, decryptionProof)
```

## Cryptographic Algorithms Summary

| Operation             | Algorithm           | Key Size        | Source                         |
| --------------------- | ------------------- | --------------- | ------------------------------ |
| Credential encryption | AES-GCM             | 256-bit         | Web Crypto API                 |
| Key derivation        | PBKDF2-SHA-256      | 600k iterations | Web Crypto API                 |
| Store key hashing     | SHA-256 (truncated) | 128-bit output  | Web Crypto API                 |
| CDN integrity         | SHA-384             | —               | Web Crypto API                 |
| FHE encryption        | TFHE                | Network key     | WASM (`@zama-fhe/relayer-sdk`) |
| ZK proofs             | WASM prover         | —               | WASM (`@zama-fhe/relayer-sdk`) |
| Wallet signing        | ECDSA secp256k1     | 256-bit         | User wallet                    |
| Request IDs           | UUID v4             | 128-bit         | `crypto.randomUUID()`          |
| CSRF tokens           | Opaque              | —               | App-provided callback          |
