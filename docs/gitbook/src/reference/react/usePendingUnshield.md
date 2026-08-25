---
title: usePendingUnshield
description: Read the unwrap tx hash of an unshield interrupted between its two phases.
---

# usePendingUnshield

Read the unwrap transaction hash of an unshield that was interrupted between its two phases (returns `null` if none is pending for the wrapper).

The SDK persists this automatically when [`useUnshield`](./useUnshield.md) / [`useUnshieldAll`](./useUnshieldAll.md) submit phase 1, and clears it once phase 2 finalizes — the unshield and unwrap mutations invalidate this query on success. Surface the returned hash as a "resume" prompt and pass it to [`useResumeUnshield`](./useResumeUnshield.md); resuming is caller-driven so a wallet transaction is never triggered on load.

The pointer is verified on-chain before it is reported: a pointer whose unwrap request was already finalized is cleared, and `null` is returned. A stale entry never shows a resume prompt. If the verification read fails, the pointer is returned unverified; a network error never deletes recovery state.

## Import

```ts
import { usePendingUnshield } from "@zama-fhe/react-sdk";
```

## Usage

{% tabs %}
{% tab title="ResumeUnshieldGuard.tsx" %}

```tsx
import { usePendingUnshield, useResumeUnshield } from "@zama-fhe/react-sdk";
import type { Address } from "@zama-fhe/sdk";

function ResumeUnshieldGuard({
  wrapperAddress,
  children,
}: {
  wrapperAddress: Address;
  children: React.ReactNode;
}) {
  const { data: unwrapTxHash } = usePendingUnshield(wrapperAddress);
  const { mutate: resumeUnshield } = useResumeUnshield(wrapperAddress);

  if (unwrapTxHash) {
    // Finalize on user action, not on load — never trigger a wallet tx unprompted.
    return <button onClick={() => resumeUnshield({ unwrapTxHash })}>Resume unshield</button>;
  }

  return children;
}
```

{% endtab %}
{% endtabs %}

## Parameters

### tokenAddress

`Address`

Address of the confidential wrapper contract. Passed positionally as the first argument.

```ts
const { data: unwrapTxHash } = usePendingUnshield("0xWrapper");
```

## Return Type

`data` is `Hex | null` — the unwrap transaction hash of an interrupted unshield, or `null` when none is pending.

{% include ".gitbook/includes/query-result.md" %}

## Suspense

Use `usePendingUnshieldSuspense` inside a `<Suspense>` boundary. The hook throws a promise while loading, so `data` is always defined (`Hex | null`).

```tsx
import { usePendingUnshieldSuspense } from "@zama-fhe/react-sdk";

const { data: unwrapTxHash } = usePendingUnshieldSuspense("0xWrapper");
```

## Related

- [`useResumeUnshield`](./useResumeUnshield.md) — resume the interrupted unshield from the returned hash
- [`useUnshield`](./useUnshield.md) — standard unshield (persists/clears pending state automatically)
- [`WrappedToken.getPendingUnshield`](../sdk/WrappedToken.md#getpendingunshield) — imperative equivalent on the `WrappedToken` class
- [`zamaQueryKeys.pendingUnshield`](./query-keys.md) — cache keys for manual invalidation
