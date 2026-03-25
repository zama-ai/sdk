import { describe, expectTypeOf, test } from "vitest";
import type { GenericStorage } from "../storage";

describe("GenericStorage", () => {
  test("get returns Promise<T | null>", () => {
    expectTypeOf<GenericStorage["get"]>().returns.toEqualTypeOf<Promise<unknown | null>>();
  });

  test("set returns Promise<void>", () => {
    expectTypeOf<GenericStorage["set"]>().returns.toEqualTypeOf<Promise<void>>();
  });

  test("delete returns Promise<void>", () => {
    expectTypeOf<GenericStorage["delete"]>().returns.toEqualTypeOf<Promise<void>>();
  });
});
