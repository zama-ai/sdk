import { describe, expect, test } from "../../test-fixtures";
import { confidentialBalanceQueryOptions } from "../confidential-balance";

describe("confidentialBalanceQueryOptions", () => {
  test("uses handle-dependent key and staleTime Infinity", ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken("0x1111111111111111111111111111111111111111");
    const options = confidentialBalanceQueryOptions(token, {
      owner: "0x2222222222222222222222222222222222222222",
      handle: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(options.queryKey).toEqual([
      "zama.confidentialBalance",
      {
        tokenAddress: "0x1111111111111111111111111111111111111111",
        owner: "0x2222222222222222222222222222222222222222",
        handle: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ]);
    expect(options.staleTime).toBe(Infinity);
  });

  test("enabled is false without handle", ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken("0x1111111111111111111111111111111111111111");
    const options = confidentialBalanceQueryOptions(token, {
      owner: "0x2222222222222222222222222222222222222222",
    });

    expect(options.enabled).toBe(false);
  });

  test("queryFn reads handle from context.queryKey", async ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken("0x1111111111111111111111111111111111111111");
    const options = confidentialBalanceQueryOptions(token, {
      owner: "0x2222222222222222222222222222222222222222",
      handle: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const key = [
      "zama.confidentialBalance",
      {
        tokenAddress: "0x1111111111111111111111111111111111111111",
        owner: "0x2222222222222222222222222222222222222222",
        handle: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    ] as const;

    await options.queryFn({ queryKey: key });
    expect(token.decryptBalance).toHaveBeenCalledWith(
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      "0x2222222222222222222222222222222222222222",
    );
  });
});
