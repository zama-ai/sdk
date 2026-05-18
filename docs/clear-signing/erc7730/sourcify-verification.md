# Sourcify Verification Status

Status checked on 2026-05-18 for the deployments referenced by the local
ERC-7730 descriptor drafts in `docs/clear-signing/erc7730/registry/zama/`.

This matters because the ethereum.org clear-signing tutorial calls out
Sourcify verification as a prerequisite for descriptor registry submission. A
descriptor can be valid locally and still be blocked from registry acceptance if
the covered contract ABI cannot be verified.

## Method

- Read deployments from the four local descriptor files.
- Queried Sourcify using `check-all-by-addresses` and spot-checked with
  `/v2/contract/{chainId}/{address}`.
- For ERC-1967 proxies, read the implementation address from slot
  `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc` on
  Sepolia and checked those implementation addresses as well.

## Summary

| Group                               | Registry readiness                                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Sepolia ACL proxy                   | Proxy has `perfect` Sourcify match, but implementation is not verified.                               |
| Sepolia confidential token wrappers | All wrapper proxies have `perfect` Sourcify matches, but their shared implementation is not verified. |
| Sepolia underlying ERC-20 tokens    | 3 of 8 are Sourcify verified.                                                                         |
| Sepolia EIP-712 decryption verifier | Not Sourcify verified.                                                                                |
| Mainnet ACL/decryption verifier     | Not Sourcify verified.                                                                                |

## FHE Core Contracts

| Chain   | Role                | Address                                      | Sourcify status | Notes                                                                                 |
| ------- | ------------------- | -------------------------------------------- | --------------- | ------------------------------------------------------------------------------------- |
| Mainnet | ACL                 | `0xcA2E8f1F656CD25C01F05d0b243Ab1ecd4a8ffb6` | missing         | Descriptor should not include this deployment for registry submission until verified. |
| Mainnet | Decryption verifier | `0x0f6024a97684f7d90ddb0fAAD79cB15F2C888D24` | missing         | Blocks mainnet EIP-712 descriptor coverage.                                           |
| Sepolia | ACL proxy           | `0xf0Ffdc93b7E186bC2f8CB3dAA75D86d1930A433D` | perfect         | Sourcify metadata identifies the proxy contract.                                      |
| Sepolia | ACL implementation  | `0x85d248b4cb457290c8b8ebae501fbe2b5ae8c890` | missing         | Implementation ABI must be verified or explicitly accepted by registry tooling.       |
| Sepolia | Decryption verifier | `0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478` | missing         | Blocks Sepolia EIP-712 descriptor coverage.                                           |

## Sepolia Confidential Wrappers

All wrappers below are `ERC1967Proxy` contracts with a `perfect` Sourcify match.
They currently share implementation `0x528f2f29ddeb466cfbfb7a31ce92bfb3c343973c`,
which is not Sourcify verified.

| Token     | Wrapper address                              | Proxy status | Implementation status |
| --------- | -------------------------------------------- | ------------ | --------------------- |
| cUSDCMock | `0x7c5BF43B851c1dff1a4feE8dB225b87f2C223639` | perfect      | missing               |
| cUSDTMock | `0x4E7B06D78965594eB5EF5414c357ca21E1554491` | perfect      | missing               |
| cWETHMock | `0x46208622DA27d91db4f0393733C8BA082ed83158` | perfect      | missing               |
| cBRONMock | `0xaa5612FA27c927a0c7961f5AEFEE5ba3A0F9C891` | perfect      | missing               |
| cZAMAMock | `0xf2D628d2598aF4eAF94CB76a437Ff86CA78FfbFB` | perfect      | missing               |
| ctGBPMock | `0xfCE5c7069c5525eF6c8C2b2E35A745bA20a2F7CC` | perfect      | missing               |
| cXAUtMock | `0xe4FcF848739845BC81Dee1d5352cf3844F0a60C7` | perfect      | missing               |
| ctGBP     | `0x167DC962808B32CFFFc7e14B5018c0bE06A3A208` | perfect      | missing               |

