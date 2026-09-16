import { getAddress, type Address } from "viem";
import { vi } from "vitest";
import { ConfigurationError } from "../../errors";
import {
  describe,
  expect,
  joinedLog,
  mockEncryptedLegs,
  test,
  VALID_INPUT_PROOF,
} from "../../test-fixtures";
import type { GenericProvider, GenericSigner } from "../../types";
import type { BatcherHistory } from "../batcher-history";
import { VaultGroup, type VaultGroupConfig } from "../vault-group";

const ROUTER = getAddress("0x4444444444444444444444444444444444444444");
const REGISTRY = getAddress("0x5555555555555555555555555555555555555555");
const ASSET = getAddress("0x2222222222222222222222222222222222222222");

const ALPHA = {
  id: "alpha",
  vault: getAddress("0x1010101010101010101010101010101010101010"),
  share: getAddress("0x1111111111111111111111111111111111111111"),
  depositBatcher: getAddress("0xAaaAaAAaAaAAaAaAAaaAaaAaAaAAaAaAaAAAAaaA"),
  redeemBatcher: getAddress("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"),
};
const BETA = {
  id: "beta",
  vault: getAddress("0x3030303030303030303030303030303030303030"),
  share: getAddress("0x3333333333333333333333333333333333333333"),
  depositBatcher: getAddress("0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"),
  redeemBatcher: getAddress("0xdDdDddDdDdddDDddDdDdDDDDdDdDDdDDdDDDDDDd"),
};

function history(latest: Address): BatcherHistory {
  return { retired: [], latest };
}

function member(entry: typeof ALPHA) {
  return {
    id: entry.id,
    vault: entry.vault,
    share: entry.share,
    batchers: { deposit: history(entry.depositBatcher), redeem: history(entry.redeemBatcher) },
  };
}

const GROUP: VaultGroupConfig = {
  id: "stable",
  asset: ASSET,
  vaults: [member(ALPHA), member(BETA)],
  router: ROUTER,
};

const SOLO: VaultGroupConfig = { id: "solo", asset: ASSET, vaults: [member(ALPHA)] };

/** Every chain read a group submission makes. */
function mockReads(provider: GenericProvider, answers: { isTokenListed?: boolean } = {}) {
  vi.mocked(provider.readContract).mockImplementation(async (call: unknown) => {
    const { functionName } = call as { functionName: string };
    switch (functionName) {
      case "tokenWrapperRegistry":
        return REGISTRY;
      case "isConfidentialTokenValid":
        return answers.isTokenListed ?? true;
      case "isOperator":
        return true;
      default:
        throw new Error(`Unexpected read of ${functionName}`);
    }
  });
}

/** Every batcher reports a join, so a submission can read its batch ids back. */
function mockReceipts(provider: GenericProvider, account: Address, batchers: readonly Address[]) {
  vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
    logs: batchers.map((batcher) => joinedLog({ batcher, account, batchId: 7n })),
  });
}

function writesTo(signer: GenericSigner, functionName: string) {
  return vi
    .mocked(signer.writeContract)
    .mock.calls.filter(([call]) => call.functionName === functionName);
}

describe("VaultGroup construction", () => {
  test("checksums and keeps the members in the declared leg order", ({ sdk }) => {
    const group = new VaultGroup(sdk, GROUP);
    expect(group.vaults.map((entry) => entry.id)).toStrictEqual(["alpha", "beta"]);
    expect(group.asset).toBe(ASSET);
    expect(group.router?.address).toBe(ROUTER);
  });

  test("a single-vault group needs no router", ({ sdk }) => {
    expect(new VaultGroup(sdk, SOLO).router).toBeUndefined();
  });

  test("refuses a multi-vault group with no router to reach them", ({ sdk }) => {
    expect(() => new VaultGroup(sdk, { ...GROUP, router: undefined })).toThrow(ConfigurationError);
  });

  test("refuses a group above the leg count a submission can carry", ({ sdk }) => {
    const vaults = Array.from({ length: 9 }, (_unused, index) => ({
      ...member(ALPHA),
      id: `vault-${index}`,
      share: `0x${index.toString(16).repeat(40)}`.slice(0, 42) as Address,
    }));
    expect(() => new VaultGroup(sdk, { ...GROUP, vaults })).toThrow(ConfigurationError);
  });

  test("refuses duplicate ids and duplicate share tokens", ({ sdk }) => {
    expect(() => new VaultGroup(sdk, { ...GROUP, vaults: [member(ALPHA), member(ALPHA)] })).toThrow(
      ConfigurationError,
    );
    expect(
      () =>
        new VaultGroup(sdk, {
          ...GROUP,
          vaults: [member(ALPHA), { ...member(BETA), share: ALPHA.share }],
        }),
    ).toThrow(ConfigurationError);
  });

  test("refuses an empty group", ({ sdk }) => {
    expect(() => new VaultGroup(sdk, { ...GROUP, vaults: [] })).toThrow(ConfigurationError);
  });

  test("member() rejects an id the group does not name", ({ sdk }) => {
    expect(() => new VaultGroup(sdk, GROUP).member("gamma")).toThrow(ConfigurationError);
  });
});

