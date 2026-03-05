import { describe, expect, test } from "../../test-fixtures";
import { useReadonlyToken } from "../use-readonly-token";
import { TOKEN } from "../../__tests__/mutation-test-helpers";

describe("useReadonlyToken", () => {
  test("default", ({ renderWithProviders }) => {
    const { result } = renderWithProviders(() => useReadonlyToken(TOKEN));

    expect(result.current.address).toBe(TOKEN);
  });
});
