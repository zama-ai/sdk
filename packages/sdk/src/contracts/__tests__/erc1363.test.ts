import { describe, expect, test } from "../../test-fixtures";
import { transferAndCallContract } from "../erc1363";

describe("transferAndCallContract", () => {
  const TOKEN = "0x1111111111111111111111111111111111111111" as const;
  const WRAPPER = "0x2222222222222222222222222222222222222222" as const;

  test("builds config with no data", () => {
    const config = transferAndCallContract(TOKEN, WRAPPER, 1000n);
    expect(config.address).toBe(TOKEN);
    expect(config.functionName).toBe("transferAndCall");
    expect(config.args).toEqual([WRAPPER, 1000n, "0x"]);
  });

  test("builds config with recipient data", () => {
    const data = "0x0000000000000000000000003333333333333333333333333333333333333333" as const;
    const config = transferAndCallContract(TOKEN, WRAPPER, 500n, data);
    expect(config.address).toBe(TOKEN);
    expect(config.functionName).toBe("transferAndCall");
    expect(config.args).toEqual([WRAPPER, 500n, data]);
  });
});
