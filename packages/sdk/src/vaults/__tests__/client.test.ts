import { decodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { vi } from "vitest";
import { confidentialWrapperAbi } from "../../abi/confidential-wrapper.abi";
import {
  ConfigurationError,
  InsufficientConfidentialBalanceError,
  UnlistedConfidentialTokenError,
  VaultActionNotAllowedError,
  VaultBatcherPausedError,
  type VaultJoinUnconfirmedError,
} from "../../errors";
import type { RelayerSDK } from "../../relayer/types";
import { USER } from "../../test-fixtures/constants";
import { describe, expect, joinedLog, test, VALID_INPUT_PROOF } from "../../test-fixtures";
import { Token } from "../../token";
import type { GenericProvider } from "../../types";
import type { ZamaSDK } from "../../zama-sdk";
import { vaultBatcherAbi } from "../abi/vault-batcher.abi";
import { vaultRouterAbi } from "../abi/vault-router.abi";
import { createVaultClient } from "../client";
import { defineVaults } from "../config";
import type { JoinRecord } from "../types";

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

const VAULTS = defineVaults({
  chainId: 31337,
  router: ROUTER,
  groups: {
    stable: {
      asset: ASSET,
      vaults: {
        alpha: { depositBatcher: ALPHA.depositBatcher, redeemBatcher: ALPHA.redeemBatcher },
        beta: { depositBatcher: BETA.depositBatcher, redeemBatcher: BETA.redeemBatcher },
      },
    },
  },
});

const SOLO = defineVaults({
  chainId: 31337,
  groups: {
    solo: {
      asset: ASSET,
      vaults: {
        main: { depositBatcher: ALPHA.depositBatcher, redeemBatcher: ALPHA.redeemBatcher },
      },
    },
  },
});

const NOW = 1_000_000n;

// Alpha's deposit batcher was upgraded: the retired one takes joins up to batch 7.
const RETIRED_ALPHA_DEPOSIT = getAddress("0x7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a7a");
function upgradedVaults(lastBatchId: bigint) {
  return defineVaults({
    ...VAULTS,
    groups: {
      stable: {
        ...VAULTS.groups.stable,
        vaults: {
          ...VAULTS.groups.stable.vaults,
          alpha: {
            depositBatcher: {
              retired: [{ address: RETIRED_ALPHA_DEPOSIT, lastBatchId }],
              latest: ALPHA.depositBatcher,
            },
            redeemBatcher: ALPHA.redeemBatcher,
          },
        },
      },
    },
  });
}

interface BatchFacts {
  state: number;
  createdAt?: bigint;
  minAge?: bigint;
  dispatchedAt?: bigint;
  deadline?: bigint;
  deposit?: Hex;
}

/** What each batcher reports, and the batches a position read asks about. */
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
        // One handle per batcher, so each callback can be checked against its own decrypt.
        return `0x${batcher.slice(2, 4).repeat(32)}`;
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

function record(
  direction: "deposit" | "redeem" = "deposit",
): JoinRecord<"stable", "alpha" | "beta"> {
  const side = direction === "deposit" ? "depositBatcher" : "redeemBatcher";
  return {
    v: 1,
    chainId: 31337,
    groupId: "stable",
    direction,
    account: USER,
    legs: [
      { vaultId: "alpha", batcher: ALPHA[side], batchId: 3n },
      { vaultId: "beta", batcher: BETA[side], batchId: 5n },
    ],
  };
}

function decodeCall(
  abi: typeof vaultBatcherAbi | typeof vaultRouterAbi | typeof confidentialWrapperAbi,
  data: Hex,
) {
  return decodeFunctionData({ abi, data });
}

describe("defineVaults", () => {
  test("refuses a group with no vault", () => {
    expect(() =>
      defineVaults({ chainId: 1, groups: { empty: { asset: ASSET, vaults: {} } } }),
    ).toThrow(ConfigurationError);
  });

  test("refuses a batcher named twice", () => {
    expect(() =>
      defineVaults({
        chainId: 1,
        groups: {
          a: {
            asset: ASSET,
            vaults: {
              x: { depositBatcher: ALPHA.depositBatcher, redeemBatcher: ALPHA.depositBatcher },
            },
          },
        },
      }),
    ).toThrow(/more than once/);
  });

  test("refuses an invalid address", () => {
    expect(() =>
      defineVaults({
        chainId: 1,
        groups: { a: { asset: "0x12" as Address, vaults: { x: ALPHA } } },
      }),
    ).toThrow(/not an address/);
  });
});

describe("prepareDeposit", () => {
  test("a group of one sends one transfer-and-call to the batcher, with no grants", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk, SOLO).prepareDeposit({
      groupId: "solo",
      amount: 10n,
    });
    expect(prepared.grants).toStrictEqual([]);
    expect(prepared.calls).toHaveLength(1);
    expect(prepared.calls[0]!.to).toBe(ASSET);
    const call = decodeCall(confidentialWrapperAbi, prepared.calls[0]!.data);
    expect(call.functionName).toBe("confidentialTransferAndCall");
    expect(call.args?.[0]).toBe(ALPHA.depositBatcher);
    expect(prepared.atomic).toBe(false);
    expect(prepared.sender).toBe(USER);
  });

  test("a multi-vault sequential deposit pushes through the router with every leg", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk, VAULTS).prepareDeposit({
      groupId: "stable",
      vaultId: "beta",
      amount: 10n,
    });
    expect(prepared.calls).toHaveLength(1);
    const call = decodeCall(confidentialWrapperAbi, prepared.calls[0]!.data);
    expect(call.args?.[0]).toBe(ROUTER);
    // The router encryption carries one amount per vault: the chosen one's and a zero.
    const routerEncrypt = vi
      .mocked(relayer.encryptValues)
      .mock.calls.map(
        ([params]) =>
          params as unknown as { contractAddress: Address; values: { value: bigint }[] },
      )
      .find((params) => getAddress(params.contractAddress) === ROUTER);
    expect(routerEncrypt?.values.map((entry) => entry.value)).toStrictEqual([0n, 10n]);
  });

  test("an atomic wallet gets one transfer per vault, marked atomic", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk, VAULTS).prepareDeposit(
      { groupId: "stable", vaultId: "alpha", amount: 10n },
      { walletMode: "atomic" },
    );
    expect(
      prepared.calls.map((call) => decodeCall(confidentialWrapperAbi, call.data).args?.[0]),
    ).toStrictEqual([ALPHA.depositBatcher, BETA.depositBatcher]);
    expect(prepared.atomic).toBe(true);
  });

  test("is plain data that survives structuredClone", async ({ sdk, provider, relayer }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk, VAULTS).prepareDeposit({
      groupId: "stable",
      vaultId: "alpha",
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
      createVaultClient(sdk, VAULTS).prepareDeposit(
        { groupId: "stable", vaultId: "alpha", amount: 10n },
        { skipChecks: ["balance", "config"] },
      ),
    ).rejects.toBeInstanceOf(VaultBatcherPausedError);
  });

  test("refuses a router deposit of an unlisted asset", async ({ sdk, provider, relayer }) => {
    mockChain(provider, { listed: false });
    mockEncryption(relayer);
    await expect(
      createVaultClient(sdk, VAULTS).prepareDeposit({
        groupId: "stable",
        vaultId: "alpha",
        amount: 10n,
      }),
    ).rejects.toBeInstanceOf(UnlistedConfidentialTokenError);
  });

  test("refuses a short balance", async ({ sdk, provider, relayer }) => {
    mockChain(provider, { balance: 5n });
    mockEncryption(relayer);
    await expect(
      createVaultClient(sdk, VAULTS).prepareDeposit({
        groupId: "stable",
        vaultId: "alpha",
        amount: 10n,
      }),
    ).rejects.toBeInstanceOf(InsufficientConfidentialBalanceError);
  });

  test("needs skipChecks balance to prepare for another account", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const client = createVaultClient(sdk, VAULTS);
    await expect(
      client.prepareDeposit(
        { groupId: "stable", vaultId: "alpha", amount: 10n },
        { account: FRIEND },
      ),
    ).rejects.toThrow(/skipChecks/);
    const prepared = await client.prepareDeposit(
      { groupId: "stable", vaultId: "alpha", amount: 10n },
      { account: FRIEND, skipChecks: ["balance"] },
    );
    expect(prepared.sender).toBe(FRIEND);
  });

  test("a beneficiary in a group of one pulls through the batcher and grants it first", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider, { operators: false });
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk, SOLO).prepareDeposit({
      groupId: "solo",
      amount: 10n,
      beneficiary: FRIEND,
    });
    expect(prepared.grants).toHaveLength(1);
    expect(decodeCall(confidentialWrapperAbi, prepared.grants[0]!.data).args?.[0]).toBe(
      ALPHA.depositBatcher,
    );
    expect(prepared.expiresAt).toBe(NOW + 3600n);
    const join = decodeCall(vaultBatcherAbi, prepared.calls[0]!.data);
    expect(join.functionName).toBe("join");
    expect(join.args?.[0]).toBe(FRIEND);
  });

  test("refuses a beneficiary in a larger group at runtime too", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const client = createVaultClient(
      sdk,
      VAULTS as typeof VAULTS & { groups: Record<string, never> },
    );
    await expect(
      client.prepareDeposit({
        groupId: "stable",
        vaultId: "alpha",
        amount: 10n,
        beneficiary: FRIEND,
      } as never),
    ).rejects.toThrow(/only a group of one/);
  });
});

