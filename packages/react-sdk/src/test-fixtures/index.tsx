import { test as base } from "../../../sdk/src/test-fixtures";
import { reactAddressFixtures, type ReactAddressFixtures } from "./addresses";
import { mutationFixtures, type MutationFixtures } from "./mutations";
import { queryClientFixtures, type QueryClientFixtures } from "./query-client";
import { wrapperFixtures, type WrapperFixtures } from "./wrapper";

type ReactSDKTestFixtures = ReactAddressFixtures &
  QueryClientFixtures &
  WrapperFixtures &
  MutationFixtures;

export const test = base.extend<ReactSDKTestFixtures>({
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
