# Ledger Hardware Wallet Integration — Technical Summary

**Audience:** SDK and protocol team members.
**Purpose:** Decision-support document summarising what was explored, what was achieved, what is not possible, and where to go from here.
**Date:** April 2026.

---

## Executive Summary

This POC demonstrates that the full ERC-7984 operation set — decrypt, shield, transfer, unshield, delegation grant/revoke, delegate decrypt — can be driven end-to-end by a physical Ledger hardware device in a Next.js application, without a browser extension or MetaMask, using the Zama React SDK.

The integration is fully functional on Hoodi testnet with the cleartext stack. Moving to a production-grade deployment (Sepolia or Mainnet with real FHE encryption) requires only configuration changes; the signing layer is network-agnostic. Three concrete blockers remain before this can be used in a user-facing context: transaction blind signing (requires Ledger CAL registration), Chromium-only browser support (WebHID), and the absence of real FHE encryption on the test network used.

---

## 1. Context and Objective

### The problem

The Zama SDK currently has no first-class support for hardware wallet signers. The `EthersSigner` and `ViemSigner` adapters assume a browser-extension (MetaMask-style) EIP-1193 provider and expect a connected wallet at initialisation time.

The broader question this POC investigates is: **can a developer integrate the Zama SDK with a Ledger hardware wallet, without any browser extension?**

### Target objective

A production-grade integration where a user can shield, transfer, and unshield ERC-7984 confidential tokens via a Ledger hardware device, with full EIP-712 field display on-screen, on a Zama-supported network (Sepolia or Mainnet).

### What this POC achieves

A working Next.js application demonstrating the full ERC-7984 operation set — balance decrypt, shield, transfer, unshield, delegation grant/revoke, and delegate decrypt — driven by a real Ledger hardware device via WebHID, on Hoodi testnet using the cleartext stack. No browser extension required.

Hoodi is used here because it is the closest available testnet for this type of integration work. It is not a Zama-supported network and the FHE co-processor is not deployed there; the cleartext stack is used as a compatibility shim (see section 4).

---

## 2. Approach: Two Iterations

### Iteration 1 — Ledger Button (EIP-6963) — Abandoned

The first attempt used `@ledgerhq/ledger-wallet-provider` (the "Ledger Button"), a floating widget that registers itself as an EIP-6963 provider. This approach was abandoned for the following reasons:

- The library accesses `window`/`document` at import time, making it incompatible with Next.js SSR without a dynamic import inside a `useEffect`.
- EIP-6963 provider discovery is asynchronous and event-driven (`eip6963:announceProvider`), adding indirection between provider availability and `ZamaProvider` being mountable.
- The Ledger Button routes RPC requests to Ledger's own node infrastructure, which does not serve Hoodi. A hybrid provider was required (sign via Ledger Button, read via direct Hoodi RPC).
- The Ledger Button is designed for registered dApps with a Ledger partner API key. Without one, a server-side stub is required in development, and production use requires enrolment.

### Iteration 2 — Custom `LedgerWebHIDProvider` — Current approach

The second approach replaces the Ledger Button with a hand-written EIP-1193 provider (`LedgerWebHIDProvider`) built directly on Ledger's low-level libraries:

| Library                         | Role                                                                                               |
| ------------------------------- | -------------------------------------------------------------------------------------------------- |
| `@ledgerhq/hw-transport-webhid` | Opens and manages the WebHID USB channel to the device                                             |
| `@ledgerhq/hw-app-eth`          | Speaks the Ethereum app protocol: get address, sign message, sign typed data, sign transaction     |
| `ethers v6`                     | EIP-1559 transaction building, `TypedDataEncoder` for Nano S fallback hashing, JSON-RPC for reads |

This provider implements the full EIP-1193 `request()` surface expected by the Zama SDK: `eth_accounts`, `personal_sign`, `eth_signTypedData_v4`, `eth_sendTransaction`, `eth_chainId`, `eth_blockNumber`, and all read-only methods forwarded to a direct Hoodi JSON-RPC endpoint. It also exposes three additional methods — `connect(accountIndex?)`, `verifyAddress()`, and `disconnect()` — consumed by the UI layer.

---

## 3. What Was Achieved

### Operations

All ERC-7984 SDK operations are functional end-to-end on Hoodi testnet via a physical Ledger device:

