---
title: useResumeUnshield
description: Mutation hook that resumes an unshield interrupted between unwrap and finalize steps.
---

# useResumeUnshield

Mutation hook that resumes an unshield interrupted between the unwrap and finalize steps (e.g. the user closed the page mid-flow).

## Import

```ts
import { useResumeUnshield } from "@zama-fhe/react-sdk";
import { loadPendingUnshield, clearPendingUnshield } from "@zama-fhe/react-sdk";
```

## Usage

::: code-group

```tsx [component.tsx]
import { useEffect } from "react";
import {
  useResumeUnshield,
  loadPendingUnshield,
  clearPendingUnshield,
  useZamaSDK,
} from "@zama-fhe/react-sdk";

const TOKEN = "0xToken" as const;

function ResumeUnshieldGuard() {
  const sdk = useZamaSDK();
  const { mutateAsync: resumeUnshield } = useResumeUnshield({
    // [!code focus]
    tokenAddress: TOKEN, // [!code focus]
  }); // [!code focus]

  useEffect(() => {
    async function checkPending() {
      const pending = await loadPendingUnshield(sdk.storage, TOKEN); // [!code focus]
      if (!pending) return;

      await resumeUnshield({ unwrapTxHash: pending }); // [!code focus]
      await clearPendingUnshield(sdk.storage, TOKEN); // [!code focus]
    }
    checkPending();
  }, []);

  return null;
}
```

```ts [config.ts]
<<< @/snippets/config.ts
```

:::

## Parameters

```ts
import { type UseResumeUnshieldParameters } from "@zama-fhe/react-sdk";
```

### tokenAddress

`Address`

Address of the confidential ERC-20 wrapper contract.

```ts
const { mutateAsync: resumeUnshield } = useResumeUnshield({
  tokenAddress: "0xToken", // [!code focus]
});
```

---

<!--@include: @/shared/mutation-options.md-->

## Mutation Variables

Passed to `mutate` / `mutateAsync` at call time.

### unwrapTxHash

`Hex`

Transaction hash of the original unwrap transaction. Retrieved via `loadPendingUnshield`.

```ts
await resumeUnshield({ unwrapTxHash: "0xabc..." }); // [!code focus]
```

## Recovery Pattern

The full recovery flow uses three utilities together:

1. **`loadPendingUnshield(storage, tokenAddress)`** — reads the stored unwrap tx hash (returns `null` if none).
2. **`resumeUnshield({ unwrapTxHash })`** — picks up from the finalize step using the unwrap receipt.
3. **`clearPendingUnshield(storage, tokenAddress)`** — removes the pending record after finalize succeeds.

Run this check on mount to handle any session that was interrupted.

## Return Type

```ts
import { type UseResumeUnshieldReturnType } from "@zama-fhe/react-sdk";
```

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

Auto-invalidates the `confidentialBalance` cache on success.

<!--@include: @/shared/mutation-result.md-->

## Related

- [useUnshield](/reference/react/useUnshield) — standard unshield (handles both steps automatically)
- [useUnshieldAll](/reference/react/useUnshieldAll) — unshield the entire balance
- [Token.resumeUnshield](/reference/sdk/Token#resumeunshield) — imperative equivalent on the `Token` class
