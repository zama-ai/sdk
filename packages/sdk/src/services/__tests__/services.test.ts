import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { Relayer, Signer, CredentialStorage, SessionStorage, EventEmitter } from "../index";
import type { Hex } from "../../relayer/relayer-sdk.types";

describe("Service Tags", () => {
  it("Relayer is a valid Context.Tag", () => {
    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      return relayer;
    });
    expect(program).toBeDefined();
  });

  it("Signer is a valid Context.Tag", () => {
    const program = Effect.gen(function* () {
      const signer = yield* Signer;
      return signer;
    });
    expect(program).toBeDefined();
  });

  it("CredentialStorage is a valid Context.Tag", () => {
    const program = Effect.gen(function* () {
      const storage = yield* CredentialStorage;
      return storage;
    });
    expect(program).toBeDefined();
  });

  it("SessionStorage is a valid Context.Tag", () => {
    const program = Effect.gen(function* () {
      const storage = yield* SessionStorage;
      return storage;
    });
    expect(program).toBeDefined();
  });

  it("EventEmitter is a valid Context.Tag", () => {
    const program = Effect.gen(function* () {
      const emitter = yield* EventEmitter;
      return emitter;
    });
    expect(program).toBeDefined();
  });

  it("Relayer service can be provided and used", async () => {
    const program = Effect.gen(function* () {
      const relayer = yield* Relayer;
      const result = yield* relayer.generateKeypair();
      return result;
    });

    const result = await Effect.runPromise(
      program.pipe(
        Effect.provideService(Relayer, {
          encrypt: () => Effect.succeed({ handles: [], inputProof: new Uint8Array() }),
          userDecrypt: () => Effect.succeed({}),
          publicDecrypt: () =>
            Effect.succeed({
              clearValues: {},
              abiEncodedClearValues: "0x" as Hex,
              decryptionProof: "0x" as Hex,
            }),
          generateKeypair: () => Effect.succeed({ publicKey: "pk", privateKey: "sk" }),
          createEIP712: () => Effect.die("not implemented"),
          createDelegatedUserDecryptEIP712: () => Effect.die("not implemented"),
          delegatedUserDecrypt: () => Effect.succeed({}),
          requestZKProofVerification: () => Effect.die("not implemented"),
          getPublicKey: () => Effect.succeed(null),
          getPublicParams: () => Effect.succeed(null),
        }),
      ),
    );

    expect(result).toEqual({ publicKey: "pk", privateKey: "sk" });
  });
});
