import type { Hex } from "viem";
import { EventService } from "../event-service";
import { describe, expect, test, vi } from "../../test-fixtures";

const TX_HASH = "0x1111111111111111111111111111111111111111111111111111111111111111" as Hex;

describe("EventService", () => {
  test("typed listener receives narrowed event for matching type only", async () => {
    const service = new EventService();
    const listener = vi.fn();

    service.on("transfer:submitted", listener);

    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    await service.emit({
      type: "unwrap:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
    const [event] = listener.mock.calls[0]!;
    expect(event.type).toBe("transfer:submitted");
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

    service.on("transfer:submitted", makeListener("slow", 30));
    service.on("transfer:submitted", makeListener("fast", 5));

    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    // Faster listener resolves first → both complete because emit awaited Promise.all.
    expect(calls).toEqual(["fast", "slow"]);
  });

  test("subscribe fires for every event type", async () => {
    const service = new EventService();
    const listener = vi.fn();

    service.subscribe(listener);
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    await service.emit({
      type: "unwrap:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls[0]![0].type).toBe("transfer:submitted");
    expect(listener.mock.calls[1]![0].type).toBe("unwrap:submitted");
  });

  test("unsubscribe stops further emits", async () => {
    const service = new EventService();
    const listener = vi.fn();

    const unsubscribe = service.on("transfer:submitted", listener);
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    unsubscribe();
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("subscribe unsubscribe stops further emits", async () => {
    const service = new EventService();
    const listener = vi.fn();

    const unsubscribe = service.subscribe(listener);
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    unsubscribe();
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("emit with no listeners resolves immediately", async () => {
    const service = new EventService();
    await expect(
      service.emit({ type: "transfer:submitted", txHash: TX_HASH }),
    ).resolves.toBeUndefined();
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

    await expect(
      service.emit({ type: "transfer:submitted", txHash: TX_HASH }),
    ).resolves.toBeUndefined();
    expect(failing).toHaveBeenCalledTimes(1);
    expect(sibling).toHaveBeenCalledTimes(1);
    expect(anyListener).toHaveBeenCalledTimes(1);
  });

  test("async listener is awaited by emit", async () => {
    const service = new EventService();
    let resolved = false;
    service.on("transfer:submitted", async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      resolved = true;
    });

    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    expect(resolved).toBe(true);
  });

  test("once(type, listener) fires exactly once and auto-unsubscribes", async () => {
    const service = new EventService();
    const listener = vi.fn();

    service.once("transfer:submitted", listener);

    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("once unsubscribe returned fn is a no-op after auto-fire", async () => {
    const service = new EventService();
    const listener = vi.fn();

    const unsubscribe = service.once("transfer:submitted", listener);
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    unsubscribe(); // no-op
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("once unsubscribe before first event prevents fire", async () => {
    const service = new EventService();
    const listener = vi.fn();

    const unsubscribe = service.once("transfer:submitted", listener);
    unsubscribe();
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).not.toHaveBeenCalled();
  });

  test("back-compat: EventServiceConfig.onEvent wires through subscribe", async () => {
    const onEvent = vi.fn();
    const service = new EventService({ onEvent });

    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0]![0].type).toBe("transfer:submitted");
  });

  test("on({ signal }) unsubscribes when the signal aborts", async () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();

    service.on("transfer:submitted", listener, {
      signal: controller.signal,
    });
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    controller.abort();
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("on({ signal }) with already-aborted signal never registers the listener", async () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();
    controller.abort();

    const unsubscribe = service.on("transfer:submitted", listener, {
      signal: controller.signal,
    });
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  test("subscribe({ signal }) unsubscribes when the signal aborts", async () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();

    service.subscribe(listener, { signal: controller.signal });
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    controller.abort();
    await service.emit({
      type: "unwrap:submitted",
      txHash: TX_HASH,
    });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("once({ signal }) aborted before first event prevents fire", async () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();

    service.once("transfer:submitted", listener, {
      signal: controller.signal,
    });
    controller.abort();
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).not.toHaveBeenCalled();
  });

  test("emit stamps timestamp and optional tokenAddress on the event", async () => {
    const service = new EventService();
    const listener = vi.fn();
    service.subscribe(listener);

    const tokenAddress = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as const;
    await service.emit({ type: "transfer:submitted", txHash: TX_HASH }, tokenAddress);

    const [event] = listener.mock.calls[0]!;
    expect(event.tokenAddress).toBe(tokenAddress);
    expect(event.timestamp).toEqual(expect.any(Number));
  });

  test("typed and catch-all listeners both fire on the same emit", async () => {
    const service = new EventService();
    const typed = vi.fn();
    const any = vi.fn();

    service.on("transfer:submitted", typed);
    service.subscribe(any);

    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(typed).toHaveBeenCalledTimes(1);
    expect(any).toHaveBeenCalledTimes(1);
    expect(typed.mock.calls[0]![0]).toEqual(any.mock.calls[0]![0]);
  });

  test("subscribe({ signal }) with already-aborted signal never registers the listener", async () => {
    const service = new EventService();
    const listener = vi.fn();
    const controller = new AbortController();
    controller.abort();

    const unsubscribe = service.subscribe(listener, {
      signal: controller.signal,
    });
    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });

    expect(listener).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  test("listener throw is logged via console.warn with the EventService tag", async () => {
    const service = new EventService();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    service.on("transfer:submitted", () => {
      throw new Error("listener boom");
    });

    try {
      await service.emit({
        type: "transfer:submitted",
        txHash: TX_HASH,
      });

      expect(warn).toHaveBeenCalledTimes(1);
      const [message, error] = warn.mock.calls[0]!;
      expect(message).toEqual(`[zama-sdk] transfer:submitted listener threw:`);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe("listener boom");
    } finally {
      warn.mockRestore();
    }
  });

  test("listeners added during dispatch do not fire on the current emit", async () => {
    const service = new EventService();
    const late = vi.fn();
    service.subscribe(() => {
      service.on("transfer:submitted", late);
    });

    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    expect(late).not.toHaveBeenCalled();

    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    expect(late).toHaveBeenCalledTimes(1);
  });

  test("listeners removed during dispatch still fire for siblings on the current emit", async () => {
    const service = new EventService();
    const sibling = vi.fn();
    let unsubscribeSibling: (() => void) | undefined;

    service.on("transfer:submitted", () => {
      unsubscribeSibling?.();
    });
    unsubscribeSibling = service.on("transfer:submitted", sibling);

    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    expect(sibling).toHaveBeenCalledTimes(1);

    await service.emit({
      type: "transfer:submitted",
      txHash: TX_HASH,
    });
    expect(sibling).toHaveBeenCalledTimes(1);
  });
});
