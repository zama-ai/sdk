import { decodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { vi } from "vitest";
import { confidentialWrapperAbi } from "../../abi/confidential-wrapper.abi";
import {
  BalanceCheckUnavailableError,
  ConfigurationError,
  InsufficientConfidentialBalanceError,
  VaultBatcherPausedError,
  type VaultBatchNotDispatchedError,
  type VaultJoinUnconfirmedError,
} from "../../errors";
import type { RelayerSDK } from "../../relayer/types";
import { USER } from "../../test-fixtures/constants";
import {
  describe,
  expect,
  createMockRouter,
  joinedLog,
  test as baseTest,
  VALID_INPUT_PROOF,
} from "../../test-fixtures";
import { Token } from "../../token";
import type { GenericProvider } from "../../types";
import { vaultBatcherAbi } from "../abi/vault-batcher.abi";
import { vaultRouterAbi } from "../abi/vault-router.abi";
import { createVaultClient } from "../client";
import { defineVault, defineVaultGroup, MAX_GROUP_VAULTS } from "../config";
import { depositMutationOptions } from "../query";
import type { VaultCall } from "../types";

// Every fixture address has hex letters, so a missing `getAddress` shows up as a casing mismatch.
const ROUTER = getAddress("0x4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e4e");
const ASSET = getAddress("0x2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a");
const FRIEND = getAddress("0x6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a");
const ALPHA = {
  share: getAddress("0x1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c"),
  depositBatcher: getAddress("0xAaaAaAAaAaAAaAaAAaaAaaAaAaAAaAaAaAAAAaaA"),
  redeemBatcher: getAddress("0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB"),
};
const BETA = {
  share: getAddress("0x3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e3e"),
  depositBatcher: getAddress("0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC"),
  redeemBatcher: getAddress("0xdDdDddDdDdddDDddDdDdDDDDdDdDDdDDdDDDDDDd"),
};
// Alpha's deposit batcher was upgraded: the retired one takes joins up to a batch id.
const RETIRED_ALPHA_DEPOSIT = getAddress("0x7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a");

const CHAIN_ID = 31337;
const NOW = 1_000_000n;
const YEAR = 365n * 24n * 60n * 60n;

// The router comes from the chain, never from the group.
const test = baseTest.extend({
  chain: async ({ createMockChain }, use) => {
    await use(createMockChain({ id: CHAIN_ID, vaultRouterAddress: ROUTER }));
  },
});

function vault(entry: typeof ALPHA, id: string) {
  return { id, batchers: { deposit: entry.depositBatcher, redeem: entry.redeemBatcher } };
}

const STABLE = defineVaultGroup({
  id: "stable",
  chainId: CHAIN_ID,
  vaults: [vault(ALPHA, "alpha"), vault(BETA, "beta")],
});

const SOLO = defineVaultGroup({ id: "solo", chainId: CHAIN_ID, vaults: [vault(ALPHA, "main")] });

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
    operators?: boolean;
    batches?: Readonly<Record<Address, BatchFacts>>;
    balance?: bigint;
    fromTokens?: Readonly<Record<Address, Address>>;
  } = {},
) {
  const fromTokens: Record<Address, Address> = {
    [ALPHA.depositBatcher]: ASSET,
    [ALPHA.redeemBatcher]: ALPHA.share,
    [BETA.depositBatcher]: ASSET,
    [BETA.redeemBatcher]: BETA.share,
    [RETIRED_ALPHA_DEPOSIT]: ASSET,
    ...answers.fromTokens,
  };
  vi.mocked(provider.getBlockTimestamp).mockResolvedValue(NOW);
  vi.mocked(provider.readContract).mockImplementation(async (call: unknown) => {
    const { functionName, address } = call as { functionName: string; address: Address };
    const batcher = getAddress(address);
    const batch = answers.batches?.[batcher];
    switch (functionName) {
      case "isOperator":
        return answers.operators ?? true;
      case "paused":
        return answers.paused?.includes(batcher) ?? false;
      case "fromToken":
        return fromTokens[batcher];
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

const kinds = (calls: readonly VaultCall[]) => calls.map((call) => call.kind);

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
    expect(() =>
      defineVaultGroup({
        ...STABLE,
        vaults: [{ id: "alpha", batchers: { deposit: "0x12", redeem: ALPHA.redeemBatcher } }],
      }),
    ).toThrow(/not an address/);
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
      direction: "deposit",
      vaultId: "main",
      account: USER,
      amount: 10n,
      route: "direct",
    });
    expect(kinds(prepared.calls)).toStrictEqual(["join"]);
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
    expect(kinds(prepared.calls)).toStrictEqual(["join"]);
    expect(decode(prepared.calls[0]).args?.[0]).toBe(ROUTER);
    expect(prepared.calls[0]).toMatchObject({ leg: { vaultId: "beta" } });
  });

  test("the direct route sends one transfer per vault and no router", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareDeposit(
      STABLE,
      { vaultId: "alpha", account: USER, amount: 10n },
      { route: "direct" },
    );
    expect(prepared.route).toBe("direct");
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

  test("refuses when any vault's batcher is paused, without the balance check", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider, { paused: [BETA.depositBatcher] });
    mockEncryption(relayer);
    await expect(
      createVaultClient(sdk).prepareDeposit(STABLE, {
        vaultId: "alpha",
        account: USER,
        amount: 10n,
      }),
    ).rejects.toBeInstanceOf(VaultBatcherPausedError);
  });

  test("refuses a short balance unless told to skip the check", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider, { balance: 5n });
    mockEncryption(relayer);
    const client = createVaultClient(sdk);
    const input = { vaultId: "alpha", account: USER, amount: 10n } as const;
    await expect(client.prepareDeposit(STABLE, input)).rejects.toBeInstanceOf(
      InsufficientConfidentialBalanceError,
    );
    await expect(
      client.prepareDeposit(STABLE, input, { skipBalanceCheck: true }),
    ).resolves.toMatchObject({ amount: 10n });
  });

  test("refuses to prepare for another account without skipping the balance check", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    await expect(
      createVaultClient(sdk).prepareDeposit(STABLE, {
        vaultId: "alpha",
        account: FRIEND,
        amount: 10n,
      }),
    ).rejects.toThrow(BalanceCheckUnavailableError);
    expect(Token.batchBalancesOf).not.toHaveBeenCalled();
  });

  test("reads each leg's token from its batcher", async ({ sdk, provider, relayer }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const client = createVaultClient(sdk);
    const input = { vaultId: "beta", account: USER, amount: 10n } as const;
    const deposit = await client.prepareDeposit(STABLE, input);
    const redeem = await client.prepareRedeem(STABLE, input);
    expect(deposit.legs.map((leg) => leg.token)).toStrictEqual([ASSET, ASSET]);
    expect(redeem.legs.map((leg) => leg.token)).toStrictEqual([ALPHA.share, BETA.share]);
  });

  test("refuses a group whose deposit batchers take different assets", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider, { fromTokens: { [BETA.depositBatcher]: BETA.share } });
    mockEncryption(relayer);
    await expect(
      createVaultClient(sdk).prepareDeposit(STABLE, {
        vaultId: "alpha",
        account: USER,
        amount: 10n,
      }),
    ).rejects.toThrow(/mixes deposit assets/);
  });

  test("refuses a multi-vault join on a chain with no router", async ({
    createSDK,
    createMockChain,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const router = createMockRouter({ relayer, chains: [createMockChain({ id: CHAIN_ID })] });
    const client = createVaultClient(createSDK({ router }));
    await expect(
      client.prepareDeposit(STABLE, { vaultId: "alpha", account: USER, amount: 10n }),
    ).rejects.toThrow(/has no router/);
  });

  test("checks the balance before sending by default", async ({ sdk, provider, relayer }) => {
    mockChain(provider, { balance: 5n });
    mockEncryption(relayer);
    await expect(
      createVaultClient(sdk).deposit(STABLE, { vaultId: "alpha", amount: 10n }),
    ).rejects.toBeInstanceOf(InsufficientConfidentialBalanceError);
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
      { route: "direct" },
    );
    expect(encryptedFor(relayer)).toStrictEqual(
      [
        [ALPHA.share, USER, [0n]],
        [BETA.share, USER, [4n]],
      ].sort(([a], [b]) => String(a).localeCompare(String(b))),
    );
  });
});

