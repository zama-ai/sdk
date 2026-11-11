import { decodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { vi } from "vitest";
import { confidentialWrapperAbi } from "../../abi/confidential-wrapper.abi";
import {
  ConfigurationError,
  InsufficientConfidentialBalanceError,
  UnlistedConfidentialTokenError,
  VaultBatcherPausedError,
  type VaultBatchNotDispatchedError,
  type VaultJoinUnconfirmedError,
} from "../../errors";
import type { RelayerSDK } from "../../relayer/types";
import { USER } from "../../test-fixtures/constants";
import { describe, expect, joinedLog, test, VALID_INPUT_PROOF } from "../../test-fixtures";
import { Token } from "../../token";
import type { GenericProvider } from "../../types";
import { vaultBatcherAbi } from "../abi/vault-batcher.abi";
import { vaultRouterAbi } from "../abi/vault-router.abi";
import { createVaultClient } from "../client";
import { defineVaultGroup, MAX_GROUP_VAULTS } from "../config";
import type { VaultCall } from "../types";

// Every fixture address has hex letters, so a missing `getAddress` shows up as a casing mismatch.
const ROUTER = getAddress("0x4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e");
const REGISTRY = getAddress("0x5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f5f");
const ASSET = getAddress("0x2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a");
const FRIEND = getAddress("0x6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a");
const ALPHA = {
  vault: getAddress("0x1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b"),
  share: getAddress("0x1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c"),
  depositBatcher: getAddress("0xAaaAaAAaAaAAaAaAAaaAaaAaAaAAaAaAaAAAAaaA"),
  redeemBatcher: getAddress("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"),
};
const BETA = {
  vault: getAddress("0x3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d3d"),
  share: getAddress("0x3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e"),
  depositBatcher: getAddress("0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"),
  redeemBatcher: getAddress("0xdDdDddDdDdddDDddDdDdDDDDdDdDDdDDdDDDDDDd"),
};
// Alpha's deposit batcher was upgraded: the retired one takes joins up to a batch id.
const RETIRED_ALPHA_DEPOSIT = getAddress("0x7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a");

const CHAIN_ID = 31337;
const NOW = 1_000_000n;
const YEAR = 365n * 24n * 60n * 60n;

function vault(entry: typeof ALPHA, id: string) {
  return {
    id,
    batchers: { deposit: entry.depositBatcher, redeem: entry.redeemBatcher },
    share: entry.share,
  };
}

const STABLE = defineVaultGroup({
  id: "stable",
  chainId: CHAIN_ID,
  asset: ASSET,
  router: ROUTER,
  vaults: [vault(ALPHA, "alpha"), vault(BETA, "beta")],
});

const SOLO = defineVaultGroup({
  id: "solo",
  chainId: CHAIN_ID,
  asset: ASSET,
  vaults: [vault(ALPHA, "main")],
});

function upgraded(lastBatchId: bigint) {
  return defineVaultGroup({
    ...STABLE,
    vaults: [
      {
        ...vault(ALPHA, "alpha"),
        batchers: {
          deposit: {
            retired: [{ address: RETIRED_ALPHA_DEPOSIT, lastBatchId }],
            latest: ALPHA.depositBatcher,
          },
          redeem: ALPHA.redeemBatcher,
        },
      },
      vault(BETA, "beta"),
    ],
  });
}

interface BatchFacts {
  state?: number;
  createdAt?: bigint;
  minAge?: bigint;
  dispatchedAt?: bigint;
  deadline?: bigint;
  deposit?: Hex;
}

/** What each batcher reports, and the batches a read asks about. Every batcher's current batch is 7. */
function mockChain(
  provider: GenericProvider,
  answers: {
    paused?: readonly Address[];
    listed?: boolean;
    operators?: boolean;
    batches?: Readonly<Record<Address, BatchFacts>>;
    balance?: bigint;
  } = {},
) {
  const reports: Record<Address, { fromToken: Address; toToken: Address; vault: Address }> = {
    [ALPHA.depositBatcher]: { fromToken: ASSET, toToken: ALPHA.share, vault: ALPHA.vault },
    [ALPHA.redeemBatcher]: { fromToken: ALPHA.share, toToken: ASSET, vault: ALPHA.vault },
    [BETA.depositBatcher]: { fromToken: ASSET, toToken: BETA.share, vault: BETA.vault },
    [BETA.redeemBatcher]: { fromToken: BETA.share, toToken: ASSET, vault: BETA.vault },
    [RETIRED_ALPHA_DEPOSIT]: { fromToken: ASSET, toToken: ALPHA.share, vault: ALPHA.vault },
  };
  vi.mocked(provider.getBlockTimestamp).mockResolvedValue(NOW);
  vi.mocked(provider.readContract).mockImplementation(async (call: unknown) => {
    const { functionName, address } = call as { functionName: string; address: Address };
    const batcher = getAddress(address);
    const batch = answers.batches?.[batcher];
    switch (functionName) {
      case "tokenWrapperRegistry":
        return REGISTRY;
      case "isConfidentialTokenValid":
        return answers.listed ?? true;
      case "isOperator":
        return answers.operators ?? true;
      case "paused":
        return answers.paused?.includes(batcher) ?? false;
      case "fromToken":
      case "toToken":
      case "vault":
        return reports[batcher]?.[functionName];
      case "batchState":
        return batch?.state ?? 0;
      case "batchCreatedAt":
        return batch?.createdAt ?? NOW - 10n;
      case "batchMinBatchAge":
        return batch?.minAge ?? 100n;
      case "batchDispatchedAt":
        return batch?.dispatchedAt ?? 0n;
      case "batchCallbackDeadline":
        return batch?.deadline ?? 3600n;
      case "exchangeRate":
        return 2n;
      case "exchangeRateDecimals":
        return 0;
      case "deposits":
        return batch?.deposit ?? `0x${"ab".repeat(32)}`;
      case "currentBatchId":
        return 7n;
      case "unwrapRequestId":
        return `0x${"cd".repeat(32)}`;
      case "unwrapAmount":
        return `0x${"ef".repeat(32)}`;
      default:
        throw new Error(`Unexpected read of ${functionName}`);
    }
  });
  vi.spyOn(Token, "batchBalancesOf").mockImplementation(async (tokens) => ({
    results: new Map(tokens.map(({ address }) => [address, answers.balance ?? 1_000_000n])),
    errors: new Map(),
  }));
}

function mockEncryption(relayer: RelayerSDK) {
  vi.mocked(relayer.encryptValues).mockImplementation(
    async (params: unknown) =>
      ({
        encryptedValues: (params as { values: unknown[] }).values.map(
          (_value, index) => `0x${(index + 1).toString(16).padStart(2, "0").repeat(32)}`,
        ),
        inputProof: VALID_INPUT_PROOF,
      }) as unknown as Awaited<ReturnType<RelayerSDK["encryptValues"]>>,
  );
}

function decode(call: { data: Hex }) {
  for (const abi of [confidentialWrapperAbi, vaultBatcherAbi, vaultRouterAbi]) {
    try {
      return decodeFunctionData({ abi, data: call.data });
    } catch {}
  }
  throw new Error("Undecodable call");
}

const roles = (calls: readonly VaultCall[]) => calls.map((call) => call.role);

describe("defineVaultGroup", () => {
  test("refuses a group with no vault", () => {
    expect(() => defineVaultGroup({ ...STABLE, vaults: [] })).toThrow(ConfigurationError);
  });

  test("refuses more than MAX_GROUP_VAULTS vaults", () => {
    const vaults = Array.from({ length: MAX_GROUP_VAULTS + 1 }, (_unused, index) => ({
      id: `v${index}`,
      batchers: {
        deposit: `0x${(index + 16).toString(16).repeat(20)}` as Address,
        redeem: `0x${(index + 48).toString(16).repeat(20)}` as Address,
      },
      share: ALPHA.share,
    }));
    expect(() => defineVaultGroup({ ...STABLE, vaults })).toThrow(/more than 8/);
  });

  test("refuses a vault id twice", () => {
    expect(() =>
      defineVaultGroup({ ...STABLE, vaults: [vault(ALPHA, "alpha"), vault(BETA, "alpha")] }),
    ).toThrow(/twice/);
  });

  test("refuses a batcher used twice, a retired one included", () => {
    expect(() =>
      defineVaultGroup({
        ...STABLE,
        vaults: [
          {
            ...vault(ALPHA, "alpha"),
            batchers: {
              deposit: {
                retired: [{ address: BETA.depositBatcher, lastBatchId: 1n }],
                latest: ALPHA.depositBatcher,
              },
              redeem: ALPHA.redeemBatcher,
            },
          },
          vault(BETA, "beta"),
        ],
      }),
    ).toThrow(/more than once/);
  });

  test("refuses an invalid address", () => {
    expect(() => defineVaultGroup({ ...STABLE, asset: "0x12" as Address })).toThrow(
      /not an address/,
    );
  });
});

describe("prepareDeposit", () => {
  test("a group of one sends one transfer-and-call to its batcher, tagged with its leg", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareDeposit(SOLO, {
      vaultId: "main",
      account: USER,
      amount: 10n,
    });
    expect(prepared).toMatchObject({
      kind: "deposit",
      vaultId: "main",
      account: USER,
      amount: 10n,
      route: "legs",
    });
    expect(roles(prepared.calls)).toStrictEqual(["join"]);
    const [call] = prepared.calls;
    expect(call).toMatchObject({
      to: ASSET,
      value: 0n,
      leg: { batcher: ALPHA.depositBatcher, amount: 10n },
    });
    expect(decode(call).args?.[0]).toBe(ALPHA.depositBatcher);
  });

  test("a sequential multi-vault deposit pushes through the router with a leg per vault", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareDeposit(STABLE, {
      vaultId: "beta",
      account: USER,
      amount: 10n,
    });
    expect(prepared.route).toBe("router");
    expect(prepared.legs.map((leg) => [leg.vaultId, leg.amount])).toStrictEqual([
      ["alpha", 0n],
      ["beta", 10n],
    ]);
    expect(roles(prepared.calls)).toStrictEqual(["join"]);
    expect(decode(prepared.calls[0]).args?.[0]).toBe(ROUTER);
    expect(prepared.calls[0]).toMatchObject({ leg: { vaultId: "beta" } });
  });

  test("a bundling wallet gets one transfer per vault and no router", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareDeposit(
      STABLE,
      { vaultId: "alpha", account: USER, amount: 10n },
      { walletMode: "bundle" },
    );
    expect(prepared.route).toBe("legs");
    expect(prepared.calls.map((call) => decode(call).args?.[0])).toStrictEqual([
      ALPHA.depositBatcher,
      BETA.depositBatcher,
    ]);
  });

  test("is plain data that survives structuredClone", async ({ sdk, provider, relayer }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareDeposit(STABLE, {
      vaultId: "alpha",
      account: USER,
      amount: 10n,
    });
    expect(structuredClone(prepared)).toEqual(prepared);
  });

  test("refuses when any vault's batcher is paused, even with every check skipped", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider, { paused: [BETA.depositBatcher] });
    mockEncryption(relayer);
    await expect(
      createVaultClient(sdk).prepareDeposit(
        STABLE,
        { vaultId: "alpha", account: USER, amount: 10n },
        { skipChecks: ["balance", "config"] },
      ),
    ).rejects.toBeInstanceOf(VaultBatcherPausedError);
  });

  test("refuses a router deposit of an unlisted asset", async ({ sdk, provider, relayer }) => {
    mockChain(provider, { listed: false });
    mockEncryption(relayer);
    await expect(
      createVaultClient(sdk).prepareDeposit(STABLE, {
        vaultId: "alpha",
        account: USER,
        amount: 10n,
      }),
    ).rejects.toBeInstanceOf(UnlistedConfidentialTokenError);
  });

  test("refuses a short balance", async ({ sdk, provider, relayer }) => {
    mockChain(provider, { balance: 5n });
    mockEncryption(relayer);
    await expect(
      createVaultClient(sdk).prepareDeposit(STABLE, {
        vaultId: "alpha",
        account: USER,
        amount: 10n,
      }),
    ).rejects.toBeInstanceOf(InsufficientConfidentialBalanceError);
  });

  test("refuses a group whose batchers trade another share token than configured", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const wrong = defineVaultGroup({
      ...STABLE,
      vaults: [{ ...vault(ALPHA, "alpha"), share: BETA.share }, vault(BETA, "beta")],
    });
    await expect(
      createVaultClient(sdk).prepareDeposit(wrong, {
        vaultId: "alpha",
        account: USER,
        amount: 10n,
      }),
    ).rejects.toThrow(/not the configured asset/);
  });

  test("a beneficiary in a group of one pulls through the batcher, after a grant to it", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider, { operators: false });
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareDeposit(
      SOLO,
      { vaultId: "main", account: USER, amount: 10n, beneficiary: FRIEND },
      { skipChecks: ["balance"] },
    );
    expect(roles(prepared.calls)).toStrictEqual(["grant", "join"]);
    expect(prepared.calls[0]).toMatchObject({
      role: "grant",
      vaultId: "main",
      token: ASSET,
      operator: ALPHA.depositBatcher,
      until: NOW + YEAR,
    });
    const join = decode(prepared.calls[1] as VaultCall);
    expect([join.functionName, join.args?.[0]]).toStrictEqual(["join", FRIEND]);
  });

  test("refuses a beneficiary in a larger group", async ({ sdk, provider, relayer }) => {
    mockChain(provider);
    mockEncryption(relayer);
    await expect(
      createVaultClient(sdk).prepareDeposit(STABLE, {
        vaultId: "alpha",
        account: USER,
        amount: 10n,
        beneficiary: FRIEND,
      }),
    ).rejects.toThrow(/only a group of one/);
  });
});

