import { nodeTest as test, expect } from "../../fixtures/node-test";
import type { Address } from "viem";

test.describe("ZamaSDK — lifecycle and configuration", () => {
  test("creates Token with explicit wrapper", async ({ sdk, contracts }) => {
    const token = sdk.createToken(contracts.USDC, contracts.cUSDC as Address);
    expect(token).toBeDefined();
  });

  test("creates Token without wrapper (defaults to address)", async ({ sdk, contracts }) => {
    const token = sdk.createToken(contracts.cUSDT);
    expect(token).toBeDefined();
  });

  test("creates ReadonlyToken", async ({ sdk, contracts }) => {
    const readonlyToken = sdk.createReadonlyToken(contracts.cUSDC as Address);
    expect(readonlyToken).toBeDefined();
  });

  test("terminate cleans up relayer", async ({ sdk }) => {
    sdk.terminate();
    // Relayer is terminated — further operations should fail
    await expect(sdk.relayer.generateKeypair()).rejects.toThrow("terminated");
  });

  test("dispose unsubscribes without terminating relayer", async ({ sdk }) => {
    sdk.dispose();
    // Relayer still works after dispose
    const keypair = await sdk.relayer.generateKeypair();
    expect(keypair.publicKey).toBeDefined();
    sdk.terminate();
  });

  test("rejects zero keypairTTL", async ({ relayer, viemClient, anvilPort }) => {
    const { createPublicClient, http } = await import("viem");
    const { foundry } = await import("viem/chains");
    const { ViemSigner } = await import("@zama-fhe/sdk/viem");
    const { MemoryStorage, ZamaSDK } = await import("@zama-fhe/sdk");

    const publicClient = createPublicClient({
      chain: foundry,
      transport: http(`http://127.0.0.1:${anvilPort}`),
    });
    const signer = new ViemSigner({ walletClient: viemClient, publicClient });
    expect(
      () =>
        new ZamaSDK({
          relayer,
          signer,
          storage: new MemoryStorage(),
          keypairTTL: 0,
        }),
    ).toThrow("keypairTTL must be a positive number");
  });
});