describe("prepareRedeem", () => {
  test("approves the router as operator on every share token it lacks, for a year, then joins", async ({
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
    expect(kinds(prepared.calls)).toStrictEqual(["operatorApproval", "operatorApproval", "join"]);
    expect(prepared.calls.slice(0, 2)).toMatchObject([
      { to: ALPHA.share, operator: ROUTER, vaultId: "alpha", until: NOW + YEAR },
      { to: BETA.share, operator: ROUTER, vaultId: "beta", until: NOW + YEAR },
    ]);
    expect(prepared.calls[0]).not.toHaveProperty("token");
    expect(decode(prepared.calls[2] as VaultCall).functionName).toBe("join");
  });

  test("sends only the join once the operator approvals are in place", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareRedeem(STABLE, {
      vaultId: "alpha",
      account: USER,
      amount: 10n,
    });
    expect(kinds(prepared.calls)).toStrictEqual(["join"]);
  });
});

describe("without a signer", () => {
  test("prepares joins and batch actions for any account", async ({
    createSDK,
    provider,
    relayer,
  }) => {
    mockChain(provider, { operators: false });
    mockEncryption(relayer);
    const client = createVaultClient(createSDK({ signer: undefined }));
    const input = { vaultId: "beta", account: FRIEND, amount: 10n } as const;
    const deposit = await client.prepareDeposit(STABLE, input, { skipBalanceCheck: true });
    const redeem = await client.prepareRedeem(STABLE, input, { skipBalanceCheck: true });

    expect(deposit.account).toBe(FRIEND);
    expect(kinds(deposit.calls)).toStrictEqual(["join"]);
    expect(kinds(redeem.calls)).toStrictEqual(["operatorApproval", "operatorApproval", "join"]);
    const batch = { chainId: CHAIN_ID, batcher: ALPHA.depositBatcher, batchId: 1n };
    expect(client.prepareClaim(batch, FRIEND).to).toBe(ALPHA.depositBatcher);
    expect(client.prepareQuit(batch).to).toBe(ALPHA.depositBatcher);
    expect(client.prepareDispatch(batch).to).toBe(ALPHA.depositBatcher);

    await expect(client.prepareDeposit(STABLE, input)).rejects.toThrow(
      BalanceCheckUnavailableError,
    );
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
    const prepared = await createVaultClient(sdk).prepareDeposit(
      upgraded(7n),
      { vaultId: "alpha", account: USER, amount: 10n },
      { route: "direct" },
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
    const batches = await createVaultClient(sdk).readOpenBatches(upgraded(6n), "deposit");
    expect(batches.map((batch) => batch.batcher)).toStrictEqual([
      ALPHA.depositBatcher,
      BETA.depositBatcher,
    ]);
  });
});

describe("batch actions", () => {
  test("claim, quit and dispatch encode without reading the chain", ({ sdk, provider }) => {
    const client = createVaultClient(sdk);
    const batch = { chainId: CHAIN_ID, batcher: ALPHA.depositBatcher, batchId: 3n };
    expect(decode(client.prepareClaim(batch, USER))).toMatchObject({
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
    const batch = await createVaultClient(sdk).readBatch(ref, USER);
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
    const batch = await createVaultClient(sdk).readBatch(ref, USER);
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
    expect((await createVaultClient(sdk).readBatch(ref, USER)).actions).toStrictEqual([]);
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

describe("a single vault", () => {
  const MAIN = defineVault({ ...vault(ALPHA, "main"), chainId: CHAIN_ID });

  test("joins its batcher directly, with no vaultId", async ({ sdk, provider, relayer }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareDeposit(MAIN, {
      account: USER,
      amount: 10n,
    });
    expect(prepared).toMatchObject({ vaultId: "main", route: "direct" });
    expect(kinds(prepared.calls)).toStrictEqual(["join"]);
    expect(decode(prepared.calls[0]).args?.[0]).toBe(ALPHA.depositBatcher);
  });

  test("reads its open batch in each direction", async ({ sdk, provider }) => {
    mockChain(provider);
    const client = createVaultClient(sdk);
    expect(await client.readOpenBatches(MAIN, "deposit")).toMatchObject([
      { vaultId: "main", batcher: ALPHA.depositBatcher, batchId: 7n },
    ]);
    expect(await client.readOpenBatches(MAIN, "redeem")).toMatchObject([
      { vaultId: "main", batcher: ALPHA.redeemBatcher },
    ]);
  });

  test("is joined through the mutation options with { vault }", async ({ sdk }) => {
    const client = createVaultClient(sdk);
    const deposit = vi.spyOn(client, "deposit").mockResolvedValue({} as never);
    await depositMutationOptions(client).mutationFn({ vault: MAIN, amount: 10n });
    expect(deposit).toHaveBeenCalledWith(
      MAIN,
      { amount: 10n, vaultId: undefined },
      { skipBalanceCheck: undefined, onJoinSubmitted: undefined },
    );
  });

  test("defineVault validates like a group", () => {
    expect(() =>
      defineVault({
        id: "main",
        chainId: CHAIN_ID,
        batchers: { deposit: "0xnot-an-address", redeem: ALPHA.redeemBatcher },
      }),
    ).toThrow(ConfigurationError);
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

  test("redeem sends the operator approvals before the join", async ({
    sdk,
    provider,
    relayer,
    signer,
  }) => {
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
  test("refuses to encrypt while the wallet is on another chain, as a send does", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const elsewhere = defineVaultGroup({ ...STABLE, chainId: 1 });
    await expect(
      createVaultClient(sdk).prepareDeposit(elsewhere, {
        vaultId: "alpha",
        account: USER,
        amount: 10n,
      }),
    ).rejects.toMatchObject({ name: "ChainMismatchError", targetChainId: 1 });
  });

  test("without a wallet, refuses to encrypt while the provider is on another chain", async ({
    createSDK,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const elsewhere = defineVaultGroup({ ...STABLE, chainId: 1 });
    await expect(
      createVaultClient(createSDK({ signer: undefined })).prepareDeposit(elsewhere, {
        vaultId: "alpha",
        account: USER,
        amount: 10n,
      }),
    ).rejects.toBeInstanceOf(ConfigurationError);
  });

  test("refuses to send while the wallet is on another chain", async ({ sdk, signer }) => {
    await expect(
      createVaultClient(sdk).claim({ chainId: 1, batcher: ALPHA.depositBatcher, batchId: 3n }),
    ).rejects.toMatchObject({ name: "ChainMismatchError", targetChainId: 1 });
    expect(signer.writeContract).not.toHaveBeenCalled();
  });
});
