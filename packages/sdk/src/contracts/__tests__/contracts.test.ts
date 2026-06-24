import { describe, test, expect } from "../../test-fixtures";
import type { Address } from "viem";

// ERC-20
import {
  nameContract,
  symbolContract,
  decimalsContract,
  allowanceContract,
  approveContract,
} from "../erc20";

// ERC-165
import {
  supportsInterfaceContract,
  ERC7984_INTERFACE_ID,
  ERC7984_WRAPPER_INTERFACE_ID,
  isConfidentialTokenContract,
  isConfidentialWrapperContract,
} from "../erc165";

// Confidential wrapper (ERC-7984 + wrap/unwrap lifecycle)
import {
  confidentialBalanceOfContract,
  confidentialTotalSupplyContract,
  confidentialTransferAndCallContract,
  confidentialTransferContract,
  confidentialTransferFromAndCallContract,
  confidentialTransferFromContract,
  finalizeUnwrapContract,
  inferredTotalSupplyContract,
  isOperatorContract,
  rateContract,
  setOperatorContract,
  underlyingContract,
  unwrapContract,
  unwrapFromBalanceContract,
  wrapContract,
} from "../confidential-wrapper";
import { confidentialWrapperAbi } from "../../abi/confidential-wrapper.abi";

const SPENDER = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;

describe("ERC-20 contract builders", () => {
  test("nameContract", ({ tokenAddress }) => {
    const config = nameContract(tokenAddress);
    expect(config.address).toBe(tokenAddress);
    expect(config.functionName).toBe("name");
    expect(config.args).toEqual([]);
  });

  test("symbolContract", ({ tokenAddress }) => {
    const config = symbolContract(tokenAddress);
    expect(config.functionName).toBe("symbol");
    expect(config.args).toEqual([]);
  });

  test("decimalsContract", ({ tokenAddress }) => {
    const config = decimalsContract(tokenAddress);
    expect(config.functionName).toBe("decimals");
    expect(config.args).toEqual([]);
  });

  test("allowanceContract", ({ tokenAddress, userAddress }) => {
    const config = allowanceContract(tokenAddress, userAddress, SPENDER);
    expect(config.address).toBe(tokenAddress);
    expect(config.functionName).toBe("allowance");
    expect(config.args).toEqual([userAddress, SPENDER]);
  });

  test("approveContract", ({ tokenAddress }) => {
    const config = approveContract(tokenAddress, SPENDER, 100n);
    expect(config.functionName).toBe("approve");
    expect(config.args).toEqual([SPENDER, 100n]);
  });
});

describe("ERC-165 contract builders", () => {
  test("supportsInterfaceContract", ({ tokenAddress }) => {
    const config = supportsInterfaceContract(tokenAddress, ERC7984_INTERFACE_ID);
    expect(config.address).toBe(tokenAddress);
    expect(config.functionName).toBe("supportsInterface");
    expect(config.args).toEqual([ERC7984_INTERFACE_ID]);
  });

  test("exports interface IDs", () => {
    expect(ERC7984_INTERFACE_ID).toBe("0x4958f2a4");
    expect(ERC7984_WRAPPER_INTERFACE_ID).toBe("0x1f1c62b2");
  });

  test("isConfidentialTokenContract uses ERC7984_INTERFACE_ID", ({ tokenAddress }) => {
    const config = isConfidentialTokenContract(tokenAddress);
    expect(config.address).toBe(tokenAddress);
    expect(config.functionName).toBe("supportsInterface");
    expect(config.args).toEqual([ERC7984_INTERFACE_ID]);
  });

  test("isConfidentialWrapperContract uses ERC7984_WRAPPER_INTERFACE_ID", ({ tokenAddress }) => {
    const config = isConfidentialWrapperContract(tokenAddress);
    expect(config.address).toBe(tokenAddress);
    expect(config.functionName).toBe("supportsInterface");
    expect(config.args).toEqual([ERC7984_WRAPPER_INTERFACE_ID]);
  });
});

