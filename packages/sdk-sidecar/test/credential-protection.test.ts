import { RemoteEvents } from "../src/remote-events.js";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { inspect } from "node:util";
import { anvil, createConfig, MemoryStorage, ZamaSDK, type ZamaSDKOptions } from "@zama-fhe/sdk";
import { expect, test, vi } from "vitest";
import { createMockProvider } from "../../sdk/src/test-fixtures/provider.js";
import { createMockRelayer } from "../../sdk/src/test-fixtures/relayer.js";
import {
  TEST_PRIVATE_KEY,
  TEST_SIGNATURE,
  TOKEN,
  USER,
} from "../../sdk/src/test-fixtures/constants.js";
import { createContextFactory } from "../src/sdk.js";
import { StorageManager } from "../src/storage-manager.js";
import { RemoteStorage } from "../src/remote-storage.js";
import { RemoteSigner } from "../src/remote-signer.js";
import { errorDetails, serviceError } from "../src/errors.js";
import {
  ContextConfig,
  CreateContextRequest,
  DerivationSecret,
} from "../src/generated/zama/sdk/v1alpha1/sidecar.js";

vi.mock("@zama-fhe/sdk/viem", () => ({
  ViemProvider: vi.fn(function () {
    return createMockProvider();
  }),
}));
vi.mock("@zama-fhe/sdk/node", () => ({
  node: () => ({ type: "test", createRelayer: () => createMockRelayer() }),
}));

const secretText = "synthetic-config-secret-".repeat(4);
const protectedOption = { transportKeyPairDerivationSecret: secretText };
const wireSecret = DerivationSecret.fromPartial({ value: { $case: "text", text: secretText } });

function signer() {
  const result = new RemoteSigner({ address: USER, chainId: anvil.id }, () => {});
  vi.spyOn(result, "signTypedData").mockResolvedValue(TEST_SIGNATURE);
  return result;
}
function direct(
  backing: MemoryStorage,
  wallet: RemoteSigner,
  options: ZamaSDKOptions,
  scope?: string,
) {
  const backend = { type: "test", createRelayer: () => createMockRelayer() };
  return new ZamaSDK(
    createConfig({
      chains: [anvil],
      provider: createMockProvider(),
      signer: wallet,
      storage: backing,
      transportKeyPairScope: scope,
      relayers: { [anvil.id]: backend },
    }),
    options,
  );
}
function request(secret?: DerivationSecret, scope?: string) {
  return CreateContextRequest.fromPartial({
    config: ContextConfig.fromPartial({
      chainId: BigInt(anvil.id),
      chains: [{ id: BigInt(anvil.id), network: "http://rpc.invalid" }],
      transportKeyPairScope: scope,
    }),
    signerEnabled: true,
    storage: { backend: { $case: "persistent", persistent: "credentials" } },
    transportKeyPairDerivationSecret: secret,
  });
}
async function outcome(action: () => unknown) {
  try {
    return { value: await action() };
  } catch (error) {
    return { error: errorDetails(error) };
  }
}

test.each([
  { name: "omitted", wire: undefined, options: {} },
  {
    name: "explicitly missing",
    wire: DerivationSecret.fromPartial({}),
    options: { transportKeyPairDerivationSecret: undefined },
  },
  {
    name: "empty text",
    wire: DerivationSecret.fromPartial({ value: { $case: "text", text: "" } }),
    options: { transportKeyPairDerivationSecret: "" },
  },
  {
    name: "short text",
    wire: DerivationSecret.fromPartial({ value: { $case: "text", text: "sensitive-invalid" } }),
    options: { transportKeyPairDerivationSecret: "sensitive-invalid" },
  },
  {
    name: "empty bytes",
    wire: DerivationSecret.fromPartial({ value: { $case: "bytes", bytes: Buffer.alloc(0) } }),
    options: { transportKeyPairDerivationSecret: new Uint8Array() },
  },
  { name: "valid text", wire: wireSecret, options: protectedOption },
  {
    name: "valid bytes",
    wire: DerivationSecret.fromPartial({ value: { $case: "bytes", bytes: Buffer.alloc(32, 7) } }),
    options: { transportKeyPairDerivationSecret: new Uint8Array(32).fill(7) },
  },
])("constructor preserves direct SDK behavior for $name", async ({ wire, options }) => {
  const manager = new StorageManager();
  const wallet = signer();
  const config = request(wire);
  config.storage = undefined;
  const expected = await outcome(() => {
    const sdk = direct(new MemoryStorage(), wallet, options);
    sdk.dispose();
  });
  const actual = await outcome(async () => {
    const context = await createContextFactory(manager)(
      config,
      wallet,
      new RemoteStorage(),
      new RemoteEvents("fixture"),
    );
    context.sdk.dispose();
  });
  expect(actual).toEqual(expected);
  expect(inspect(actual)).not.toContain("sensitive-invalid");
  expect(inspect(actual)).not.toContain(secretText);
  await manager.close();
  wallet.dispose();
});

