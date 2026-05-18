# Ledger DSK Clear-Signing POC Plan

This note captures the practical path for testing a `ZAMAMock` -> `cZAMAMock`
shield operation on a physical Ledger signer with ERC-7730 clear signing.

## Current Goal

Produce a physical-device proof of concept where a user signs a Sepolia
`cZAMAMock.wrap(address to,uint256 amount)` transaction and the Ledger secure
screen displays a human-readable intent close to:

```text
Action:  Shield
Send:    100 ZAMAMock
Receive: cZAMAMock
Recipient: <wallet>
Wrapper: cZAMAMock
Network: Sepolia
```

`Receive: 100 cZAMAMock` is not targeted yet. `ZAMAMock` has 18 decimals,
`cZAMAMock` has 6 decimals, and the wrapper `rate()` is `1_000_000_000_000`.
The current ERC-7730 descriptor tooling can format values but does not express
this derived `amount / rate` display safely.

## Confirmed Ledger Requirements

Ledger's public wallet integration guide says wallet-side clear signing uses
Device Management Kit (DMK) and Device Signer Kit (DSK). The signer fetches
metadata from the Clear Signing Registry and forwards formatted fields to the
device. If the wallet or dApp path does not support ERC-7730, the signer falls
back to blind signing.

The same guide states that wallet integration requires Ledger partner enrollment
to obtain an `originToken`. The token is used when building the Ethereum signer:

```ts
new SignerEthBuilder({
  dmk,
  sessionId,
  originToken,
}).build();
```

Ledger also documents that the token should not be exposed in client-side code.
For a local browser POC this is a practical tension: the public API accepts the
token in browser-side DSK setup, but a production integration should clarify
with Ledger whether a dev token can be used locally, or whether the integration
must be mediated by an approved wallet/server architecture.

Local package inspection confirms that `@ledgerhq/context-module` sends the
token as an HTTP header:

```text
X-Ledger-Client-Origin: <originToken>
```

The default Context Module queries Ledger CAL at:

```text
https://crypto-assets-service.api.ledger.com/v1
```

For calldata descriptors it requests:

```text
GET /{dapps|tokens}
  output=descriptors_calldata
  chain_id=<chainId>
  contracts=<contractAddress>
  contract_address=<contractAddress>
  ref=branch:<branch>
```

The returned descriptor must include Ledger-signed calldata payloads and PKI
certificate material. This means a local ERC-7730 JSON file is not, by itself,
enough for a production physical Ledger signer.

## What This Means For Us

We can continue building everything in this SDK, but true physical-device clear
signing has two external gates:

1. The descriptor must be accepted into a registry/CAL path that Ledger DSK can
   fetch for Sepolia `0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB` and selector
   `0xbf376c7a`.
2. The test wallet/signer path needs a valid Ledger `originToken`, obtained via
   Ledger partner enrollment or a Ledger-provided dev/test process.

Without these, a physical Nano S Plus should be expected to show raw/blind
signing even if our dApp preview is human-readable.

## Local Testing Paths

### Path A: Realistic physical-device path

This is the path that matters for the final POC.

1. Keep the ZAMA shield descriptor valid and convertible:
   `docs/clear-signing/erc7730/ledger-demo/zama-shield/calldata-czamamock-wrapper.json`.
2. Submit the descriptor to the Clear Signing registry/CAL path accepted by
   Ledger.
3. Obtain a Ledger `originToken`.
4. Build a Ledger-only signing POC using DMK + WebHID + DSK, bypassing Rabby and
   MetaMask.
5. Sign and broadcast the `wrap(address,uint256)` transaction through DSK.
6. Verify whether DSK selects `EIP7730` clear signing or falls back to basic /
   blind signing.

Ledger derivation paths for the signer API are passed without the `m/` prefix
(`44'/60'/0'/0/0`, not `m/44'/60'/0'/0/0`).

### Path B: Local DSK instrumentation before registry approval

This is useful now because it validates our app integration and tells us exactly
where the fallback occurs.

1. Add a local Ledger-only POC app or page.
2. Connect the Nano S Plus via WebHID.
3. Build the Sepolia `wrap(address,uint256)` transaction using the SDK token
   flow as the source of truth for routing and calldata.
4. Call `signerEth.signTransaction(...)`.
5. Surface DSK logs and signing mode in the UI.

Expected result before registry/CAL availability: fallback to basic/blind
signing. That is still valuable because it proves the hardware path and gives
us a reproducible failure mode to discuss with Ledger.

### Path C: Local descriptor simulation

Ledger's older `clear-signing-erc7730-developer-tools` repository can preview
how labels may appear, but it is not a physical-device signing path. It does not
replace DSK, CAL, signed descriptors, or a real Nano test.

The Context Module exposes advanced hooks such as custom loaders and custom CAL
configuration. We can investigate them, but the inspected code expects signed
descriptor payloads and certificates. A fake local CAL may not be accepted by a
production Ethereum app on a physical Ledger signer.

## Questions To Send Ledger

These are the concrete questions needed to unblock a physical POC:

1. Can Ledger provide a dev/test `originToken` for a local WebHID POC?
2. Is there a supported way to test local ERC-7730 calldata descriptors on a
   physical Nano S Plus before public registry/CAL ingestion?
3. Are Sepolia calldata descriptors accepted in the public Clear Signing
   registry/CAL flow?
4. If local/test descriptors are supported, which CAL branch/mode and signature
   process should be used?
5. Which Ethereum app version and device firmware are required for ERC-7730
   calldata clear signing on Nano S Plus?

## Recommended Next SDK Work

The SDK now includes a Ledger-only POC surface, separate from Rabby/MetaMask:

```text
examples/react-wagmi-clear-signing/src/app/ledger
```

Run the example app and open:

```text
http://localhost:<port>/ledger
```

The POC should:

- use the existing ZAMA / cZAMA Sepolia pair;
- connect directly to Ledger through DMK WebHID;
- sign through DSK instead of `window.ethereum`;
- display clear-signing status, DSK logs, raw calldata, and fallback reason;
- broadcast the signed transaction with `viem` only after the user confirms on
  the device.

The current implementation intentionally signs the `cZAMAMock.wrap(address,uint256)`
fallback shield transaction directly. It assumes the required ERC-20 allowance
already exists, or lets the tester sign a separate `approve` transaction first.
This keeps the dApp-level intent preview, wallet-extension behavior, and
physical Ledger DSK behavior separate and testable while we validate whether DSK
can resolve the ERC-7730 descriptor from Ledger CAL.
