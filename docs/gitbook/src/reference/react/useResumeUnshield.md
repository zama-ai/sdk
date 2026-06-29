---
title: useResumeUnshield
description: Mutation hook that resumes an unshield interrupted between unwrap and finalize steps.
---

# useResumeUnshield

Mutation hook that resumes an unshield interrupted between the unwrap and finalize steps (e.g. the user closed the page mid-flow).

## Import

```ts
import { useResumeUnshield, useWrappedToken } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useEffect } from "react";
import { useResumeUnshield, useWrappedToken } from "@zama-fhe/react-sdk";

const TOKEN = "0xToken" as const;

function ResumeUnshieldGuard() {
  const wrappedToken = useWrappedToken(TOKEN);
  const { mutateAsync: resumeUnshield } = useResumeUnshield(TOKEN);

  useEffect(() => {
    async function checkPending() {
      // The SDK persisted the unwrap tx hash during phase 1 and clears it
      // automatically once the resume finalizes.
      const pending = await wrappedToken.getPendingUnshield();
      if (!pending) return;

      await resumeUnshield({ unwrapTxHash: pending });
    }
    checkPending();
  }, [wrappedToken]);

  return null;
}
```

{% endtab %}
{% tab title="config.ts" %}

```ts
// config.ts
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";
import { web } from "@zama-fhe/sdk/web";
import { sepolia } from "@zama-fhe/sdk/chains";
import type { FheChain } from "@zama-fhe/sdk/chains";
import { config as wagmiConfig } from "./wagmi";

const mySepolia = {
  ...sepolia,
  relayerUrl: "https://your-app.com/api/relayer/11155111",
} as const satisfies FheChain;

export const zamaConfig = createZamaConfig({
  chains: [mySepolia],
  wagmiConfig,
  relayers: { [mySepolia.id]: web() },
});

// In your app layout:
// <ZamaProvider config={zamaConfig}>
//   <App />
// </ZamaProvider>
```

{% endtab %}
{% endtabs %}

## Parameters

### address

`Address`

Address of the confidential wrapper contract. Passed positionally as the first argument.

```ts
const { mutateAsync: resumeUnshield } = useResumeUnshield("0xWrapper");
```

---

{% include ".gitbook/includes/mutation-options.md" %}

## Mutation variables

Passed to `mutate` / `mutateAsync` at call time.

### unwrapTxHash

`Hex`

Transaction hash of the original unwrap transaction. Retrieved via `WrappedToken.getPendingUnshield()` (see [useWrappedToken](./useWrappedToken.md)).

```ts
await resumeUnshield({ unwrapTxHash: "0xabc..." });
```

## Recovery pattern

The SDK persists the unwrap tx hash automatically when phase 1 is submitted and clears it once finalization confirms, so recovery is two steps:

1. **`wrappedToken.getPendingUnshield()`** — returns the stored unwrap tx hash (or `null` if none is pending).
2. **`resumeUnshield({ unwrapTxHash })`** — picks up from the finalize step using the unwrap receipt, then clears the persisted state on success.

Run this check on mount to handle any session that was interrupted. Resuming is intentionally caller-driven — prompt the user rather than finalizing on load, so you never trigger a wallet transaction they did not initiate.

{% hint style="info" %}
For custom flows that bypass `resumeUnshield`, the lower-level `savePendingUnshield`, `loadPendingUnshield`, and `clearPendingUnshield` helpers remain exported from `@zama-fhe/sdk`.
{% endhint %}

## Return Type

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

Auto-invalidates the `confidentialBalance` cache on success.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useUnshield](./useUnshield.md) — standard unshield (handles both steps automatically)
- [useUnshieldAll](./useUnshieldAll.md) — unshield the entire balance
- [WrappedToken.resumeUnshield](../sdk/WrappedToken.md#resumeunshield) — imperative equivalent on the `WrappedToken` class
