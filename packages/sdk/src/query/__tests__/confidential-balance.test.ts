import { describe, expect, test, mockQueryContext } from "../../test-fixtures";
import { confidentialBalanceQueryOptions } from "../confidential-balance";

describe("confidentialBalanceQueryOptions", () => {
  test("uses handle-dependent key and staleTime Infinity", ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken("0x1111111111111111111111111111111111111111");
    const options = confidentialBalanceQueryOptions(token, {
      owner: "0x2222222222222222222222222222222222222222",
      handle: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(options.queryKey).toEqual([
      "zama.confidentialBalance",
      {
        tokenAddress: "0x1111111111111111111111111111111111111111",
        owner: "0x2222222222222222222222222222222222222222",
        handle: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
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
      handle: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const key = [
      "zama.confidentialBalance",
      {
        tokenAddress: "0x1111111111111111111111111111111111111111",
        owner: "0x2222222222222222222222222222222222222222",
        handle: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbBbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    ] as const;

    await options.queryFn(mockQueryContext(key));
    expect(token.decryptBalance).toHaveBeenCalledWith(
      "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbBbbbbbbbbbbbbbbbbbbbbbbbb",
      "0x2222222222222222222222222222222222222222",
    );
  });
});
