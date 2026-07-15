import { describe, expect, test } from "../../test-fixtures";
import { toFhevmChain } from "../to-fhevm-chain";

describe("toFhevmChain", () => {
  test("protocolConfig is undefined when protocolConfigContractAddress is not set", ({
    createMockChain,
  }) => {
    const chain = createMockChain({ id: 1 });
    expect(toFhevmChain(chain).fhevm.contracts.protocolConfig).toBeUndefined();
  });

  test("protocolConfig is mapped through when protocolConfigContractAddress is set", ({
    createMockChain,
  }) => {
    const protocolConfigContractAddress = "0x0000000000000000000000000000000000000002" as const;
    const chain = createMockChain({ id: 1, protocolConfigContractAddress });
    expect(toFhevmChain(chain).fhevm.contracts.protocolConfig).toEqual({
      address: protocolConfigContractAddress,
    });
  });
});
