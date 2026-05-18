import { test as base } from "@zama-fhe/sdk/test-fixtures";
import { queryClientFixtures, type QueryClientFixtures } from "./query-client";
import { tokenFixtures, type TokenFixtures } from "./token";
import { wrapperFixtures, type WrapperFixtures } from "./wrapper";

/**
 * Builder chain — extends the SDK's test (relayer, signer, provider, storage…)
 * with React-specific fixtures.
 *
 *   sdk-base → token → queryClient → wrapper
 */
export const test = base
  .extend<TokenFixtures>(tokenFixtures)
  .extend<QueryClientFixtures>(queryClientFixtures)
  .extend<WrapperFixtures>(wrapperFixtures);

export const it = test;

export { TEST_ADDR_A, TEST_ADDR_B } from "./constants";
export type { TokenFixtures } from "./token";
export type { QueryClientFixtures } from "./query-client";
export type { WrapperFixtures } from "./wrapper";

export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";
