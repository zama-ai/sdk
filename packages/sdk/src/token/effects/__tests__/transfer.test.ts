import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { Relayer, type RelayerService } from "../../../services/Relayer";
import { Signer } from "../../../services/Signer";
import { EventEmitter, type EventEmitterService } from "../../../services/EventEmitter";
import { EncryptionFailed } from "../../../errors";
import type { Address, Hex, EIP712TypedData } from "../../../relayer/relayer-sdk.types";
import { confidentialTransfer, confidentialTransferFrom } from "../transfer";

// ── Test constants ─────────────────────────────────────────

const TOKEN_ADDRESS = "0x1234567890abcdef1234567890abcdef12345678" as Address;
const RECIPIENT = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd" as Address;
const SENDER = "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" as Address;
const TEST_TX_HASH = "0xaaaa" as Hex;
const TEST_SIGNATURE = "0xdeadbeef" as Hex;
const TEST_PUBLIC_KEY = "test-public-key";
const TEST_PRIVATE_KEY = "test-private-key";

const TEST_EIP712: EIP712TypedData = {
  domain: { name: "test", version: "1", chainId: 1, verifyingContract: TOKEN_ADDRESS },
  types: { Reencrypt: [] },
  primaryType: "Reencrypt",
  message: {
    publicKey: TEST_PUBLIC_KEY,
    contractAddresses: [TOKEN_ADDRESS],
    startTimestamp: 0n,
    durationDays: 1n,
    extraData: "",
  },
};

const TEST_RECEIPT = { logs: [] };

// ── Mock factories ─────────────────────────────────────────

const makeTestRelayer = (overrides?: Partial<RelayerService>): RelayerService => ({
  encrypt: () =>
    Effect.succeed({
      handles: [new Uint8Array([1, 2, 3])],
      inputProof: new Uint8Array([4, 5, 6]),
    }),
  userDecrypt: () => Effect.succeed({}),
  publicDecrypt: () =>
    Effect.succeed({
      clearValues: {},
      abiEncodedClearValues: "0x" as Hex,
      decryptionProof: "0x" as Hex,
    }),
  generateKeypair: () =>
    Effect.succeed({ publicKey: TEST_PUBLIC_KEY, privateKey: TEST_PRIVATE_KEY }),
  createEIP712: () => Effect.succeed(TEST_EIP712),
  createDelegatedUserDecryptEIP712: () => Effect.die("not implemented"),
  delegatedUserDecrypt: () => Effect.succeed({}),
  requestZKProofVerification: () => Effect.die("not implemented"),
  getPublicKey: () => Effect.succeed(null),
  getPublicParams: () => Effect.succeed(null),
  ...overrides,
});

const makeTestSigner = (overrides?: Record<string, unknown>) => ({
  getAddress: () => Effect.succeed(SENDER),
  getChainId: () => Effect.succeed(1),
  signTypedData: () => Effect.succeed(TEST_SIGNATURE),
  readContract: () => Effect.die("not implemented"),
  writeContract: () => Effect.succeed(TEST_TX_HASH),
  waitForTransactionReceipt: () => Effect.succeed(TEST_RECEIPT),
  ...overrides,
});

const makeTestEmitter = (): EventEmitterService => ({
  emit: () => Effect.void,
});

function provideAll<A, E>(
  effect: Effect.Effect<A, E, Relayer | Signer | EventEmitter>,
  overrides?: {
    relayer?: RelayerService;
    signer?: ReturnType<typeof makeTestSigner>;
    emitter?: EventEmitterService;
  },
) {
  return effect.pipe(
    Effect.provideService(Relayer, overrides?.relayer ?? makeTestRelayer()),
    Effect.provideService(Signer, overrides?.signer ?? makeTestSigner()),
    Effect.provideService(EventEmitter, overrides?.emitter ?? makeTestEmitter()),
  );
}

// ── Tests ──────────────────────────────────────────────────

