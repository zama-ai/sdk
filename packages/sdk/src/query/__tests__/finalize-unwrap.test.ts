import { describe, expect, test } from "vitest";
import { finalizeUnwrapMutationOptions } from "../finalize-unwrap";
import { createMockToken } from "./test-helpers";

describe("finalizeUnwrapMutationOptions", () => {
  test("delegates finalizeUnwrap", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = finalizeUnwrapMutationOptions(token);

    expect(options.mutationKey).toEqual([
      "finalizeUnwrap",
      "0x1111111111111111111111111111111111111111",
    ]);
    await options.mutationFn({
      burnAmountHandle: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(token.finalizeUnwrap).toHaveBeenCalledWith(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    );
  });
});
