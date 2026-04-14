import { describe, expect, test, mockQueryContext } from "../../test-fixtures";
import { confidentialBalanceQueryOptions } from "../confidential-balance";

describe("confidentialBalanceQueryOptions", () => {
  test("uses handle-dependent key and staleTime Infinity", ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken("0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a");
    const options = confidentialBalanceQueryOptions(token, {
      owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      handle: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    expect(options.queryKey).toEqual([
      "zama.confidentialBalance",
      {
        tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
        owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        handle: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
      },
    ]);
    expect(options.staleTime).toBe(Infinity);
  });

  test("enabled is false without handle", ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken("0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a");
    const options = confidentialBalanceQueryOptions(token, {
      owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
    });

    expect(options.enabled).toBe(false);
  });

  test("queryFn reads handle from context.queryKey", async ({ createMockReadonlyToken }) => {
    const token = createMockReadonlyToken("0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a");
    const options = confidentialBalanceQueryOptions(token, {
      owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
      handle: "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa",
    });

    const key = [
      "zama.confidentialBalance",
      {
        tokenAddress: "0x1a1A1A1A1a1A1A1a1A1a1a1a1a1a1a1A1A1a1a1a",
        owner: "0x2b2B2B2b2B2b2B2b2B2b2b2b2B2B2b2b2B2b2B2B",
        handle: "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbBbbbbbbbbbbbbbbbbbbbbbbbb",
      },
    ] as const;

    await options.queryFn(mockQueryContext(key));
    expect(token.decryptBalance).toHaveBeenCalledWith(
      "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbBbbbbbbbbbbbbbbbbbbbbbbbb",
    );
  });
});
