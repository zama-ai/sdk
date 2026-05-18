import { test as base, type SdkTestFixtures } from "@zama-fhe/sdk/test-fixtures";
import type { TestAPI } from "vitest";
import { reactAddressFixtures, type ReactAddressFixtures } from "./addresses";
import { mutationFixtures, type MutationFixtures } from "./mutations";
import { queryClientFixtures, type QueryClientFixtures } from "./query-client";
import { wrapperFixtures, type WrapperFixtures } from "./wrapper";

/**
 * Flat union of every fixture available in react-sdk tests. The explicit
 * `TestAPI<...>` annotation on `test` keeps TS inference fast — otherwise
 * destructured fixture parameters widen to `any` after a few `.extend(...)`
 * layers.
 */
export type ReactSdkTestFixtures = SdkTestFixtures &
  ReactAddressFixtures &
  QueryClientFixtures &
  WrapperFixtures &
  MutationFixtures;

/**
 * Builder chain — extends the SDK's test (relayer, signer, provider, storage…)
 * with React-specific fixtures.
 *
 *   sdk-base → reactAddresses → queryClient → wrapper → mutations
 */
export const test: TestAPI<ReactSdkTestFixtures> = base
  .extend<ReactAddressFixtures>(reactAddressFixtures)
  .extend<QueryClientFixtures>(queryClientFixtures)
  .extend<WrapperFixtures>(wrapperFixtures)
  .extend<MutationFixtures>(mutationFixtures);

export type { ReactAddressFixtures } from "./addresses";
export type { QueryClientFixtures } from "./query-client";
export type { WrapperFixtures } from "./wrapper";
export type { MutationFixtures } from "./mutations";

export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";