describe("Encryption contract builders", () => {
  test("confidentialBalanceOfContract", ({ tokenAddress, userAddress }) => {
    const config = confidentialBalanceOfContract(tokenAddress, userAddress);
    expect(config.address).toBe(tokenAddress);
    expect(config.functionName).toBe("confidentialBalanceOf");
    expect(config.args).toEqual([userAddress]);
  });

  test("confidentialTransferContract forwards hex handle and proof", ({
    tokenAddress,
    userAddress,
    handle,
    inputProof,
  }) => {
    const config = confidentialTransferContract(tokenAddress, userAddress, handle, inputProof);
    expect(config.functionName).toBe("confidentialTransfer");
    expect(config.args).toEqual([userAddress, handle, inputProof]);
  });

  test("confidentialTransferFromContract forwards hex handle and proof", ({
    tokenAddress,
    userAddress,
  }) => {
    const config = confidentialTransferFromContract(
      tokenAddress,
      userAddress,
      SPENDER,
      "0xab",
      "0xcd",
    );
    expect(config.functionName).toBe("confidentialTransferFrom");
    expect(config.args).toEqual([userAddress, SPENDER, "0xab", "0xcd"]);
  });

  test("confidentialTransferAndCallContract forwards hex handle, proof and data", ({
    tokenAddress,
    userAddress,
    handle,
    inputProof,
  }) => {
    const config = confidentialTransferAndCallContract(
      tokenAddress,
      userAddress,
      handle,
      inputProof,
      "0xdeadbeef",
    );
    expect(config.address).toBe(tokenAddress);
    expect(config.functionName).toBe("confidentialTransferAndCall");
    expect(config.args).toEqual([userAddress, handle, inputProof, "0xdeadbeef"]);
  });

  test("confidentialTransferFromAndCallContract forwards hex handle, proof and data", ({
    tokenAddress,
    userAddress,
  }) => {
    const config = confidentialTransferFromAndCallContract(
      tokenAddress,
      userAddress,
      SPENDER,
      "0xab",
      "0xcd",
      "0xdeadbeef",
    );
    expect(config.functionName).toBe("confidentialTransferFromAndCall");
    expect(config.args).toEqual([userAddress, SPENDER, "0xab", "0xcd", "0xdeadbeef"]);
  });

  test("isOperatorContract", ({ tokenAddress, userAddress }) => {
    const config = isOperatorContract(tokenAddress, userAddress, SPENDER);
    expect(config.functionName).toBe("isOperator");
    expect(config.args).toEqual([userAddress, SPENDER]);
  });

  test("setOperatorContract with explicit timestamp", ({ tokenAddress }) => {
    const config = setOperatorContract(tokenAddress, SPENDER, 12345);
    expect(config.functionName).toBe("setOperator");
    expect(config.args).toEqual([SPENDER, 12345]);
  });

  test("setOperatorContract defaults timestamp to ~1 hour from now", ({ tokenAddress }) => {
    const before = Math.floor(Date.now() / 1000) + 3600;
    const config = setOperatorContract(tokenAddress, SPENDER);
    const after = Math.floor(Date.now() / 1000) + 3600;
    expect(config.args[1]).toBeGreaterThanOrEqual(before);
    expect(config.args[1]).toBeLessThanOrEqual(after);
  });

  test("unwrapContract forwards hex handle and proof", ({ tokenAddress, userAddress }) => {
    const config = unwrapContract(tokenAddress, userAddress, SPENDER, "0xdead", "0xbeef");
    expect(config.functionName).toBe("unwrap");
    expect(config.args).toEqual([userAddress, SPENDER, "0xdead", "0xbeef"]);
  });

  test("unwrapFromBalanceContract", ({ tokenAddress, userAddress }) => {
    const handle = "0x" + "ab".repeat(32);
    const config = unwrapFromBalanceContract(tokenAddress, userAddress, SPENDER, handle as Address);
    expect(config.functionName).toBe("unwrap");
    expect(config.args).toEqual([userAddress, SPENDER, handle]);
  });

  test("confidentialTotalSupplyContract", ({ tokenAddress }) => {
    const config = confidentialTotalSupplyContract(tokenAddress);
    expect(config.functionName).toBe("confidentialTotalSupply");
    expect(config.args).toEqual([]);
  });

  test("rateContract", ({ tokenAddress }) => {
    const config = rateContract(tokenAddress);
    expect(config.functionName).toBe("rate");
  });
});

