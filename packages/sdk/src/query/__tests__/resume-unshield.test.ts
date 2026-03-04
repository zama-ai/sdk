import { describe, expect, test } from "vitest";
import { resumeUnshieldMutationOptions } from "../resume-unshield";
import { createMockToken } from "./test-helpers";

describe("resumeUnshieldMutationOptions", () => {
  test("delegates resumeUnshield", async () => {
    const token = createMockToken("0x1111111111111111111111111111111111111111");
    const options = resumeUnshieldMutationOptions(token);

    expect(options.mutationKey).toEqual([
      "resumeUnshield",
      "0x1111111111111111111111111111111111111111",
    ]);
    await options.mutationFn({
      unwrapTxHash: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(token.resumeUnshield).toHaveBeenCalledWith(
      "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      undefined,
    );
  });
});