| Operation                        | SDK API                               | Device action                     |
| -------------------------------- | ------------------------------------- | --------------------------------- |
| Decrypt confidential balance     | `useConfidentialBalance` + `useAllow` | Signs EIP-712 credential request  |
| Shield (ERC-20 → cToken)         | `sdk.createToken().shield()`          | Signs ERC-20 approve + shield tx  |
| Confidential transfer            | `useConfidentialTransfer`             | Signs EIP-712 + sends tx          |
| Unshield (cToken → ERC-20)       | `useUnshield`                         | Signs EIP-712 + sends tx          |
| Grant decryption delegation      | `useDelegateDecryption`               | Signs tx                          |
| Revoke delegation                | `useRevokeDelegation`                 | Signs tx                          |
| Decrypt balance as delegate      | `useDecryptBalanceAs`                 | Signs EIP-712                     |

### UX features

- **BIP-44 account selector** — supports account indices 0–4 (`m/44'/60'/0'/0/n`); selectable before or after connecting.
- **Verify address** — calls `getAddress(path, display: true)` so the device screen shows the derived address for anti-phishing confirmation.
- **Disconnect / recovery** — both voluntary disconnect (button) and physical cable unplug are handled via the transport `disconnect` event; the app returns to the connect screen without a page reload.
- **Two-tier EIP-712 signing** — detailed in section 6.

### Testing

A full Playwright E2E suite runs without a physical device:

| File                     | Coverage                                                                 |
| ------------------------ | ------------------------------------------------------------------------ |
| `e2e/connect.spec.ts`    | Connect screen UI, account selector, successful connect, error handling  |
| `e2e/main.spec.ts`       | Operation cards, header elements, token selector, empty registry state   |
| `e2e/disconnect.spec.ts` | Device unplug recovery, heading after disconnect, reconnect, Disconnect button |
| `e2e/delegation.spec.ts` | Delegation section labels, button states                                 |

Tests use `window.__ledgerProvider` (exposed by the provider in non-production builds) to replace `connect()` and `_onDisconnect()` with stubs via `page.evaluate()`. The Hoodi RPC is intercepted at the network layer with ABI-encoded static responses, making the suite entirely self-contained with no external dependencies.

---

## 4. Cleartext Stack on Hoodi

Because the FHE co-processor is unavailable on Hoodi, the SDK's cleartext backend is used:

```
RelayerCleartext + hoodiCleartextConfig
```

This replaces the relayer and on-chain FHE execution with a local mock:

- "Encrypted" values are stored as plaintexts on-chain (`CleartextFHEVMExecutor`).
- KMS signatures are produced locally, without any external call.
- No relayer server is required.

**This is for testing only.** Values are not actually encrypted — any party with chain access can read balances. This approach would never be used in production; it is a compatibility shim that allows the SDK's full API surface to be exercised on a network where the FHE co-processor is not deployed.

---

## 5. Limitations and Tradeoffs

### 5.1 Browser compatibility — Chromium only

WebHID (`@ledgerhq/hw-transport-webhid`) is a Chrome/Chromium API. Firefox and Safari do not support it. This is a hard browser-level constraint, not a library limitation. Any WebHID-based approach is inherently Chromium-only on desktop.

### 5.2 No mobile support

WebHID is unavailable on mobile browsers. Reaching mobile users would require a different transport (`@ledgerhq/hw-transport-web-ble` for Bluetooth on Nano X, Stax, and Flex) and a different architecture.

### 5.3 EthersSigner type mismatch

`EthersSigner` expects an `Eip1193Provider` from wagmi's type definitions — a union type broader than what `LedgerWebHIDProvider` currently declares. Bridging requires `as any` at the call site in `providers.tsx`:

```typescript
new EthersSigner({ ethereum: ledgerProvider as any });
```

This is a type-only issue (runtime behaviour is correct), but it is a symptom of the SDK not defining or exporting its own minimal EIP-1193 interface that custom providers can implement against.

### 5.4 "No such account" at startup

`EthersSigner` internally calls `BrowserProvider.getSigner()` during initialisation, which calls `eth_requestAccounts`. Before the user connects a device, `eth_requestAccounts` returns an empty array and `getSigner()` rejects with `"no such account"`. This becomes an unhandled promise rejection in the console.

The workaround — a global `unhandledRejection` handler that suppresses this specific message — is functional but inelegant. The root cause is that the SDK assumes a wallet is available at provider initialisation time, which is not true for hardware wallets or for any wallet that requires an explicit user gesture before connecting.

### 5.5 Transaction signing requires blind signing to be enabled on the device