describe("proof binding", () => {
  // A proof only verifies in the contract it was encrypted for, so a wrong binding reverts on chain.
  function encryptedFor(relayer: RelayerSDK) {
    return vi
      .mocked(relayer.encryptValues)
      .mock.calls.map(([params]) => {
        const { contractAddress, userAddress, values } = params as unknown as {
          contractAddress: Address;
          userAddress: Address;
          values: { value: bigint }[];
        };
        return [
          getAddress(contractAddress),
          getAddress(userAddress),
          values.map((entry) => entry.value),
        ];
      })
      .sort(([a], [b]) => String(a).localeCompare(String(b)));
  }

  test("a router deposit binds the total to the asset and the allocation to the router", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    await createVaultClient(sdk).prepareDeposit(STABLE, {
      vaultId: "beta",
      account: USER,
      amount: 10n,
    });
    expect(encryptedFor(relayer)).toStrictEqual(
      [
        [ASSET, USER, [10n]],
        [ROUTER, USER, [0n, 10n]],
      ].sort(([a], [b]) => String(a).localeCompare(String(b))),
    );
  });

  test("a router redeem binds the allocation to the router", async ({ sdk, provider, relayer }) => {
    mockChain(provider);
    mockEncryption(relayer);
    await createVaultClient(sdk).prepareRedeem(STABLE, {
      vaultId: "alpha",
      account: USER,
      amount: 4n,
    });
    expect(encryptedFor(relayer)).toStrictEqual([[ROUTER, USER, [4n, 0n]]]);
  });

  test("bundled redeem legs bind each amount to the share token it spends", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    await createVaultClient(sdk).prepareRedeem(
      STABLE,
      { vaultId: "beta", account: USER, amount: 4n },
      { walletMode: "bundle" },
    );
    expect(encryptedFor(relayer)).toStrictEqual(
      [
        [ALPHA.share, USER, [0n]],
        [BETA.share, USER, [4n]],
      ].sort(([a], [b]) => String(a).localeCompare(String(b))),
    );
  });

  test("a join for a beneficiary binds the amount to the batcher that pulls it", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    await createVaultClient(sdk).prepareDeposit(
      SOLO,
      { vaultId: "main", account: USER, amount: 10n, beneficiary: FRIEND },
      { skipChecks: ["balance"] },
    );
    expect(encryptedFor(relayer)).toStrictEqual([[ALPHA.depositBatcher, USER, [10n]]]);
  });
});

