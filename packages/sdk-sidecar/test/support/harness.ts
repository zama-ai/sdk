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
  type ZamaSDKEventListener,
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
  type CreateContextRequest,
  type SignerAction,
  type SignerClientMessage,
  type SignerReply,
  type SignerServerMessage,
} from "../../src/generated/zama/sdk/v1alpha1/sidecar.js";

export const storage = () => new MemoryStorage();
export function fixture(
  signer: GenericSigner | undefined,
  backing: GenericStorage = storage(),
  permitTTL?: number,
  onEvent?: ZamaSDKEventListener,
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
      onEvent,
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
export function createContext(
  client: SidecarServiceClient,
  request: Partial<CreateContextRequest> = {},
) {
  return new Promise<string>((resolve, reject) =>
    client.createContext(
      {
        config: undefined,
        signerEnabled: false,
        account: undefined,
        storage: undefined,
        permitStorage: undefined,
        transportKeyPairDerivationSecret: undefined,
        ...request,
      },
      (error, response) => (error ? reject(error) : resolve(response.contextId)),
    ),
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
    socket,
    async attachWallet(
      contextId: string,
      respond: (action: SignerAction) => Promise<SignerReply["result"]>,
    ) {
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
        // A throwing responder must still reply, or the caller hangs waiting for one.
        const settle = async () => {
          try {
            return await respond(action);
          } catch (error) {
            return { $case: "error", error: errorDetails(error) } satisfies SignerReply["result"];
          }
        };
        void settle().then((result) =>
          stream.write({
            message: {
              $case: "reply",
              reply: { operationId: action.operationId, actionId: action.actionId, result },
            },
          }),
        );
      });
      stream.write({ message: { $case: "attach", attach: { contextId } } });
      await ready.promise;
      return stream;
    },
    attachSigner(contextId: string, sign: (action: SignerAction) => Promise<Hex>) {
      return this.attachWallet(contextId, (action) =>
        sign(action).then(
          (signature): SignerReply["result"] => ({
            $case: "signature",
            signature: bytes(signature),
          }),
          (error: unknown): SignerReply["result"] => ({
            $case: "error",
            error: errorDetails(error),
          }),
        ),
      );
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
