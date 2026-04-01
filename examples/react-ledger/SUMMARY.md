# react-ledger — Technical Summary

**Audience:** SDK and protocol team members.
**Purpose:** Decision-support document summarising what was explored, what was achieved, what is not possible, and where to go from here.

---

## 1. Context and Objective

### The problem

The Zama Protocol is officially deployed on Ethereum mainnet and Sepolia. Hoodi testnet is not a supported target, and the FHE co-processor is not available there. At the same time, the SDK currently has no first-class support for hardware wallet signers — the `EthersSigner` and `ViemSigner` adapters assume a browser extension (MetaMask-style) EIP-1193 provider.

The broader question this POC investigates is: **can a developer use the Zama SDK with a Ledger hardware wallet without any browser extension?**

### Final objective

A production-grade integration where a user can shield, transfer, and unshield ERC-7984 confidential tokens via a Ledger hardware device, with full EIP-712 field display on-screen, on a Zama-supported network (Sepolia or Mainnet).

### Intermediate objective achieved by this POC

A working Next.js application demonstrating the full ERC-7984 operation set — balance decrypt, shield, transfer, unshield, delegation grant/revoke, and delegate decrypt — driven by a real Ledger hardware device via WebHID, on Hoodi testnet using the cleartext stack. No browser extension, no MetaMask.

---

## 2. Approach: Two Iterations

### Iteration 1 — Ledger Button (EIP-6963) — Abandoned

The first attempt used `@ledgerhq/ledger-wallet-provider` (the "Ledger Button"), a floating widget that registers itself as an EIP-6963 provider. This approach was abandoned for the following reasons:

- The library accesses `window`/`document` at import time, making it incompatible with Next.js SSR without a dynamic import inside a `useEffect` — a significant ergonomic cost.
- EIP-6963 provider discovery is asynchronous and event-driven (`eip6963:announceProvider`), adding a layer of indirection between the provider being available and ZamaProvider being mountable.
- The Ledger Button routes RPC requests to Ledger's own node infrastructure, which does not serve Hoodi. A hybrid provider was required (sign via Ledger Button, read via direct Hoodi RPC), adding further complexity.
- The Ledger Button is designed for registered dApps with a Ledger partner API key. Without one, a server-side stub was needed in dev, and production use would require enrolment (`tally.so/r/wzaAVa`).

### Iteration 2 — Custom `LedgerWebHIDProvider` — Current approach

The second approach replaces the Ledger Button with a hand-written EIP-1193 provider (`LedgerWebHIDProvider`) built directly on the low-level Ledger libraries:

| Library                         | Role                                                                                                       |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@ledgerhq/hw-transport-webhid` | Opens/manages the WebHID USB channel to the device                                                         |
| `@ledgerhq/hw-app-eth`          | Speaks the Ethereum app protocol: get address, sign message, sign typed data, sign transaction             |
| `ethers v6`                     | EIP-1559 transaction building, `TypedDataEncoder` for Nano S fallback hashing, `JsonRpcProvider` for reads |

This provider handles the full EIP-1193 `request()` surface expected by ZamaSDK (`eth_accounts`, `personal_sign`, `eth_signTypedData_v4`, `eth_sendTransaction`, `eth_chainId`, `eth_blockNumber`, and all read-only methods forwarded to a direct Hoodi JSON-RPC endpoint). It also exposes three additional methods — `connect(accountIndex?)`, `verifyAddress()`, and `disconnect()` — consumed by the UI layer.

---

## 3. What Was Achieved

### Operations

All ERC-7984 SDK operations are functional end-to-end on Hoodi testnet via a physical Ledger device:

| Operation                    | SDK API                               | Device action                    |
| ---------------------------- | ------------------------------------- | -------------------------------- |
| Decrypt confidential balance | `useConfidentialBalance` + `useAllow` | Signs EIP-712 credential request |
| Shield (ERC-20 → cToken)     | `sdk.createToken().shield()`          | Signs ERC-20 approve + shield tx |
| Confidential transfer        | `useConfidentialTransfer`             | Signs EIP-712 + sends tx         |
| Unshield (cToken → ERC-20)   | `useUnshield`                         | Signs EIP-712 + sends tx         |
| Grant decryption delegation  | `useDelegateDecryption`               | Signs tx                         |
| Revoke delegation            | `useRevokeDelegation`                 | Signs tx                         |
| Decrypt balance as delegate  | `useDecryptBalanceAs`                 | Signs EIP-712                    |

### UX features

- **BIP-44 account selector** — supports account indices 0–4 (`m/44'/60'/0'/0/n`); selectable before or after connecting.
- **Verify address** — calls `getAddress(path, display:true)` so the device screen shows the derived address for anti-phishing confirmation.
- **Disconnect / recovery** — both voluntary disconnect (button) and physical unplug are handled via the transport `disconnect` event; the app returns to the connect screen without a page reload.
- **Two-tier EIP-712 signing** — detailed in section 6.