describe("group check", () => {
  test("checks a second group with the same id against the chain again", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const client = createVaultClient(sdk);
    await client.prepareDeposit(STABLE, { vaultId: "alpha", account: USER, amount: 1n });
    const sameId = defineVaultGroup({
      ...STABLE,
      vaults: [{ ...vault(ALPHA, "alpha"), share: BETA.share }, vault(BETA, "beta")],
    });
    await expect(
      client.prepareDeposit(sameId, { vaultId: "alpha", account: USER, amount: 1n }),
    ).rejects.toThrow(/not the configured asset/);
  });
});

describe("prepareRedeem", () => {
  test("grants the router on every share token it lacks, for a year, then joins", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider, { operators: false });
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareRedeem(STABLE, {
      vaultId: "alpha",
      account: USER,
      amount: 10n,
    });
    expect(roles(prepared.calls)).toStrictEqual(["grant", "grant", "join"]);
    expect(prepared.calls.slice(0, 2)).toMatchObject([
      { token: ALPHA.share, operator: ROUTER, vaultId: "alpha", until: NOW + YEAR },
      { token: BETA.share, operator: ROUTER, vaultId: "beta", until: NOW + YEAR },
    ]);
    expect(decode(prepared.calls[2] as VaultCall).functionName).toBe("join");
  });

  test("sends only the join once the grants are in place", async ({ sdk, provider, relayer }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareRedeem(STABLE, {
      vaultId: "alpha",
      account: USER,
      amount: 10n,
    });
    expect(roles(prepared.calls)).toStrictEqual(["join"]);
  });
});

