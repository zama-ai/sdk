# Ledger Demo: ZAMA Shield

This folder contains minimal ERC-7730 descriptor drafts for testing a Ledger
clear-signing flow with the verified Sepolia `ZAMAMock` / `cZAMAMock` pair.

## Contracts

| Role                               | Address                                      | Sourcify      |
| ---------------------------------- | -------------------------------------------- | ------------- |
| `ZAMAMock` underlying ERC-20       | `0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57` | `perfect`     |
| `cZAMAMock` wrapper proxy          | `0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB` | `perfect`     |
| `cZAMAMock` wrapper implementation | `0x528f2f29ddeb466cfbfb7a31ce92bfb3c343973c` | `exact_match` |

## Target Display

The intended Ledger screen should be as close as possible to:

```text
Action:  Shield
Send:    100 ZAMAMock
Receive: cZAMAMock
Recipient: <wallet>
Wrapper: cZAMAMock
Network: Sepolia
```

The exact `Receive: 100 cZAMAMock` amount is intentionally not encoded in these
descriptors yet. `ZAMAMock` has 18 decimals, `cZAMAMock` has 6 decimals, and the
wrapper `rate()` is `1_000_000_000_000`. ERC-7730 v2 can format fields and
constants, but it does not define arithmetic such as `amount / rate` for derived
display fields. Showing `100 cZAMAMock` on a Ledger therefore needs either
wallet/tool support for this derived value or an app-level preview.

`Receive` is encoded as the static text `cZAMAMock` instead of using a
token-ticker formatter. The current `erc7730 calldata --v2` conversion path does
not support a standalone token ticker field, while a static `raw` value keeps
the descriptor convertible for Ledger Generic Parser smoke tests.

## Covered Calls

- `ZAMAMock.transferAndCall(address to,uint256 value,bytes data)`
- `ZAMAMock.approve(address spender,uint256 amount)`
- `cZAMAMock.wrap(address to,uint256 amount)`

`transferAndCall` is the preferred single-transaction shield path when the
underlying token supports ERC-1363. `approve` + `wrap` remains useful as the
fallback path and for testing individual wallet renderers.

For the current Ledger Generic Parser smoke test, focus on
`cZAMAMock.wrap(address to,uint256 amount)`. Rabby or MetaMask will still show a
blind-signing style hardware-wallet prompt unless the wallet path actually
loads and forwards the ERC-7730 descriptor to Ledger. The local example app only
previews the SDK-level intent; it does not make browser wallets ERC-7730-aware.

## Validation

```bash
uvx erc7730 lint --v2 \
  docs/clear-signing/erc7730/ledger-demo/zama-shield/calldata-zamamock-shield.json \
  docs/clear-signing/erc7730/ledger-demo/zama-shield/calldata-czamamock-wrapper.json
```

To verify that the `wrap` descriptor can be lowered into Ledger calldata
descriptor payloads, run:

```bash
uvx erc7730 calldata --v2 \
  docs/clear-signing/erc7730/ledger-demo/zama-shield/calldata-czamamock-wrapper.json
```

The output should contain one Sepolia calldata descriptor for selector
`0xbf376c7a` with these field names, in order: `Send`, `Receive`, `Recipient`,
`Wrapper`, `Network`.

`fixtures.json` contains sample calldata for a `100 ZAMAMock` shield.
