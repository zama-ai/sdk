import { test as baseTest, expect } from "../../../sdk/src/test-fixtures";
import { reactAddressFixtures, type ReactAddressFixtures } from "./addresses";
import { mutationAssertions, mutationFixtures, type MutationFixtures } from "./mutations";
import { queryClientFixtures, type QueryClientFixtures } from "./query-client";
import { wrapperFixtures, type WrapperFixtures } from "./wrapper";

type ReactSDKTestFixtures = ReactAddressFixtures &
  QueryClientFixtures &
  WrapperFixtures &
  MutationFixtures;

export const test = baseTest.extend<ReactSDKTestFixtures>({
  ...reactAddressFixtures,
  ...queryClientFixtures,
  ...wrapperFixtures,
  ...mutationFixtures,
});

expect.extend({
  ...mutationAssertions,
});

export { expect };
export { MOCK_ENCRYPTED_VALUE, MOCK_INPUT_PROOF } from "../../../sdk/src/test-fixtures";
export type { ReactAddressFixtures } from "./addresses";
export type { MutationFixtures } from "./mutations";
export type { QueryClientFixtures } from "./query-client";
export type { WrapperFixtures } from "./wrapper";
export { afterEach, beforeEach, describe, vi, type Mock } from "vitest";
