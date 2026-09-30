import { decodeAbiParameters, getAbiItem, getAddress, type Address, type Hex } from "viem";
import { vi } from "vitest";
import {
  ConfigurationError,
  InsufficientConfidentialBalanceError,
  SignerNotConfiguredError,
  TransactionRevertedError,
  UnlistedConfidentialTokenError,
  VaultBatcherPausedError,
} from "../../errors";
import type { ZamaSDKEvent } from "../../events/sdk-events";
import type { RelayerSDK } from "../../relayer/types";
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
import { vaultRouterAbi } from "../abi/vault-router.abi";
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

function member(entry: typeof ALPHA) {
  return {
    id: entry.id,
    vault: entry.vault,
    cShare: entry.share,
    batchers: { deposit: entry.depositBatcher, redeem: entry.redeemBatcher },
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
    /** Per token: whether the operator the read asks about is already granted. Defaults to `true`. */
    operators?: Readonly<Record<Address, boolean>>;
    paused?: readonly Address[];
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
        return answers.operators?.[getAddress(address)] ?? true;
      case "paused":
        return answers.paused?.includes(getAddress(address)) ?? false;
      case "fromToken":
        return batchers[getAddress(address)]?.fromToken;
      case "vault":
        return batchers[getAddress(address)]?.vault;
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

const ASSET_PROOF = `0x${"a1".repeat(64)}` as Hex;
const ROUTER_PROOF = `0x${"b2".repeat(64)}` as Hex;
const TOTAL_VALUE = `0x${"01".repeat(32)}` as Hex;
const LEG_VALUES = [`0x${"02".repeat(32)}`, `0x${"03".repeat(32)}`] as const;

/**
 * A deposit encrypts twice, once against the asset and once against the
 * router. Each gets its own proof so a test can tell them apart in the call.
 */
function mockDepositEncryptions(relayer: RelayerSDK) {
  vi.mocked(relayer.encryptValues).mockImplementation(async (params: unknown) => {
    const { contractAddress } = params as { contractAddress: Address };
    return (getAddress(contractAddress) === ROUTER
      ? { encryptedValues: [...LEG_VALUES], inputProof: ROUTER_PROOF }
      : { encryptedValues: [TOTAL_VALUE], inputProof: ASSET_PROOF }) as unknown as Awaited<
      ReturnType<RelayerSDK["encryptValues"]>
    >;
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
  });

  test("a single-vault group needs no router", ({ sdk }) => {
    expect(() => new VaultGroup(sdk, SOLO)).not.toThrow();
  });

  test("refuses a multi-vault group with no router to reach them", ({ sdk }) => {
    expect(() => new VaultGroup(sdk, { ...GROUP, router: undefined })).toThrow(ConfigurationError);
  });

  test("refuses a group above the leg count a submission can carry", ({ sdk }) => {
    const vaults = Array.from({ length: 11 }, (_unused, index) => ({
      ...member(ALPHA),
      id: `vault-${index}`,
      vault: `0x${(index + 1).toString(16).padStart(2, "0").repeat(20)}` as Address,
      cShare: `0x${(index + 21).toString(16).padStart(2, "0").repeat(20)}` as Address,
      batchers: {
        deposit: `0x${(index + 41).toString(16).padStart(2, "0").repeat(20)}` as Address,
        redeem: `0x${(index + 61).toString(16).padStart(2, "0").repeat(20)}` as Address,
      },
    }));
    expect(() => new VaultGroup(sdk, { ...GROUP, vaults })).toThrow(ConfigurationError);
  });

  test("refuses duplicate ids and duplicate cShare tokens", ({ sdk }) => {
    expect(
      () =>
        new VaultGroup(sdk, {
          ...GROUP,
          vaults: [member(ALPHA), { ...member(BETA), id: ALPHA.id }],
        }),
    ).toThrow(/"alpha" twice/);
    expect(
      () =>
        new VaultGroup(sdk, {
          ...GROUP,
          vaults: [member(ALPHA), { ...member(BETA), cShare: ALPHA.share }],
        }),
    ).toThrow(/cShare of more than one vault/);
  });

  test("matches ids exactly, so two ids that differ only in case are distinct", ({ sdk }) => {
    const group = new VaultGroup(sdk, {
      ...GROUP,
      vaults: [member(ALPHA), { ...member(BETA), id: "Alpha" }],
    });
    expect(group.member("Alpha").vault).toBe(BETA.vault);
  });

  test("refuses two members that share a vault, however their addresses are cased", ({ sdk }) => {
    expect(
      () =>
        new VaultGroup(sdk, {
          ...GROUP,
          vaults: [member(ALPHA), { ...member(BETA), vault: ALPHA.vault.toLowerCase() as Address }],
        }),
    ).toThrow(/vault of more than one member/);
  });

  test("refuses a batcher named by two members, or for both directions of one", ({ sdk }) => {
    expect(
      () =>
        new VaultGroup(sdk, {
          ...GROUP,
          vaults: [
            member(ALPHA),
            {
              ...member(BETA),
              batchers: { ...member(BETA).batchers, deposit: ALPHA.depositBatcher },
            },
          ],
        }),
    ).toThrow(/batcher .* more than once/);
    expect(
      () =>
        new VaultGroup(sdk, {
          ...SOLO,
          vaults: [
            {
              ...member(ALPHA),
              batchers: { deposit: ALPHA.depositBatcher, redeem: ALPHA.depositBatcher },
            },
          ],
        }),
    ).toThrow(/batcher .* more than once/);
  });

  test("refuses an empty group", ({ sdk }) => {
    expect(() => new VaultGroup(sdk, { ...GROUP, vaults: [] })).toThrow(ConfigurationError);
  });

  test("member() rejects an id the group does not name", ({ sdk }) => {
    expect(() => new VaultGroup(sdk, GROUP).member("gamma")).toThrow(ConfigurationError);
  });
});

describe("VaultGroup isAssetListed", () => {
  test("asks the router's registry about the asset", async ({ sdk, provider }) => {
    mockReads(provider, { isTokenListed: false });
    await expect(new VaultGroup(sdk, GROUP).isAssetListed()).resolves.toBe(false);
  });

  test("reads the registry address once across calls", async ({ sdk, provider }) => {
    mockReads(provider);
    const group = new VaultGroup(sdk, GROUP);

    await group.isAssetListed();
    await group.isAssetListed();

    const registryReads = vi
      .mocked(provider.readContract)
      .mock.calls.filter(([call]) => call.functionName === "tokenWrapperRegistry");
    expect(registryReads).toHaveLength(1);
  });

  test("is true for a single-vault group without asking, even one configured with a router", async ({
    sdk,
    provider,
  }) => {
    mockReads(provider, { isTokenListed: false });

    await expect(new VaultGroup(sdk, SOLO).isAssetListed()).resolves.toBe(true);
    await expect(new VaultGroup(sdk, { ...SOLO, router: ROUTER }).isAssetListed()).resolves.toBe(
      true,
    );
    expect(provider.readContract).not.toHaveBeenCalled();
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
        userAddress,
        values: [
          { value: 0n, type: "euint64" },
          { value: 1_000n, type: "euint64" },
        ],
      }),
    );
  });

  test("sends one transfer of the amount to the router, carrying the router-bound allocation", async ({
    sdk,
    provider,
    relayer,
    signer,
    userAddress,
  }) => {
    mockReads(provider);
    mockDepositEncryptions(relayer);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher, BETA.depositBatcher]);

    const result = await new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n);

    expect(relayer.encryptValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: ASSET,
        userAddress,
        values: [{ value: 1_000n, type: "euint64" }],
      }),
    );
    const transfers = writesTo(signer, "confidentialTransferAndCall");
    expect(transfers).toHaveLength(1);
    const [call] = transfers[0] ?? [];
    if (!call) {
      throw new Error("No transfer was written");
    }
    expect(call).toMatchObject({ address: ASSET });
    const [to, total, proof, data] = call.args as unknown as [Address, Hex, Hex, Hex];
    expect(to).toBe(ROUTER);
    expect(total).toBe(TOTAL_VALUE);
    expect(proof).toBe(ASSET_PROOF);
    const [legs, allocationProof] = decodeAbiParameters(
      getAbiItem({ abi: vaultRouterAbi, name: "join" }).inputs,
      data,
    );
    expect(legs).toStrictEqual([
      { batcher: ALPHA.depositBatcher, token: ASSET, amount: LEG_VALUES[0] },
      { batcher: BETA.depositBatcher, token: ASSET, amount: LEG_VALUES[1] },
    ]);
    expect(allocationProof).toBe(ROUTER_PROOF);
    expect(result.txHash).toBeDefined();
    expect(writesTo(signer, "setOperator")).toHaveLength(0);
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

  test("fails after the transaction if a leg's batcher reported no join", async ({
    sdk,
    provider,
    relayer,
    userAddress,
  }) => {
    mockReads(provider);
    mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher]);

    await expect(new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n)).rejects.toThrow(
      TransactionRevertedError,
    );
    await expect(new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n)).rejects.toThrow(/"beta"/);
  });

  test("fails before submitting when the router's registry does not list the asset", async ({
    sdk,
    provider,
    signer,
  }) => {
    mockReads(provider, { isTokenListed: false });

    await expect(new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n)).rejects.toThrow(
      UnlistedConfidentialTokenError,
    );
    await expect(new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n)).rejects.toMatchObject({
      token: ASSET,
      registry: REGISTRY,
    });
    expect(signer.writeContract).not.toHaveBeenCalled();
  });

  test("fails before submitting when any member's batcher is paused, naming it", async ({
    sdk,
    provider,
    signer,
  }) => {
    mockReads(provider, { paused: [BETA.depositBatcher] });

    const attempt = new VaultGroup(sdk, GROUP).deposit("alpha", 1_000n);
    await expect(attempt).rejects.toThrow(VaultBatcherPausedError);
    await expect(attempt).rejects.toMatchObject({ batcher: BETA.depositBatcher, vaultId: "beta" });
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
    const [value] = mockEncryptedLegs(relayer, 1);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher]);

    await new VaultGroup(sdk, SOLO).deposit("alpha", 1_000n);

    expect(relayer.encryptValues).toHaveBeenCalledWith(
      expect.objectContaining({ contractAddress: ALPHA.depositBatcher }),
    );
    const joins = writesTo(signer, "join");
    expect(joins).toHaveLength(1);
    expect(joins[0]?.[0]).toMatchObject({
      address: ALPHA.depositBatcher,
      args: [userAddress, value, VALID_INPUT_PROOF],
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

  test("emits the push through the router as a routerJoin event tagged with the router", async ({
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
      expect.objectContaining({
        type: events.VaultSubmitted,
        vaultOperation: "routerJoin",
        tokenAddress: ROUTER,
      }),
    );
    expect(received).not.toContainEqual(
      expect.objectContaining({ type: events.TransferSubmitted }),
    );
  });
});