## Sepolia Underlying ERC-20 Tokens

| Token    | Address                                      | Sourcify status |
| -------- | -------------------------------------------- | --------------- |
| USDCMock | `0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF` | missing         |
| USDTMock | `0xa7dA08FafDC9097Cc0E7D4f113A61e31d7e8e9b0` | missing         |
| WETHMock | `0xff54739b16576FA5402F211D0b938469Ab9A5f3F` | missing         |
| BRONMock | `0xFf021fB13cA64e5354c62c954b949a88cfDEb25E` | missing         |
| ZAMAMock | `0x75355a85c6FB9df5f0C80FF54e8747EEe9a0BF57` | perfect         |
| tGBPMock | `0x93c931278A2aad1916783F952f94276eA5111442` | missing         |
| XAUtMock | `0x24377AE4AA0C45ecEe71225007f17c5D423dd940` | perfect         |
| tGBP     | `0xf6Ef9ADB61A48E29E36bc873070A46A3D2667ff3` | perfect         |

## Impact

The current local descriptors remain useful SDK artefacts, but they are not yet
registry-ready as-is:

1. `eip712-decryption-permits.json` is blocked by missing verifier contract
   verification on both Mainnet and Sepolia.
2. `calldata-acl-user-decryption.json` is blocked for Mainnet, and Sepolia may
   still be blocked unless the registry accepts proxy verification without the
   implementation ABI.
3. `calldata-confidential-token-wrapper.json` is blocked unless the shared
   wrapper implementation is verified or proxy ABI resolution is explicitly
   accepted.
4. `calldata-erc20-shield-entrypoints.json` can only cover the three verified
   underlying tokens today unless the five missing ERC-20s are verified.

## Recommended Next Step

Verify the missing Sepolia contracts on Sourcify before opening the external
registry PR:

1. Shared wrapper implementation:
   `0x528f2f29ddeb466cfbfb7a31ce92bfb3c343973c`.
2. ACL implementation:
   `0x85d248b4cb457290c8b8ebae501fbe2b5ae8c890`.
3. Sepolia decryption verifier:
   `0x5D8BD78e2ea6bbE41f26dFe9fdaEAa349e077478`.
4. Missing Sepolia underlying tokens, or narrow the shield descriptor to the
   verified tokens only.
5. Mainnet ACL and decryption verifier, or remove Mainnet deployments from the
   initial registry submission.

## Attempted Local Verification

Two Sourcify verification submissions were attempted from this SDK workspace on
2026-05-18 using the local Foundry project and its generated standard JSON
inputs:

| Target                        | Address                                      | Local candidate                                                                                                                        | Sourcify job                           | Result                             |
| ----------------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------- |
| USDCMock                      | `0x9b5Cd13b8eFbB58Dc25A05CF411D8056058aDFfF` | `src/mocks/Erc20Mintable.sol:TestERC20` with constructor args `("USD Coin (Mock)", "USDCMock", 6)`                                     | `43384976-4875-41f7-94c1-0123b667b9d2` | Failed: `bytecode_length_mismatch` |
| Shared wrapper implementation | `0x528f2f29ddeb466cfbfb7a31ce92bfb3c343973c` | `dependencies/protocol-apps-wrapper-da4afe387420/contracts/confidential-wrapper/contracts/ConfidentialWrapper.sol:ConfidentialWrapper` | `971e1b4a-48bd-48fc-897f-6cbd5dacd16a` | Failed: `bytecode_length_mismatch` |

Runtime bytecode length comparison:

| Target                        | On-chain runtime bytes | Local candidate runtime bytes |
| ----------------------------- | ---------------------: | ----------------------------: |
| USDCMock                      |                   2321 |                          1895 |
| Shared wrapper implementation |                  16417 |                         14536 |

Conclusion: the current SDK workspace contains useful source candidates, but it
does not contain the exact source/build settings used for the Sepolia
deployments above. Successful Sourcify verification requires the deployment
repo/commit or build-info that produced those on-chain bytecodes.
