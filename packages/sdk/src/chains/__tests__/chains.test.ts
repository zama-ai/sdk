import { describe, it, expect } from "../../test-fixtures";
import { fhevmHardhat, fhevmHoodi, fhevmMainnet, fhevmSepolia } from "@zama-fhe/sdk/chains";

describe("fhevm chain presets", () => {
  it("defines canonical chain ids", () => {
    expect(fhevmSepolia.id).toBe(11155111);
    expect(fhevmMainnet.id).toBe(1);
    expect(fhevmHardhat.id).toBe(31337);
    expect(fhevmHoodi.id).toBe(560048);
  });
});
