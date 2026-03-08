import { describe, it, expect, vi } from "vitest";
import { Effect } from "effect";
import { Signer, CredentialStorage, SessionStorage, EventEmitter } from "../index";
import {
  makeSignerLayer,
  makeCredentialStorageLayer,
  makeSessionStorageLayer,
  makeEventEmitterLayer,
} from "../layers";
import type { GenericSigner } from "../../token/token.types";
import type { EIP712TypedData } from "../../relayer/relayer-sdk.types";
import type { ZamaSDKEventInput } from "../../events/sdk-events";
import { MemoryStorage } from "../../token/memory-storage";

describe("Layer factories", () => {
  it("makeSignerLayer wraps GenericSigner into Signer service", async () => {
    const mockSigner: GenericSigner = {
      getAddress: vi.fn().mockResolvedValue("0xaddr"),
      getChainId: vi.fn().mockResolvedValue(1),
      signTypedData: vi.fn().mockResolvedValue("0xsig"),
      readContract: vi.fn().mockResolvedValue("data"),
      writeContract: vi.fn().mockResolvedValue("0xtx"),
      waitForTransactionReceipt: vi.fn().mockResolvedValue({ logs: [] }),
    };

    const layer = makeSignerLayer(mockSigner);
    const program = Effect.gen(function* () {
      const signer = yield* Signer;
      return yield* signer.getAddress();
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(result).toBe("0xaddr");
  });

  it("makeSignerLayer signTypedData maps rejection to SigningRejected", async () => {
    const mockSigner: GenericSigner = {
      getAddress: vi.fn().mockResolvedValue("0xaddr"),
      getChainId: vi.fn().mockResolvedValue(1),
      signTypedData: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("rejected"), { code: 4001 })),
      readContract: vi.fn(),
      writeContract: vi.fn(),
      waitForTransactionReceipt: vi.fn(),
    };

    const layer = makeSignerLayer(mockSigner);
    const program = Effect.gen(function* () {
      const signer = yield* Signer;
      return yield* signer.signTypedData({} as unknown as EIP712TypedData);
    });

    const exit = await Effect.runPromiseExit(program.pipe(Effect.provide(layer)));
    expect(exit._tag).toBe("Failure");
  });

  it("makeCredentialStorageLayer wraps GenericStorage", async () => {
    const store = new MemoryStorage();
    const layer = makeCredentialStorageLayer(store);
    const program = Effect.gen(function* () {
      const storage = yield* CredentialStorage;
      yield* storage.set("key", "value");
      return yield* storage.get("key");
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(result).toBe("value");
  });

  it("makeSessionStorageLayer wraps GenericStorage", async () => {
    const store = new MemoryStorage();
    const layer = makeSessionStorageLayer(store);
    const program = Effect.gen(function* () {
      const storage = yield* SessionStorage;
      yield* storage.set("k", 42);
      return yield* storage.get("k");
    });

    const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(result).toBe(42);
  });

  it("makeEventEmitterLayer calls listener", async () => {
    const listener = vi.fn();
    const layer = makeEventEmitterLayer(listener);
    const program = Effect.gen(function* () {
      const emitter = yield* EventEmitter;
      yield* emitter.emit({ type: "test" } as unknown as ZamaSDKEventInput);
    });

    await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(listener).toHaveBeenCalledOnce();
  });

  it("makeEventEmitterLayer works without listener", async () => {
    const layer = makeEventEmitterLayer();
    const program = Effect.gen(function* () {
      const emitter = yield* EventEmitter;
      yield* emitter.emit({ type: "test" } as unknown as ZamaSDKEventInput);
    });

    // Should not throw
    await Effect.runPromise(program.pipe(Effect.provide(layer)));
  });
});
