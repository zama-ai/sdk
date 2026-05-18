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

type ReactExtensions = ReactAddressFixtures &
  QueryClientFixtures &
  WrapperFixtures &
  MutationFixtures;

/**
 * Single `.extend()` call with every react-sdk fixture group spread in. vitest
 * resolves intra-call dependencies automatically and the cumulative test type
 * stays as a flat intersection rather than nested `AddBuilderWorker<...>`s,
 * which TypeScript otherwise struggles to display.
 */
export const test: TestAPI<ReactSdkTestFixtures> = base.extend<ReactExtensions>({
  ...reactAddressFixtures,
  ...queryClientFixtures,
  ...wrapperFixtures,
  ...mutationFixtures,
});

export type { ReactAddressFixtures } from "./addresses";
export type { QueryClientFixtures } from "./query-client";
export type { WrapperFixtures } from "./wrapper";
export type { MutationFixtures } from "./mutations";

export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";
