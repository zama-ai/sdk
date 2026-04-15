import { describe, it, expect } from "../../test-fixtures";
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

// Encryption (confidential ERC-20)
import {
  confidentialBalanceOfContract,
  confidentialTransferContract,
  confidentialTransferFromContract,
  isOperatorContract,
  setOperatorContract,
  unwrapContract,
  unwrapFromBalanceContract,
  confidentialTotalSupplyContract,
  totalSupplyContract,
  rateContract,
} from "../encrypted";

// Wrapper
import { finalizeUnwrapContract, underlyingContract, wrapContract } from "../wrapper";
import { wrapperAbi } from "../../abi/wrapper.abi";

const SPENDER = "0x3C3C3C3C3c3C3c3C3C3C3C3C3c3c3c3c3c3c3c3C" as Address;

describe("ERC-20 contract builders", () => {
  it("nameContract", ({ tokenAddress }) => {
    const config = nameContract(tokenAddress);
    expect(config.address).toBe(tokenAddress);
    expect(config.functionName).toBe("name");
    expect(config.args).toEqual([]);
  });

  it("symbolContract", ({ tokenAddress }) => {
    const config = symbolContract(tokenAddress);
    expect(config.functionName).toBe("symbol");
    expect(config.args).toEqual([]);
  });

  it("decimalsContract", ({ tokenAddress }) => {
    const config = decimalsContract(tokenAddress);
    expect(config.functionName).toBe("decimals");
    expect(config.args).toEqual([]);
  });

  it("allowanceContract", ({ tokenAddress, userAddress }) => {
    const config = allowanceContract(tokenAddress, userAddress, SPENDER);
    expect(config.address).toBe(tokenAddress);
    expect(config.functionName).toBe("allowance");
    expect(config.args).toEqual([userAddress, SPENDER]);
  });

  it("approveContract", ({ tokenAddress }) => {
    const config = approveContract(tokenAddress, SPENDER, 100n);
    expect(config.functionName).toBe("approve");
    expect(config.args).toEqual([SPENDER, 100n]);
  });
});

describe("ERC-165 contract builders", () => {
  it("supportsInterfaceContract", ({ tokenAddress }) => {
    const config = supportsInterfaceContract(tokenAddress, ERC7984_INTERFACE_ID);
    expect(config.address).toBe(tokenAddress);
    expect(config.functionName).toBe("supportsInterface");
    expect(config.args).toEqual([ERC7984_INTERFACE_ID]);
  });

  it("exports interface IDs", () => {
    expect(ERC7984_INTERFACE_ID).toBe("0x4958f2a4");
    expect(ERC7984_WRAPPER_INTERFACE_ID).toBe("0x1f1c62b2");
  });

  it("isConfidentialTokenContract uses ERC7984_INTERFACE_ID", ({ tokenAddress }) => {
    const config = isConfidentialTokenContract(tokenAddress);
    expect(config.address).toBe(tokenAddress);
    expect(config.functionName).toBe("supportsInterface");
    expect(config.args).toEqual([ERC7984_INTERFACE_ID]);
  });

  it("isConfidentialWrapperContract uses ERC7984_WRAPPER_INTERFACE_ID", ({ tokenAddress }) => {
    const config = isConfidentialWrapperContract(tokenAddress);
    expect(config.address).toBe(tokenAddress);
    expect(config.functionName).toBe("supportsInterface");
    expect(config.args).toEqual([ERC7984_WRAPPER_INTERFACE_ID]);
  });
});

