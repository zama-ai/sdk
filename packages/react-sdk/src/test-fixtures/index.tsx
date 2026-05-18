import { test as base, type SdkTestFixtures } from "@zama-fhe/sdk/test-fixtures";
import type { TestAPI } from "vitest";
import { mutationFixtures, type MutationFixtures } from "./mutations";
import { queryClientFixtures, type QueryClientFixtures } from "./query-client";
import { tokenFixtures, type TokenFixtures } from "./token";
import { wrapperFixtures, type WrapperFixtures } from "./wrapper";

/**
 * Flat union of every fixture available in react-sdk tests. The explicit
 * `TestAPI<...>` annotation on `test` keeps TS inference fast — otherwise
 * destructured fixture parameters widen to `any` after a few `.extend(...)`
 * layers.
 *
 * The local `TokenFixtures` overrides the SDK's `token` fixture with a mocked
 * Token whose methods are `vi.fn()`s, so React mutation tests can stub returns
 * per-call (e.g. `vi.mocked(token.shield).mockRejectedValueOnce(...)`).
 */
export type ReactSdkTestFixtures = Omit<SdkTestFixtures, keyof TokenFixtures> &
  TokenFixtures &
  QueryClientFixtures &
  WrapperFixtures &
  MutationFixtures;

/**
 * Builder chain — extends the SDK's test (relayer, signer, provider, storage…)
 * with React-specific fixtures.
 *
 *   sdk-base → token → queryClient → wrapper → mutations
 */
export const test: TestAPI<ReactSdkTestFixtures> = base
  .extend<TokenFixtures>(tokenFixtures)
  .extend<QueryClientFixtures>(queryClientFixtures)
  .extend<WrapperFixtures>(wrapperFixtures)
  .extend<MutationFixtures>(mutationFixtures);

export { TEST_ADDR_A, TEST_ADDR_B } from "./constants";
export type { TokenFixtures } from "./token";
export type { QueryClientFixtures } from "./query-client";
export type { WrapperFixtures } from "./wrapper";
export type { MutationFixtures } from "./mutations";

export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";
