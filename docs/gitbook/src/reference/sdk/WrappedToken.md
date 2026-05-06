---
title: WrappedToken
description: ERC-7984 ERC-20 wrapper interface — shield, unshield, allowance.
---

# WrappedToken

> ⚠️ This page is a placeholder — full reference docs are coming.

`WrappedToken` extends [`Token`](Token.md) with operations specific to ERC-7984 ERC-20 wrappers: shield (deposit underlying ERC-20 to mint confidential balance), unshield (burn confidential balance to redeem underlying), allowance management, and unwrap orchestration.

The wrapper IS the confidential token — there is no separate token/wrapper address pair. Pass the wrapper contract address directly.

## Import

```ts
import { WrappedToken } from "@zama-fhe/sdk";
```

## Construction

Use [`ZamaSDK.createWrappedToken`](ZamaSDK.md):

```ts
const wrappedToken = sdk.createWrappedToken("0xWrapper");
```

## Methods

In addition to everything inherited from [`Token`](Token.md):

- `underlying()` — read the underlying ERC-20 address
- `allowance(owner)` — read ERC-20 allowance the owner granted to the wrapper
- `approveUnderlying(amount?)` — approve the wrapper to spend the underlying
- `shield(amount, options?)` — deposit ERC-20 → mint confidential balance
- `unshield(amount, options?)` — burn confidential balance → redeem ERC-20
- `unshieldAll(options?)` — unshield the entire confidential balance
- `resumeUnshield(unwrapTxHash, options?)` — resume an in-flight unshield
- `unwrap(amount)` — low-level unwrap (returns request id)
- `unwrapAll()` — low-level unwrap-all
- `finalizeUnwrap(requestIdOrHandle)` — finalize a pending unwrap
