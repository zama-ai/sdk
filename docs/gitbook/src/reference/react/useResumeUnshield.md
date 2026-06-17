---
title: useResumeUnshield
description: Mutation hook that resumes an unshield interrupted between unwrap and finalize steps.
---

# useResumeUnshield

Mutation hook that resumes an unshield interrupted between the unwrap and finalize steps (e.g. the user closed the page mid-flow).

## Import

```ts
import { useResumeUnshield } from "@zama-fhe/react-sdk";
import { loadPendingUnshield, clearPendingUnshield } from "@zama-fhe/sdk";
```

## Usage

{% tabs %}
{% tab title="component.tsx" %}

```tsx
import { useEffect } from "react";
import { useResumeUnshield, useZamaSDK } from "@zama-fhe/react-sdk";
import { loadPendingUnshield, clearPendingUnshield } from "@zama-fhe/sdk";

const TOKEN = "0xToken" as const;

function ResumeUnshieldGuard() {
  const sdk = useZamaSDK();
  const { mutateAsync: resumeUnshield } = useResumeUnshield(TOKEN);

  useEffect(() => {
    async function checkPending() {
      const pending = await loadPendingUnshield(sdk.storage, TOKEN);
      if (!pending) return;

      await resumeUnshield({ unwrapTxHash: pending });
      await clearPendingUnshield(sdk.storage, TOKEN);
    }
    checkPending();
  }, []);

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

Transaction hash of the original unwrap transaction. Retrieved via `loadPendingUnshield`.

```ts
await resumeUnshield({ unwrapTxHash: "0xabc..." });
```

## Recovery pattern

The full recovery flow uses three utilities together:

1. **`loadPendingUnshield(storage, tokenAddress)`** — reads the stored unwrap tx hash (returns `null` if none).
2. **`resumeUnshield({ unwrapTxHash })`** — picks up from the finalize step using the unwrap receipt.
3. **`clearPendingUnshield(storage, tokenAddress)`** — removes the pending record after finalize succeeds.

Run this check on mount to handle any session that was interrupted.

## Return Type

`data` resolves to `{ txHash: Hex, receipt: TransactionReceipt }`.

Auto-invalidates the `confidentialBalance` cache on success.

{% include ".gitbook/includes/mutation-result.md" %}

## Related

- [useUnshield](./useUnshield.md) — standard unshield (handles both steps automatically)
- [useUnshieldAll](./useUnshieldAll.md) — unshield the entire balance
- [WrappedToken.resumeUnshield](../sdk/WrappedToken.md#resumeunshield) — imperative equivalent on the `WrappedToken` class
