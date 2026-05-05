import { describe, expect, it } from "../../test-fixtures";
import type { FheChain } from "../../chains";
import { ConfigurationError } from "../../errors";
import { cleartext } from "../cleartext";

describe("cleartext()", () => {
  it("throws ConfigurationError when the chain has no executorAddress", () => {
    const chainWithoutExecutor = { id: 31337, name: "test" } as FheChain;
    expect(() => cleartext().createRelayer(chainWithoutExecutor)).toThrow(ConfigurationError);
    expect(() => cleartext().createRelayer(chainWithoutExecutor)).toThrow(/executorAddress/i);
  });
});