describe("prepareRedeem", () => {
  test("goes through the router and grants it on every share token it lacks", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider, { operators: false });
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk, VAULTS).prepareRedeem({
      groupId: "stable",
      vaultId: "alpha",
      amount: 10n,
    });
    expect(prepared.grants.map((grant) => grant.to)).toStrictEqual([ALPHA.share, BETA.share]);
    expect(decodeCall(vaultRouterAbi, prepared.calls[0]!.data).functionName).toBe("join");
  });
});

describe("prepareExit", () => {
  test("quits a pending leg, claims a finalized one, and needs the account to send", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider, {
      batches: { [ALPHA.depositBatcher]: { state: 0 }, [BETA.depositBatcher]: { state: 2 } },
    });
    const prepared = await createVaultClient(sdk, VAULTS).prepareExit(record());
    expect(
      prepared.calls.map((call) => decodeCall(vaultBatcherAbi, call.data).functionName),
    ).toStrictEqual(["quit", "claim"]);
    expect(prepared.sender).toBe(USER);
  });

  test("recovers canceled legs, which anyone may send", async ({ sdk, provider }) => {
    mockChain(provider, {
      batches: { [ALPHA.depositBatcher]: { state: 3 }, [BETA.depositBatcher]: { state: 2 } },
    });
    const prepared = await createVaultClient(sdk, VAULTS).prepareExit(record());
    expect(
      prepared.calls.map((call) => decodeCall(vaultBatcherAbi, call.data).functionName),
    ).toStrictEqual(["recover", "claim"]);
    expect(prepared.sender).toBeNull();
  });

  test("refuses while a leg is dispatched", async ({ sdk, provider }) => {
    mockChain(provider, { batches: { [ALPHA.depositBatcher]: { state: 1 } } });
    await expect(createVaultClient(sdk, VAULTS).prepareExit(record())).rejects.toMatchObject({
      reason: "leg-dispatched",
    });
  });

  test("refuses a record that leaves out a vault", async ({ sdk, provider }) => {
    mockChain(provider);
    const partial = { ...record(), legs: [record().legs[0]!] };
    await expect(createVaultClient(sdk, VAULTS).prepareExit(partial)).rejects.toThrow(
      /one leg per vault/,
    );
  });
});

