import { describe, it, expect } from "vitest";
import type { Address } from "../../relayer/relayer-sdk.types";

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
  deploymentCoordinatorContract,
  isFinalizeUnwrapOperatorContract,
  setFinalizeUnwrapOperatorContract,
} from "../encryption";

// Wrapper
import {
  finalizeUnwrapContract,
  underlyingContract,
  wrapContract,
  wrapETHContract,
} from "../wrapper";

// Deployment coordinator
import {
  getWrapperContract,
  wrapperExistsContract,
} from "../deployment-coordinator";

// Fee manager
import {
  getWrapFeeContract,
  getUnwrapFeeContract,
  getBatchTransferFeeContract,
  getFeeRecipientContract,
} from "../fee-manager";

// Transfer batcher
import { confidentialBatchTransferContract } from "../transfer-batcher";

const TOKEN = "0xtoken" as Address;
const USER = "0xuser" as Address;
const SPENDER = "0xspender" as Address;
const WRAPPER = "0xwrapper" as Address;
const COORDINATOR = "0xcoordinator" as Address;
const FEE_MANAGER = "0xfeemanager" as Address;
const BATCHER = "0xbatcher" as Address;

describe("ERC-20 contract builders", () => {
  it("nameContract", () => {
    const config = nameContract(TOKEN);
    expect(config.address).toBe(TOKEN);
    expect(config.functionName).toBe("name");
    expect(config.args).toEqual([]);
  });

  it("symbolContract", () => {
    const config = symbolContract(TOKEN);
    expect(config.functionName).toBe("symbol");
    expect(config.args).toEqual([]);
  });

  it("decimalsContract", () => {
    const config = decimalsContract(TOKEN);
    expect(config.functionName).toBe("decimals");
    expect(config.args).toEqual([]);
  });

  it("allowanceContract", () => {
    const config = allowanceContract(TOKEN, USER, SPENDER);
    expect(config.address).toBe(TOKEN);
    expect(config.functionName).toBe("allowance");
    expect(config.args).toEqual([USER, SPENDER]);
  });

  it("approveContract", () => {
    const config = approveContract(TOKEN, SPENDER, 100n);
    expect(config.functionName).toBe("approve");
    expect(config.args).toEqual([SPENDER, 100n]);
  });
});

describe("ERC-165 contract builders", () => {
  it("supportsInterfaceContract", () => {
    const config = supportsInterfaceContract(TOKEN, ERC7984_INTERFACE_ID);
    expect(config.address).toBe(TOKEN);
    expect(config.functionName).toBe("supportsInterface");
    expect(config.args).toEqual([ERC7984_INTERFACE_ID]);
  });

  it("exports interface IDs", () => {
    expect(ERC7984_INTERFACE_ID).toBe("0x4958f2a4");
    expect(ERC7984_WRAPPER_INTERFACE_ID).toBe("0xd04584ba");
  });
});

describe("Encryption contract builders", () => {
  it("confidentialBalanceOfContract", () => {
    const config = confidentialBalanceOfContract(TOKEN, USER);
    expect(config.address).toBe(TOKEN);
    expect(config.functionName).toBe("confidentialBalanceOf");
    expect(config.args).toEqual([USER]);
  });

  it("confidentialTransferContract converts handles to hex", () => {
    const handle = new Uint8Array([1, 2, 3]);
    const proof = new Uint8Array([4, 5, 6]);
    const config = confidentialTransferContract(TOKEN, USER, handle, proof);
    expect(config.functionName).toBe("confidentialTransfer");
    expect(config.args[0]).toBe(USER);
    expect(config.args[1]).toBe("0x010203");
    expect(config.args[2]).toBe("0x040506");
  });

  it("confidentialTransferFromContract converts handles to hex", () => {
    const handle = new Uint8Array([0xab]);
    const proof = new Uint8Array([0xcd]);
    const config = confidentialTransferFromContract(
      TOKEN,
      USER,
      SPENDER,
      handle,
      proof,
    );
    expect(config.functionName).toBe("confidentialTransferFrom");
    expect(config.args).toEqual([USER, SPENDER, "0xab", "0xcd"]);
  });

  it("isOperatorContract", () => {
    const config = isOperatorContract(TOKEN, USER, SPENDER);
    expect(config.functionName).toBe("isOperator");
    expect(config.args).toEqual([USER, SPENDER]);
  });

  it("setOperatorContract with explicit timestamp", () => {
    const config = setOperatorContract(TOKEN, SPENDER, 12345);
    expect(config.functionName).toBe("setOperator");
    expect(config.args).toEqual([SPENDER, 12345]);
  });

  it("setOperatorContract defaults timestamp to ~1 hour from now", () => {
    const before = Math.floor(Date.now() / 1000) + 3600;
    const config = setOperatorContract(TOKEN, SPENDER);
    const after = Math.floor(Date.now() / 1000) + 3600;
    expect(config.args[1]).toBeGreaterThanOrEqual(before);
    expect(config.args[1]).toBeLessThanOrEqual(after);
  });

  it("unwrapContract converts handles to hex", () => {
    const handle = new Uint8Array([0xde, 0xad]);
    const proof = new Uint8Array([0xbe, 0xef]);
    const config = unwrapContract(TOKEN, USER, SPENDER, handle, proof);
    expect(config.functionName).toBe("unwrap");
    expect(config.args).toEqual([USER, SPENDER, "0xdead", "0xbeef"]);
  });

  it("unwrapFromBalanceContract", () => {
    const handle = "0x" + "ab".repeat(32);
    const config = unwrapFromBalanceContract(
      TOKEN,
      USER,
      SPENDER,
      handle as Address,
    );
    expect(config.functionName).toBe("unwrap");
    expect(config.args).toEqual([USER, SPENDER, handle]);
  });

  it("confidentialTotalSupplyContract", () => {
    const config = confidentialTotalSupplyContract(TOKEN);
    expect(config.functionName).toBe("confidentialTotalSupply");
    expect(config.args).toEqual([]);
  });

  it("totalSupplyContract", () => {
    const config = totalSupplyContract(TOKEN);
    expect(config.functionName).toBe("totalSupply");
  });

  it("rateContract", () => {
    const config = rateContract(TOKEN);
    expect(config.functionName).toBe("rate");
  });

  it("deploymentCoordinatorContract", () => {
    const config = deploymentCoordinatorContract(TOKEN);
    expect(config.functionName).toBe("deploymentCoordinator");
  });

  it("isFinalizeUnwrapOperatorContract", () => {
    const config = isFinalizeUnwrapOperatorContract(TOKEN, USER, SPENDER);
    expect(config.functionName).toBe("isFinalizeUnwrapOperator");
    expect(config.args).toEqual([USER, SPENDER]);
  });

  it("setFinalizeUnwrapOperatorContract with explicit timestamp", () => {
    const config = setFinalizeUnwrapOperatorContract(TOKEN, SPENDER, 99999);
    expect(config.functionName).toBe("setFinalizeUnwrapOperator");
    expect(config.args).toEqual([SPENDER, 99999]);
  });

  it("setFinalizeUnwrapOperatorContract defaults timestamp", () => {
    const before = Math.floor(Date.now() / 1000) + 3600;
    const config = setFinalizeUnwrapOperatorContract(TOKEN, SPENDER);
    const after = Math.floor(Date.now() / 1000) + 3600;
    expect(config.args[1]).toBeGreaterThanOrEqual(before);
    expect(config.args[1]).toBeLessThanOrEqual(after);
  });
});