### Testing

A full Playwright E2E suite runs without a physical device:

| File                     | Coverage                                                                |
| ------------------------ | ----------------------------------------------------------------------- |
| `e2e/connect.spec.ts`    | Connect screen UI, account selector, successful connect, error handling |
| `e2e/main.spec.ts`       | Operation cards, header elements, token selector, empty registry state  |
| `e2e/disconnect.spec.ts` | Device unplug, heading after disconnect, reconnect, Disconnect button   |
| `e2e/delegation.spec.ts` | Delegation section labels, button states                                |

The test strategy uses `window.__ledgerProvider` (exposed by the provider in non-production builds) to replace `connect()` and `_onDisconnect()` with stubs via `page.evaluate()`. The Hoodi RPC is intercepted at the network layer with ABI-encoded static responses, so tests are entirely self-contained with no external dependencies.

---

## 4. Cleartext Stack on Hoodi

Because the FHE co-processor is unavailable on Hoodi, the SDK's cleartext backend is used:

```
RelayerCleartext + hoodiCleartextConfig
```

This replaces the relayer and the on-chain FHE execution with a local mock:

- "Encrypted" values are stored as plaintexts on-chain (`CleartextFHEVMExecutor`).
- KMS signatures are produced locally, without any external call.
- No relayer server is required.

**Important:** this is for testing only. Values are not actually encrypted. Any party with chain access can read balances. This approach would never be used in production; it is a compatibility shim that allows the SDK's full API surface to be exercised on unsupported networks.

---

## 5. Limitations and Tradeoffs

### 5.1 Browser compatibility — Chromium only

WebHID (`@ledgerhq/hw-transport-webhid`) is a Chrome/Chromium API. Firefox and Safari do not support it. This is a hard browser-level constraint, not a library limitation. Any WebHID-based approach is inherently Chromium-only for desktop.

### 5.2 No mobile support

WebHID is not available on mobile browsers. Reaching mobile users would require a different transport (`@ledgerhq/hw-transport-web-ble` for Bluetooth on Nano X/Stax/Flex, or WalletConnect as a bridge) and a different architecture.

### 5.3 EthersSigner type mismatch

`EthersSigner` (and `ViemSigner`) expect an `Eip1193Provider` from wagmi's type definitions, which is a union broader than what `LedgerWebHIDProvider` declares. Bridging requires `as any` at the call site in `providers.tsx`:

```typescript
new EthersSigner({ ethereum: ledgerProvider as any });
```

This is a type-only issue (the runtime behaviour is correct), but it is a symptom of the SDK not defining or exporting its own minimal EIP-1193 interface that custom providers can implement against.

### 5.4 "No such account" at startup

`EthersSigner` internally calls `BrowserProvider.getSigner()` during initialisation, which calls `eth_requestAccounts`. Before the user connects a device, `eth_requestAccounts` returns `[]` and `getSigner()` rejects with `"no such account"`. This rejection becomes an unhandled promise rejection in the console.

The workaround — a global `unhandledRejection` handler that suppresses this specific message — is functional but inelegant. The root cause is that the SDK assumes a wallet is available at provider initialisation time, which is not true for hardware wallets (or for any wallet that requires an explicit user gesture before connecting).

### 5.5 Transaction signing requires "Blind signing" to be enabled on the device

This is the most significant practical limitation of this POC and must be understood clearly.

Ledger's Ethereum app enforces two distinct signing paths:

- **EIP-712 signing** (`signEIP712Message`): shows structured field names and values on-screen. Does **not** require blind signing to be enabled. After fixing the `EIP712Domain` injection bug (see commit history), this works correctly on Nano S Plus, Nano X, Stax, and Flex.
- **Transaction signing** (`signTransaction`): when the target contract is not registered in Ledger's CAL, the device firmware blocks the operation entirely and displays "Blind signing must be enabled in Settings". This is a firmware-level enforcement — there is no workaround at the library or SDK level.

**Impact by operation:**