describe("prepareDispatch", () => {
  test("dispatches every pending leg that is old enough", async ({ sdk, provider }) => {
    mockChain(provider, {
      batches: {
        [ALPHA.depositBatcher]: { state: 0, createdAt: NOW - 200n, minAge: 100n },
        [BETA.depositBatcher]: { state: 0, createdAt: NOW - 200n, minAge: 100n },
      },
    });
    const prepared = await createVaultClient(sdk, VAULTS).prepareDispatch(record());
    expect(prepared.calls.map((call) => call.to)).toStrictEqual([
      ALPHA.depositBatcher,
      BETA.depositBatcher,
    ]);
    expect(prepared.sender).toBeNull();
  });

  test("refuses when no leg is old enough", async ({ sdk, provider }) => {
    mockChain(provider);
    await expect(createVaultClient(sdk, VAULTS).prepareDispatch(record())).rejects.toBeInstanceOf(
      VaultActionNotAllowedError,
    );
  });
});

describe("batcher upgrades", () => {
  // Every batcher reports currentBatchId 7 in mockChain.
  test("joins the retired batcher while its current batch is at most lastBatchId", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk, upgradedVaults(7n)).prepareDeposit(
      { groupId: "stable", vaultId: "alpha", amount: 10n },
      { walletMode: "atomic" },
    );
    expect(
      prepared.calls.map((call) => decodeCall(confidentialWrapperAbi, call.data).args?.[0]),
    ).toStrictEqual([RETIRED_ALPHA_DEPOSIT, BETA.depositBatcher]);
  });

  test("joins the latest batcher once the retired one has passed lastBatchId", async ({
    sdk,
    provider,
    relayer,
  }) => {
    mockChain(provider);
    mockEncryption(relayer);
    const prepared = await createVaultClient(sdk, upgradedVaults(6n)).prepareDeposit(
      { groupId: "stable", vaultId: "alpha", amount: 10n },
      { walletMode: "atomic" },
    );
    expect(
      prepared.calls.map((call) => decodeCall(confidentialWrapperAbi, call.data).args?.[0]),
    ).toStrictEqual([ALPHA.depositBatcher, BETA.depositBatcher]);
  });

  test("still exits a leg that joined the retired batcher", async ({ sdk, provider }) => {
    mockChain(provider, { batches: { [RETIRED_ALPHA_DEPOSIT]: { state: 2 } } });
    const old = {
      ...record(),
      legs: [{ vaultId: "alpha", batcher: RETIRED_ALPHA_DEPOSIT, batchId: 3n }, record().legs[1]!],
    } as const;
    const prepared = await createVaultClient(sdk, upgradedVaults(6n)).prepareExit(old);
    expect(prepared.calls.map((call) => call.to)).toStrictEqual([
      RETIRED_ALPHA_DEPOSIT,
      BETA.depositBatcher,
    ]);
  });

  test("refuses a batcher listed both as retired and as another vault's", () => {
    expect(() =>
      defineVaults({
        chainId: 1,
        groups: {
          a: {
            asset: ASSET,
            vaults: {
              x: {
                depositBatcher: {
                  retired: [{ address: BETA.depositBatcher, lastBatchId: 1n }],
                  latest: ALPHA.depositBatcher,
                },
                redeemBatcher: ALPHA.redeemBatcher,
              },
              y: { depositBatcher: BETA.depositBatcher, redeemBatcher: BETA.redeemBatcher },
            },
          },
        },
      }),
    ).toThrow(/more than once/);
  });
});