describe("Encryption contract builders", () => {
  it("confidentialBalanceOfContract", ({ tokenAddress, userAddress }) => {
    const config = confidentialBalanceOfContract(tokenAddress, userAddress);
    expect(config.address).toBe(tokenAddress);
    expect(config.functionName).toBe("confidentialBalanceOf");
    expect(config.args).toEqual([userAddress]);
  });

  it("confidentialTransferContract converts handles to hex", ({ tokenAddress, userAddress }) => {
    const handle = new Uint8Array([1, 2, 3]);
    const proof = new Uint8Array([4, 5, 6]);
    const config = confidentialTransferContract(tokenAddress, userAddress, handle, proof);
    expect(config.functionName).toBe("confidentialTransfer");
    expect(config.args[0]).toBe(userAddress);
    expect(config.args[1]).toBe("0x010203");
    expect(config.args[2]).toBe("0x040506");
  });

  it("confidentialTransferFromContract converts handles to hex", ({
    tokenAddress,
    userAddress,
  }) => {
    const handle = new Uint8Array([0xab]);
    const proof = new Uint8Array([0xcd]);
    const config = confidentialTransferFromContract(
      tokenAddress,
      userAddress,
      SPENDER,
      handle,
      proof,
    );
    expect(config.functionName).toBe("confidentialTransferFrom");
    expect(config.args).toEqual([userAddress, SPENDER, "0xab", "0xcd"]);
  });

  it("isOperatorContract", ({ tokenAddress, userAddress }) => {
    const config = isOperatorContract(tokenAddress, userAddress, SPENDER);
    expect(config.functionName).toBe("isOperator");
    expect(config.args).toEqual([userAddress, SPENDER]);
  });

  it("setOperatorContract with explicit timestamp", ({ tokenAddress }) => {
    const config = setOperatorContract(tokenAddress, SPENDER, 12345);
    expect(config.functionName).toBe("setOperator");
    expect(config.args).toEqual([SPENDER, 12345]);
  });

  it("setOperatorContract defaults timestamp to ~1 hour from now", ({ tokenAddress }) => {
    const before = Math.floor(Date.now() / 1000) + 3600;
    const config = setOperatorContract(tokenAddress, SPENDER);
    const after = Math.floor(Date.now() / 1000) + 3600;
    expect(config.args[1]).toBeGreaterThanOrEqual(before);
    expect(config.args[1]).toBeLessThanOrEqual(after);
  });

  it("unwrapContract converts handles to hex", ({ tokenAddress, userAddress }) => {
    const handle = new Uint8Array([0xde, 0xad]);
    const proof = new Uint8Array([0xbe, 0xef]);
    const config = unwrapContract(tokenAddress, userAddress, SPENDER, handle, proof);
    expect(config.functionName).toBe("unwrap");
    expect(config.args).toEqual([userAddress, SPENDER, "0xdead", "0xbeef"]);
  });

  it("unwrapFromBalanceContract", ({ tokenAddress, userAddress }) => {
    const handle = "0x" + "ab".repeat(32);
    const config = unwrapFromBalanceContract(tokenAddress, userAddress, SPENDER, handle as Address);
    expect(config.functionName).toBe("unwrap");
    expect(config.args).toEqual([userAddress, SPENDER, handle]);
  });

  it("confidentialTotalSupplyContract", ({ tokenAddress }) => {
    const config = confidentialTotalSupplyContract(tokenAddress);
    expect(config.functionName).toBe("confidentialTotalSupply");
    expect(config.args).toEqual([]);
  });

  it("totalSupplyContract", ({ tokenAddress }) => {
    const config = totalSupplyContract(tokenAddress);
    expect(config.functionName).toBe("totalSupply");
  });

  it("rateContract", ({ tokenAddress }) => {
    const config = rateContract(tokenAddress);
    expect(config.functionName).toBe("rate");
  });
});

describe("Wrapper contract builders", () => {
  it("finalizeUnwrapContract", ({ wrapperAddress }) => {
    const handle = ("0x" + "ab".repeat(32)) as Address;
    const proof = ("0x" + "cd".repeat(32)) as Address;
    const config = finalizeUnwrapContract(wrapperAddress, handle, 500n, proof);
    expect(config.address).toBe(wrapperAddress);
    expect(config.functionName).toBe("finalizeUnwrap");
    expect(config.args).toEqual(["0x" + "ab".repeat(32), 500n, "0x" + "cd".repeat(32)]);
  });

  it("underlyingContract", ({ wrapperAddress }) => {
    const config = underlyingContract(wrapperAddress);
    expect(config.address).toBe(wrapperAddress);
    expect(config.functionName).toBe("underlying");
  });

  it("wrapContract", ({ wrapperAddress, userAddress }) => {
    const config = wrapContract(wrapperAddress, userAddress, 1000n);
    expect(config.functionName).toBe("wrap");
    expect(config.args).toEqual([userAddress, 1000n]);
  });
});

// Regression: verify wrapperAbi matches protocol-apps@49b417a4 (OZ confidential-contracts v0.4.0).
// These assertions prove the chosen ABI version is intentional: the interface uses
// openzeppelin-confidential-contracts v0.4.0 where unwrapRequester is an implementation-only
// function (not part of IERC7984ERC20Wrapper), giving ERC7984_WRAPPER_INTERFACE_ID = 0x1f1c62b2.
describe("wrapperAbi version smoke test (protocol-apps@49b417a4)", () => {
  type AbiFunction = { type: string; name: string; inputs: { type: string; name: string }[] };
  const fns = (wrapperAbi as AbiFunction[]).filter((x) => x.type === "function");
  const fn = (name: string) => fns.find((f) => f.name === name);

  it("finalizeUnwrap first param is bytes32 unwrapRequestId (not euint64 burntAmount)", () => {
    const f = fn("finalizeUnwrap");
    expect(f).toBeDefined();
    expect(f!.inputs[0].name).toBe("unwrapRequestId");
    expect(f!.inputs[0].type).toBe("bytes32");
  });

  it("unwrapAmount exists with bytes32 param", () => {
    const f = fn("unwrapAmount");
    expect(f).toBeDefined();
    expect(f!.inputs[0].type).toBe("bytes32");
  });

  it("unwrapRequester exists with bytes32 param", () => {
    const f = fn("unwrapRequester");
    expect(f).toBeDefined();
    expect(f!.inputs[0].type).toBe("bytes32");
  });
});