describe("confidentialTransfer", () => {
  it("encrypts, submits transfer, and returns txHash + receipt", async () => {
    const result = await Effect.runPromise(
      provideAll(confidentialTransfer(TOKEN_ADDRESS, RECIPIENT, 1000n)),
    );

    expect(result.txHash).toBe(TEST_TX_HASH);
    expect(result.receipt).toEqual(TEST_RECEIPT);
  });

  it("fails with EncryptionFailed when encryption returns no handles", async () => {
    const relayer = makeTestRelayer({
      encrypt: () =>
        Effect.succeed({
          handles: [],
          inputProof: new Uint8Array(),
        }),
    });

    const exit = await Effect.runPromiseExit(
      provideAll(confidentialTransfer(TOKEN_ADDRESS, RECIPIENT, 1000n), { relayer }),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const error = (exit.cause as { _tag: string; error: { _tag: string } }).error;
      expect(error._tag).toBe("EncryptionFailed");
    }
  });

  it("emits EncryptStart, EncryptEnd, and TransferSubmitted events", async () => {
    const events: string[] = [];
    const emitter: EventEmitterService = {
      emit: (event) =>
        Effect.sync(() => {
          events.push(event.type);
        }),
    };

    await Effect.runPromise(
      provideAll(confidentialTransfer(TOKEN_ADDRESS, RECIPIENT, 1000n), { emitter }),
    );

    expect(events).toContain("encrypt:start");
    expect(events).toContain("encrypt:end");
    expect(events).toContain("transfer:submitted");
  });

  it("emits EncryptError when encryption fails", async () => {
    const events: string[] = [];
    const emitter: EventEmitterService = {
      emit: (event) =>
        Effect.sync(() => {
          events.push(event.type);
        }),
    };
    const relayer = makeTestRelayer({
      encrypt: () => Effect.fail(new EncryptionFailed({ message: "encrypt failed" })),
    });

    await Effect.runPromiseExit(
      provideAll(confidentialTransfer(TOKEN_ADDRESS, RECIPIENT, 1000n), { relayer, emitter }),
    );

    expect(events).toContain("encrypt:error");
  });

  it("validates the recipient address", async () => {
    const exit = await Effect.runPromiseExit(
      provideAll(confidentialTransfer(TOKEN_ADDRESS, "invalid-address" as Address, 1000n)),
    );

    expect(exit._tag).toBe("Failure");
  });
});

describe("confidentialTransferFrom", () => {
  it("encrypts, submits transferFrom, and returns txHash + receipt", async () => {
    const result = await Effect.runPromise(
      provideAll(confidentialTransferFrom(TOKEN_ADDRESS, SENDER, RECIPIENT, 500n)),
    );

    expect(result.txHash).toBe(TEST_TX_HASH);
    expect(result.receipt).toEqual(TEST_RECEIPT);
  });

  it("emits TransferFromSubmitted event", async () => {
    const events: string[] = [];
    const emitter: EventEmitterService = {
      emit: (event) =>
        Effect.sync(() => {
          events.push(event.type);
        }),
    };

    await Effect.runPromise(
      provideAll(confidentialTransferFrom(TOKEN_ADDRESS, SENDER, RECIPIENT, 500n), { emitter }),
    );

    expect(events).toContain("transferFrom:submitted");
  });

  it("fails with EncryptionFailed when encryption returns no handles", async () => {
    const relayer = makeTestRelayer({
      encrypt: () =>
        Effect.succeed({
          handles: [],
          inputProof: new Uint8Array(),
        }),
    });

    const exit = await Effect.runPromiseExit(
      provideAll(confidentialTransferFrom(TOKEN_ADDRESS, SENDER, RECIPIENT, 500n), { relayer }),
    );

    expect(exit._tag).toBe("Failure");
    if (exit._tag === "Failure") {
      const error = (exit.cause as { _tag: string; error: { _tag: string } }).error;
      expect(error._tag).toBe("EncryptionFailed");
    }
  });
});