describe("batcher upgrades", () => {
  test("joins the retired batcher while its current batch is at most lastBatchId", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const client = createVaultClient(sdk);
    expect(await client.activeBatchers(upgraded(7n), "deposit")).toStrictEqual({
      alpha: RETIRED_ALPHA_DEPOSIT,
      beta: BETA.depositBatcher,
    });
    const prepared = await client.prepareDeposit(
      upgraded(7n),
      { vaultId: "alpha", account: USER, amount: 10n },
      { walletMode: "bundle" },
    );
    expect(prepared.legs.map((leg) => leg.batcher)).toStrictEqual([
      RETIRED_ALPHA_DEPOSIT,
      BETA.depositBatcher,
    ]);
  });

  test("joins the latest batcher once the retired one passed lastBatchId", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider);
    expect(await createVaultClient(sdk).activeBatchers(upgraded(6n), "deposit")).toStrictEqual({
      alpha: ALPHA.depositBatcher,
      beta: BETA.depositBatcher,
    });
  });
});

describe("batch actions", () => {
  test("claim, quit and dispatch encode without reading the chain", ({ sdk, provider }) => {
    const client = createVaultClient(sdk);
    const batch = { chainId: CHAIN_ID, batcher: ALPHA.depositBatcher, batchId: 3n };
    expect(decode(client.prepareClaim({ ...batch, account: USER }))).toMatchObject({
      functionName: "claim",
      args: [3n, USER],
    });
    expect(decode(client.prepareQuit(batch))).toMatchObject({ functionName: "quit", args: [3n] });
    expect(client.prepareDispatch(batch)).toMatchObject({ to: ALPHA.depositBatcher, value: 0n });
    expect(provider.readContract).not.toHaveBeenCalled();
  });

  test("prepareFinalize settles a dispatched batch with its public decryption", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider, { batches: { [ALPHA.depositBatcher]: { state: 1 } } });
    const handle = `0x${"ef".repeat(32)}` as Hex;
    vi.spyOn(sdk.decryption, "decryptPublicValues").mockResolvedValue({
      clearValues: { [handle]: 42n },
      decryptionProof: "0x1234",
    } as never);
    const prepared = await createVaultClient(sdk).prepareFinalize({
      chainId: CHAIN_ID,
      batcher: ALPHA.depositBatcher,
      batchId: 3n,
    });
    expect(prepared).toMatchObject({ unwrapAmountCleartext: 42n, decryptionProof: "0x1234" });
    expect(decode(prepared.call)).toMatchObject({
      functionName: "dispatchBatchCallback",
      args: [3n, 42n, "0x1234"],
    });
  });

  test("prepareFinalize refuses a batch that is not dispatched", async ({ sdk, provider }) => {
    mockChain(provider, { batches: { [ALPHA.depositBatcher]: { state: 2 } } });
    await expect(
      createVaultClient(sdk).prepareFinalize({
        chainId: CHAIN_ID,
        batcher: ALPHA.depositBatcher,
        batchId: 3n,
      }),
    ).rejects.toMatchObject({ state: "finalized" } satisfies Partial<VaultBatchNotDispatchedError>);
  });
});

