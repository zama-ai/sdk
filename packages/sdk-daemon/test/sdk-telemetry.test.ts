import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ClientLanguage,
  ContextConfig,
  CreateContextRequest,
} from "../src/generated/zama/sdk/v1beta1/daemon.js";
import { RemoteEvents } from "../src/remote-events.js";
import { RemoteStorage } from "../src/remote-storage.js";
import { createContextFactory } from "../src/sdk.js";
import { StorageManager } from "../src/storage-manager.js";
import type { FhevmRelayerConfig } from "../../sdk/src/relayer/fhevm-relayer";
import { telemetryRequestOptions } from "../../sdk/src/telemetry";

const captured = vi.hoisted(() => ({ configs: [] as unknown[] }));
vi.mock("../../sdk/src/relayer/fhevm-relayer", () => ({
  FhevmRelayer: vi.fn(function FhevmRelayerMock(config: unknown) {
    captured.configs.push(config);
    return {};
  }),
}));

// The binary decoder delivers unknown enum values as-is: field 6, varint 3.
const futureLanguage = CreateContextRequest.decode(new Uint8Array([0x30, 0x03])).clientLanguage;

describe("context factory telemetry", () => {
  let directory: string;
  beforeEach(async () => {
    captured.configs.length = 0;
    directory = await mkdtemp(join(tmpdir(), "daemon-telemetry-"));
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  async function build(clientLanguage = ClientLanguage.CLIENT_LANGUAGE_GO) {
    const context = await createContextFactory(new StorageManager(directory))(
      {
        config: ContextConfig.fromPartial({
          chains: [{ id: 11155111n, network: "https://rpc.invalid" }],
        }),
        signerEnabled: false,
        account: undefined,
        storage: undefined,
        permitStorage: undefined,
        clientLanguage,
        transportKeyPairDerivationSecret: undefined,
      },
      undefined,
      new RemoteStorage(),
      new RemoteEvents("telemetry"),
    );
    context.sdk.dispose();
    const relayer = captured.configs[0] as FhevmRelayerConfig | undefined;
    expect(relayer).toBeDefined();
    return relayer!.telemetry;
  }

  test("ZAMA_SDK_TELEMETRY=off sends no telemetry", async () => {
    vi.stubEnv("ZAMA_SDK_TELEMETRY", "off");

    await expect(build()).resolves.toBeUndefined();
  });

  test.each([
    [ClientLanguage.CLIENT_LANGUAGE_GO, "go"],
    [ClientLanguage.CLIENT_LANGUAGE_RUST, "rust"],
    [ClientLanguage.CLIENT_LANGUAGE_UNSPECIFIED, "unknown"],
    [ClientLanguage.UNRECOGNIZED, "unknown"],
    [futureLanguage, "unknown"],
  ])("tags client language %s as the daemon runtime and client %s", async (language, client) => {
    vi.stubEnv("ZAMA_SDK_TELEMETRY", "");
    const telemetry = await build(language);

    expect(telemetryRequestOptions(telemetry!, undefined).headers).toMatchObject({
      "x-zama-sdk-runtime": "daemon",
      "x-zama-sdk-client": client,
    });
  });

  test("ZAMA_SDK_TELEMETRY=query sends the daemon fields as query parameters", async () => {
    vi.stubEnv("ZAMA_SDK_TELEMETRY", "query");
    const telemetry = await build();

    expect(telemetryRequestOptions(telemetry!, undefined).query).toMatchObject({
      zama_sdk_runtime: "daemon",
      zama_sdk_client: "go",
    });
  });
});
