import { expect, test, vi } from "vitest";
import { status, type ServiceError } from "@grpc/grpc-js";
import {
  BaseSigner,
  anvil,
  type Hex,
  type WalletAccountChange,
  type ZamaSDKEvent,
} from "@zama-fhe/sdk";
import { createContext, fixture, storage, testServer } from "./support/harness.js";
import { sdkEvent, walletChange } from "../src/event-encoding.js";
import { bytes } from "../src/encoding.js";
import { RemoteEvents } from "../src/remote-events.js";
import type {
  EventDelivery,
  EventServerMessage,
} from "../src/generated/zama/sdk/v1alpha1/sidecar.js";
import {
  TEST_SIGNATURE,
  TOKEN,
  USER,
  VALID_ENCRYPTED_VALUE,
} from "../../sdk/src/test-fixtures/constants.js";

class Signer extends BaseSigner {
  constructor() {
    super({ address: USER, chainId: anvil.id });
  }
  override async signTypedData(): Promise<Hex> {
    return TEST_SIGNATURE;
  }
  override async writeContract(): Promise<Hex> {
    throw new Error("Unexpected transaction");
  }
}

test("real SDK decryption events preserve payloads, order and RPC correlation across the wire", async () => {
  const expected: ZamaSDKEvent[] = [];
  const directSigner = new Signer();
  const direct = fixture(directSigner, storage(), undefined, (event) => expected.push(event));
  const server = await testServer(async (_, signer, _storage, events) => {
    const created = fixture(signer, storage(), undefined, events.onEvent);
    events.observeWallet(created.sdk);
    return { sdk: created.sdk, storageIdentities: ["events-test"] };
  });
  const contextId = await createContext(server.client, {
    signerEnabled: true,
    account: { address: bytes(USER), chainId: BigInt(anvil.id) },
  });
  const stream = server.client.eventChannel();
  const ready = Promise.withResolvers<void>();
  const received: EventDelivery[] = [];
  stream.on("error", ready.reject);
  stream.on("data", ({ message }: EventServerMessage) => {
    if (message?.$case === "attached") {
      ready.resolve();
    }
    if (message?.$case === "delivery") {
      received.push(message.delivery);
      stream.write({
        message: {
          $case: "reply",
          reply: {
            sequence: message.delivery.sequence,
            outcome: { $case: "acknowledged", acknowledged: {} },
          },
        },
      });
    }
  });
  stream.write({ message: { $case: "attach", attach: { contextId } } });
  try {
    await ready.promise;
    await server.attachSigner(contextId, async () => TEST_SIGNATURE);
    await direct.sdk.decryption.decryptValues([
      { encryptedValue: VALID_ENCRYPTED_VALUE, contractAddress: TOKEN },
    ]);
    await new Promise<void>((resolve, reject) =>
      server.client.decryptValues(
        {
          operation: { contextId, operationId: "decrypt-1" },
          inputs: [{ encryptedValue: bytes(VALID_ENCRYPTED_VALUE), contractAddress: bytes(TOKEN) }],
          timeoutMs: undefined,
        },
        (error) => (error ? reject(error) : resolve()),
      ),
    );
    await vi.waitFor(() =>
      expect(received.filter((delivery) => delivery.payload?.$case === "event")).toHaveLength(
        expected.length,
      ),
    );
    const events = received.filter((delivery) => delivery.payload?.$case === "event");
    expect(events.map((delivery) => [delivery.contextId, delivery.operationId])).toEqual(
      expected.map(() => [contextId, "decrypt-1"]),
    );
    const normalize = ({
      timestamp: _timestamp,
      durationMs: _duration,
      ...event
    }: ReturnType<typeof sdkEvent>) => event;
    expect(
      events.map(
        (delivery) => delivery.payload?.$case === "event" && normalize(delivery.payload.event),
      ),
    ).toEqual(expected.map((event) => normalize(sdkEvent(event))));
    expect(events.at(-1)?.payload).toMatchObject({
      event: { result: [{ value: { value: { $case: "bigintValue" } } }] },
    });
  } finally {
    stream.cancel();
    direct.sdk.dispose();
    directSigner.dispose();
    await server.close();
  }
});

