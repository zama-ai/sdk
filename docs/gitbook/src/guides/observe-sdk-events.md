---
title: Observe SDK events
description: Subscribe to the unified SDK event stream for logging, analytics, and monitoring.
---

# Observe SDK events

`sdk.events` is a typed, multi-listener event stream for passive, SDK-wide observation -- debug logging, performance monitoring, analytics, and correlating multi-step operations. It is separate from the per-operation callbacks (`ShieldCallbacks`, `TransferCallbacks`, `UnshieldCallbacks`) that individual `Token`/`WrappedToken` methods accept as options.

Use `sdk.events` when you want to observe the SDK as a whole, wired independently from any single call. Use per-operation callbacks when you want to drive UI state for one specific call (see [Shield tokens](shield-tokens.md), [Unshield tokens](unshield-tokens.md), [Transfer privately](transfer-privately.md)). A consumer never needs both to get a complete picture of a single operation -- callbacks and events for the same step carry the same information, fired from the same place.

## Steps

### 1. Subscribe to a single event type

Use `sdk.events.on(type, listener)` to receive only events of one type. It returns an unsubscribe function.

{% tabs %}
{% tab title="SDK" %}

```ts
import { ZamaSDKEvents } from "@zama-fhe/sdk";

const unsubscribe = sdk.events.on(ZamaSDKEvents.ShieldSubmitted, (event) => {
  console.log(`Shield submitted via ${event.shieldPath}: ${event.txHash}`);
});

// Later, when you no longer need updates:
unsubscribe();
```

{% endtab %}
{% endtabs %}

### 2. Subscribe to every event

Use `sdk.events.subscribe(listener)` for a catch-all listener that receives every event regardless of type -- useful for a debug logger or an analytics sink.

{% tabs %}
{% tab title="SDK" %}

```ts
const unsubscribe = sdk.events.subscribe((event) => {
  analytics.track(event.type, event);
});
```

{% endtab %}
{% endtabs %}

Passing `onEvent` to `createConfig`/the SDK constructor is convenience sugar for this same catch-all subscription, registered once at construction time:

```ts
const sdk = new ZamaSDK({
  ...config,
  onEvent: (event) => analytics.track(event.type, event),
});
```

### 3. Subscribe to one occurrence only

Use `sdk.events.once(type, listener)` when you only care about the next occurrence -- it auto-unsubscribes after firing once.

{% tabs %}
{% tab title="SDK" %}

```ts
sdk.events.once(ZamaSDKEvents.DecryptEnd, (event) => {
  console.log(`First decrypt took ${event.durationMs}ms`);
});
```

{% endtab %}
{% endtabs %}

### 4. Subscribe from a React component

`sdk.events` is a regular property on the `ZamaSDK` instance returned by `useZamaSDK()`. Subscribe in a `useEffect` and unsubscribe on cleanup:

{% tabs %}
{% tab title="React" %}

```tsx
import { useEffect } from "react";
import { useZamaSDK } from "@zama-fhe/react-sdk";
import { ZamaSDKEvents } from "@zama-fhe/sdk";

function ShieldActivityLog() {
  const sdk = useZamaSDK();

  useEffect(() => {
    return sdk.events.on(ZamaSDKEvents.ShieldSubmitted, (event) => {
      console.log(`Shield submitted: ${event.txHash}`);
    });
  }, [sdk]);

  return null;
}
```

{% endtab %}
{% endtabs %}

### 5. Correlate multi-phase operations

Events for a multi-phase operation (e.g. unshield's two phases) share an `operationId`. Use it to link related events instead of relying on ordering:

{% tabs %}
{% tab title="SDK" %}

```ts
const active = new Map<string, number>();

sdk.events.on(ZamaSDKEvents.UnshieldPhase1Submitted, (event) => {
  if (event.operationId) active.set(event.operationId, Date.now());
});

sdk.events.on(ZamaSDKEvents.UnshieldPhase2Submitted, (event) => {
  const startedAt = event.operationId ? active.get(event.operationId) : undefined;
  if (startedAt) console.log(`Unshield finished in ${Date.now() - startedAt}ms`);
});
```

{% endtab %}
{% endtabs %}

## Error events are for passive logging only

`EncryptError`, `DecryptError`, and `TransactionError` are emitted on the event stream alongside every failed operation, but they are **not** the primary way to handle errors. The SDK already throws well-typed errors (the `ZamaError` hierarchy) at the call site -- catch and handle those, as covered in [Handle errors](handle-errors.md). Treat the error events as a secondary channel for logging or monitoring tools (Sentry, DataDog) that want a passive feed of every failure, not as a substitute for `try/catch`.

## A listener that throws never breaks the SDK

If a listener throws, the SDK catches it, logs a warning through the configured logger, and continues delivering the event to any other listeners. The operation that triggered the event is never affected by a misbehaving listener.

## Next steps

- See [Handle errors](handle-errors.md) for the errors thrown by SDK operations.
- See [Shield tokens](shield-tokens.md), [Unshield tokens](unshield-tokens.md), and [Transfer privately](transfer-privately.md) for the per-operation callbacks that complement `sdk.events` for single-call UI state.