describe("readPosition", () => {
  test("queued, with dispatch time as the next change", async ({ sdk, provider }) => {
    mockChain(provider);
    const position = await createVaultClient(sdk, VAULTS).readPosition(record());
    expect(position.phase).toBe("queued");
    expect(position.availableActions).toStrictEqual(["exit"]);
    expect(position.nextChangeAt).toBe(NOW + 90n);
    expect(position.chosenVaultId).toBeNull();
  });

  test("settling while a leg is dispatched, with only finalize", async ({ sdk, provider }) => {
    mockChain(provider, {
      batches: { [BETA.depositBatcher]: { state: 1, dispatchedAt: NOW - 10n, deadline: 60n } },
    });
    const position = await createVaultClient(sdk, VAULTS).readPosition(record());
    expect(position.phase).toBe("settling");
    expect(position.availableActions).toStrictEqual(["finalize"]);
  });

  test("with decrypt, names the chosen vault, and closes once every deposit is zero", async ({
    sdk,
    provider,
  }) => {
    const alphaDeposit = `0x${"11".repeat(32)}` as Hex;
    const betaDeposit = `0x${"22".repeat(32)}` as Hex;
    mockChain(provider, {
      batches: {
        [ALPHA.depositBatcher]: { state: 2, deposit: alphaDeposit },
        [BETA.depositBatcher]: { state: 2, deposit: betaDeposit },
      },
    });
    const decrypt = vi.spyOn(sdk.decryption, "decryptValues");
    decrypt.mockResolvedValueOnce({ [alphaDeposit]: 0n, [betaDeposit]: 10n } as never);
    const client = createVaultClient(sdk, VAULTS);
    const position = await client.readPosition(record(), { decrypt: true });
    expect(position.phase).toBe("ready");
    expect(position.chosenVaultId).toBe("beta");
    // One decrypt for every leg, so the relayer cannot tell which one matters.
    expect(decrypt.mock.calls[0]![0]).toHaveLength(2);

    decrypt.mockResolvedValueOnce({ [alphaDeposit]: 0n, [betaDeposit]: 0n } as never);
    const closed = await client.readPosition(record(), { decrypt: true });
    expect(closed.phase).toBe("closed");
    expect(closed.availableActions).toStrictEqual([]);
  });
});

