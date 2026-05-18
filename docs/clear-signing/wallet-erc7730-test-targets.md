# ERC-7730 wallet test targets

This note records the current wallet-support assessment for testing wallet-native clear
signing from the Zama SDK workstream.

## Key model

ERC-7730 descriptors are not sent as an extra field in `eth_sendTransaction` or
`eth_signTypedData_v4`. The wallet receives the normal transaction or typed-data payload,
then resolves a matching descriptor by chain, contract, selector, or typed-data context.

For the Zama SDK this means:

- The dApp should continue sending normal transactions and EIP-712 messages.
- The SDK/app can generate fixtures and descriptors, but wallet-native rendering depends
  on the wallet's descriptor source and trust policy.
- A local dApp preview is still useful, but it is not equivalent to wallet-native
  ERC-7730 because a compromised dApp could lie.
- Public registry submission requires ABI verification, with Sourcify called out by
  ethereum.org as required before a descriptor can be accepted.

## Public support status

| Target                         | Status                                                                                                                             | Practical value now                                                                                           |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Ledger Wallet / Ledger devices | Live public clear-signing support according to clearsigning.org.                                                                   | Best immediate target for true wallet-native rendering.                                                       |
| Trezor                         | Listed as in development, expected around mid-2026 on supported devices.                                                           | Track, but not the first test target.                                                                         |
| WalletConnect                  | Publicly committed to making ERC-7730 interoperable across wallets that implement it.                                              | Useful transport/ecosystem signal, not itself the final renderer.                                             |
| MetaMask                       | Named as a working-group participant by WalletConnect, but no public dApp-facing ERC-7730 loading path was found in official docs. | Do not assume we can force-load local descriptors yet. Test only if an experimental build/flag is identified. |
| Rabby                          | No public ERC-7730 support or descriptor-loading path found in official/public sources.                                            | Keep as manual comparison wallet; do not use as the first wallet-native target.                               |

## Test strategy decision

For the next implementation step, optimize for descriptor correctness before wallet
specific integration:

1. Generate ERC-7730 descriptors and fixtures for Zama Sepolia flows.
2. Validate them against the ERC-7730 schema and available preview tooling.
3. Test with Ledger-compatible tooling or registry flow first.
4. Add MetaMask/Rabby only once we have a confirmed descriptor source they will consume
   (registry, dev flag, Snap/extension build, or another documented mechanism).

## Sources checked

- Clear Signing build docs: descriptor anatomy, registry submission path, and wallet-side
  consumption model.
- Clear Signing ecosystem page: current public wallet support list.
- ERC-7730 spec: context binding, descriptor security model, EIP-712 examples, and
  calldata formatting rules.
- ethereum.org clear-signing tutorial: descriptor skeleton, wording guidance, CLI
  validation path, Sourcify requirement, and registry submission flow.
- WalletConnect announcement: working-group participants and WalletConnect's stated
  interoperability role.
- Ledger ERC-7730 developer tools/registry repository: historical structure, validation,
  sample fixtures, and developer preview tooling.
