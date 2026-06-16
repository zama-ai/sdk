// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { expect, type MatcherState, type vi } from "vitest";
import type { Address, RawLog } from "@zama-fhe/sdk";
import type { FixturesOf } from "./types";

const tokenAddress = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const userAddress = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;

const burnAmount = `0x${"22".repeat(32)}` as const;
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

/**
 * Custom matchers for TanStack Query cache state in mutation tests. Spread into
 * the `expect.extend(...)` call in `test-fixtures/index.tsx` so the matchers
 * are registered alongside any other groups.
 */
export const mutationAssertions = {
  toEqualDefaultMutationState(this: MatcherState, received: unknown) {
    const pass = this.equals(received, defaultIdleMutationState);
    return {
      pass,
      message: () => `expected value ${pass ? "not " : ""}to equal default idle mutation state`,
      actual: received,
      expected: defaultIdleMutationState,
    };
  },
  toHaveCacheRemoved(this: MatcherState, received: QueryClient, key: QueryKey) {
    const query = received.getQueryCache().find({ queryKey: key });
    const data = received.getQueryData(key);
    const pass = query === undefined && data === undefined;
    return {
      pass,
      message: () =>
        `expected cache entry ${pass ? "not " : ""}to be removed for key ${this.utils.printExpected(key)}`,
    };
  },
  toHaveCacheInvalidated(this: MatcherState, received: QueryClient, key: QueryKey) {
    const state = received.getQueryState(key);
    if (state === undefined) {
      return {
        pass: false,
        message: () => `expected query to exist in cache for key ${this.utils.printExpected(key)}`,
      };
    }
    return {
      pass: state.isInvalidated,
      message: () =>
        `expected cache ${state.isInvalidated ? "not " : ""}to be invalidated for key ${this.utils.printExpected(key)}`,
    };
  },
  toHaveCacheUntouched(this: MatcherState, received: QueryClient, key: QueryKey, value: unknown) {
    const state = received.getQueryState(key);
    if (state === undefined) {
      return {
        pass: false,
        message: () => `expected query to exist in cache for key ${this.utils.printExpected(key)}`,
      };
    }
    if (state.isInvalidated) {
      return {
        pass: false,
        message: () =>
          `expected cache to remain valid for key ${this.utils.printExpected(key)} but was invalidated`,
      };
    }
    const actualValue = received.getQueryData(key);
    const pass = actualValue === value;
    return {
      pass,
      message: () =>
        `expected cache value ${this.utils.printExpected(value)} but got ${this.utils.printReceived(actualValue)}`,
      actual: actualValue,
      expected: value,
    };
  },
  toHaveInvalidatedQueries(this: MatcherState, received: QueryClient, keys: QueryKey[]) {
    const failures: QueryKey[] = [];
    for (const key of keys) {
      const state = received.getQueryState(key);
      if (state === undefined || !state.isInvalidated) {
        failures.push(key);
      }
    }
    const pass = failures.length === 0;
    return {
      pass,
      message: () =>
        pass
          ? `expected some queries not to be invalidated, but all ${keys.length} were`
          : `expected all queries invalidated, but ${failures.length} were not: ${this.utils.printExpected(failures)}`,
    };
  },
};

declare module "vitest" {
  interface Assertion {
    toEqualDefaultMutationState(): void;
    toHaveCacheRemoved(key: QueryKey): void;
    toHaveCacheInvalidated(key: QueryKey): void;
    toHaveCacheUntouched(key: QueryKey, value: unknown): void;
    toHaveInvalidatedQueries(keys: QueryKey[]): void;
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
  burnAmount: typeof burnAmount;
  wagmiBalanceKey: typeof wagmiBalanceKey;
  createUnwrapRequestedLog: typeof createUnwrapRequestedLog;
  mutateAndExpectOnSuccess: typeof mutateAndExpectOnSuccess;
}

export const mutationFixtures: FixturesOf<MutationFixtures> = {
  burnAmount,
  wagmiBalanceKey,
  createUnwrapRequestedLog: async ({}, use) => {
    await use(createUnwrapRequestedLog);
  },
  mutateAndExpectOnSuccess: async ({}, use) => {
    await use(mutateAndExpectOnSuccess);
  },
};
