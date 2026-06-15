import type { Hex } from "viem";
import { EventService } from "../event-service";
import { describe, expect, test, vi } from "../../test-fixtures";

const TX_HASH = "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;

describe("EventService", () => {
  test("typed listener receives narrowed event for matching type only", () => {
    const service = new EventService();
    const listener = vi.fn();

    service.on("transfer:submitted", listener);

    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    service.emit({
      type: "unwrap:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const [event] = listener.mock.calls[0]!;
    expect(event.type).toBe("transfer:submitted");
    expect(event.txHash).toBe(TX_HASH);
    expect(event.timestamp).toEqual(expect.any(Number));
  });

  test("multiple typed listeners fire in registration order", () => {
    const service = new EventService();
    const calls: string[] = [];

    service.on("transfer:submitted", () => calls.push("first"));
    service.on("transfer:submitted", () => calls.push("second"));

    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(calls).toEqual(["first", "second"]);
  });

  test("subscribe fires for every event type", () => {
    const service = new EventService();
    const listener = vi.fn();

    service.subscribe(listener);
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    service.emit({
      type: "unwrap:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0]![0].type).toBe("transfer:submitted");
    expect(listener.mock.calls[1]![0].type).toBe("unwrap:submitted");
  });

  test("unsubscribe stops further emits", () => {
    const service = new EventService();
    const listener = vi.fn();

    const unsubscribe = service.on("transfer:submitted", listener);
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    unsubscribe();
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("subscribe unsubscribe stops further emits", () => {
    const service = new EventService();
    const listener = vi.fn();

    const unsubscribe = service.subscribe(listener);
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    unsubscribe();
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("emit with no listeners is a no-op", () => {
    const service = new EventService();
    expect(() => service.emit({ type: "transfer:submitted", txHash: TX_HASH })).not.toThrow();
  });

  test("listener throw does not propagate and siblings still fire", async () => {
    const service = new EventService();
    const failing = vi.fn(() => {
      throw new Error("listener boom");
    });
    const sibling = vi.fn();
    const anyListener = vi.fn();

    service.on("transfer:submitted", failing);
    service.on("transfer:submitted", sibling);
    service.subscribe(anyListener);

    const previous = process.listeners("uncaughtException");
    process.removeAllListeners("uncaughtException");
    const swallow = new Promise<void>((resolve) => {
      process.once("uncaughtException", () => resolve());
    });
    try {
      expect(() => service.emit({ type: "transfer:submitted", txHash: TX_HASH })).not.toThrow();
      expect(failing).toHaveBeenCalledTimes(1);
      expect(sibling).toHaveBeenCalledTimes(1);
      expect(anyListener).toHaveBeenCalledTimes(1);
      await swallow;
    } finally {
      for (const handler of previous) {
        process.on("uncaughtException", handler);
      }
    }
  });

  test("once(type, listener) fires exactly once and auto-unsubscribes", () => {
    const service = new EventService();
    const listener = vi.fn();

    service.once("transfer:submitted", listener);

    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("once unsubscribe returned fn is a no-op after auto-fire", () => {
    const service = new EventService();
    const listener = vi.fn();

    const unsubscribe = service.once("transfer:submitted", listener);
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    unsubscribe();
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("once unsubscribe before first event prevents fire", () => {
    const service = new EventService();
    const listener = vi.fn();

    const unsubscribe = service.once("transfer:submitted", listener);
    unsubscribe();
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).not.toHaveBeenCalled();
  });

  test("back-compat: EventServiceConfig.onEvent wires through subscribe", () => {
    const onEvent = vi.fn();
    const service = new EventService({ onEvent });

    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]![0].type).toBe("transfer:submitted");
  });

  test("on({ signal }) unsubscribes when the signal aborts", () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();

    service.on("transfer:submitted", listener, {
      signal: controller.signal,
    });
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    controller.abort();
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("on({ signal }) with already-aborted signal never registers the listener", () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();
    controller.abort();

    const unsubscribe = service.on("transfer:submitted", listener, {
      signal: controller.signal,
    });
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  test("subscribe({ signal }) unsubscribes when the signal aborts", () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();

    service.subscribe(listener, { signal: controller.signal });
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    controller.abort();
    service.emit({
      type: "unwrap:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("once({ signal }) aborted before first event prevents fire", () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();

    service.once("transfer:submitted", listener, {
      signal: controller.signal,
    });
    controller.abort();
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).not.toHaveBeenCalled();
  });

  test("emit stamps timestamp and optional tokenAddress on the event", () => {
    const service = new EventService();
    const listener = vi.fn();
    service.subscribe(listener);

    const tokenAddress = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as const;
    service.emit({ type: "transfer:submitted", txHash: TX_HASH }, tokenAddress);

    const [event] = listener.mock.calls[0]!;
    expect(event.tokenAddress).toBe(tokenAddress);
    expect(event.timestamp).toEqual(expect.any(Number));
  });

  test("typed and catch-all listeners both fire on the same emit", () => {
    const service = new EventService();
    const typed = vi.fn();
    const any = vi.fn();

    service.on("transfer:submitted", typed);
    service.subscribe(any);

    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(typed).toHaveBeenCalledTimes(1);
    expect(any).toHaveBeenCalledTimes(1);
    expect(typed.mock.calls[0]![0]).toEqual(any.mock.calls[0]![0]);
  });

  test("subscribe({ signal }) with already-aborted signal never registers the listener", () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();
    controller.abort();

    const unsubscribe = service.subscribe(listener, {
      signal: controller.signal,
    });
    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  test("listener throw does not propagate to emit and surfaces on a microtask", async () => {
    const service = new EventService();
    const boom = new Error("listener boom");
    service.on("transfer:submitted", () => {
      throw boom;
    });

    // Intercept the microtask re-throw so vitest doesn't fail the test.
    const previous = process.listeners("uncaughtException");
    process.removeAllListeners("uncaughtException");
    const captured = new Promise<unknown>((resolve) => {
      process.once("uncaughtException", resolve);
    });

    try {
      expect(() =>
        service.emit({
          type: "transfer:submitted",
          txHash: TX_HASH,
        }),
      ).not.toThrow();

      await expect(captured).resolves.toBe(boom);
    } finally {
      for (const handler of previous) {
        process.on("uncaughtException", handler);
      }
    }
  });

  test("listeners added during dispatch do not fire on the current emit", () => {
    const service = new EventService();
    const late = vi.fn();
    service.subscribe(() => {
      service.on("transfer:submitted", late);
    });

    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    expect(late).not.toHaveBeenCalled();

    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    expect(late).toHaveBeenCalledTimes(1);
  });

  test("on/once/subscribe return values are Disposable for use with `using`", () => {
    const service = new EventService();
    const onListener = vi.fn();
    const onceListener = vi.fn();
    const subListener = vi.fn();

    {
      using onSub = service.on("transfer:submitted", onListener);
      using onceSub = service.once("transfer:submitted", onceListener);
      using subSub = service.subscribe(subListener);
      expect(onSub[Symbol.dispose]).toBeTypeOf("function");
      expect(onceSub[Symbol.dispose]).toBeTypeOf("function");
      expect(subSub[Symbol.dispose]).toBeTypeOf("function");
      service.emit({ type: "transfer:submitted", txHash: TX_HASH });
    }
    service.emit({ type: "transfer:submitted", txHash: TX_HASH });

    expect(onListener).toHaveBeenCalledTimes(1);
    expect(onceListener).toHaveBeenCalledTimes(1);
    expect(subListener).toHaveBeenCalledTimes(1);
  });

  test("listeners removed during dispatch still fire for siblings on the current emit", () => {
    const service = new EventService();
    const sibling = vi.fn();
    let unsubscribeSibling: (() => void) | undefined;

    service.on("transfer:submitted", () => {
      unsubscribeSibling?.();
    });
    unsubscribeSibling = service.on("transfer:submitted", sibling);

    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    expect(sibling).toHaveBeenCalledTimes(1);

    service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    expect(sibling).toHaveBeenCalledTimes(1);
  });
});
