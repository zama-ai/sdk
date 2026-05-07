---
title: Token
description: Read/write interface for an ERC-7984 confidential token — balances, transfers, operator approvals.
---

# Token

> ⚠️ This page is a placeholder — full reference docs are coming.

`Token` is the high-level ERC-20-style interface for an ERC-7984 confidential token. It hides FHE complexity (encryption, decryption, EIP-712 signing) behind familiar methods.

For ERC-7984 ERC-20 wrappers (shield / unshield / allowance), use [`WrappedToken`](WrappedToken.md) instead — it extends `Token` with wrapper-specific operations.

## Import

Created via [`ZamaSDK.createToken()`](ZamaSDK.md):

```ts
import { ZamaSDK } from "@zama-fhe/sdk";

const sdk = new ZamaSDK(config); // config from createConfig()
const token = sdk.createToken("0xConfidentialToken");

const balance = await token.balanceOf(ownerAddress);
await token.confidentialTransfer("0xRecipient", 500n);
```

For shield / unshield, create a `WrappedToken` via `sdk.createWrappedToken("0xWrapper")` — see [`WrappedToken`](WrappedToken.md).

## Methods

- `name()` / `symbol()` / `decimals()` — ERC-20-style metadata reads
- `isConfidential()` / `isWrapper()` — ERC-165 introspection
- `balanceOf(owner)` — decrypt and return the plaintext balance
- `confidentialBalanceOf(owner)` — return the raw encrypted handle without decrypting
- `decryptBalanceAs({ delegatorAddress, ... })` — decrypt a delegator's balance using delegated credentials
- `confidentialTransfer(to, amount, options?)` — encrypted transfer
- `confidentialTransferFrom(from, to, amount, callbacks?)` — operator transfer
- `setOperator(spender, until)` — set or revoke an operator approval
- `isOperator(holder, spender)` — read whether `spender` is an approved operator
- `Token.batchBalancesOf(tokens, owner)` _(static)_ — decrypt multiple balances in one batch
- `Token.batchDecryptBalancesAs(tokens, options)` _(static)_ — batch delegated decryption
