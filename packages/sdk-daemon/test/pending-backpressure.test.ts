import type { ServiceError } from "@grpc/grpc-js";
import { expect, test } from "vitest";
import { parseAbi } from "viem";
import { CALLBACK_OUTPUT_LIMIT } from "../src/channel-writer.js";
import { operationContext, RemoteSigner, type SignerStream } from "../src/remote-signer.js";
import { RemoteStorage, type StorageStream } from "../src/remote-storage.js";
import type {
  SignerServerMessage,
  StorageServerMessage,
} from "../src/generated/zama/sdk/v1alpha1/sidecar.js";
import { FakeStream } from "./support/fake-stream.js";

const account = {
  address: "0x1111111111111111111111111111111111111111" as const,
  chainId: 11155111,
};

test("signer output overflow keeps a pending write outcome uncertain without replay", async () => {
  const controller = new AbortController();
  const reasons: Error[] = [];
  const signer = new RemoteSigner(account, (_operationId, reason) => {
    reasons.push(reason);
    controller.abort(reason);
  });
  const stream = new FakeStream<SignerServerMessage>();
  stream.write = (message) => {
    stream.messages.push(message);
    return false;
  };
  const failures: ServiceError[] = [];
  stream.on("error", (error) => failures.push(error));
  signer.attach(stream as unknown as SignerStream);
  const pending = operationContext.run({ id: "write", signal: controller.signal }, () =>
    signer.writeContract({
      address: "0x2222222222222222222222222222222222222222",
      abi: parseAbi(["function store(uint256 amount)"]),
      functionName: "store",
      args: [1n],
    }),
  );
  const outcome = pending.catch((error: unknown) => error);
  try {
    for (let index = 0; index < CALLBACK_OUTPUT_LIMIT; index++) {
      signer.reply({ operationId: "stale", actionId: String(index), result: undefined });
    }
    expect(await outcome).toMatchObject({ code: "TRANSACTION_OUTCOME_UNKNOWN", retryable: false });
    expect(reasons).toEqual([
      expect.objectContaining({ code: "TRANSACTION_OUTCOME_UNKNOWN", retryable: false }),
    ]);
    expect(failures).toHaveLength(1);
    expect(failures[0]?.metadata.get("zama-error-code")).toEqual(["CALLBACK_BACKPRESSURE"]);
    const replacement = new FakeStream<SignerServerMessage>();
    signer.attach(replacement as unknown as SignerStream);
    stream.emit("drain");
    expect(replacement.messages).toEqual([{ message: { $case: "attached", attached: {} } }]);
    expect(stream.messages).toHaveLength(1);
  } finally {
    signer.dispose();
  }
});

test("storage output overflow rejects pending work as unavailable without replay", async () => {
  const storage = new RemoteStorage();
  const stream = new FakeStream<StorageServerMessage>();
  stream.write = (message) => {
    stream.messages.push(message);
    return false;
  };
  const failures: ServiceError[] = [];
  stream.on("error", (error) => failures.push(error));
  storage.attach(stream as unknown as StorageStream);
  const pending = storage.forBackend("backend").get("key");
  const outcome = pending.catch((error: unknown) => error);
  try {
    for (let index = 0; index < CALLBACK_OUTPUT_LIMIT; index++) {
      storage.reply({ requestId: String(index), result: undefined });
    }
    expect(await outcome).toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    expect(failures).toHaveLength(1);
    expect(failures[0]?.metadata.get("zama-error-code")).toEqual(["CALLBACK_BACKPRESSURE"]);
    const replacement = new FakeStream<StorageServerMessage>();
    storage.attach(replacement as unknown as StorageStream);
    stream.emit("drain");
    expect(replacement.messages).toEqual([{ message: { $case: "attached", attached: {} } }]);
    expect(stream.messages).toHaveLength(1);
  } finally {
    storage.dispose();
  }
});