describe("readBatch", () => {
  const ref = { chainId: CHAIN_ID, batcher: ALPHA.depositBatcher, batchId: 3n };

  test("a young pending batch: quit for its depositor, and when it becomes dispatchable", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider);
    const batch = await createVaultClient(sdk).readBatch({ ...ref, account: USER });
    expect(batch).toMatchObject({
      state: "pending",
      dispatchableAt: NOW + 90n,
      actions: ["quit"],
      nextChangeAt: NOW + 90n,
    });
    expect(batch).not.toHaveProperty("dispatchedAt");
  });

  test("an old enough pending batch can be dispatched by anyone", async ({ sdk, provider }) => {
    mockChain(provider, { batches: { [ALPHA.depositBatcher]: { createdAt: NOW - 200n } } });
    const batch = await createVaultClient(sdk).readBatch(ref);
    expect(batch.actions).toStrictEqual(["dispatch"]);
    expect(batch.deposit).toBeNull();
  });

  test("a finalized batch can be claimed, with its exchange rate", async ({ sdk, provider }) => {
    mockChain(provider, {
      batches: { [ALPHA.depositBatcher]: { state: 2, dispatchedAt: NOW - 50n } },
    });
    const batch = await createVaultClient(sdk).readBatch({ ...ref, account: USER });
    expect(batch).toMatchObject({
      actions: ["claim"],
      exchangeRate: { rate: 2n, decimals: 0 },
      dispatchedAt: NOW - 50n,
    });
  });

  test("lists nothing for an account that never joined", async ({ sdk, provider }) => {
    mockChain(provider, {
      batches: { [ALPHA.depositBatcher]: { state: 2, deposit: `0x${"00".repeat(32)}` } },
    });
    expect(
      (await createVaultClient(sdk).readBatch({ ...ref, account: USER })).actions,
    ).toStrictEqual([]);
  });

  test("a dispatched batch can be finalized until its deadline", async ({ sdk, provider }) => {
    mockChain(provider, {
      batches: { [ALPHA.depositBatcher]: { state: 1, dispatchedAt: NOW - 10n, deadline: 60n } },
    });
    const batch = await createVaultClient(sdk).readBatch(ref);
    expect(batch).toMatchObject({
      actions: ["finalize"],
      cancelsAt: NOW + 50n,
      nextChangeAt: NOW + 50n,
    });
  });
});

