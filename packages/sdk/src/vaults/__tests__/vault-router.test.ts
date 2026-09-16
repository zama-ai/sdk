import type { Address } from "viem";
import { vi } from "vitest";
import {
  ConfigurationError,
  EncryptionFailedError,
  SignerNotConfiguredError,
  UnlistedConfidentialTokenError,
} from "../../errors";
import { describe, expect, mockEncryptedLegs, test, VALID_INPUT_PROOF } from "../../test-fixtures";
import type { GenericProvider } from "../../types";
import type { AllocationLeg } from "../allocation";
import { VaultRouter } from "../vault-router";

const ROUTER = "0x4444444444444444444444444444444444444444" as Address;
const REGISTRY = "0x5555555555555555555555555555555555555555" as Address;
const BATCHER_A = "0x1111111111111111111111111111111111111111" as Address;
const BATCHER_B = "0x3333333333333333333333333333333333333333" as Address;
const SHARED_TOKEN = "0x2222222222222222222222222222222222222222" as Address;
const OTHER_TOKEN = "0x6666666666666666666666666666666666666666" as Address;

/** Every chain read a router call makes. */
function mockReads(
  provider: GenericProvider,
  answers: { isTokenListed?: boolean; operators?: Readonly<Record<Address, boolean>> } = {},
) {
  vi.mocked(provider.readContract).mockImplementation(async (call: unknown) => {
    const { functionName, address } = call as { functionName: string; address: Address };
    switch (functionName) {
      case "tokenWrapperRegistry":
        return REGISTRY;
      case "isConfidentialTokenValid":
        return answers.isTokenListed ?? true;
      case "isOperator":
        return answers.operators?.[address] ?? false;
      default:
        throw new Error(`Unexpected read of ${functionName}`);
    }
  });
}

const LEGS: readonly AllocationLeg[] = [
  { batcher: BATCHER_A, token: SHARED_TOKEN, amount: 1_000n },
  { batcher: BATCHER_B, token: SHARED_TOKEN, amount: 0n },
];

describe("VaultRouter", () => {
  test("checksums the router address", ({ sdk }) => {
    expect(new VaultRouter(sdk, ROUTER.toLowerCase() as Address).address).toBe(ROUTER);
  });

  describe("tokenWrapperRegistry", () => {
    test("reads the registry the router names and caches it", async ({ sdk, provider }) => {
      mockReads(provider);
      const router = new VaultRouter(sdk, ROUTER);

      await expect(router.tokenWrapperRegistry()).resolves.toBe(REGISTRY);
      await expect(router.tokenWrapperRegistry()).resolves.toBe(REGISTRY);
      expect(provider.readContract).toHaveBeenCalledTimes(1);
    });

    test("isTokenListed asks that registry, not the router", async ({ sdk, provider }) => {
      mockReads(provider);
      await expect(new VaultRouter(sdk, ROUTER).isTokenListed(SHARED_TOKEN)).resolves.toBe(true);

      expect(provider.readContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: REGISTRY,
          functionName: "isConfidentialTokenValid",
          args: [SHARED_TOKEN],
        }),
      );
    });

    test("requireTokenListed names the token and the registry it asked", async ({
      sdk,
      provider,
    }) => {
      mockReads(provider, { isTokenListed: false });
      const router = new VaultRouter(sdk, ROUTER);

      await expect(router.requireTokenListed(SHARED_TOKEN)).rejects.toThrow(
        UnlistedConfidentialTokenError,
      );
      await expect(router.requireTokenListed(SHARED_TOKEN)).rejects.toMatchObject({
        token: SHARED_TOKEN,
        registry: REGISTRY,
      });
    });

    test("requireTokenListed resolves for a listed token", async ({ sdk, provider }) => {
      mockReads(provider);
      await expect(
        new VaultRouter(sdk, ROUTER).requireTokenListed(SHARED_TOKEN),
      ).resolves.toBeUndefined();
    });
  });

  describe("join", () => {
    test("encrypts every leg in one input bound to the router", async ({
      sdk,
      provider,
      relayer,
      userAddress,
    }) => {
      mockReads(provider, { operators: { [SHARED_TOKEN]: true } });
      mockEncryptedLegs(relayer, LEGS.length);

      await new VaultRouter(sdk, ROUTER).join(LEGS);

      expect(relayer.encryptValues).toHaveBeenCalledTimes(1);
      expect(relayer.encryptValues).toHaveBeenCalledWith(
        expect.objectContaining({
          contractAddress: ROUTER,
          userAddress,
          values: [
            { value: 1_000n, type: "euint64" },
            { value: 0n, type: "euint64" },
          ],
        }),
      );
    });

    test("submits the handles in leg order, each beside its own batcher", async ({
      sdk,
      provider,
      relayer,
      signer,
    }) => {
      mockReads(provider, { operators: { [SHARED_TOKEN]: true } });
      const [handleA, handleB] = mockEncryptedLegs(relayer, LEGS.length);

      await new VaultRouter(sdk, ROUTER).join(LEGS);

      expect(signer.writeContract).toHaveBeenCalledWith(
        expect.objectContaining({
          address: ROUTER,
          functionName: "join",
          args: [
            [
              { batcher: BATCHER_A, token: SHARED_TOKEN, amount: handleA },
              { batcher: BATCHER_B, token: SHARED_TOKEN, amount: handleB },
            ],
            VALID_INPUT_PROOF,
          ],
        }),
      );
    });

    test("grants the router operator once per distinct token", async ({
      sdk,
      provider,
      relayer,
      signer,
    }) => {
      mockReads(provider, { operators: { [OTHER_TOKEN]: true } });
      mockEncryptedLegs(relayer, 3);

      await new VaultRouter(sdk, ROUTER).join([
        { batcher: BATCHER_A, token: SHARED_TOKEN, amount: 1_000n },
        { batcher: BATCHER_A, token: SHARED_TOKEN, amount: 0n },
        { batcher: BATCHER_B, token: OTHER_TOKEN, amount: 0n },
      ]);

      const grants = vi
        .mocked(signer.writeContract)
        .mock.calls.filter(([call]) => call.functionName === "setOperator");
      expect(grants).toHaveLength(1);
      expect(grants[0]?.[0]).toMatchObject({
        address: SHARED_TOKEN,
        args: expect.arrayContaining([ROUTER]),
      });
    });

    test("rejects an empty leg set before touching the wallet", async ({ sdk, signer }) => {
      await expect(new VaultRouter(sdk, ROUTER).join([])).rejects.toThrow(ConfigurationError);
      expect(signer.writeContract).not.toHaveBeenCalled();
    });

    test("throws without a configured signer", async ({ createSDK }) => {
      const router = new VaultRouter(createSDK({ signer: undefined }), ROUTER);
      await expect(router.join(LEGS)).rejects.toThrow(SignerNotConfiguredError);
    });

    test("refuses to submit when encryption returns fewer handles than legs", async ({
      sdk,
      provider,
      relayer,
      signer,
    }) => {
      mockReads(provider, { operators: { [SHARED_TOKEN]: true } });
      mockEncryptedLegs(relayer, LEGS.length - 1);

      await expect(new VaultRouter(sdk, ROUTER).join(LEGS)).rejects.toThrow(EncryptionFailedError);
      expect(
        vi.mocked(signer.writeContract).mock.calls.filter(([call]) => call.functionName === "join"),
      ).toHaveLength(0);
    });
  });
});
