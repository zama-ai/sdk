import { decodeFunctionData, getAddress, zeroHash, type Address, type Hex } from "viem";
import { vi } from "vitest";
import { confidentialWrapperAbi } from "../../abi/confidential-wrapper.abi";
import {
  BalanceCheckUnavailableError,
  ConfigurationError,
  InsufficientConfidentialBalanceError,
  VaultBatcherPausedError,
  VaultBatcherReadFailedError,
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
import { defineVault, defineVaultGroup, MAX_GROUP_VAULTS, type Vault } from "../config";
import { depositMutationOptions, redeemMutationOptions } from "../query";
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
// A second deposit batcher for alpha, listed before its first one in `upgraded`.
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

function vault<const TId extends string>(entry: typeof ALPHA, id: TId, chainId = CHAIN_ID) {
  return defineVault({
    id,
    chainId,
    batchers: { deposit: entry.depositBatcher, redeem: entry.redeemBatcher },
  });
}

const ALPHA_VAULT = vault(ALPHA, "alpha");
const BETA_VAULT = vault(BETA, "beta");

const STABLE = defineVaultGroup({ id: "stable", vaults: [ALPHA_VAULT, BETA_VAULT] });

const MAIN = vault(ALPHA, "main");

function upgraded(lastBatchId: bigint) {
  const alpha = defineVault({
    id: "alpha",
    chainId: CHAIN_ID,
    batchers: {
      deposit: {
        retired: [{ address: RETIRED_ALPHA_DEPOSIT, lastBatchId }],
        latest: ALPHA.depositBatcher,
      },
      redeem: ALPHA.redeemBatcher,
    },
  });
  return defineVaultGroup({ id: "stable", vaults: [alpha, BETA_VAULT] });
}

interface BatchFacts {
  state?: number;
  createdAt?: bigint;
  minAge?: bigint;
  dispatchedAt?: bigint;
  deadline?: bigint;
  deposit?: Hex;
  /** Defaults to 7. */
  currentBatchId?: bigint;
  /** The state of the batch before the current one, defaults to finalized. */
  previousState?: number;
  /** The batcher's first batch id; a batch before it does not exist. Defaults to 1. */
  firstBatchId?: bigint;
  /** What `closed()` returns; `"reverts"` for a batcher deployed before it. Defaults to false. */
  closed?: boolean | "reverts";
}

/** What each batcher reports, and the batches a read asks about. */
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
    const { functionName, address, args } = call as {
      functionName: string;
      address: Address;
      args: readonly unknown[];
    };
    const batcher = getAddress(address);
    const batch = answers.batches?.[batcher];
    const current = batch?.currentBatchId ?? 7n;
    switch (functionName) {
      case "isOperator":
        return answers.operators ?? true;
      case "paused":
        return answers.paused?.includes(batcher) ?? false;
      case "closed":
        if (batch?.closed === "reverts") {
          throw new Error("execution reverted");
        }
        return batch?.closed ?? false;
      case "fromToken":
        return fromTokens[batcher];
      case "batchState":
        if ((args[0] as bigint) < (batch?.firstBatchId ?? 1n)) {
          throw new Error(`execution reverted: BatchNonexistent(${String(args[0])})`);
        }
        return args[0] === current - 1n ? (batch?.previousState ?? 2) : (batch?.state ?? 0);
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
        return current;
      case "unwrapRequestId":
        return (args[0] as bigint) < (batch?.firstBatchId ?? 1n)
          ? zeroHash
          : `0x${"cd".repeat(32)}`;
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

describe("defineVault and defineVaultGroup", () => {
  test("return what they are given", () => {
    const config = { id: "alpha", chainId: CHAIN_ID, batchers: ALPHA_VAULT.batchers } as const;
    expect(defineVault(config)).toBe(config);
    const group = { id: "stable", vaults: [ALPHA_VAULT, BETA_VAULT] } as const;
    expect(defineVaultGroup(group)).toBe(group);
  });
});

describe("config checks, where the config is used", () => {
  const input = { vaultId: "alpha", account: USER, amount: 10n } as const;

  test("refuses an invalid batcher address", async ({ sdk, provider }) => {
    mockChain(provider);
    const broken = defineVault({
      id: "broken",
      chainId: CHAIN_ID,
      batchers: { deposit: "0x12", redeem: ALPHA.redeemBatcher },
    });
    const client = createVaultClient(sdk);
    await expect(
      client.prepareDeposit(broken, { account: USER, amount: 10n }, { skipBalanceCheck: true }),
    ).rejects.toThrow(/deposit batcher is not an address/);
    await expect(client.readOpenBatches(broken, "deposit")).rejects.toThrow(/not an address/);
  });

  test.for([
    [
      "a negative lastBatchId",
      { address: ALPHA.depositBatcher, lastBatchId: -1n },
      /invalid lastBatchId: -1/,
    ],
    [
      "a lastBatchId that is not a bigint",
      { address: ALPHA.depositBatcher, lastBatchId: 6 as never },
      /invalid lastBatchId: 6/,
    ],
    ["an invalid address in an entry", { address: "0x12" as never }, /not an address: 0x12/],
  ] as const)("refuses %s in a batcher list", async ([, entry, message], { sdk, provider }) => {
    mockChain(provider);
    const broken = defineVault({
      id: "broken",
      chainId: CHAIN_ID,
      batchers: { deposit: [entry, BETA.depositBatcher], redeem: ALPHA.redeemBatcher },
    });
    const read = createVaultClient(sdk).readOpenBatches(broken, "deposit");
    await expect(read).rejects.toBeInstanceOf(ConfigurationError);
    await expect(read).rejects.toThrow(message);
  });

  test("refuses a lone batcher entry, which is not a list", async ({ sdk, provider }) => {
    mockChain(provider);
    const broken = defineVault({
      id: "broken",
      chainId: CHAIN_ID,
      batchers: {
        deposit: { address: ALPHA.depositBatcher } as never,
        redeem: ALPHA.redeemBatcher,
      },
    });
    await expect(createVaultClient(sdk).readOpenBatches(broken, "deposit")).rejects.toThrow(
      /must be an address or a list/,
    );
  });

  test("refuses an invalid lastBatchId", async ({ sdk, provider }) => {
    mockChain(provider);
    const broken = defineVault({
      id: "broken",
      chainId: CHAIN_ID,
      batchers: {
        deposit: {
          retired: [{ address: RETIRED_ALPHA_DEPOSIT, lastBatchId: undefined as never }],
          latest: ALPHA.depositBatcher,
        },
        redeem: ALPHA.redeemBatcher,
      },
    });
    await expect(createVaultClient(sdk).readOpenBatches(broken, "deposit")).rejects.toThrow(
      /invalid lastBatchId: undefined/,
    );
  });

  test("refuses more than MAX_GROUP_VAULTS vaults", async ({ sdk }) => {
    const extra = Array.from({ length: MAX_GROUP_VAULTS - 1 }, (_unused, index) =>
      defineVault({
        id: `v${index}`,
        chainId: CHAIN_ID,
        batchers: {
          deposit: `0x${(index + 16).toString(16).repeat(20)}` as Address,
          redeem: `0x${(index + 48).toString(16).repeat(20)}` as Address,
        },
      }),
    );
    const big = defineVaultGroup({ id: "big", vaults: [ALPHA_VAULT, BETA_VAULT, ...extra] });
    await expect(createVaultClient(sdk).prepareDeposit(big, input)).rejects.toThrow(/more than 8/);
  });

  test("refuses a vault id twice", async ({ sdk }) => {
    const twice = defineVaultGroup({ id: "twice", vaults: [ALPHA_VAULT, vault(BETA, "alpha")] });
    await expect(createVaultClient(sdk).prepareDeposit(twice, input)).rejects.toThrow(/twice/);
  });

  test("refuses vaults on different chains", async ({ sdk }) => {
    const mixed = defineVaultGroup({ id: "mixed", vaults: [ALPHA_VAULT, vault(BETA, "beta", 1)] });
    await expect(createVaultClient(sdk).prepareDeposit(mixed, input)).rejects.toThrow(
      /mixes chains/,
    );
    await expect(createVaultClient(sdk).readOpenBatches(mixed, "deposit")).rejects.toThrow(
      /mixes chains/,
    );
  });
});

describe("prepareDeposit", () => {
  test("a vault on its own sends one transfer-and-call to its batcher, tagged with its leg", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareDeposit(MAIN, {
      account: USER,
      amount: 10n,
    });
    expect(prepared).toMatchObject({
      direction: "deposit",
      groupId: undefined,
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

  test.for([
    ["paused", { paused: [BETA.depositBatcher] }, "cannot be joined until one resumes"],
    [
      "closed",
      { batches: { [BETA.depositBatcher]: { createdAt: 0n, closed: true } } },
      "is closed, so the vault takes no joins",
    ],
  ] as const)(
    "refuses when the chosen vault's batchers are all %s, without the balance check",
    async ([, chain, message], { sdk, provider, relayer }) => {
      mockChain(provider, chain);
      mockEncryption(relayer);
      const joining = createVaultClient(sdk).prepareDeposit(STABLE, {
        vaultId: "beta",
        account: USER,
        amount: 10n,
      });
      await expect(joining).rejects.toBeInstanceOf(VaultBatcherPausedError);
      await expect(joining).rejects.toMatchObject({
        batcher: BETA.depositBatcher,
        vaultId: "beta",
      });
      await expect(joining).rejects.toThrow(message);
      expect(Token.batchBalancesOf).not.toHaveBeenCalled();
    },
  );

  test.for([
    ["paused", { paused: [BETA.depositBatcher] }],
    ["closed", { batches: { [BETA.depositBatcher]: { createdAt: 0n, closed: true } } }],
  ] as const)(
    "leaves out a member whose batchers are all %s",
    async ([, chain], { sdk, provider, relayer }) => {
      mockChain(provider, chain);
      mockEncryption(relayer);
      for (const route of ["router", "direct"] as const) {
        const prepared = await createVaultClient(sdk).prepareDeposit(
          STABLE,
          { vaultId: "alpha", account: USER, amount: 10n },
          { route },
        );
        expect(prepared.legs.map((leg) => [leg.vaultId, leg.amount])).toStrictEqual([
          ["alpha", 10n],
        ]);
        expect(prepared.calls).toHaveLength(1);
      }
    },
  );

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
  test.for([
    ["paused", { paused: [ALPHA.redeemBatcher] }],
    ["closed", { batches: { [ALPHA.redeemBatcher]: { createdAt: 0n, closed: true } } }],
  ] as const)(
    "leaves out a member whose redeem batchers are all %s, and asks no approval for it",
    async ([, chain], { sdk, provider, relayer }) => {
      mockChain(provider, { operators: false, ...chain });
      mockEncryption(relayer);
      const prepared = await createVaultClient(sdk).prepareRedeem(STABLE, {
        vaultId: "beta",
        account: USER,
        amount: 10n,
      });
      expect(prepared.legs.map((leg) => leg.vaultId)).toStrictEqual(["beta"]);
      expect(kinds(prepared.calls)).toStrictEqual(["operatorApproval", "join"]);
      expect(prepared.calls[0]).toMatchObject({ to: BETA.share, vaultId: "beta" });
    },
  );

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

describe("several batchers in one direction", () => {
  const [EARLY, LATE] = [RETIRED_ALPHA_DEPOSIT, ALPHA.depositBatcher];
  // Listed in reverse dispatch order, so list order cannot be what picks the batcher.
  const SET = defineVault({
    id: "set",
    chainId: CHAIN_ID,
    batchers: { deposit: [LATE, EARLY], redeem: ALPHA.redeemBatcher },
  });
  const nextBatcher = async (sdk: Parameters<typeof createVaultClient>[0], target: Vault = SET) =>
    (await createVaultClient(sdk).readOpenBatches(target, "deposit"))[0];

  test("a join reaches the open batch that is dispatched first", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider, {
      batches: {
        [EARLY]: { createdAt: NOW, minAge: 100n },
        [LATE]: { createdAt: NOW, minAge: 200n },
      },
    });
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareDeposit(SET, {
      account: USER,
      amount: 10n,
    });
    expect(prepared.legs[0].batcher).toBe(EARLY);
    expect(prepared.calls[0].to).toBe(ASSET);
    expect(decode(prepared.calls[0]).args?.[0]).toBe(EARLY);
    expect(await nextBatcher(sdk)).toMatchObject({
      batcher: EARLY,
      dispatchableAt: NOW + 100n,
      paused: false,
    });
  });

  test("passes over a batch due within a minute while another batcher is open", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider, {
      batches: {
        [EARLY]: { createdAt: NOW, minAge: 59n },
        [LATE]: { createdAt: NOW, minAge: 600n },
      },
    });
    expect(await nextBatcher(sdk)).toMatchObject({ batcher: LATE });
  });

  test("passes over a batch that waits on its dispatched previous batch", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider, {
      batches: {
        [EARLY]: { createdAt: NOW, minAge: 100n, previousState: 1 },
        [LATE]: { createdAt: NOW, minAge: 600n },
      },
    });
    expect(await nextBatcher(sdk)).toMatchObject({ batcher: LATE });
  });

  test("joins the first batch of a batcher whose ids start past 1", async ({ sdk, provider }) => {
    mockChain(provider, {
      batches: {
        [EARLY]: { createdAt: NOW, minAge: 100n, firstBatchId: 7n },
        [LATE]: { createdAt: NOW, minAge: 600n },
      },
    });
    expect(await nextBatcher(sdk)).toMatchObject({ batcher: EARLY });
  });

  test("when every batch waits on its previous one, takes the one due first", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider, {
      batches: {
        [EARLY]: { createdAt: NOW, minAge: 100n, previousState: 1 },
        [LATE]: { createdAt: NOW, minAge: 600n, previousState: 1 },
      },
    });
    expect(await nextBatcher(sdk)).toMatchObject({ batcher: EARLY, paused: false });
  });

  test("skips a paused batcher while another is open", async ({ sdk, provider, relayer }) => {
    mockChain(provider, {
      paused: [EARLY],
      batches: {
        [EARLY]: { createdAt: NOW, minAge: 100n },
        [LATE]: { createdAt: NOW, minAge: 200n },
      },
    });
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareDeposit(SET, {
      account: USER,
      amount: 10n,
    });
    expect(prepared.legs[0].batcher).toBe(LATE);
  });

  test("skips a batcher closed on chain, whose current batch never opened", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider, {
      batches: {
        [EARLY]: { createdAt: 0n, minAge: NOW + 100n, closed: true },
        [LATE]: { createdAt: NOW, minAge: 600n },
      },
    });
    expect(await nextBatcher(sdk)).toMatchObject({ batcher: LATE });
  });

  test("skips a batcher past its configured lastBatchId", async ({ sdk, provider }) => {
    mockChain(provider, {
      batches: {
        [EARLY]: { createdAt: NOW, minAge: 100n },
        [LATE]: { createdAt: NOW, minAge: 600n },
      },
    });
    const bounded = defineVault({
      id: "bounded",
      chainId: CHAIN_ID,
      batchers: {
        deposit: [{ address: EARLY, lastBatchId: 6n }, LATE],
        redeem: ALPHA.redeemBatcher,
      },
    });
    expect(await nextBatcher(sdk, bounded)).toMatchObject({ batcher: LATE });
  });

  test("refuses a join when every batcher is paused or closed, and reads it as paused", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider, { paused: [LATE], batches: { [EARLY]: { createdAt: 0n, closed: true } } });
    mockEncryption(relayer);
    await expect(
      createVaultClient(sdk).prepareDeposit(SET, { account: USER, amount: 10n }),
    ).rejects.toMatchObject({
      batcher: LATE,
      vaultId: "set",
    } satisfies Partial<VaultBatcherPausedError>);
    expect(await nextBatcher(sdk)).toMatchObject({ batcher: LATE, paused: true });
    expect(relayer.encryptValues).not.toHaveBeenCalled();
  });

  test("refuses an empty list", async ({ sdk, provider }) => {
    mockChain(provider);
    const empty = defineVault({
      id: "empty",
      chainId: CHAIN_ID,
      batchers: { deposit: [], redeem: ALPHA.redeemBatcher },
    });
    await expect(nextBatcher(sdk, empty)).rejects.toThrow(/list is empty/);
  });

  test("refuses when every batcher is closed, naming the first one declared", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider, {
      batches: {
        [EARLY]: { createdAt: 0n, closed: true },
        [LATE]: { createdAt: 0n, closed: true },
      },
    });
    await expect(nextBatcher(sdk)).rejects.toMatchObject({
      name: "VaultBatcherPausedError",
      batcher: LATE,
      vaultId: "set",
    });
  });

  test("reads a batch with no creation time again when closed() is false, since a node lagged", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider, {
      batches: {
        [EARLY]: { createdAt: NOW, minAge: 100n },
        [LATE]: { createdAt: NOW, minAge: 600n },
      },
    });
    const answer = vi.mocked(provider.readContract).getMockImplementation();
    let lagging = true;
    vi.mocked(provider.readContract).mockImplementation(async (call: unknown) => {
      const { functionName, address } = call as { functionName: string; address: Address };
      if (lagging && functionName === "batchCreatedAt" && getAddress(address) === EARLY) {
        lagging = false;
        return 0n;
      }
      return answer?.(call as never);
    });
    expect(await nextBatcher(sdk)).toMatchObject({ batcher: EARLY });
  });

  test.for([
    ["closed() is false", false],
    ["the batcher has no closed()", "reverts"],
  ] as const)(
    "throws a retryable read error when a batch keeps reading with no creation time and %s",
    async ([, closed], { sdk, provider }) => {
      mockChain(provider, {
        batches: { [EARLY]: { createdAt: 0n, closed }, [LATE]: { createdAt: NOW, minAge: 600n } },
      });
      const read = nextBatcher(sdk);
      await expect(read).rejects.toBeInstanceOf(VaultBatcherReadFailedError);
      await expect(read).rejects.toMatchObject({ batcher: EARLY, vaultId: "set", retryable: true });
      const createdAtReads = vi
        .mocked(provider.readContract)
        .mock.calls.filter(
          ([call]) =>
            (call as { functionName: string }).functionName === "batchCreatedAt" &&
            getAddress((call as { address: Address }).address) === EARLY,
        );
      // Read once, then once more before giving up.
      expect(createdAtReads).toHaveLength(2);
    },
  );

  test.for([
    ["an RPC rate limit", Object.assign(new Error("limit exceeded"), { code: -32005 }), true],
    ["any other failure", new Error("socket hang up"), false],
  ] as const)(
    "names the batcher and the vault when a read fails with %s",
    async ([, cause, retryable], { sdk, provider }) => {
      mockChain(provider);
      const answer = vi.mocked(provider.readContract).getMockImplementation();
      vi.mocked(provider.readContract).mockImplementation(async (call: unknown) => {
        if (getAddress((call as { address: Address }).address) === LATE) {
          throw cause;
        }
        return answer?.(call as never);
      });
      const read = nextBatcher(sdk);
      await expect(read).rejects.toThrow(`batcher ${LATE} of vault "set"`);
      await expect(read).rejects.toMatchObject({ batcher: LATE, vaultId: "set", cause, retryable });
    },
  );

  test("passes a provider's ConfigurationError through, as a read on another chain throws", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider);
    const wrongChain = new ConfigurationError("provider is bound to another chain");
    vi.mocked(provider.readContract).mockRejectedValue(wrongChain);
    await expect(nextBatcher(sdk)).rejects.toBe(wrongChain);
  });

  test("keeps the cause when closed() fails for a reason other than a revert", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider, {
      batches: { [EARLY]: { createdAt: 0n }, [LATE]: { createdAt: NOW, minAge: 600n } },
    });
    const answer = vi.mocked(provider.readContract).getMockImplementation();
    // viem wraps every readContract failure, transport ones included.
    const cause = Object.assign(new Error("Too Many Requests"), {
      name: "ContractFunctionExecutionError",
      cause: Object.assign(new Error("HTTP request failed. Status: 429"), {
        name: "HttpRequestError",
      }),
    });
    vi.mocked(provider.readContract).mockImplementation(async (call: unknown) => {
      if ((call as { functionName: string }).functionName === "closed") {
        throw cause;
      }
      return answer?.(call as never);
    });
    await expect(nextBatcher(sdk)).rejects.toMatchObject({
      message: expect.stringContaining("Could not read"),
      cause,
      retryable: true,
    });
  });

  test("picks by due time, not by address", async ({ sdk, provider }) => {
    // LATE has the higher address, so only its earlier batch can make it win.
    mockChain(provider, {
      batches: {
        [EARLY]: { createdAt: NOW, minAge: 600n },
        [LATE]: { createdAt: NOW, minAge: 100n },
      },
    });
    expect(await nextBatcher(sdk)).toMatchObject({ batcher: LATE });
  });

  test("still reads a BatcherHistory as the list of its batchers", async ({ sdk, provider }) => {
    mockChain(provider);
    const batches = await createVaultClient(sdk).readOpenBatches(upgraded(6n), "deposit");
    expect(batches.map((batch) => batch.batcher)).toStrictEqual([
      ALPHA.depositBatcher,
      BETA.depositBatcher,
    ]);
  });

  test("a BatcherHistory's latest batcher takes joins before the retired one is past lastBatchId", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider, {
      batches: {
        [RETIRED_ALPHA_DEPOSIT]: { createdAt: NOW, minAge: 600n },
        [ALPHA.depositBatcher]: { createdAt: NOW, minAge: 100n },
      },
    });
    const [alpha] = await createVaultClient(sdk).readOpenBatches(upgraded(7n), "deposit");
    expect(alpha).toMatchObject({ batcher: ALPHA.depositBatcher });
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
  // The batcher's current batch, so its previous batch reads `previousState`.
  const ref = { chainId: CHAIN_ID, batcher: ALPHA.depositBatcher, batchId: 7n };

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

  test("reads the first batch of a batcher whose ids start past 1", async ({ sdk, provider }) => {
    mockChain(provider, {
      batches: { [ALPHA.depositBatcher]: { createdAt: NOW - 200n, firstBatchId: 7n } },
    });
    expect((await createVaultClient(sdk).readBatch(ref)).actions).toStrictEqual(["dispatch"]);
  });

  test("cannot be dispatched while the previous batch is in flight", async ({ sdk, provider }) => {
    mockChain(provider, {
      batches: { [ALPHA.depositBatcher]: { createdAt: NOW - 200n, previousState: 1 } },
    });
    expect((await createVaultClient(sdk).readBatch(ref)).actions).toStrictEqual([]);
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
  test("reads the batch a join reaches in each vault", async ({ sdk, provider }) => {
    mockChain(provider);
    const batches = await createVaultClient(sdk).readOpenBatches(STABLE, "deposit");
    expect(batches).toMatchObject([
      { vaultId: "alpha", batcher: ALPHA.depositBatcher, batchId: 7n, observedAt: NOW },
      { vaultId: "beta", batcher: BETA.depositBatcher, batchId: 7n, observedAt: NOW },
    ]);
  });

  test("leaves out a group member whose batchers are all closed, and keeps a paused one", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider, { batches: { [ALPHA.depositBatcher]: { createdAt: 0n, closed: true } } });
    expect(await createVaultClient(sdk).readOpenBatches(STABLE, "deposit")).toMatchObject([
      { vaultId: "beta", paused: false },
    ]);
    mockChain(provider, { paused: [ALPHA.depositBatcher] });
    expect(await createVaultClient(sdk).readOpenBatches(STABLE, "deposit")).toMatchObject([
      { vaultId: "alpha", paused: true },
      { vaultId: "beta", paused: false },
    ]);
  });

  test("refuses a group whose members are all closed", async ({ sdk, provider }) => {
    mockChain(provider, {
      batches: {
        [ALPHA.depositBatcher]: { createdAt: 0n, closed: true },
        [BETA.depositBatcher]: { createdAt: 0n, closed: true },
      },
    });
    const reading = createVaultClient(sdk).readOpenBatches(STABLE, "deposit");
    await expect(reading).rejects.toMatchObject({
      name: "VaultBatcherPausedError",
      batcher: ALPHA.depositBatcher,
      vaultId: "alpha",
    });
    await expect(reading).rejects.toThrow(/every vault in group "stable" is closed/);
  });
});