test("wallet bridge observes SDK lifecycle completion without synthesizing signer snapshots", async () => {
  const signer = new Signer();
  const sdk = fixture(signer);
  const expected: WalletAccountChange[] = [];
  const observer = new RemoteEvents("wallet");
  const notify = vi.spyOn(observer, "notify");
  observer.observeWallet(sdk.sdk);
  const lifecycle = sdk.sdk as unknown as {
    onWalletAccountChange(listener: (change: WalletAccountChange) => void): () => void;
  };
  const unsubscribe = lifecycle.onWalletAccountChange((change) => expected.push(change));
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    notify.mockClear();
    expected.length = 0;
    signer.walletAccount.setSnapshot(undefined);
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(notify.mock.calls[0]?.[0]).toEqual({
      $case: "walletAccount",
      walletAccount: walletChange({
        previous: { address: USER, chainId: anvil.id },
        next: undefined,
      }),
    });
    expect(notify.mock.calls.map(([payload]) => payload)).toEqual(
      expected.map((change) => ({ $case: "walletAccount", walletAccount: walletChange(change) })),
    );
    observer.dispose();
    signer.walletAccount.setSnapshot({ address: USER, chainId: anvil.id });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(notify).toHaveBeenCalledTimes(1);
  } finally {
    unsubscribe();
    observer.dispose();
    sdk.sdk.dispose();
    signer.dispose();
  }
});

test("a duplicate event attachment returns EVENT_ATTACHED over the real transport", async () => {
  const server = await testServer(async () => ({
    sdk: fixture(undefined).sdk,
    storageIdentities: [],
  }));
  const contextId = await createContext(server.client);
  const first = server.client.eventChannel();
  const second = server.client.eventChannel();
  try {
    const attached = new Promise<void>((resolve, reject) => {
      first.once("error", reject);
      first.on("data", ({ message }: EventServerMessage) => {
        if (message?.$case === "attached") {
          resolve();
        }
      });
    });
    first.write({ message: { $case: "attach", attach: { contextId } } });
    await attached;

    const rejected = new Promise<ServiceError>((resolve) => second.once("error", resolve));
    second.write({ message: { $case: "attach", attach: { contextId } } });
    const error = await rejected;
    expect(error.code).toBe(status.ALREADY_EXISTS);
    expect(error.metadata.get("zama-error-code")[0]?.toString()).toBe("EVENT_ATTACHED");
  } finally {
    first.cancel();
    second.cancel();
    await server.close();
  }
});

test("event queue saturation reaches the client as EVENT_BACKPRESSURE", async () => {
  let events: RemoteEvents | undefined;
  const server = await testServer(async (_, _signer, _storage, observer) => {
    events = observer;
    return { sdk: fixture(undefined).sdk, storageIdentities: [] };
  });
  const contextId = await createContext(server.client);
  const stream = server.client.eventChannel();
  try {
    const attached = new Promise<void>((resolve, reject) => {
      stream.once("error", reject);
      stream.on("data", ({ message }: EventServerMessage) => {
        if (message?.$case === "attached") {
          resolve();
        }
      });
    });
    stream.write({ message: { $case: "attach", attach: { contextId } } });
    await attached;
    const rejected = new Promise<ServiceError>((resolve) => stream.once("error", resolve));
    for (let index = 0; index < 258; index++) {
      events!.onEvent({ type: "encrypt:start", timestamp: index });
    }
    const error = await rejected;
    expect(error.code).toBe(status.RESOURCE_EXHAUSTED);
    expect(error.metadata.get("zama-error-code")[0]?.toString()).toBe("EVENT_BACKPRESSURE");
  } finally {
    stream.cancel();
    await server.close();
  }
});
