import { test as base } from "@zama-fhe/sdk/test-fixtures";
import type { TestAPI } from "vitest";
import { reactAddressFixtures, type ReactAddressFixtures } from "./addresses";
import { mutationFixtures, type MutationFixtures } from "./mutations";
import { queryClientFixtures, type QueryClientFixtures } from "./query-client";
import { wrapperFixtures, type WrapperFixtures } from "./wrapper";

type ReactExtensions = ReactAddressFixtures &
  QueryClientFixtures &
  WrapperFixtures &
  MutationFixtures;

export const test: TestAPI<ReactExtensions> = base.extend<ReactExtensions>({
  ...reactAddressFixtures,
  ...queryClientFixtures,
  ...wrapperFixtures,
  ...mutationFixtures,
});

export type { ReactAddressFixtures } from "./addresses";
export type { MutationFixtures } from "./mutations";
export type { QueryClientFixtures } from "./query-client";
export type { WrapperFixtures } from "./wrapper";

export { afterEach, beforeEach, describe, expect, vi, type Mock } from "vitest";