| Operation                              | Signing method      | Blind signing required?            |
| -------------------------------------- | ------------------- | ---------------------------------- |
| Balance decrypt / delegate credentials | `signEIP712Message` | ❌ No                              |
| Shield (ERC-20 approve + wrap tx)      | `signTransaction`   | ✅ Yes (Zama contracts not in CAL) |
| Confidential transfer                  | `signTransaction`   | ✅ Yes                             |
| Unshield                               | `signTransaction`   | ✅ Yes                             |
| Delegation grant / revoke              | `signTransaction`   | ✅ Yes                             |
| Mint                                   | `signTransaction`   | ✅ Yes                             |

In practice, this means blind signing must be enabled in the Ethereum app settings (Settings → Enable blind signing → ON) to use any operation that involves an on-chain transaction. Disabling it only affects the EIP-712 credential signing step, which now shows proper field display on capable devices. For a full UX without blind signing, Zama contracts must be registered in Ledger's CAL.

### 5.6 No human-readable field labels for Zama contracts

`hw-app-eth` by default fetches EIP-712 clear-signing metadata from `crypto-assets-service.api.ledger.com`. Hoodi testnet and Zama contracts are not registered in Ledger's Clear-signing Asset Library (CAL), so every call to `signEIP712Message` produces a 403 + CORS error in the background.

The workaround is `{ calServiceURL: null }` in `hw-app-eth`'s `LoadConfig`, which skips the HTTP call entirely. Field names and values from the typed-data structure are still displayed on-screen (driven by the types map, not CAL metadata), so the user sees the actual field data — but without human-readable contract-specific descriptions that CAL registration would add.

### 5.7 Cleartext stack is Hoodi-only and not encrypted

As noted in section 4, values are plaintext on-chain. Moving to a Zama-supported network (Sepolia, Mainnet) would require switching to `RelayerWeb` (browser) or `RelayerNode` (server), and ensuring the network is registered with a live FHE co-processor. The WebHID signing layer is network-agnostic; only the relayer configuration changes.

### 5.8 No session persistence across page reloads

After a page reload, the user must re-connect the device. This is inherent to WebHID (no persisted connection state) and expected for hardware wallets, but worth noting for UX design.

---

## 6. Note on Ledger Nano S Support

The Nano S (original) does not support `signEIP712Message` — the Ethereum app command that sends the full typed-data structure to the device and displays each field name and value on screen. This is a firmware and memory limitation of the device, not a library restriction.

### How support was implemented

A two-tier strategy was implemented in `LedgerWebHIDProvider.eth_signTypedData_v4`:

1. **Tier 1 — `signEIP712Message`** (Nano X, Nano S Plus, Stax, Flex): the full typed-data JSON object is sent to the device. The Ethereum app parses and displays each field. If the call succeeds, the signature is returned immediately.

2. **Tier 2 — `signEIP712HashedMessage` fallback** (Nano S): if Tier 1 raises an error (indicating the device does not support the command), the domain and message are pre-hashed locally using ethers' `TypedDataEncoder`, and the two 32-byte hashes are sent to the device instead.

Auto-detection is runtime, via try/catch — no device model configuration is required.

### Tradeoff

On Nano S, the device displays only a generic "Sign typed data? ⚠️" prompt — no field names, no values. The user has no way to verify on-device what they are agreeing to. This is meaningfully weaker from a security assurance standpoint compared to the full-display experience on newer devices.

This is the best achievable UX for Nano S with the current Ethereum app. The only alternative would be to drop Nano S support and inform users that a newer device is required — a valid product decision, given that Nano S reached end-of-life (no longer sold by Ledger) and its user base is shrinking.

---

## 7. Recommendations and Suggested Next Steps

### 7.1 SDK (`@zama-fhe/sdk` / `@zama-fhe/react-sdk`)

**Export a minimal EIP-1193 interface.**
Define and export a `MinimalEIP1193Provider` (or similar) type from the SDK — the exact subset of `request`, `on`, and `removeListener` that `EthersSigner` and `ViemSigner` rely on. This lets custom providers implement against the SDK's own type, eliminating the `as any` cast and making the integration contract explicit.

**Tolerate a null/disconnected signer state at initialisation.**
`ZamaProvider` and `EthersSigner` currently assume a wallet is already connected when the provider is passed in. For hardware wallet flows (and arguably for any wallet with a connect-gate), the provider may legitimately return no accounts at startup. The SDK should handle this gracefully — either by deferring account resolution until the first signing operation, or by exposing a `ready` callback/event.