describe("VaultGroup deposit", () => {
  test("gives every member a leg and the amount to only the chosen one", async ({
    sdk,
    provider,
    relayer,
    userAddress,
  }) => {
    mockReads(provider);
    mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher, BETA.depositBatcher]);

    await new VaultGroup(sdk, GROUP).deposit("beta", 1_000n);

    // The allocation is the second encrypt; the first covers the transfer total.
    expect(relayer.encryptValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: ROUTER,
        values: [
          { value: 0n, type: "euint64" },
          { value: 1_000n, type: "euint64" },
        ],
      }),
    );
  });

  test("moves the sum of the legs, so the router has nothing to sweep back", async ({
    sdk,
    provider,
    relayer,
    userAddress,
  }) => {
    mockReads(provider);
    mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher, BETA.depositBatcher]);

    await new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n);

    expect(relayer.encryptValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: ASSET,
        values: [{ value: 1_000n, type: "euint64" }],
      }),
    );
  });

  test("sends one transfer of the asset to the router, carrying the allocation", async ({
    sdk,
    provider,
    relayer,
    signer,
    userAddress,
  }) => {
    mockReads(provider);
    mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher, BETA.depositBatcher]);

    const result = await new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n);

    const transfers = writesTo(signer, "confidentialTransferAndCall");
    expect(transfers).toHaveLength(1);
    expect(transfers[0]?.[0]).toMatchObject({ address: ASSET, args: expect.any(Array) });
    expect(transfers[0]?.[0].args?.[0]).toBe(ROUTER);
    expect(transfers[0]?.[0].args?.[3]).not.toBe("0x");
    expect(result.transactions).toHaveLength(1);
  });

  test("reads a batch id back for every leg, decoys included", async ({
    sdk,
    provider,
    relayer,
    userAddress,
  }) => {
    mockReads(provider);
    mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher, BETA.depositBatcher]);

    const result = await new VaultGroup(sdk, GROUP).deposit("beta", 1_000n);

    expect(result.vaultId).toBe("beta");
    expect(result.joins).toStrictEqual([
      expect.objectContaining({ vaultId: "alpha", batcher: ALPHA.depositBatcher, batchId: 7n }),
      expect.objectContaining({ vaultId: "beta", batcher: BETA.depositBatcher, batchId: 7n }),
    ]);
  });

  test("fails before submitting when the router's registry does not list the asset", async ({
    sdk,
    provider,
    signer,
  }) => {
    mockReads(provider, { isTokenListed: false });

    await expect(new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n)).rejects.toThrow(
      /does not list/,
    );
    expect(signer.writeContract).not.toHaveBeenCalled();
  });

  test("a single-vault group transfers straight to its batcher", async ({
    sdk,
    provider,
    relayer,
    signer,
    userAddress,
  }) => {
    mockReads(provider);
    const [handle] = mockEncryptedLegs(relayer, 1);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher]);

    await new VaultGroup(sdk, SOLO).deposit("alpha", 1_000n);

    const transfers = writesTo(signer, "confidentialTransferAndCall");
    expect(transfers).toHaveLength(1);
    expect(transfers[0]?.[0].args).toStrictEqual([
      ALPHA.depositBatcher,
      handle,
      VALID_INPUT_PROOF,
      "0x",
    ]);
  });
});

describe("VaultGroup strategy", () => {
  test('"direct" changes the packaging and nothing about the legs', async ({
    sdk,
    provider,
    relayer,
    signer,
    userAddress,
  }) => {
    mockReads(provider);
    mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher, BETA.depositBatcher]);

    await new VaultGroup(sdk, GROUP).deposit("beta", 1_000n, { strategy: "direct" });

    const transfers = writesTo(signer, "confidentialTransferAndCall");
    expect(transfers.map(([call]) => call.args?.[0])).toStrictEqual([
      ALPHA.depositBatcher,
      BETA.depositBatcher,
    ]);
    // Same values, same order, whichever way they were packaged.
    expect(relayer.encryptValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: ASSET,
        values: [
          { value: 0n, type: "euint64" },
          { value: 1_000n, type: "euint64" },
        ],
      }),
    );
  });

  test('"router" on a group that has none is refused', async ({ sdk, provider }) => {
    mockReads(provider);
    await expect(
      new VaultGroup(sdk, SOLO).deposit("alpha", 1_000n, { strategy: "router" }),
    ).rejects.toThrow(ConfigurationError);
  });
});

describe("VaultGroup requestWithdrawal", () => {
  test("hands the legs to the router, each spending its own share token", async ({
    sdk,
    provider,
    relayer,
    signer,
    userAddress,
  }) => {
    mockReads(provider);
    mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.redeemBatcher, BETA.redeemBatcher]);

    await new VaultGroup(sdk, GROUP).requestWithdrawal("alpha", 500n);

    const joins = writesTo(signer, "join");
    expect(joins).toHaveLength(1);
    expect(joins[0]?.[0].args?.[0]).toStrictEqual([
      expect.objectContaining({ batcher: ALPHA.redeemBatcher, token: ALPHA.share }),
      expect.objectContaining({ batcher: BETA.redeemBatcher, token: BETA.share }),
    ]);
  });

  test("encrypts once per leg on the direct path, each against its own share token", async ({
    sdk,
    provider,
    relayer,
    userAddress,
  }) => {
    mockReads(provider);
    mockEncryptedLegs(relayer, 1);
    mockReceipts(provider, userAddress, [ALPHA.redeemBatcher, BETA.redeemBatcher]);

    await new VaultGroup(sdk, GROUP).requestWithdrawal("alpha", 500n, { strategy: "direct" });

    expect(
      vi.mocked(relayer.encryptValues).mock.calls.map(([call]) => call.contractAddress),
    ).toStrictEqual([ALPHA.share, BETA.share]);
  });
});
