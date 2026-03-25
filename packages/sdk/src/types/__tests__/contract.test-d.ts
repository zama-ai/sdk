import { describe, expectTypeOf, test } from "vitest";
import type { Address } from "viem";
import type {
  ContractAbi,
  ReadContractConfig,
  ReadContractReturnType,
  ReadFunctionName,
  WriteContractArgs,
  WriteContractConfig,
  WriteFunctionName,
} from "../contract";

const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

describe("ReadFunctionName", () => {
  test("narrows to view/pure functions", () => {
    expectTypeOf<ReadFunctionName<typeof ERC20_ABI>>().toEqualTypeOf<"balanceOf">();
  });
});

describe("WriteFunctionName", () => {
  test("narrows to nonpayable/payable functions", () => {
    expectTypeOf<WriteFunctionName<typeof ERC20_ABI>>().toEqualTypeOf<"transfer" | "approve">();
  });
});

describe("ReadContractConfig", () => {
  test("infers address, abi, functionName, and args", () => {
    type Config = ReadContractConfig<typeof ERC20_ABI, "balanceOf">;
    expectTypeOf<Config["address"]>().toEqualTypeOf<Address>();
    expectTypeOf<Config["functionName"]>().toEqualTypeOf<"balanceOf">();
    expectTypeOf<Config["args"]>().toEqualTypeOf<readonly [Address]>();
  });
});

describe("WriteContractConfig", () => {
  test("infers args for transfer", () => {
    type Config = WriteContractConfig<typeof ERC20_ABI, "transfer">;
    expectTypeOf<Config["functionName"]>().toEqualTypeOf<"transfer">();
    expectTypeOf<Config["args"]>().toEqualTypeOf<readonly [Address, bigint]>();
  });

  test("includes optional value and gas", () => {
    type Config = WriteContractConfig<typeof ERC20_ABI, "transfer">;
    expectTypeOf<Config["value"]>().toEqualTypeOf<bigint | undefined>();
    expectTypeOf<Config["gas"]>().toEqualTypeOf<bigint | undefined>();
  });
});

describe("WriteContractArgs", () => {
  test("infers approve args", () => {
    type Args = WriteContractArgs<typeof ERC20_ABI, "approve">;
    expectTypeOf<Args>().toEqualTypeOf<readonly [Address, bigint]>();
  });
});

describe("ReadContractReturnType", () => {
  test("infers balanceOf return as bigint", () => {
    type Return = ReadContractReturnType<typeof ERC20_ABI, "balanceOf">;
    expectTypeOf<Return>().toEqualTypeOf<bigint>();
  });
});

describe("ContractAbi", () => {
  test("accepts a typed const ABI", () => {
    expectTypeOf<typeof ERC20_ABI>().toExtend<ContractAbi>();
  });

  test("accepts an untyped array", () => {
    expectTypeOf<readonly unknown[]>().toExtend<ContractAbi>();
  });
});
