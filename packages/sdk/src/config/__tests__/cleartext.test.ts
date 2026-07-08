import { describe, expect, test } from "../../test-fixtures";
import type { FheChain } from "../../chains";
import { ConfigurationError } from "../../errors";
import { cleartext } from "../cleartext";

describe("cleartext()", () => {
  test("throws ConfigurationError when the chain has no executorAddress", () => {
    const chainWithoutExecutor = { id: 31337, name: "test" } as unknown as FheChain;
    const logger = { error() {}, warn() {}, info() {}, debug() {} };
    expect(() => cleartext().createRelayer(chainWithoutExecutor, undefined, logger)).toThrow(
      ConfigurationError,
    );
    expect(() => cleartext().createRelayer(chainWithoutExecutor, undefined, logger)).toThrow(
      /executorAddress/i,
    );
  });
});
