import { describe, expect, test } from "../../test-fixtures";
import type { FheChain } from "../../chains";
import { ConfigurationError } from "../../errors";
import { LoggerService } from "../../services/logger-service";
import { cleartext } from "../cleartext";

describe("cleartext()", () => {
  test("throws ConfigurationError when the chain has no executorAddress", () => {
    const chainWithoutExecutor = { id: 31337, name: "test" } as unknown as FheChain;
    expect(() => cleartext().createRelayer(chainWithoutExecutor, new LoggerService())).toThrow(
      ConfigurationError,
    );
    expect(() => cleartext().createRelayer(chainWithoutExecutor, new LoggerService())).toThrow(
      /executorAddress/i,
    );
  });
});