describe("Wrapper contract builders", () => {
  test("finalizeUnwrapContract", ({ wrapperAddress }) => {
    const handle = ("0x" + "ab".repeat(32)) as Address;
    const proof = ("0x" + "cd".repeat(32)) as Address;
    const config = finalizeUnwrapContract(wrapperAddress, handle, 500n, proof);
    expect(config.address).toBe(wrapperAddress);
    expect(config.functionName).toBe("finalizeUnwrap");
    expect(config.args).toEqual(["0x" + "ab".repeat(32), 500n, "0x" + "cd".repeat(32)]);
  });

  test("underlyingContract", ({ wrapperAddress }) => {
    const config = underlyingContract(wrapperAddress);
    expect(config.address).toBe(wrapperAddress);
    expect(config.functionName).toBe("underlying");
  });

  test("inferredTotalSupplyContract", ({ wrapperAddress }) => {
    const config = inferredTotalSupplyContract(wrapperAddress);
    expect(config.address).toBe(wrapperAddress);
    expect(config.functionName).toBe("inferredTotalSupply");
  });

  test("wrapContract", ({ wrapperAddress, userAddress }) => {
    const config = wrapContract(wrapperAddress, userAddress, 1000n);
    expect(config.functionName).toBe("wrap");
    expect(config.args).toEqual([userAddress, 1000n]);
  });
});

// Regression: verify confidentialWrapperAbi matches protocol-apps@71611c624ddc (post-mainnet upgrade).
// These assertions pin the wrapper interface shape: finalizeUnwrap takes a bytes32
// unwrapRequestId, unwrapAmount / unwrapRequester are exposed, and both UnwrapRequested
// and UnwrapFinalized events include the indexed unwrapRequestId topic.
describe("confidentialWrapperAbi version smoke test (protocol-apps@71611c624ddc)", () => {
  type AbiFunction = {
    type: string;
    name: string;
    inputs: { type: string; name: string }[];
  };
  type AbiEvent = {
    type: string;
    name: string;
    inputs: { type: string; name: string }[];
  };
  const fns = (confidentialWrapperAbi as unknown as AbiFunction[]).filter(
    (x) => x.type === "function",
  );
  const fn = (name: string) => fns.find((f) => f.name === name);
  const eventSignatures = (confidentialWrapperAbi as unknown as AbiEvent[])
    .filter((x) => x.type === "event")
    .map((event) => `${event.name}(${event.inputs.map((input) => input.type).join(",")})`);

  test("finalizeUnwrap first param is bytes32 unwrapRequestId (not euint64 amount)", () => {
    const f = fn("finalizeUnwrap");
    expect(f).toBeDefined();
    expect(f!.inputs[0].name).toBe("unwrapRequestId");
    expect(f!.inputs[0].type).toBe("bytes32");
  });

  test("unwrapAmount exists with bytes32 param", () => {
    const f = fn("unwrapAmount");
    expect(f).toBeDefined();
    expect(f!.inputs[0].type).toBe("bytes32");
  });

  test("unwrapRequester exists with bytes32 param", () => {
    const f = fn("unwrapRequester");
    expect(f).toBeDefined();
    expect(f!.inputs[0].type).toBe("bytes32");
  });

  test("includes upgraded unwrap event signatures in the exported wrapper ABI", () => {
    expect(eventSignatures).toContain("UnwrapRequested(address,bytes32,bytes32)");
    expect(eventSignatures).toContain("UnwrapFinalized(address,bytes32,bytes32,uint64)");
    // Guard against the legacy 2/3-arg signatures being re-introduced.
    expect(eventSignatures.filter((s) => s.startsWith("UnwrapRequested("))).toHaveLength(1);
    expect(eventSignatures.filter((s) => s.startsWith("UnwrapFinalized("))).toHaveLength(1);
  });
});
