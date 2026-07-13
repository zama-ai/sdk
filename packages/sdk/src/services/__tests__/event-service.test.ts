import type { Address } from "viem";
import { ZamaSDKEvents } from "../../events/sdk-events";
import type { ZamaSDKEvent } from "../../events/sdk-events";
import { describe, expect, test, vi } from "../../test-fixtures";
import { EventService } from "../event-service";
import { LoggerService } from "../logger-service";

const TOKEN_ADDRESS = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;

describe("EventService", () => {
  test("on() fans out to every listener subscribed to a matching type", () => {
    const service = new EventService({ logger: new LoggerService() });
    const a = vi.fn();
    const b = vi.fn();
    service.on(ZamaSDKEvents.EncryptStart, a);
    service.on(ZamaSDKEvents.EncryptStart, b);

    service.emit({ type: ZamaSDKEvents.EncryptStart });

    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  test("on() does not fire for a different event type", () => {
    const service = new EventService({ logger: new LoggerService() });
    const listener = vi.fn();
    service.on(ZamaSDKEvents.EncryptStart, listener);

    service.emit({ type: ZamaSDKEvents.EncryptEnd, durationMs: 5 });

    expect(listener).not.toHaveBeenCalled();
  });

  test("the unsubscribe function returned by on() stops further delivery", () => {
    const service = new EventService({ logger: new LoggerService() });
    const listener = vi.fn();
    const unsubscribe = service.on(ZamaSDKEvents.EncryptStart, listener);

    unsubscribe();
    service.emit({ type: ZamaSDKEvents.EncryptStart });

    expect(listener).not.toHaveBeenCalled();
  });

  test("once() fires exactly once then auto-unsubscribes", () => {
    const service = new EventService({ logger: new LoggerService() });
    const listener = vi.fn();
    service.once(ZamaSDKEvents.EncryptStart, listener);

    service.emit({ type: ZamaSDKEvents.EncryptStart });
    service.emit({ type: ZamaSDKEvents.EncryptStart });

    expect(listener).toHaveBeenCalledTimes(1);
  });

  test("the unsubscribe function returned by once() cancels delivery when called before the event fires", () => {
    const service = new EventService({ logger: new LoggerService() });
    const listener = vi.fn();
    const unsubscribe = service.once(ZamaSDKEvents.EncryptStart, listener);

    unsubscribe();
    service.emit({ type: ZamaSDKEvents.EncryptStart });

    expect(listener).not.toHaveBeenCalled();
  });

  test("once() fires exactly once even when a second once() listener re-enters emit() for the same type", () => {
    const service = new EventService({ logger: new LoggerService() });
    const second = vi.fn();
    // The first listener synchronously re-triggers emit() for the same event type before
    // the outer emit()'s listener snapshot finishes iterating — this exercises the reentrancy
    // path where a stale snapshot could otherwise invoke an already-fired once() listener again.
    const first = vi.fn(() => {
      service.emit({ type: ZamaSDKEvents.EncryptStart });
    });
    service.once(ZamaSDKEvents.EncryptStart, first);
    service.once(ZamaSDKEvents.EncryptStart, second);

    service.emit({ type: ZamaSDKEvents.EncryptStart });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  test("subscribe() receives every event regardless of type", () => {
    const service = new EventService({ logger: new LoggerService() });
    const listener = vi.fn();
    service.subscribe(listener);

    service.emit({ type: ZamaSDKEvents.EncryptStart });
    service.emit({ type: ZamaSDKEvents.EncryptEnd, durationMs: 5 });

    expect(listener).toHaveBeenCalledTimes(2);
  });

  test("the unsubscribe function returned by subscribe() stops further delivery", () => {
    const service = new EventService({ logger: new LoggerService() });
    const listener = vi.fn();
    const unsubscribe = service.subscribe(listener);

    unsubscribe();
    service.emit({ type: ZamaSDKEvents.EncryptStart });

    expect(listener).not.toHaveBeenCalled();
  });

  test("onEvent passed to the constructor is registered as a catch-all listener", () => {
    const onEvent = vi.fn();
    const service = new EventService({ onEvent, logger: new LoggerService() });

    service.emit({ type: ZamaSDKEvents.EncryptStart });
    service.emit({ type: ZamaSDKEvents.EncryptEnd, durationMs: 5 });

    expect(onEvent).toHaveBeenCalledTimes(2);
  });

  test("a throwing listener is isolated: emission does not throw and other listeners still fire", () => {
    const logger = new LoggerService();
    const warn = vi.spyOn(logger, "warn");
    const service = new EventService({ logger });
    const broken = vi.fn(() => {
      throw new Error("boom");
    });
    const healthy = vi.fn();
    service.subscribe(broken);
    service.subscribe(healthy);

    expect(() => service.emit({ type: ZamaSDKEvents.EncryptStart })).not.toThrow();

    expect(healthy).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("event listener silently failed"),
      expect.objectContaining({ error: expect.any(Error) }),
    );
  });

  test("emit() enriches the event with a timestamp and the given tokenAddress", () => {
    const service = new EventService({ logger: new LoggerService() });
    let received: ZamaSDKEvent | undefined;
    service.subscribe((event) => {
      received = event;
    });

    const before = Date.now();
    service.emit({ type: ZamaSDKEvents.EncryptStart }, TOKEN_ADDRESS);

    expect(received?.tokenAddress).toBe(TOKEN_ADDRESS);
    expect(received?.timestamp).toBeGreaterThanOrEqual(before);
  });

  test("dispose() removes every listener, typed and catch-all", () => {
    const service = new EventService({ logger: new LoggerService() });
    const typed = vi.fn();
    const catchAll = vi.fn();
    service.on(ZamaSDKEvents.EncryptStart, typed);
    service.subscribe(catchAll);

    service.dispose();
    service.emit({ type: ZamaSDKEvents.EncryptStart });

    expect(typed).not.toHaveBeenCalled();
    expect(catchAll).not.toHaveBeenCalled();
  });
});
