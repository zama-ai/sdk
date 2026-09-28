import { getAddress, type Address } from "viem";
import { vi } from "vitest";
import {
  ConfigurationError,
  InsufficientConfidentialBalanceError,
  SignerNotConfiguredError,
} from "../../errors";
import type { ZamaSDKEvent } from "../../events/sdk-events";
import {
  describe,
  expect,
  joinedLog,
  mockEncryptedLegs,
  test,
  VALID_INPUT_PROOF,
} from "../../test-fixtures";
import { Token } from "../../token";
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
    cShare: entry.share,
    batchers: { deposit: history(entry.depositBatcher), redeem: history(entry.redeemBatcher) },
  };
}

const GROUP: VaultGroupConfig = {
  id: "stable",
  cAsset: ASSET,
  vaults: [member(ALPHA), member(BETA)],
  router: ROUTER,
};

const SOLO: VaultGroupConfig = { id: "solo", cAsset: ASSET, vaults: [member(ALPHA)] };

/** What each batcher reports on chain, which a submission checks the config against. */
const BATCHERS: Readonly<Record<Address, { fromToken: Address; vault: Address }>> = {
  [ALPHA.depositBatcher]: { fromToken: ASSET, vault: ALPHA.vault },
  [ALPHA.redeemBatcher]: { fromToken: ALPHA.share, vault: ALPHA.vault },
  [BETA.depositBatcher]: { fromToken: ASSET, vault: BETA.vault },
  [BETA.redeemBatcher]: { fromToken: BETA.share, vault: BETA.vault },
};

/** Every chain read a group submission makes, and the balance it pre-flights. */
function mockReads(
  provider: GenericProvider,
  answers: {
    isTokenListed?: boolean;
    isOperator?: boolean;
    balance?: bigint;
    batchers?: typeof BATCHERS;
  } = {},
) {
  const batchers = answers.batchers ?? BATCHERS;
  vi.mocked(provider.readContract).mockImplementation(async (call: unknown) => {
    const { functionName, address } = call as { functionName: string; address: Address };
    switch (functionName) {
      case "tokenWrapperRegistry":
        return REGISTRY;
      case "isConfidentialTokenValid":
        return answers.isTokenListed ?? true;
      case "isOperator":
        return answers.isOperator ?? true;
      case "fromToken":
        return batchers[address]?.fromToken;
      case "vault":
        return batchers[address]?.vault;
      default:
        throw new Error(`Unexpected read of ${functionName}`);
    }
  });
  vi.spyOn(Token.prototype, "balanceOf").mockResolvedValue(answers.balance ?? 1_000_000n);
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
    expect(group.cAsset).toBe(ASSET);
    expect(group.router?.address).toBe(ROUTER);
  });

  test("a single-vault group needs no router", ({ sdk }) => {
    expect(new VaultGroup(sdk, SOLO).router).toBeUndefined();
  });

  test("refuses a multi-vault group with no router to reach them", ({ sdk }) => {
    expect(() => new VaultGroup(sdk, { ...GROUP, router: undefined })).toThrow(ConfigurationError);
  });

  test("refuses a group above the leg count a submission can carry", ({ sdk }) => {
    const vaults = Array.from({ length: 11 }, (_unused, index) => ({
      ...member(ALPHA),
      id: `vault-${index}`,
      cShare: `0x${index.toString(16).repeat(40)}`.slice(0, 42) as Address,
    }));
    expect(() => new VaultGroup(sdk, { ...GROUP, vaults })).toThrow(ConfigurationError);
  });

  test("refuses duplicate ids and duplicate cShare tokens", ({ sdk }) => {
    expect(() => new VaultGroup(sdk, { ...GROUP, vaults: [member(ALPHA), member(ALPHA)] })).toThrow(
      ConfigurationError,
    );
    expect(
      () =>
        new VaultGroup(sdk, {
          ...GROUP,
          vaults: [member(ALPHA), { ...member(BETA), cShare: ALPHA.share }],
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

  test("a single-vault group joins its batcher directly, encrypting against it", async ({
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

    expect(relayer.encryptValues).toHaveBeenCalledWith(
      expect.objectContaining({ contractAddress: ALPHA.depositBatcher }),
    );
    const joins = writesTo(signer, "join");
    expect(joins).toHaveLength(1);
    expect(joins[0]?.[0]).toMatchObject({
      address: ALPHA.depositBatcher,
      args: [userAddress, handle, VALID_INPUT_PROOF],
    });
    expect(writesTo(signer, "confidentialTransferAndCall")).toHaveLength(0);
  });

  test("refuses to write when a batcher pulls a different token than the config names", async ({
    sdk,
    provider,
    signer,
  }) => {
    mockReads(provider, {
      batchers: {
        ...BATCHERS,
        [BETA.depositBatcher]: { fromToken: BETA.share, vault: BETA.vault },
      },
    });

    await expect(new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n)).rejects.toThrow(
      ConfigurationError,
    );
    expect(signer.writeContract).not.toHaveBeenCalled();
  });

  test("refuses to write when a batcher reports a different vault than the config names", async ({
    sdk,
    provider,
    signer,
  }) => {
    mockReads(provider, {
      batchers: { ...BATCHERS, [ALPHA.depositBatcher]: { fromToken: ASSET, vault: BETA.vault } },
    });

    await expect(new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n)).rejects.toThrow(
      /reports vault/,
    );
    expect(signer.writeContract).not.toHaveBeenCalled();
  });

  test("checks the caller's balance of the asset before writing anything", async ({
    sdk,
    provider,
    signer,
  }) => {
    mockReads(provider, { balance: 999n });

    await expect(new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n)).rejects.toThrow(
      InsufficientConfidentialBalanceError,
    );
    expect(signer.writeContract).not.toHaveBeenCalled();
  });

  test("skipBalanceCheck skips the balance read", async ({
    sdk,
    provider,
    relayer,
    userAddress,
  }) => {
    mockReads(provider, { balance: 0n });
    mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher, BETA.depositBatcher]);

    await new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n, { skipBalanceCheck: true });

    expect(Token.prototype.balanceOf).not.toHaveBeenCalled();
  });

  test("throws without a configured signer", async ({ createSDK }) => {
    const group = new VaultGroup(createSDK({ signer: undefined }), GROUP);
    await expect(group.deposit("alpha", 1_000n)).rejects.toThrow(SignerNotConfiguredError);
  });

  test("emits the transfer to the router as an SDK event tagged with the asset", async ({
    createSDK,
    provider,
    relayer,
    userAddress,
    events,
  }) => {
    const received: ZamaSDKEvent[] = [];
    const sdk = createSDK({ onEvent: (event) => received.push(event) });
    mockReads(provider);
    mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher, BETA.depositBatcher]);

    await new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n);

    expect(received).toContainEqual(
      expect.objectContaining({ type: events.TransferSubmitted, tokenAddress: ASSET }),
    );
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

    const joins = writesTo(signer, "join");
    expect(joins.map(([call]) => call.address)).toStrictEqual([
      ALPHA.depositBatcher,
      BETA.depositBatcher,
    ]);
    expect(writesTo(signer, "confidentialTransferAndCall")).toHaveLength(0);
    // Same values, same order, whichever way they were packaged — but each
    // encrypted against the batcher that verifies it.
    expect(
      vi
        .mocked(relayer.encryptValues)
        .mock.calls.map(([call]) => [call.contractAddress, call.values[0]?.value]),
    ).toStrictEqual([
      [ALPHA.depositBatcher, 0n],
      [BETA.depositBatcher, 1_000n],
    ]);
  });

  test('"direct" grants each batcher operator on its leg\'s token where missing', async ({
    sdk,
    provider,
    relayer,
    signer,
    userAddress,
  }) => {
    mockReads(provider, { isOperator: false });
    mockEncryptedLegs(relayer, 1);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher, BETA.depositBatcher]);

    await new VaultGroup(sdk, GROUP).deposit("beta", 1_000n, {
      strategy: "direct",
      operatorUntil: 1_800_000_000,
    });

    const grants = writesTo(signer, "setOperator");
    expect(grants.map(([call]) => [call.address, call.args?.[0], call.args?.[1]])).toStrictEqual([
      [ASSET, ALPHA.depositBatcher, 1_800_000_000],
      [ASSET, BETA.depositBatcher, 1_800_000_000],
    ]);
  });

  test('"direct" emits one vault join event per batcher', async ({
    createSDK,
    provider,
    relayer,
    userAddress,
    events,
  }) => {
    const received: ZamaSDKEvent[] = [];
    const sdk = createSDK({ onEvent: (event) => received.push(event) });
    mockReads(provider);
    mockEncryptedLegs(relayer, 1);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher, BETA.depositBatcher]);

    await new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n, { strategy: "direct" });

    const joins = received.filter((event) => event.type === events.VaultSubmitted);
    expect(joins.map((event) => event.tokenAddress)).toStrictEqual([
      ALPHA.depositBatcher,
      BETA.depositBatcher,
    ]);
    expect(
      joins.every((event) => "vaultOperation" in event && event.vaultOperation === "join"),
    ).toBe(true);
  });

  test('"router" on a group that has none is refused', async ({ sdk, provider }) => {
    mockReads(provider);
    await expect(
      new VaultGroup(sdk, SOLO).deposit("alpha", 1_000n, { strategy: "router" }),
    ).rejects.toThrow(ConfigurationError);
  });
});