describe("Wrapper contract builders", () => {
  it("finalizeUnwrapContract", () => {
    const handle = "0xburn" as Address;
    const proof = "0xproof" as Address;
    const config = finalizeUnwrapContract(WRAPPER, handle, 500n, proof);
    expect(config.address).toBe(WRAPPER);
    expect(config.functionName).toBe("finalizeUnwrap");
    expect(config.args).toEqual([handle, 500n, proof]);
  });

  it("underlyingContract", () => {
    const config = underlyingContract(WRAPPER);
    expect(config.address).toBe(WRAPPER);
    expect(config.functionName).toBe("underlying");
  });

  it("wrapContract", () => {
    const config = wrapContract(WRAPPER, USER, 1000n);
    expect(config.functionName).toBe("wrap");
    expect(config.args).toEqual([USER, 1000n]);
  });

  it("wrapETHContract includes value", () => {
    const config = wrapETHContract(WRAPPER, USER, 500n, 500n);
    expect(config.functionName).toBe("wrapETH");
    expect(config.args).toEqual([USER, 500n]);
    expect(config.value).toBe(500n);
  });
});

describe("Deployment coordinator contract builders", () => {
  it("getWrapperContract", () => {
    const config = getWrapperContract(COORDINATOR, TOKEN);
    expect(config.address).toBe(COORDINATOR);
    expect(config.functionName).toBe("getWrapper");
    expect(config.args).toEqual([TOKEN]);
  });

  it("wrapperExistsContract", () => {
    const config = wrapperExistsContract(COORDINATOR, TOKEN);
    expect(config.functionName).toBe("wrapperExists");
    expect(config.args).toEqual([TOKEN]);
  });
});

describe("Fee manager contract builders", () => {
  it("getWrapFeeContract", () => {
    const config = getWrapFeeContract(FEE_MANAGER, 100n, USER, SPENDER);
    expect(config.address).toBe(FEE_MANAGER);
    expect(config.functionName).toBe("getWrapFee");
    expect(config.args).toEqual([100n, USER, SPENDER]);
  });

  it("getUnwrapFeeContract", () => {
    const config = getUnwrapFeeContract(FEE_MANAGER, 200n, USER, SPENDER);
    expect(config.functionName).toBe("getUnwrapFee");
    expect(config.args).toEqual([200n, USER, SPENDER]);
  });

  it("getBatchTransferFeeContract", () => {
    const config = getBatchTransferFeeContract(FEE_MANAGER);
    expect(config.functionName).toBe("getBatchTransferFee");
    expect(config.args).toEqual([]);
  });

  it("getFeeRecipientContract", () => {
    const config = getFeeRecipientContract(FEE_MANAGER);
    expect(config.functionName).toBe("getFeeRecipient");
    expect(config.args).toEqual([]);
  });
});

describe("Transfer batcher contract builders", () => {
  it("confidentialBatchTransferContract", () => {
    const data = [
      {
        to: USER,
        encryptedAmount: "0xhandle" as Address,
        inputProof: "0xproof" as Address,
        retryFor: 0n,
      },
    ];
    const config = confidentialBatchTransferContract(
      BATCHER,
      TOKEN,
      USER,
      data,
      10n,
    );
    expect(config.address).toBe(BATCHER);
    expect(config.functionName).toBe("confidentialBatchTransfer");
    expect(config.args).toEqual([TOKEN, USER, data]);
    expect(config.value).toBe(10n);
  });
});