This is the most significant practical limitation and must be understood clearly.

Ledger's Ethereum app enforces two distinct signing paths:

- **EIP-712 signing** (`signEIP712Message`): shows structured field names and values on-screen. Does **not** require blind signing. After fixing the `EIP712Domain` injection bug, this works correctly on Nano S Plus, Nano X, Stax, and Flex.
- **Transaction signing** (`signTransaction`): when the target contract is not registered in Ledger's CAL, the device firmware blocks the operation entirely and displays "Blind signing must be enabled in Settings". This is a firmware-level enforcement — there is no workaround at the library or SDK level.

**Impact by operation:**

| Operation                              | Signing method      | Blind signing required?              |
| -------------------------------------- | ------------------- | ------------------------------------ |
| Balance decrypt / delegate credentials | `signEIP712Message` | ❌ No                                |
| Shield (ERC-20 approve + wrap tx)      | `signTransaction`   | ✅ Yes (Zama contracts not in CAL)   |
| Confidential transfer                  | `signTransaction`   | ✅ Yes                               |
| Unshield                               | `signTransaction`   | ✅ Yes                               |
| Delegation grant / revoke              | `signTransaction`   | ✅ Yes                               |

In practice, blind signing must be enabled in the Ethereum app settings (Settings → Enable blind signing → ON) for any operation that involves an on-chain transaction. The path to removing this requirement is registering Zama contracts in Ledger's CAL (see section 7.3).

### 5.6 No human-readable field labels for Zama contracts

`hw-app-eth` by default fetches EIP-712 clear-signing metadata from `crypto-assets-service.api.ledger.com`. Zama contracts are not registered in Ledger's Clear-signing Asset Library (CAL), so every call to `signEIP712Message` produces a 403 + CORS error in the background.

The workaround is `{ calServiceURL: null }` in `hw-app-eth`'s `LoadConfig`, which skips the HTTP call entirely. Field names and values from the typed-data structure are still displayed on-screen (driven by the types map in the payload, not CAL metadata), so the user sees the actual field data — but without the human-readable contract-specific descriptions that CAL registration would add.

### 5.7 Cleartext stack is not encrypted

As noted in section 4, values are plaintext on-chain. Moving to a Zama-supported network (Sepolia or Mainnet) requires switching to `RelayerWeb` and pointing to a network with a live FHE co-processor. The WebHID signing layer is network-agnostic; only the relayer configuration changes.

### 5.8 No session persistence across page reloads

After a page reload, the user must re-connect the device. This is inherent to WebHID — the protocol has no persisted connection state — and is expected for hardware wallets. Worth noting for UX design.

---

## 6. Note on Nano S Support

The original Nano S does not support `signEIP712Message` — the Ethereum app command that sends the full typed-data structure to the device for field-by-field display. This is a firmware and memory limitation of the device.

### Implementation

A two-tier strategy is implemented in `LedgerWebHIDProvider.eth_signTypedData_v4`:

1. **Tier 1 — `signEIP712Message`** (Nano X, Nano S Plus, Stax, Flex): the full typed-data JSON object is sent to the device. The Ethereum app parses and displays each field. If the call succeeds, the signature is returned.

2. **Tier 2 — `signEIP712HashedMessage` fallback** (Nano S): if Tier 1 raises an error indicating the device does not support the command, the domain and message are pre-hashed locally using ethers' `TypedDataEncoder`, and the two 32-byte hashes are sent to the device instead.

Device capability detection is automatic at runtime (try/catch on the status code) — no device model configuration is required.

### Tradeoff

On Nano S, the device displays only a generic "Sign typed data? ⚠️" prompt — no field names, no values. The user cannot verify on-device what they are agreeing to. This is a weaker security assurance compared to the full-display experience on newer devices.

This is the best achievable UX for Nano S with the current Ethereum app. The Nano S has reached end-of-life (no longer sold by Ledger) and its user base is shrinking. Dropping Nano S support entirely — with a clear minimum device requirement of Nano S Plus or newer — is a valid product decision that would simplify the codebase and eliminate the Tier 2 fallback path.

---

## 7. Recommendations and Suggested Next Steps

### 7.1 SDK (`@zama-fhe/sdk` / `@zama-fhe/react-sdk`)

**Export a minimal EIP-1193 interface.**
Define and export a `MinimalEIP1193Provider` type from the SDK — the exact subset of `request`, `on`, and `removeListener` that `EthersSigner` and `ViemSigner` rely on. This lets custom providers implement against the SDK's own contract, eliminating the `as any` cast.

