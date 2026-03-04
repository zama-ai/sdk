import { describe, expect, test } from "vitest";

import { zamaQueryKeys } from "../query-keys";

describe("zamaQueryKeys", () => {
  test.each([
    ["signerAddress", zamaQueryKeys.signerAddress.all],
    ["confidentialHandle", zamaQueryKeys.confidentialHandle.all],
    ["confidentialBalance", zamaQueryKeys.confidentialBalance.all],
    ["confidentialHandles", zamaQueryKeys.confidentialHandles.all],
    ["confidentialBalances", zamaQueryKeys.confidentialBalances.all],
    ["tokenMetadata", zamaQueryKeys.tokenMetadata.all],
    ["isConfidential", zamaQueryKeys.isConfidential.all],
    ["isWrapper", zamaQueryKeys.isWrapper.all],
    ["wrapperDiscovery", zamaQueryKeys.wrapperDiscovery.all],
    ["underlyingAllowance", zamaQueryKeys.underlyingAllowance.all],
    ["confidentialIsApproved", zamaQueryKeys.confidentialIsApproved.all],
    ["totalSupply", zamaQueryKeys.totalSupply.all],
    ["activityFeed", zamaQueryKeys.activityFeed.all],
    ["fees", zamaQueryKeys.fees.all],
    ["publicKey", zamaQueryKeys.publicKey.all],
    ["publicParams", zamaQueryKeys.publicParams.all],
    ["decryption", zamaQueryKeys.decryption.all],
  ])("all keys are namespaced with zama.* (%s)", (_, key) => {
    expect(key[0]).toMatch(/^zama\./);
  });

  test("tokenMetadata token key uses 2-element tuple shape", () => {
    expect(zamaQueryKeys.tokenMetadata.token("0xabc")).toEqual([
      "zama.tokenMetadata",
      { tokenAddress: "0xabc" },
    ]);
  });

  test("confidentialBalance owner key includes optional handle only when provided", () => {
    const withHandle = zamaQueryKeys.confidentialBalance.owner("0xabc", "0xowner", "0xhandle");
    const withoutHandle = zamaQueryKeys.confidentialBalance.owner("0xabc", "0xowner");

    expect(withHandle).toEqual([
      "zama.confidentialBalance",
      { tokenAddress: "0xabc", owner: "0xowner", handle: "0xhandle" },
    ]);

    expect(withoutHandle).toEqual([
      "zama.confidentialBalance",
      { tokenAddress: "0xabc", owner: "0xowner" },
    ]);
    expect(withoutHandle[1]).not.toHaveProperty("handle");
  });

  test("confidentialBalances tokens key includes optional handles only when provided", () => {
    const withHandles = zamaQueryKeys.confidentialBalances.tokens(["0xabc"], "0xowner", [
      "0xhandle1",
      "0xhandle2",
    ]);
    const withoutHandles = zamaQueryKeys.confidentialBalances.tokens(["0xabc"], "0xowner");

    expect(withHandles).toEqual([
      "zama.confidentialBalances",
      {
        tokenAddresses: ["0xabc"],
        owner: "0xowner",
        handles: ["0xhandle1", "0xhandle2"],
      },
    ]);

    expect(withoutHandles).toEqual([
      "zama.confidentialBalances",
      {
        tokenAddresses: ["0xabc"],
        owner: "0xowner",
      },
    ]);
    expect(withoutHandles[1]).not.toHaveProperty("handles");
  });

  test("fees.shieldFee includes optional amount/from/to only when amount is provided", () => {
    const withAllParams = zamaQueryKeys.fees.shieldFee("0xfee", "100", "0xfrom", "0xto");
    const withoutAmount = zamaQueryKeys.fees.shieldFee("0xfee");

    expect(withAllParams).toEqual([
      "zama.fees",
      {
        type: "shield",
        feeManagerAddress: "0xfee",
        amount: "100",
        from: "0xfrom",
        to: "0xto",
      },
    ]);

    expect(withoutAmount).toEqual(["zama.fees", { type: "shield", feeManagerAddress: "0xfee" }]);
    expect(withoutAmount[1]).not.toHaveProperty("amount");
  });

  test("activityFeed.scope contains full cache identity", () => {
    expect(zamaQueryKeys.activityFeed.scope("0xtoken", "0xuser", "0xtx1:0,0xtx2:1", true)).toEqual([
      "zama.activityFeed",
      {
        tokenAddress: "0xtoken",
        userAddress: "0xuser",
        logsKey: "0xtx1:0,0xtx2:1",
        decrypt: true,
      },
    ]);
  });

  test("key labels are consistent and params support prefix matching", () => {
    const all = zamaQueryKeys.confidentialBalance.all;
    const token = zamaQueryKeys.confidentialBalance.token("0xtoken");
    const owner = zamaQueryKeys.confidentialBalance.owner("0xtoken", "0xowner", "0xhandle");

    expect(all[0]).toBe(token[0]);
    expect(token[0]).toBe(owner[0]);
    expect(owner[1]).toMatchObject(token[1]);
  });

  test("all parameterized keys are 2-element tuples", () => {
    const parameterizedKeys = [
      zamaQueryKeys.signerAddress.token("0xtoken"),
      zamaQueryKeys.confidentialHandle.owner("0xtoken", "0xowner"),
      zamaQueryKeys.confidentialBalance.owner("0xtoken", "0xowner", "0xhandle"),
      zamaQueryKeys.confidentialHandles.tokens(["0xa", "0xb"], "0xowner"),
      zamaQueryKeys.confidentialBalances.tokens(["0xa", "0xb"], "0xowner"),
      zamaQueryKeys.tokenMetadata.token("0xtoken"),
      zamaQueryKeys.isConfidential.token("0xtoken"),
      zamaQueryKeys.isWrapper.token("0xtoken"),
      zamaQueryKeys.wrapperDiscovery.token("0xtoken"),
      zamaQueryKeys.underlyingAllowance.token("0xtoken"),
      zamaQueryKeys.underlyingAllowance.scope("0xtoken", "0xowner", "0xwrapper"),
      zamaQueryKeys.confidentialIsApproved.token("0xtoken"),
      zamaQueryKeys.confidentialIsApproved.scope("0xtoken", "0xowner", "0xspender"),
      zamaQueryKeys.totalSupply.token("0xtoken"),
      zamaQueryKeys.activityFeed.token("0xtoken"),
      zamaQueryKeys.activityFeed.scope("0xtoken", "0xuser", "log-key", false),
      zamaQueryKeys.fees.shieldFee("0xfee", "100", "0xfrom", "0xto"),
      zamaQueryKeys.fees.unshieldFee("0xfee", "100", "0xfrom", "0xto"),
      zamaQueryKeys.fees.batchTransferFee("0xfee"),
      zamaQueryKeys.fees.feeRecipient("0xfee"),
      zamaQueryKeys.publicParams.bits(2048),
      zamaQueryKeys.decryption.handle("0xhandle", "0xcontract"),
    ];

    for (const key of parameterizedKeys) {
      expect(key).toHaveLength(2);
      expect(typeof key[0]).toBe("string");
      expect(typeof key[1]).toBe("object");
      expect(key[1]).not.toBeNull();
    }
  });
});