describe("VaultGroup single-vault join", () => {
  test("grants the batcher operator on the asset where missing", async ({
    sdk,
    provider,
    relayer,
    signer,
    userAddress,
  }) => {
    mockReads(provider, { operators: { [ASSET]: false } });
    mockEncryptedLegs(relayer, 1);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher]);

    await new VaultGroup(sdk, SOLO).deposit("alpha", 1_000n, { operatorUntil: 1_800_000_000 });

    const grants = writesTo(signer, "setOperator");
    expect(grants.map(([call]) => [call.address, call.args?.[0], call.args?.[1]])).toStrictEqual([
      [ASSET, ALPHA.depositBatcher, 1_800_000_000],
    ]);
  });

  test("ignores a configured router and emits a plain join tagged with the batcher", async ({
    createSDK,
    provider,
    relayer,
    signer,
    userAddress,
    events,
  }) => {
    const received: ZamaSDKEvent[] = [];
    const sdk = createSDK({ onEvent: (event) => received.push(event) });
    mockReads(provider);
    mockEncryptedLegs(relayer, 1);
    mockReceipts(provider, userAddress, [ALPHA.depositBatcher]);

    await new VaultGroup(sdk, { ...SOLO, router: ROUTER }).deposit("alpha", 1_000n);

    expect(writesTo(signer, "join")).toHaveLength(1);
    expect(writesTo(signer, "confidentialTransferAndCall")).toHaveLength(0);
    expect(received).toContainEqual(
      expect.objectContaining({
        type: events.VaultSubmitted,
        vaultOperation: "join",
        tokenAddress: ALPHA.depositBatcher,
      }),
    );
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
    const [valueA, valueB] = mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.redeemBatcher, BETA.redeemBatcher]);

    await new VaultGroup(sdk, GROUP).redeem("alpha", 500n);

    expect(relayer.encryptValues).toHaveBeenCalledWith(
      expect.objectContaining({
        contractAddress: ROUTER,
        userAddress,
        values: [
          { value: 500n, type: "euint64" },
          { value: 0n, type: "euint64" },
        ],
      }),
    );
    const joins = writesTo(signer, "join");
    expect(joins).toHaveLength(1);
    expect(joins[0]?.[0]).toMatchObject({
      address: ROUTER,
      args: [
        [
          { batcher: ALPHA.redeemBatcher, token: ALPHA.share, amount: valueA },
          { batcher: BETA.redeemBatcher, token: BETA.share, amount: valueB },
        ],
        VALID_INPUT_PROOF,
      ],
    });
  });

  test("grants the router operator on every share token that lacks one, then joins", async ({
    sdk,
    provider,
    relayer,
    signer,
    userAddress,
  }) => {
    mockReads(provider, { operators: { [ALPHA.share]: true, [BETA.share]: false } });
    mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.redeemBatcher, BETA.redeemBatcher]);

    await new VaultGroup(sdk, GROUP).redeem("alpha", 500n, { operatorUntil: 1_800_000_000 });

    const grants = writesTo(signer, "setOperator");
    expect(grants.map(([call]) => [call.address, call.args?.[0], call.args?.[1]])).toStrictEqual([
      [BETA.share, ROUTER, 1_800_000_000],
    ]);
    const writes = vi.mocked(signer.writeContract).mock.calls.map(([call]) => call.functionName);
    expect(writes.indexOf("setOperator")).toBeLessThan(writes.indexOf("join"));
  });

  test("submits nothing when a grant is rejected partway through", async ({
    sdk,
    provider,
    relayer,
    signer,
    userAddress,
  }) => {
    mockReads(provider, { operators: { [ALPHA.share]: false, [BETA.share]: false } });
    mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.redeemBatcher, BETA.redeemBatcher]);
    const writeContract = vi.mocked(signer.writeContract);
    const submit = writeContract.getMockImplementation();
    writeContract.mockImplementation(async (call, ...rest) => {
      if (call.functionName === "setOperator" && getAddress(call.address) === BETA.share) {
        throw new Error("User rejected the request");
      }
      return submit ? submit(call, ...rest) : (`0x${"11".repeat(32)}` as Hex);
    });

    await expect(new VaultGroup(sdk, GROUP).redeem("alpha", 500n)).rejects.toThrow();

    expect(writesTo(signer, "setOperator")).toHaveLength(2);
    expect(writesTo(signer, "join")).toHaveLength(0);
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

  test("does not ask the registry: only a pushed deposit is gated on the listing", async ({
    sdk,
    provider,
    relayer,
    userAddress,
  }) => {
    mockReads(provider, { isTokenListed: false });
    mockEncryptedLegs(relayer, 2);
    mockReceipts(provider, userAddress, [ALPHA.redeemBatcher, BETA.redeemBatcher]);

    await expect(new VaultGroup(sdk, GROUP).redeem("alpha", 500n)).resolves.toBeDefined();
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
