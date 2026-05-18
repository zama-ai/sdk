// oxlint-disable no-empty-pattern
// oxlint-disable eslint-plugin-react-hooks/rules-of-hooks
import { QueryClient, type QueryKey } from "@tanstack/react-query";
import { act } from "@testing-library/react";
import { expect, vi } from "vitest";
import type { RelayerFixtures } from "@zama-fhe/sdk/test-fixtures";
import type { Address, RawLog } from "@zama-fhe/sdk";
import type { FixturesOf } from "./types";

const TOKEN = "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a" as Address;
const USER = "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B" as Address;
const SPENDER = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;
const WRAPPER = "0x4D4d4D4d4d4D4D4d4D4D4D4d4d4d4d4D4D4d4d4D" as Address;
const COORDINATOR = "0x5e5E5e5e5E5e5E5E5e5E5E5e5e5E5E5E5e5E5E5e" as Address;
const TOKEN_B = "0x7A7a7A7a7a7a7a7A7a7a7a7A7a7A7A7A7A7A7a7A" as Address;
const OTHER_TOKEN = "0x9C9c9c9c9c9c9C9c9c9C9C9c9c9C9c9c9c9c9C9c" as Address;
const RECIPIENT = "0x8b8b8b8b8B8B8b8B8B8b8b8b8b8B8B8B8B8b8B8b" as Address;
const TRANSFER_FROM = "0xeDEdEDedeDEdeDeDedeDEDeDEdEdededeDeDEdED" as Address;
const UNDERLYING = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa" as Address;

const HANDLE = `0x${"11".repeat(32)}` as const;
const BURN_AMOUNT_HANDLE = `0x${"22".repeat(32)}` as const;
const DECRYPTION_PROOF = `0x${"33".repeat(32)}` as const;
const UNWRAP_REQUESTED_TOPIC =
  "0x4b1bfb262557cf08a74ddeefb8aef086b81deb08484bdc1820b9f420cdd1aa0e" as const;

const WAGMI_BALANCE_KEY = [
  "readContract",
  { functionName: "balanceOf", address: TOKEN, args: [USER] },
] as const;

const DEFAULT_IDLE_MUTATION_STATE = {
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
    topics: [UNWRAP_REQUESTED_TOPIC, toTopicAddress(USER), unwrapRequestId],
    data: `0x${"00".repeat(32)}`,
  };
}

function expectDefaultMutationState(state: unknown): void {
  expect(state).toEqual(DEFAULT_IDLE_MUTATION_STATE);
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
  TOKEN: Address;
  USER: Address;
  SPENDER: Address;
  WRAPPER: Address;
  COORDINATOR: Address;
  TOKEN_B: Address;
  OTHER_TOKEN: Address;
  RECIPIENT: Address;
  TRANSFER_FROM: Address;
  UNDERLYING: Address;
  HANDLE: typeof HANDLE;
  BURN_AMOUNT_HANDLE: typeof BURN_AMOUNT_HANDLE;
  DECRYPTION_PROOF: typeof DECRYPTION_PROOF;
  UNWRAP_REQUESTED_TOPIC: typeof UNWRAP_REQUESTED_TOPIC;
  WAGMI_BALANCE_KEY: typeof WAGMI_BALANCE_KEY;
  DEFAULT_IDLE_MUTATION_STATE: typeof DEFAULT_IDLE_MUTATION_STATE;
  toTopicAddress: typeof toTopicAddress;
  createUnwrapRequestedLog: typeof createUnwrapRequestedLog;
  mockPublicDecrypt: () => void;
  expectDefaultMutationState: typeof expectDefaultMutationState;
  mutateAndExpectOnSuccess: typeof mutateAndExpectOnSuccess;
  expectInvalidatedQueries: typeof expectInvalidatedQueries;
  expectCacheRemoved: typeof expectCacheRemoved;
  expectCacheInvalidated: typeof expectCacheInvalidated;
  expectCacheUntouched: typeof expectCacheUntouched;
}

export const mutationFixtures: FixturesOf<MutationFixtures, RelayerFixtures> = {
  TOKEN,
  USER,
  SPENDER,
  WRAPPER,
  COORDINATOR,
  TOKEN_B,
  OTHER_TOKEN,
  RECIPIENT,
  TRANSFER_FROM,
  UNDERLYING,
  HANDLE,
  BURN_AMOUNT_HANDLE,
  DECRYPTION_PROOF,
  UNWRAP_REQUESTED_TOPIC,
  WAGMI_BALANCE_KEY,
  DEFAULT_IDLE_MUTATION_STATE,
  toTopicAddress: async ({}, use) => {
    await use(toTopicAddress);
  },
  createUnwrapRequestedLog: async ({}, use) => {
    await use(createUnwrapRequestedLog);
  },
  mockPublicDecrypt: async ({ relayer }, use) => {
    await use(() => {
      vi.mocked(relayer.publicDecrypt).mockImplementation((handles: string[]) => {
        const clearValues: Record<string, bigint> = {};
        for (const h of handles) {
          clearValues[h] = 1n;
        }
        return Promise.resolve({
          clearValues,
          abiEncodedClearValues: "0x1",
          decryptionProof: DECRYPTION_PROOF,
        });
      });
    });
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
