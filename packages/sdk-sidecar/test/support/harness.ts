import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { credentials, type ClientDuplexStream } from "@grpc/grpc-js";
import {
  anvil,
  createConfig,
  MemoryStorage,
  ZamaSDK,
  type GenericSigner,
  type GenericStorage,
  type Hex,
} from "@zama-fhe/sdk";
import { bytesToHex } from "viem";
import { createMockProvider } from "../../../sdk/src/test-fixtures/provider.js";
import { createMockRelayer } from "../../../sdk/src/test-fixtures/relayer.js";
import { createCoordinator } from "../../src/coordination.js";
import { bytes } from "../../src/encoding.js";
import { errorDetails } from "../../src/errors.js";
import { SidecarRuntime, type ContextFactory } from "../../src/runtime.js";
import { startServer } from "../../src/server.js";
import {
  SidecarServiceClient,
  type ClearEntry,
  type ClearValue,
  type SignerAction,
  type SignerClientMessage,
  type SignerServerMessage,
} from "../../src/generated/zama/sdk/v1alpha1/sidecar.js";

export const storage = () => new MemoryStorage();
export function fixture(
  signer: GenericSigner | undefined,
  backing: GenericStorage = storage(),
  permitTTL?: number,
) {
  const provider = createMockProvider();
  const relayer = createMockRelayer();
  const backend = { type: "test", createRelayer: () => relayer };
  const sdk = new ZamaSDK(
    createConfig({
      chains: [anvil],
      signer,
      provider,
      storage: backing,
      ...(permitTTL === undefined ? {} : { permitTTL }),
      relayers: { [anvil.id]: backend },
    }),
  );
  return { sdk, provider, relayer };
}
export function decodeValue(encoded: ClearValue | undefined) {
  const value = encoded?.value;
  switch (value?.$case) {
    case "bigintValue":
      return BigInt(value.bigintValue);
    case "numberValue":
      return value.numberValue;
    case "stringValue":
      return value.stringValue;
    case "boolValue":
      return value.boolValue;
    default:
      return undefined;
  }
}
export function decode(entries: ClearEntry[]) {
  return Object.fromEntries(
    entries.map((entry) => [bytesToHex(entry.encryptedValue), decodeValue(entry.value)]),
  );
}
export async function testServer(factory: ContextFactory) {
  const directory = await mkdtemp(join(tmpdir(), "sdk-equivalence-"));
  const runtime = new SidecarRuntime(factory, createCoordinator());
  const socket = join(directory, "sdk.sock");
  const stop = await startServer(runtime, socket, "test");
  const client = new SidecarServiceClient(`unix:${socket}`, credentials.createInsecure());
  const streams: ClientDuplexStream<SignerClientMessage, SignerServerMessage>[] = [];
  return {
    client,
    async attachSigner(contextId: string, sign: (action: SignerAction) => Promise<Hex>) {
      const stream = client.signerChannel();
      streams.push(stream);
      const ready = Promise.withResolvers<void>();
      stream.on("error", ready.reject);
      stream.on("data", ({ message }: SignerServerMessage) => {
        if (message?.$case === "attached") {
          ready.resolve();
        }
        if (message?.$case !== "action") {
          return;
        }
        const action = message.action;
        void sign(action).then(
          (signature) =>
            stream.write({
              message: {
                $case: "reply",
                reply: {
                  operationId: action.operationId,
                  actionId: action.actionId,
                  signature: bytes(signature),
                  error: undefined,
                },
              },
            }),
          (error) =>
            stream.write({
              message: {
                $case: "reply",
                reply: {
                  operationId: action.operationId,
                  actionId: action.actionId,
                  signature: Buffer.alloc(0),
                  error: errorDetails(error),
                },
              },
            }),
        );
      });
      stream.write({ message: { $case: "attach", attach: { contextId } } });
      await ready.promise;
    },
    async close() {
      for (const stream of streams) {
        stream.cancel();
      }
      client.close();
      await runtime.close();
      await stop();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