describe("VaultGroup redeem", () => {
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

    await new VaultGroup(sdk, GROUP).redeem("alpha", 500n);

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

    await new VaultGroup(sdk, GROUP).redeem("alpha", 500n, { strategy: "direct" });

    expect(
      vi.mocked(relayer.encryptValues).mock.calls.map(([call]) => call.contractAddress),
    ).toStrictEqual([ALPHA.redeemBatcher, BETA.redeemBatcher]);
  });

  test("checks the caller's balance of the chosen member's shares", async ({
    sdk,
    provider,
    signer,
  }) => {
    mockReads(provider, { balance: 499n });
    const balanceOf = vi.spyOn(Token.prototype, "balanceOf").mockResolvedValue(499n);

    await expect(new VaultGroup(sdk, GROUP).redeem("beta", 500n)).rejects.toThrow(
      InsufficientConfidentialBalanceError,
    );
    expect(balanceOf.mock.instances[0]).toMatchObject({ address: BETA.share });
    expect(signer.writeContract).not.toHaveBeenCalled();
  });

  test("emits the router join as an SDK event tagged with the router", async ({
    createSDK,
    provider,
    relayer,
    userAddress,
    events,
  }) => {
    const received: ZamaSDKEvent[] = [];
    const sdk = createSDK({ onEvent: (event) => received.push(event) });
    mockReads(provider);
    mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.redeemBatcher, BETA.redeemBatcher]);

    await new VaultGroup(sdk, GROUP).redeem("alpha", 500n);

    expect(received).toContainEqual(
      expect.objectContaining({
        type: events.VaultSubmitted,
        vaultOperation: "routerJoin",
        tokenAddress: ROUTER,
      }),
    );
  });
});