describe("readOpenBatches", () => {
  test("reads each vault's active batcher's open batch", async ({ sdk, provider }) => {
    mockChain(provider);
    const batches = await createVaultClient(sdk).readOpenBatches(upgraded(7n), "deposit");
    expect(batches).toMatchObject([
      { vaultId: "alpha", batcher: RETIRED_ALPHA_DEPOSIT, batchId: 7n, observedAt: NOW },
      { vaultId: "beta", batcher: BETA.depositBatcher, batchId: 7n, observedAt: NOW },
    ]);
  });
});

describe("deposit and redeem", () => {
  function mockReceipt(provider: GenericProvider, batchers: readonly Address[]) {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: batchers.map((batcher, index) =>
        joinedLog({ batcher, account: USER, batchId: [3n, 5n][index] ?? 9n }),
      ),
    });
  }

  test("deposit returns the batch every leg landed in", async ({
    sdk,
    provider,
    relayer,
    signer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    mockReceipt(provider, [ALPHA.depositBatcher, BETA.depositBatcher]);
    const { batches, txHashes, prepared } = await createVaultClient(sdk).deposit(STABLE, {
      vaultId: "beta",
      amount: 10n,
    });
    expect(batches).toStrictEqual([
      { vaultId: "alpha", chainId: CHAIN_ID, batcher: ALPHA.depositBatcher, batchId: 3n },
      { vaultId: "beta", chainId: CHAIN_ID, batcher: BETA.depositBatcher, batchId: 5n },
    ]);
    expect(prepared.account).toBe(USER);
    expect(txHashes).toHaveLength(1);
    expect(signer.writeContract).toHaveBeenCalledTimes(1);
  });

  test("throws when the receipt does not confirm every leg", async ({ sdk, provider, relayer }) => {
    mockChain(provider);
    mockEncryption(relayer);
    mockReceipt(provider, [ALPHA.depositBatcher]);
    await expect(
      createVaultClient(sdk).deposit(STABLE, { vaultId: "beta", amount: 10n }),
    ).rejects.toMatchObject({
      unconfirmedVaultIds: ["beta"],
    } satisfies Partial<VaultJoinUnconfirmedError>);
  });

  test("redeem sends the grants before the join", async ({ sdk, provider, relayer, signer }) => {
    mockChain(provider, { operators: false });
    mockEncryption(relayer);
    mockReceipt(provider, [ALPHA.redeemBatcher, BETA.redeemBatcher]);
    const { txHashes } = await createVaultClient(sdk).redeem(STABLE, {
      vaultId: "alpha",
      amount: 1n,
    });
    expect(txHashes).toHaveLength(3);
    expect(
      vi.mocked(signer.writeContract).mock.calls.map(([call]) => call.functionName),
    ).toStrictEqual(["setOperator", "setOperator", "join"]);
  });

  test("claim targets the signer by default", async ({ sdk, provider, signer }) => {
    mockChain(provider);
    await createVaultClient(sdk).claim({
      chainId: CHAIN_ID,
      batcher: ALPHA.depositBatcher,
      batchId: 3n,
    });
    expect(vi.mocked(signer.writeContract).mock.calls[0]?.[0]).toMatchObject({
      functionName: "claim",
      args: [3n, USER],
    });
  });
});

describe("chain checks", () => {
  test("refuses to encrypt while the provider is on another chain", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const elsewhere = defineVaultGroup({ ...STABLE, chainId: 1 });
    await expect(
      createVaultClient(sdk).prepareDeposit(
        elsewhere,
        { vaultId: "alpha", account: USER, amount: 10n },
        { skipChecks: ["balance"] },
      ),
    ).rejects.toThrow(/switch to chain 1/);
  });

  test("refuses to send while the wallet is on another chain", async ({ sdk, signer }) => {
    await expect(
      createVaultClient(sdk).claim({ chainId: 1, batcher: ALPHA.depositBatcher, batchId: 3n }),
    ).rejects.toMatchObject({ name: "ChainMismatchError", targetChainId: 1 });
    expect(signer.writeContract).not.toHaveBeenCalled();
  });
});