describe("deposit", () => {
  function mockReceipt(provider: GenericProvider, batchers: readonly Address[]) {
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: batchers.map((batcher, index) =>
        joinedLog({ batcher, account: USER, batchId: [3n, 5n][index]! }),
      ),
    });
  }

  test("returns the record, read from the receipt", async ({ sdk, provider, relayer, signer }) => {
    mockChain(provider);
    mockEncryption(relayer);
    mockReceipt(provider, [ALPHA.depositBatcher, BETA.depositBatcher]);
    const { record: saved, txHashes } = await createVaultClient(sdk, VAULTS).deposit({
      groupId: "stable",
      vaultId: "beta",
      amount: 10n,
    });
    expect(saved).toStrictEqual(record());
    expect(txHashes).toHaveLength(1);
    expect(signer.writeContract).toHaveBeenCalledTimes(1);
  });

  test("throws when the receipt does not confirm every leg", async ({ sdk, provider, relayer }) => {
    mockChain(provider);
    mockEncryption(relayer);
    mockReceipt(provider, [ALPHA.depositBatcher]);
    await expect(
      createVaultClient(sdk, VAULTS).deposit({ groupId: "stable", vaultId: "beta", amount: 10n }),
    ).rejects.toMatchObject({
      unconfirmedVaultIds: ["beta"],
    } satisfies Partial<VaultJoinUnconfirmedError>);
  });

  test("sends the grants before the redeem", async ({ sdk, provider, relayer, signer }) => {
    mockChain(provider, { operators: false });
    mockEncryption(relayer);
    vi.mocked(provider.waitForTransactionReceipt).mockResolvedValue({
      logs: [ALPHA.redeemBatcher, BETA.redeemBatcher].map((batcher) =>
        joinedLog({ batcher, account: USER, batchId: 1n }),
      ),
    });
    const { txHashes } = await createVaultClient(sdk, VAULTS).redeem({
      groupId: "stable",
      vaultId: "alpha",
      amount: 1n,
    });
    expect(txHashes).toHaveLength(3);
    expect(
      vi.mocked(signer.writeContract).mock.calls.map(([call]) => call.functionName),
    ).toStrictEqual(["setOperator", "setOperator", "join"]);
  });
});

describe("prepareFinalize", () => {
  test("settles every dispatched leg with its own public decrypt and proof", async ({
    sdk,
    provider,
  }) => {
    mockChain(provider, {
      batches: { [ALPHA.depositBatcher]: { state: 1 }, [BETA.depositBatcher]: { state: 1 } },
    });
    const publicDecrypt = vi
      .spyOn(sdk.decryption, "decryptPublicValues")
      .mockImplementation(
        async ([handle]) =>
          ({
            clearValues: { [handle as Hex]: 42n },
            decryptionProof: "0x1234",
            abiEncodedClearValues: "0x",
          }) as never,
      );
    const prepared = await createVaultClient(sdk, VAULTS).prepareFinalize(record());
    expect(publicDecrypt).toHaveBeenCalledTimes(2);
    expect(prepared.sender).toBeNull();
    expect(
      prepared.calls.map((call) => {
        const decoded = decodeCall(vaultBatcherAbi, call.data);
        return [call.to, decoded.functionName, decoded.args?.[1]];
      }),
    ).toStrictEqual([
      [ALPHA.depositBatcher, "dispatchBatchCallback", 42n],
      [BETA.depositBatcher, "dispatchBatchCallback", 42n],
    ]);
  });

  test("refuses when no leg is dispatched", async ({ sdk, provider }) => {
    mockChain(provider);
    await expect(createVaultClient(sdk, VAULTS).prepareFinalize(record())).rejects.toMatchObject({
      reason: "nothing-to-finalize",
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
    const client = createVaultClient(sdk as ZamaSDK, { ...VAULTS, chainId: 1 });
    await expect(
      client.prepareDeposit(
        { groupId: "stable", vaultId: "alpha", amount: 10n },
        { account: USER, skipChecks: ["balance"] },
      ),
    ).rejects.toThrow(/switch to chain 1/);
  });
});