**Tolerate a disconnected signer at initialisation.**
`ZamaProvider` and `EthersSigner` currently assume a wallet is already connected when the provider is passed in. For hardware wallet flows (and any wallet with a connect-gate), the provider may legitimately return no accounts at startup. The SDK should handle this gracefully — by deferring account resolution until the first signing operation, or by exposing a `ready` callback.

**Consider a `HardwareWalletSigner` adapter.**
A first-party adapter in `@zama-fhe/sdk` (alongside `EthersSigner` and `ViemSigner`) that encapsulates the WebHID connect/disconnect lifecycle, BIP-44 path selection, and the two-tier EIP-712 strategy would significantly lower the barrier for hardware wallet integrations. The pattern is now well-understood from this POC.

### 7.2 Protocol and relayer

**Deploy the FHE co-processor on a testnet accessible for integration work.**
The cleartext stack is valuable for isolated testing, but it is not a realistic representation of the production system. A shared development instance of the co-processor and relayer on Hoodi — or a designated testnet — would allow integration examples to exercise the actual encryption and decryption paths.

### 7.3 Ledger ecosystem

**Register Zama contracts in Ledger's CAL (Clear-signing Asset Library).**
This is the highest-impact improvement for existing users. It removes the blind signing requirement for transactions and enables full EIP-712 field display. The registration process involves submitting ERC-7730 metadata (field descriptions, contract ABIs) to Ledger's [CAL repository](https://github.com/LedgerHQ/ledger-asset-dapps).

**Consider Ledger Live integration.**
`@ledgerhq/ledger-live-app-sdk` would allow users to connect via the Ledger Live desktop or mobile app rather than requiring a Chromium browser with WebHID. This removes the browser compatibility constraint and is worth evaluating as a longer-term effort.

**Evaluate Bluetooth transport.**
`@ledgerhq/hw-transport-web-ble` is the Bluetooth equivalent of `hw-transport-webhid` and is supported on Nano X, Stax, and Flex. It would enable mobile browser usage. The `LedgerWebHIDProvider` architecture makes swapping the transport straightforward — the signing logic is transport-agnostic.

### 7.4 This POC

**Move to a supported network before any external demonstration.**
Switching from Hoodi + cleartext to Sepolia + `RelayerWeb` requires only changes to `config.ts` (chain ID, RPC URL) and `providers.tsx` (replace `RelayerCleartext` with `RelayerWeb`). The rest of the stack is network-agnostic. This must be done before presenting the integration to external partners or users.

**Consider dropping Nano S support.**
The Tier 2 fallback is functional but degrades the security UX below acceptable levels for a production-facing tool. A minimum device requirement of Nano S Plus or newer is a reasonable product decision at this stage.

---

## 8. Status Overview

| Dimension                                               | Status                  | Notes                                                                            |
| ------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| Full ERC-7984 operation set                             | ✅ Working              | All flows functional on Hoodi with cleartext stack; blind signing ON required    |
| Physical Ledger device                                  | ✅ Working              | Tested on Nano S, Nano S Plus, Nano X, Stax, Flex                                |
| EIP-712 field display (Nano S Plus / Nano X / Stax / Flex) | ✅ Working           | Field names and values shown on device; no CAL metadata needed for raw display   |
| EIP-712 on Nano S (original)                            | ⚠️ Degraded             | Pre-hashed fallback only; no field display; not suitable for production use      |
| Transaction signing without blind signing               | ❌ Blocked              | Firmware blocks unregistered contracts; CAL registration required to resolve     |
| Browser support                                         | ⚠️ Chromium only        | Hard WebHID constraint; Firefox and Safari unsupported                           |
| Mobile support                                          | ❌ Not available        | WebHID unavailable on mobile; would require BLE transport                        |
| Production FHE encryption                               | ❌ Cleartext only       | Hoodi not supported by FHE co-processor; network-agnostic once co-processor available |
| EthersSigner type compatibility                         | ⚠️ `as any` workaround  | SDK should define and export a minimal EIP-1193 interface                        |
| E2E test coverage                                       | ✅ Full suite           | No physical device required; provider mocked via `window.__ledgerProvider`       |
| CAL registration (clear-signing metadata)               | ❌ Not registered       | Required to remove blind signing requirement; ERC-7730 JSON to be submitted      |
