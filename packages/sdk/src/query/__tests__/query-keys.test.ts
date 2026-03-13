import { describe, expect, test } from "../../test-fixtures";
import { getAddress } from "viem";
import type { Address } from "viem";


import { zamaQueryKeys } from "../query-keys";

const TOKEN_LOWER = "0x52908400098527886e0f7030069857d2e4169ee7";
const TOKEN_UPPER = "0x52908400098527886E0F7030069857D2E4169EE7";
const OWNER_LOWER = "0xde709f2102306220921060314715629080e2fb77";
const OWNER_UPPER = "0xDE709F2102306220921060314715629080E2FB77";
const WRAPPER_LOWER = "0x27b1fdb04752bbc536007a920d24acb045561c26";
const WRAPPER_UPPER = "0x27B1FDB04752BBC536007A920D24ACB045561C26";
const SPENDER_LOWER = "0xdbf03b407c01e7cd3cbea99509d93f8dddc8c6fb";
const COORDINATOR_LOWER = "0xd1220a0cf47c7b9be7a2e6ba89f429762e7b9adb";
const TOKEN_B_LOWER = "0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359";
const HANDLE_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa";
const HANDLE_B = "0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbBbbbbbbbbbbbbbbbbbbbbbbbb";

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
    expect(zamaQueryKeys.tokenMetadata.token(TOKEN_LOWER)).toEqual([
      "zama.tokenMetadata",
      { tokenAddress: getAddress(TOKEN_LOWER) },
    ]);
  });

  test("confidentialBalance owner key includes optional handle only when provided", () => {
    const withHandle = zamaQueryKeys.confidentialBalance.owner(TOKEN_LOWER, OWNER_LOWER, HANDLE_A);
    const withoutHandle = zamaQueryKeys.confidentialBalance.owner(TOKEN_LOWER, OWNER_LOWER);

    expect(withHandle).toEqual([
      "zama.confidentialBalance",
      { tokenAddress: getAddress(TOKEN_LOWER), owner: getAddress(OWNER_LOWER), handle: HANDLE_A },
    ]);

    expect(withoutHandle).toEqual([
      "zama.confidentialBalance",
      { tokenAddress: getAddress(TOKEN_LOWER), owner: getAddress(OWNER_LOWER) },
    ]);
    expect(withoutHandle[1]).not.toHaveProperty("handle");
  });

  test("confidentialBalances tokens key includes optional handles only when provided", () => {
    const withHandles = zamaQueryKeys.confidentialBalances.tokens([TOKEN_LOWER], OWNER_LOWER, [
      HANDLE_A,
      HANDLE_B,
    ]);
    const withoutHandles = zamaQueryKeys.confidentialBalances.tokens([TOKEN_LOWER], OWNER_LOWER);

    expect(withHandles).toEqual([
      "zama.confidentialBalances",
      {
        tokenAddresses: [getAddress(TOKEN_LOWER)],
        owner: getAddress(OWNER_LOWER),
        handles: [HANDLE_A, HANDLE_B],
      },
    ]);

    expect(withoutHandles).toEqual([
      "zama.confidentialBalances",
      {
        tokenAddresses: [getAddress(TOKEN_LOWER)],
        owner: getAddress(OWNER_LOWER),
      },
    ]);
    expect(withoutHandles[1]).not.toHaveProperty("handles");
  });

  test("fees.shieldFee includes optional amount/from/to only when amount is provided", () => {
    const withAllParams = zamaQueryKeys.fees.shieldFee(
      TOKEN_LOWER,
      "100",
      OWNER_LOWER,
      WRAPPER_LOWER,
    );
    const withoutAmount = zamaQueryKeys.fees.shieldFee(TOKEN_LOWER);

    expect(withAllParams).toEqual([
      "zama.fees",
      {
        type: "shield",
        feeManagerAddress: getAddress(TOKEN_LOWER),
        amount: "100",
        from: getAddress(OWNER_LOWER),
        to: getAddress(WRAPPER_LOWER),
      },
    ]);

    expect(withoutAmount).toEqual([
      "zama.fees",
      { type: "shield", feeManagerAddress: getAddress(TOKEN_LOWER) },
    ]);
    expect(withoutAmount[1]).not.toHaveProperty("amount");
  });

  test("activityFeed.scope contains full cache identity", () => {
    expect(
      zamaQueryKeys.activityFeed.scope(TOKEN_LOWER, OWNER_LOWER, "0xtx1:0,0xtx2:1", true),
    ).toEqual([
      "zama.activityFeed",
      {
        tokenAddress: getAddress(TOKEN_LOWER),
        userAddress: getAddress(OWNER_LOWER),
        logsKey: "0xtx1:0,0xtx2:1",
        decrypt: true,
      },
    ]);
  });

  test("key labels are consistent and params support prefix matching", () => {
    const all = zamaQueryKeys.confidentialBalance.all;
    const token = zamaQueryKeys.confidentialBalance.token(TOKEN_LOWER);
    const owner = zamaQueryKeys.confidentialBalance.owner(TOKEN_LOWER, OWNER_LOWER, HANDLE_A);

    expect(all[0]).toBe(token[0]);
    expect(token[0]).toBe(owner[0]);
    expect(owner[1]).toMatchObject(token[1]);
  });

  test("all parameterized keys are 2-element tuples", () => {
    const parameterizedKeys = [
      zamaQueryKeys.signerAddress.token(TOKEN_LOWER),
      zamaQueryKeys.confidentialHandle.owner(TOKEN_LOWER, OWNER_LOWER),
      zamaQueryKeys.confidentialBalance.owner(TOKEN_LOWER, OWNER_LOWER, HANDLE_A),
      zamaQueryKeys.confidentialHandles.tokens([TOKEN_LOWER, TOKEN_B_LOWER], OWNER_LOWER),
      zamaQueryKeys.confidentialBalances.tokens([TOKEN_LOWER, TOKEN_B_LOWER], OWNER_LOWER),
      zamaQueryKeys.tokenMetadata.token(TOKEN_LOWER),
      zamaQueryKeys.isConfidential.token(TOKEN_LOWER),
      zamaQueryKeys.isWrapper.token(TOKEN_LOWER),
      zamaQueryKeys.wrapperDiscovery.token(TOKEN_LOWER, COORDINATOR_LOWER),
      zamaQueryKeys.underlyingAllowance.token(TOKEN_LOWER),
      zamaQueryKeys.underlyingAllowance.scope(TOKEN_LOWER, OWNER_LOWER, WRAPPER_LOWER),
      zamaQueryKeys.confidentialIsApproved.token(TOKEN_LOWER),
      zamaQueryKeys.confidentialIsApproved.scope(TOKEN_LOWER, OWNER_LOWER, SPENDER_LOWER),
      zamaQueryKeys.totalSupply.token(TOKEN_LOWER),
      zamaQueryKeys.activityFeed.token(TOKEN_LOWER),
      zamaQueryKeys.activityFeed.scope(TOKEN_LOWER, OWNER_LOWER, "log-key", false),
      zamaQueryKeys.fees.shieldFee(TOKEN_LOWER, "100", OWNER_LOWER, WRAPPER_LOWER),
      zamaQueryKeys.fees.unshieldFee(TOKEN_LOWER, "100", OWNER_LOWER, WRAPPER_LOWER),
      zamaQueryKeys.fees.batchTransferFee(TOKEN_LOWER),
      zamaQueryKeys.fees.feeRecipient(TOKEN_LOWER),
      zamaQueryKeys.publicParams.bits(2048),
      zamaQueryKeys.decryption.handle(HANDLE_A, WRAPPER_LOWER),
    ];

    for (const key of parameterizedKeys) {
      expect(key).toHaveLength(2);
      expect(typeof key[0]).toBe("string");
      expect(typeof key[1]).toBe("object");
      expect(key[1]).not.toBeNull();
    }
  });

  test("normalizes addresses so case variants produce identical keys in core address namespaces", () => {
    const lowerVariants = [
      zamaQueryKeys.confidentialBalance.token(TOKEN_LOWER),
      zamaQueryKeys.confidentialHandle.token(TOKEN_LOWER),
      zamaQueryKeys.confidentialHandles.tokens([TOKEN_LOWER], OWNER_LOWER),
      zamaQueryKeys.confidentialBalances.tokens([TOKEN_LOWER], OWNER_LOWER),
      zamaQueryKeys.underlyingAllowance.scope(TOKEN_LOWER, OWNER_LOWER, WRAPPER_LOWER),
      zamaQueryKeys.signerAddress.token(TOKEN_LOWER),
      zamaQueryKeys.signerAddress.scope(1),
      zamaQueryKeys.activityFeed.scope(TOKEN_LOWER, OWNER_LOWER, "logs-key", false),
    ];

    const upperVariants = [
      zamaQueryKeys.confidentialBalance.token(TOKEN_UPPER),
      zamaQueryKeys.confidentialHandle.token(TOKEN_UPPER),
      zamaQueryKeys.confidentialHandles.tokens([TOKEN_UPPER], OWNER_UPPER),
      zamaQueryKeys.confidentialBalances.tokens([TOKEN_UPPER], OWNER_UPPER),
      zamaQueryKeys.underlyingAllowance.scope(TOKEN_UPPER, OWNER_UPPER, WRAPPER_UPPER),
      zamaQueryKeys.signerAddress.token(TOKEN_UPPER),
      zamaQueryKeys.signerAddress.scope(1),
      zamaQueryKeys.activityFeed.scope(TOKEN_UPPER, OWNER_UPPER, "logs-key", false),
    ];

    expect(lowerVariants).toEqual(upperVariants);
    expect(lowerVariants[0]![1]).toMatchObject({ tokenAddress: getAddress(TOKEN_LOWER) });
  });

  test("normalizes address fields in all other address-bearing factories", () => {
    const keyPairs = [
      [
        zamaQueryKeys.tokenMetadata.token(TOKEN_LOWER),
        zamaQueryKeys.tokenMetadata.token(TOKEN_UPPER),
      ],
      [
        zamaQueryKeys.isConfidential.token(TOKEN_LOWER),
        zamaQueryKeys.isConfidential.token(TOKEN_UPPER),
      ],
      [zamaQueryKeys.isWrapper.token(TOKEN_LOWER), zamaQueryKeys.isWrapper.token(TOKEN_UPPER)],
      [
        zamaQueryKeys.wrapperDiscovery.token(TOKEN_LOWER, COORDINATOR_LOWER),
        zamaQueryKeys.wrapperDiscovery.token(TOKEN_UPPER, getAddress(COORDINATOR_LOWER)),
      ],
      [
        zamaQueryKeys.underlyingAllowance.token(TOKEN_LOWER),
        zamaQueryKeys.underlyingAllowance.token(TOKEN_UPPER),
      ],
      [
        zamaQueryKeys.confidentialIsApproved.token(TOKEN_LOWER),
        zamaQueryKeys.confidentialIsApproved.token(TOKEN_UPPER),
      ],
      [
        zamaQueryKeys.confidentialIsApproved.scope(TOKEN_LOWER, OWNER_LOWER, SPENDER_LOWER),
        zamaQueryKeys.confidentialIsApproved.scope(
          TOKEN_UPPER,
          OWNER_UPPER,
          getAddress(SPENDER_LOWER),
        ),
      ],
      [zamaQueryKeys.isAllowed.scope(OWNER_LOWER), zamaQueryKeys.isAllowed.scope(OWNER_UPPER)],
      [zamaQueryKeys.totalSupply.token(TOKEN_LOWER), zamaQueryKeys.totalSupply.token(TOKEN_UPPER)],
      [
        zamaQueryKeys.fees.shieldFee(TOKEN_LOWER, "100", OWNER_LOWER, WRAPPER_LOWER),
        zamaQueryKeys.fees.shieldFee(TOKEN_UPPER, "100", OWNER_UPPER, WRAPPER_UPPER),
      ],
      [
        zamaQueryKeys.fees.unshieldFee(TOKEN_LOWER, "100", OWNER_LOWER, WRAPPER_LOWER),
        zamaQueryKeys.fees.unshieldFee(TOKEN_UPPER, "100", OWNER_UPPER, WRAPPER_UPPER),
      ],
      [
        zamaQueryKeys.fees.batchTransferFee(TOKEN_LOWER),
        zamaQueryKeys.fees.batchTransferFee(TOKEN_UPPER),
      ],
      [zamaQueryKeys.fees.feeRecipient(TOKEN_LOWER), zamaQueryKeys.fees.feeRecipient(TOKEN_UPPER)],
      [
        zamaQueryKeys.decryption.handle(HANDLE_A, WRAPPER_LOWER),
        zamaQueryKeys.decryption.handle(HANDLE_A, WRAPPER_UPPER),
      ],
    ];

    for (const [lowerKey, upperKey] of keyPairs) {
      expect(lowerKey).toEqual(upperKey);
    }
  });

  test("isAllowed scope key includes account identity", () => {
    expect(zamaQueryKeys.isAllowed.scope(OWNER_LOWER)).toEqual([
      "zama.isAllowed",
      { account: getAddress(OWNER_LOWER) },
    ]);
  });

  test("omits absent optional address fields from query keys", () => {
    expect(zamaQueryKeys.confidentialHandle.owner(TOKEN_LOWER)).toEqual([
      "zama.confidentialHandle",
      { tokenAddress: getAddress(TOKEN_LOWER) },
    ]);
    expect(zamaQueryKeys.underlyingAllowance.scope(TOKEN_LOWER)).toEqual([
      "zama.underlyingAllowance",
      { tokenAddress: getAddress(TOKEN_LOWER) },
    ]);
    expect(zamaQueryKeys.confidentialIsApproved.scope(TOKEN_LOWER, OWNER_LOWER)).toEqual([
      "zama.confidentialIsApproved",
      { tokenAddress: getAddress(TOKEN_LOWER), holder: getAddress(OWNER_LOWER) },
    ]);
  });

  test("fees keys type feeManagerAddress as Address | undefined", () => {
    const shieldFeeKey = zamaQueryKeys.fees.shieldFee(TOKEN_LOWER);
    const unshieldFeeKey = zamaQueryKeys.fees.unshieldFee(TOKEN_LOWER);
    const batchTransferFeeKey = zamaQueryKeys.fees.batchTransferFee(TOKEN_LOWER);
    const feeRecipientKey = zamaQueryKeys.fees.feeRecipient(TOKEN_LOWER);

    expectTypeOf(shieldFeeKey[1].feeManagerAddress).toEqualTypeOf<Address | undefined>();
    expectTypeOf(unshieldFeeKey[1].feeManagerAddress).toEqualTypeOf<Address | undefined>();
    expectTypeOf(batchTransferFeeKey[1].feeManagerAddress).toEqualTypeOf<Address | undefined>();
    expectTypeOf(feeRecipientKey[1].feeManagerAddress).toEqualTypeOf<Address | undefined>();
  });
});
