import { describe, expect, test } from "vitest";
import { unshieldMutationOptions } from "../unshield";
import { createMockToken } from "./test-helpers";

describe("unshieldMutationOptions", () => {
  test("delegates unshield", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = unshieldMutationOptions(token);

    expect(options.mutationKey).toEqual(["unshield", "0x1111111111111111111111111111111111111111"]);
    await options.mutationFn({ amount: 11n });
    expect(token.unshield).toHaveBeenCalledWith(11n, undefined);
  });

  test("delegates callbacks when provided", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = unshieldMutationOptions(token);
    const callbacks = {
      onUnwrapSubmitted: () => undefined,
      onFinalizing: () => undefined,
    };

    await options.mutationFn({ amount: 12n, callbacks });
    expect(token.unshield).toHaveBeenCalledWith(12n, callbacks);
  });
});