test.each([undefined, "partner"])(
  "protected credentials survive persistent restart with SDK scope %s",
  async (scope) => {
    const directory = await mkdtemp(join(tmpdir(), "sdk-362-protection-"));
    const directStorage = new MemoryStorage();
    const writes = vi.spyOn(directStorage, "set");
    const directSigner = signer();
    const sidecarSigner = signer();
    const logs = ["log", "warn", "error", "debug"].map((level) =>
      vi.spyOn(console, level as "log").mockImplementation(() => {}),
    );
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    let manager = new StorageManager(directory);
    async function phase(options: ZamaSDKOptions, wire: DerivationSecret | undefined) {
      const sdk = direct(directStorage, directSigner, options, scope);
      const remote = await createContextFactory(manager)(
        request(wire, scope),
        sidecarSigner,
        new RemoteStorage(),
        new RemoteEvents("fixture"),
      );
      try {
        const expected = await outcome(() => sdk.permits.grantPermit([TOKEN]));
        const actual = await outcome(() => remote.sdk.permits.grantPermit([TOKEN]));
        expect(actual).toEqual(expected);
        expect(inspect(actual)).not.toContain(secretText);
        expect(sidecarSigner.signTypedData).toHaveBeenCalledTimes(
          vi.mocked(directSigner.signTypedData).mock.calls.length,
        );
        return actual;
      } finally {
        sdk.dispose();
        remote.sdk.dispose();
        await manager.close();
        manager = new StorageManager(directory);
      }
    }
    try {
      expect(await phase(protectedOption, wireSecret)).toEqual({ value: undefined });
      expect(await phase(protectedOption, wireSecret)).toEqual({ value: undefined });
      expect(sidecarSigner.signTypedData).toHaveBeenCalledTimes(1);
      const persisted = writes.mock.calls.find(([key]) => key.startsWith("keypair:"))?.[1];
      expect(persisted).toMatchObject({ wrappingVersion: 1 });
      expect(inspect(persisted)).not.toContain(TEST_PRIVATE_KEY);
      expect(await phase({}, undefined)).toMatchObject({ error: { code: "KEY_WRAPPING_FAILED" } });
      const keyLabel = scope === undefined ? `keypair:${USER}` : `keypair:scope:${scope}`;
      expect(
        stderr.mock.calls.some(
          ([chunk]) => typeof chunk === "string" && chunk.includes(`{ key: '${keyLabel}' }`),
        ),
      ).toBe(false);
      expect(inspect(stderr.mock.calls)).toContain("[zama-sdk] error (details omitted)");
      expect(await phase(protectedOption, wireSecret)).toEqual({ value: undefined });
      expect(sidecarSigner.signTypedData).toHaveBeenCalledTimes(1);
      const wrong = "other-synthetic-secret-".repeat(4);
      await phase(
        { transportKeyPairDerivationSecret: wrong },
        DerivationSecret.fromPartial({ value: { $case: "text", text: wrong } }),
      );
      await manager.close();
      for (const entry of await readdir(directory, { recursive: true })) {
        if (!entry.endsWith(".sqlite")) {
          continue;
        }
        const bytes = await readFile(join(directory, entry));
        expect(bytes.includes(Buffer.from(secretText))).toBe(false);
        expect(bytes.includes(Buffer.from(TEST_PRIVATE_KEY))).toBe(false);
      }
      expect(inspect(logs.flatMap((log) => log.mock.calls))).not.toContain(secretText);
    } finally {
      logs.forEach((log) => log.mockRestore());
      stderr.mockRestore();
      directSigner.dispose();
      sidecarSigner.dispose();
      await manager.close();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("secret validation errors expose only SDK metadata on the gRPC boundary", async () => {
  const wallet = signer();
  const error = await Promise.resolve()
    .then(() =>
      direct(new MemoryStorage(), wallet, { transportKeyPairDerivationSecret: "secret-marker" }),
    )
    .catch((error: unknown) => error);
  const rpc = serviceError(error);
  expect(rpc.metadata.get("zama-error-code")).toEqual(["CONFIGURATION"]);
  expect(inspect(rpc)).not.toContain("secret-marker");
  wallet.dispose();
});
