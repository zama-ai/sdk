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

  test("onAny fires for every event type", async () => {
    const service = new EventService();
    const listener = vi.fn();

    service.onAny(listener);
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

  test("onAny unsubscribe stops further emits", async () => {
    const service = new EventService();
    const listener = vi.fn();

    const unsubscribe = service.onAny(listener);
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
    service.onAny(anyListener);

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

  test("hung listener is timed out, emit resolves, warning logged", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const service = new EventService({ timeoutMs: 30 });
    const slow = vi.fn(() => new Promise<void>(() => {})); // never resolves
    const fast = vi.fn();

    service.on(ZamaSDKEvents.TransferSubmitted, slow);
    service.on(ZamaSDKEvents.TransferSubmitted, fast);

    const before = performance.now();
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });
    const elapsed = performance.now() - before;

    expect(elapsed).toBeGreaterThanOrEqual(25);
    expect(elapsed).toBeLessThan(200);
    expect(fast).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
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

  test("back-compat: EventServiceConfig.onEvent wires through onAny", async () => {
    const onEvent = vi.fn();
    const service = new EventService({ onEvent });

    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]![0].type).toBe(ZamaSDKEvents.TransferSubmitted);
  });

  test("emit stamps timestamp and optional tokenAddress on the event", async () => {
    const service = new EventService();
    const listener = vi.fn();
    service.onAny(listener);

    const tokenAddress = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as const;
    await service.emit({ type: ZamaSDKEvents.TransferSubmitted, txHash: TX_HASH }, tokenAddress);

    const [event] = listener.mock.calls[0]!;
    expect(event.tokenAddress).toBe(tokenAddress);
    expect(event.timestamp).toEqual(expect.any(Number));
  });
});
