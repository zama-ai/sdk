// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { expect, type vi } from "vitest";
import type { Address, RawLog } from "@zama-fhe/sdk";
import type { FixturesOf } from "./types";

const tokenAddress = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const userAddress = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;

const burnAmountHandle = `0x${"22".repeat(32)}` as const;
const unwrapRequestedTopic =
  "0x4b1bfb262557cf08a74ddeefb8aef086b81deb08484bdc1820b9f420cdd1aa0e" as const;

const wagmiBalanceKey = [
  "readContract",
  { functionName: "balanceOf", address: tokenAddress, args: [userAddress] },
] as const;

const defaultIdleMutationState = {
  context: undefined,
  data: undefined,
  error: null,
  failureCount: 0,
  failureReason: null,
  isError: false,
  isIdle: true,
  isPaused: false,
  isPending: false,
  isSuccess: false,
  status: "idle",
  submittedAt: 0,
  variables: undefined,
} as const;

function toTopicAddress(address: Address): Address {
  return `0x${address.slice(2).padStart(64, "0")}`;
}

function createUnwrapRequestedLog(unwrapRequestId: Address): RawLog {
  return {
    topics: [unwrapRequestedTopic, toTopicAddress(userAddress), unwrapRequestId],
    data: `0x${"00".repeat(32)}`,
  };
}

function expectDefaultMutationState(state: unknown): void {
  expect(state).toEqual(defaultIdleMutationState);
}

function expectCacheRemoved(qc: QueryClient, key: QueryKey): void {
  const query = qc.getQueryCache().find({ queryKey: key });
  if (query !== undefined || qc.getQueryData(key) !== undefined) {
    throw new Error("Expected query cache to be removed");
  }
}

function expectCacheInvalidated(qc: QueryClient, key: QueryKey): void {
  const state = qc.getQueryState(key);
  if (state === undefined) {
    throw new Error("Expected query to exist in cache");
  }
  if (!state.isInvalidated) {
    throw new Error("Expected query cache to be invalidated");
  }
}

function expectCacheUntouched(qc: QueryClient, key: QueryKey, value: unknown): void {
  const state = qc.getQueryState(key);
  if (state === undefined) {
    throw new Error("Expected query to exist in cache");
  }
  if (state.isInvalidated) {
    throw new Error("Expected query cache to remain valid");
  }
  if (qc.getQueryData(key) !== value) {
    throw new Error("Expected query cache value to remain unchanged");
  }
}

function expectInvalidatedQueries(client: QueryClient, keys: QueryKey[]): void {
  for (const key of keys) {
    expectCacheInvalidated(client, key);
  }
}

async function mutateAndExpectOnSuccess(
  mutate: () => Promise<unknown>,
  onSuccess: ReturnType<typeof vi.fn>,
  assertClient: (client: QueryClient) => void,
  options: { variables: "defined" | "undefined" } = { variables: "defined" },
): Promise<void> {
  await act(mutate);
  expect(onSuccess).toHaveBeenCalledOnce();

  const [data, variables, _onMutateResult, context] = onSuccess.mock.calls[0] ?? [];
  expect(data).toBeDefined();
  if (options.variables === "undefined") {
    expect(variables).toBeUndefined();
  } else {
    expect(variables).toBeDefined();
  }
  expect(context.client).toBeInstanceOf(QueryClient);

  assertClient(context.client);
}

export interface MutationFixtures {
  burnAmountHandle: typeof burnAmountHandle;
  wagmiBalanceKey: typeof wagmiBalanceKey;
  createUnwrapRequestedLog: typeof createUnwrapRequestedLog;
  expectDefaultMutationState: typeof expectDefaultMutationState;
  mutateAndExpectOnSuccess: typeof mutateAndExpectOnSuccess;
  expectInvalidatedQueries: typeof expectInvalidatedQueries;
  expectCacheRemoved: typeof expectCacheRemoved;
  expectCacheInvalidated: typeof expectCacheInvalidated;
  expectCacheUntouched: typeof expectCacheUntouched;
}

export const mutationFixtures: FixturesOf<MutationFixtures> = {
  burnAmountHandle,
  wagmiBalanceKey,
  createUnwrapRequestedLog: async ({}, use) => {
    await use(createUnwrapRequestedLog);
  },
  expectDefaultMutationState: async ({}, use) => {
    await use(expectDefaultMutationState);
  },
  mutateAndExpectOnSuccess: async ({}, use) => {
    await use(mutateAndExpectOnSuccess);
  },
  expectInvalidatedQueries: async ({}, use) => {
    await use(expectInvalidatedQueries);
  },
  expectCacheRemoved: async ({}, use) => {
    await use(expectCacheRemoved);
  },
  expectCacheInvalidated: async ({}, use) => {
    await use(expectCacheInvalidated);
  },
  expectCacheUntouched: async ({}, use) => {
    await use(expectCacheUntouched);
  },
};