describe("a vault on its own", () => {
  test("joins its batcher directly, with no vaultId, even when it is in a group", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk).prepareDeposit(BETA_VAULT, {
      account: USER,
      amount: 10n,
    });
    expect(prepared).toMatchObject({ groupId: undefined, vaultId: "beta", route: "direct" });
    expect(prepared.legs.map((leg) => leg.vaultId)).toStrictEqual(["beta"]);
    expect(kinds(prepared.calls)).toStrictEqual(["join"]);
    expect(decode(prepared.calls[0]).args?.[0]).toBe(BETA.depositBatcher);
  });

  test("reads its open batch in each direction", async ({ sdk, provider }) => {
    mockChain(provider);
    const client = createVaultClient(sdk);
    expect(await client.readOpenBatches(ALPHA_VAULT, "deposit")).toMatchObject([
      { vaultId: "alpha", batcher: ALPHA.depositBatcher, batchId: 7n },
    ]);
    expect(await client.readOpenBatches(ALPHA_VAULT, "redeem")).toMatchObject([
      { vaultId: "alpha", batcher: ALPHA.redeemBatcher },
    ]);
  });

  test("is joined through the mutation options with { vault }", async ({ sdk }) => {
    const client = createVaultClient(sdk);
    const deposit = vi.spyOn(client, "deposit").mockResolvedValue({} as never);
    await depositMutationOptions(client).mutationFn({ vault: ALPHA_VAULT, amount: 10n });
    expect(deposit).toHaveBeenCalledWith(
      ALPHA_VAULT,
      { amount: 10n },
      { skipBalanceCheck: undefined, onJoinSubmitted: undefined },
    );
  });

  test("a group is joined through the mutation options with { group, vaultId }", async ({
    sdk,
  }) => {
    const client = createVaultClient(sdk);
    const redeem = vi.spyOn(client, "redeem").mockResolvedValue({} as never);
    await redeemMutationOptions(client).mutationFn({
      group: STABLE,
      vaultId: "beta",
      amount: 10n,
      skipBalanceCheck: true,
    });
    expect(redeem).toHaveBeenCalledWith(
      STABLE,
      { vaultId: "beta", amount: 10n },
      { skipBalanceCheck: true, onJoinSubmitted: undefined },
    );
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
    const outcome = await createVaultClient(sdk).deposit(STABLE, { vaultId: "beta", amount: 10n });
    expect(outcome).toStrictEqual({
      batches: [
        { vaultId: "alpha", chainId: CHAIN_ID, batcher: ALPHA.depositBatcher, batchId: 3n },
        { vaultId: "beta", chainId: CHAIN_ID, batcher: BETA.depositBatcher, batchId: 5n },
      ],
      txHashes: [expect.any(String)],
    });
    expect(signer.writeContract).toHaveBeenCalledTimes(1);
  });

  test.for(["deposit", "redeem"] as const)(
    "%s returns no batch for a member left out of the join",
    async (direction, { sdk, provider, relayer }) => {
      const [alpha, beta] =
        direction === "deposit"
          ? [ALPHA.depositBatcher, BETA.depositBatcher]
          : [ALPHA.redeemBatcher, BETA.redeemBatcher];
      mockChain(provider, { paused: [alpha] });
      mockEncryption(relayer);
      mockReceipt(provider, [beta]);
      const { batches } = await createVaultClient(sdk)[direction](STABLE, {
        vaultId: "beta",
        amount: 10n,
      });
      expect(batches).toStrictEqual([
        { vaultId: "beta", chainId: CHAIN_ID, batcher: beta, batchId: 3n },
      ]);
    },
  );

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
    const elsewhere = defineVaultGroup({
      id: "stable",
      vaults: [vault(ALPHA, "alpha", 1), vault(BETA, "beta", 1)],
    });
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
    const elsewhere = defineVaultGroup({
      id: "stable",
      vaults: [vault(ALPHA, "alpha", 1), vault(BETA, "beta", 1)],
    });
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