**Consider a `HardwareWalletSigner` adapter.**
A first-party adapter in `@zama-fhe/sdk` (alongside `EthersSigner` and `ViemSigner`) that encapsulates the WebHID connect/disconnect lifecycle, BIP-44 path selection, and the two-tier EIP-712 strategy would significantly lower the barrier for hardware wallet integrations. This is non-trivial but the pattern is now well-understood from this POC.

### 7.2 Protocol and relayer

**Support for Hoodi (or a designated testnet) with a real co-processor.**
The cleartext stack is valuable for local development and isolated testing, but it is not a realistic representation of the production system. A Hoodi deployment of the FHE co-processor and relayer — even a shared development instance — would let integration examples (including this one) exercise the actual encryption and decryption paths.

**Relayer SDK (`@zama-fhe/relayer-sdk` or equivalent).**
If a relayer-side SDK exists or is planned, it should define the signing interface it expects from a client wallet, allowing hardware wallet providers to implement against it directly without going through the browser `BrowserProvider` abstraction.

### 7.3 Ledger ecosystem

**Register Zama contracts in Ledger's CAL (Clear-signing Asset Library).**
This is the highest-impact UX improvement for existing Nano X / S Plus / Stax / Flex users. Without CAL registration, `signEIP712Message` falls back to a generic display even on devices that support full field display. The registration process involves submitting ERC-7730 metadata (field descriptions, contract ABIs) to Ledger's [CAL repository](https://github.com/LedgerHQ/ledger-asset-dapps). Once registered, devices with the Ethereum app display each EIP-712 field by name and value — a substantially stronger security UX.

**Consider registering in Ledger Live.**
Ledger Live integration (via `@ledgerhq/ledger-live-app-sdk`) would allow users to connect via the Ledger Live desktop/mobile app rather than requiring a Chromium browser with WebHID. This is a longer-term effort but would remove the browser compatibility constraint.

**Evaluate Bluetooth transport.**
`@ledgerhq/hw-transport-web-ble` is the Bluetooth equivalent of `hw-transport-webhid` and is supported on Nano X, Stax, and Flex. It would enable mobile browser usage (with limited support). The `LedgerWebHIDProvider` architecture makes swapping the transport layer straightforward — the signing logic is transport-agnostic.

### 7.4 This POC

**Move to a supported network before any external demonstration.**
Switching from Hoodi + cleartext to Sepolia + `RelayerWeb` requires only changes to `config.ts` (chain ID, RPC URL) and `providers.tsx` (replace `RelayerCleartext` with `RelayerWeb`). The rest of the stack is network-agnostic. This should be done before presenting the integration to external partners or users.

**Consider dropping Nano S support.**
The blind-signing fallback for Nano S is functional but degrades the security UX below acceptable levels for a production-facing tool. Nano S is end-of-life and not sold by Ledger. A clear minimum device requirement (Nano S Plus or newer) would simplify the codebase and eliminate the Tier 2 fallback path.

---

## 8. Summary Table

| Dimension                                              | Status                 | Notes                                                                        |
| ------------------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------- |
| Full ERC-7984 operation set                            | ✅ Working             | All flows functional on Hoodi with cleartext stack (blind signing ON)        |
| Physical Ledger device                                 | ✅ Working             | All listed device models tested                                              |
| EIP-712 field display (Nano S+ / Nano X / Stax / Flex) | ✅ Working             | Field names + values shown on device; no CAL metadata needed for raw fields  |
| EIP-712 on Nano S                                      | ⚠️ Blind signing       | Inherent device limitation; pre-hashed fallback; not suitable for production |
| Transaction signing without blind signing              | ❌ Blocked             | Firmware blocks unregistered contracts; requires CAL registration to resolve |
| Browser support                                        | ⚠️ Chromium only       | WebHID constraint                                                            |
| Mobile support                                         | ❌ None                | WebHID unavailable on mobile                                                 |
| Production encryption                                  | ❌ Cleartext only      | Hoodi not supported by FHE co-processor                                      |
| EthersSigner type compatibility                        | ⚠️ `as any` workaround | SDK should define and export its own EIP-1193 subset                         |
| E2E test coverage                                      | ✅ Full suite          | No physical device required; mocked via `window.__ledgerProvider`            |
| CAL registration (clear-signing metadata)              | ❌ Not registered      | Required to enable blind signing OFF for transactions; ERC-7730 JSON needed  |
