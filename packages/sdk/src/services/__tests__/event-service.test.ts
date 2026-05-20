import type { Hex } from "viem";
import { ZamaSDKEvents } from "../../events/sdk-events";
import { EventService } from "../event-service";
import { describe, expect, test, vi } from "../../test-fixtures";

const TX_HASH = "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;

describe("EventService", () => {
  test("typed listener receives narrowed event for matching type only", async () => {
    const service = new EventService();
    const listener = vi.fn();

    service.on(ZamaSDKEvents.TransferSubmitted, listener);

    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });
    await service.emit({ type: ZamaSDKEvents.UnwrapSubmitted, txHash: TX_HASH });

    expect(listener).toHaveBeenCalledTimes(1);
    const [event] = listener.mock.calls[0]!;
    expect(event.type).toBe(ZamaSDKEvents.TransferSubmitted);
    expect(event.txHash).toBe(TX_HASH);
    expect(event.timestamp).toEqual(expect.any(Number));
  });

  test("multiple typed listeners fire in parallel", async () => {
    const service = new EventService();
    const calls: string[] = [];
    const makeListener = (label: string, delayMs: number) => async () => {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      calls.push(label);
    };

    service.on(ZamaSDKEvents.TransferSubmitted, makeListener("slow", 30));
    service.on(ZamaSDKEvents.TransferSubmitted, makeListener("fast", 5));

    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });

    // Faster listener resolves first → both complete because emit awaited Promise.all.
    expect(calls).toEqual(["fast", "slow"]);
  });

  test("subscribe fires for every event type", async () => {
    const service = new EventService();
    const listener = vi.fn();

    service.subscribe(listener);
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });
    await service.emit({ type: ZamaSDKEvents.UnwrapSubmitted, txHash: TX_HASH });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0]![0].type).toBe(ZamaSDKEvents.TransferSubmitted);
    expect(listener.mock.calls[1]![0].type).toBe(ZamaSDKEvents.UnwrapSubmitted);
  });

  test("unsubscribe stops further emits", async () => {
    const service = new EventService();
    const listener = vi.fn();

    const unsubscribe = service.on(ZamaSDKEvents.TransferSubmitted, listener);
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });
    unsubscribe();
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("subscribe unsubscribe stops further emits", async () => {
    const service = new EventService();
    const listener = vi.fn();

    const unsubscribe = service.subscribe(listener);
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });
    unsubscribe();
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("emit with no listeners resolves immediately", async () => {
    const service = new EventService();
    await expect(
      service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH }),
    ).resolves.toBeUndefined();
  });

  test("listener throw does not propagate and siblings still fire", async () => {
    const service = new EventService();
    const failing = vi.fn(() => {
      throw new Error("listener boom");
    });
    const sibling = vi.fn();
    const anyListener = vi.fn();

    service.on(ZamaSDKEvents.TransferSubmitted, failing);
    service.on(ZamaSDKEvents.TransferSubmitted, sibling);
    service.subscribe(anyListener);

    await expect(
      service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH }),
    ).resolves.toBeUndefined();
    expect(failing).toHaveBeenCalledTimes(1);
    expect(sibling).toHaveBeenCalledTimes(1);
    expect(anyListener).toHaveBeenCalledTimes(1);
  });

  test("async listener is awaited by emit", async () => {
    const service = new EventService();
    let resolved = false;
    service.on(ZamaSDKEvents.TransferSubmitted, async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      resolved = true;
    });

    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });
    expect(resolved).toBe(true);
  });

  test("once(type, listener) fires exactly once and auto-unsubscribes", async () => {
    const service = new EventService();
    const listener = vi.fn();

    service.once(ZamaSDKEvents.TransferSubmitted, listener);

    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("once unsubscribe returned fn is a no-op after auto-fire", async () => {
    const service = new EventService();
    const listener = vi.fn();

    const unsubscribe = service.once(ZamaSDKEvents.TransferSubmitted, listener);
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });
    unsubscribe(); // no-op
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("once unsubscribe before first event prevents fire", async () => {
    const service = new EventService();
    const listener = vi.fn();

    const unsubscribe = service.once(ZamaSDKEvents.TransferSubmitted, listener);
    unsubscribe();
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });

    expect(listener).not.toHaveBeenCalled();
  });

  test("back-compat: EventServiceConfig.onEvent wires through subscribe", async () => {
    const onEvent = vi.fn();
    const service = new EventService({ onEvent });

    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]![0].type).toBe(ZamaSDKEvents.TransferSubmitted);
  });

  test("on({ signal }) unsubscribes when the signal aborts", async () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();

    service.on(ZamaSDKEvents.TransferSubmitted, listener, { signal: controller.signal });
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });
    controller.abort();
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("on({ signal }) with already-aborted signal never registers the listener", async () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();
    controller.abort();

    const unsubscribe = service.on(ZamaSDKEvents.TransferSubmitted, listener, {
      signal: controller.signal,
    });
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });

    expect(listener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  test("subscribe({ signal }) unsubscribes when the signal aborts", async () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();

    service.subscribe(listener, { signal: controller.signal });
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });
    controller.abort();
    await service.emit({ type: ZamaSDKEvents.UnwrapSubmitted, txHash: TX_HASH });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("once({ signal }) aborted before first event prevents fire", async () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();

    service.once(ZamaSDKEvents.TransferSubmitted, listener, { signal: controller.signal });
    controller.abort();
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });

    expect(listener).not.toHaveBeenCalled();
  });

  test("emit stamps timestamp and optional tokenAddress on the event", async () => {
    const service = new EventService();
    const listener = vi.fn();
    service.subscribe(listener);

    const tokenAddress = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as const;
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH }, tokenAddress);

    const [event] = listener.mock.calls[0]!;
    expect(event.tokenAddress).toBe(tokenAddress);
    expect(event.timestamp).toEqual(expect.any(Number));
  });
});
