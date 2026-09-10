import type * as Viem from "viem";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { createContextFactory } from "../src/sdk.js";
import { StorageManager } from "../src/storage-manager.js";
import { RemoteStorage } from "../src/remote-storage.js";
import { RemoteSigner } from "../src/remote-signer.js";

const requests = vi.hoisted(() => [] as string[]);
vi.mock("viem", async (importOriginal) => {
  const actual = await importOriginal<typeof Viem>();
  return {
    ...actual,
    createPublicClient: () =>
      actual.createPublicClient({
        transport: actual.custom({
          request: async ({ method }) => {
            requests.push(method);
            if (method === "eth_chainId") {
              return "0xaa36a7";
            }
            if (method === "eth_call") {
              return `0x${"00".repeat(32)}`;
            }
            throw new Error(`Unexpected RPC method: ${method}`);
          },
        }),
      }),
  };
});

test("context factory preserves signerless public decryption and zero-value lazy signing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sidecar-zero-"));
  const storage = new StorageManager(directory);
  const factory = createContextFactory(storage);
  const request = {
    configJson: JSON.stringify({ chainId: 11155111, rpcUrl: "https://rpc.invalid" }),
    signerEnabled: false,
    account: undefined,
    storage: undefined,
    permitStorage: undefined,
  };
  const signer = new RemoteSigner(
    { address: "0x1111111111111111111111111111111111111111", chainId: 11155111 },
    () => {},
  );
  const signing = vi.spyOn(signer, "signTypedData");
  const publicContext = await factory(request, undefined, new RemoteStorage());
  const signedContext = await factory(
    { ...request, signerEnabled: true },
    signer,
    new RemoteStorage(),
  );
  const zero = `0x${"00".repeat(32)}` as const;
  try {
    await expect(publicContext.sdk.decryption.decryptPublicValues([])).resolves.toEqual({
      clearValues: {},
      decryptionProof: "0x",
      abiEncodedClearValues: "0x",
    });
    await expect(publicContext.sdk.decryption.decryptValues([])).rejects.toMatchObject({
      code: "SIGNER_NOT_CONFIGURED",
    });
    await expect(
      signedContext.sdk.decryption.decryptValues([
        { encryptedValue: zero, contractAddress: "0x2222222222222222222222222222222222222222" },
      ]),
    ).resolves.toEqual({ [zero]: 0n });
    expect(signing).not.toHaveBeenCalled();
    expect(requests).toContain("eth_chainId");
  } finally {
    publicContext.sdk.dispose();
    signedContext.sdk.dispose();
    signer.dispose();
    await storage.close();
    await rm(directory, { recursive: true, force: true });
  }
});
