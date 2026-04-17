import { describe, expect, test } from "../../test-fixtures";
import { getAddress } from "viem";

import { zamaQueryKeys } from "../query-keys";

const TOKEN_LOWER = "0x52908400098527886e0f7030069857d2e4169ee7";
const TOKEN_UPPER = "0x52908400098527886E0F7030069857D2E4169EE7";
const OWNER_LOWER = "0xde709f2102306220921060314715629080e2fb77";
const OWNER_UPPER = "0xDE709F2102306220921060314715629080E2FB77";
const WRAPPER_LOWER = "0x27b1fdb04752bbc536007a920d24acb045561c26";
const WRAPPER_UPPER = "0x27B1FDB04752BBC536007A920D24ACB045561C26";
const SPENDER_LOWER = "0xdbf03b407c01e7cd3cbea99509d93f8dddc8c6fb";
const ERC20_LOWER = "0xd1220a0cf47c7b9be7a2e6ba89f429762e7b9adb";
const TOKEN_B_LOWER = "0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359";
const HANDLE_A = "0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAaaaaaaaaaaaaaaaaaaaaaaaaa";

describe("zamaQueryKeys", () => {
  test.each([
    ["signerAddress", zamaQueryKeys.signerAddress.all],
    ["confidentialBalance", zamaQueryKeys.confidentialBalance.all],
    ["confidentialBalances", zamaQueryKeys.confidentialBalances.all],
    ["tokenMetadata", zamaQueryKeys.tokenMetadata.all],
    ["isConfidential", zamaQueryKeys.isConfidential.all],
    ["isWrapper", zamaQueryKeys.isWrapper.all],
    ["wrapperDiscovery", zamaQueryKeys.wrapperDiscovery.all],
    ["underlyingAllowance", zamaQueryKeys.underlyingAllowance.all],
    ["confidentialIsApproved", zamaQueryKeys.confidentialIsApproved.all],
    ["totalSupply", zamaQueryKeys.totalSupply.all],
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

  test("confidentialBalance owner key includes optional owner only when provided", () => {
    const withOwner = zamaQueryKeys.confidentialBalance.owner(TOKEN_LOWER, OWNER_LOWER);
    const withoutOwner = zamaQueryKeys.confidentialBalance.owner(TOKEN_LOWER);

    expect(withOwner).toEqual([
      "zama.confidentialBalance",
      {
        tokenAddress: getAddress(TOKEN_LOWER),
        owner: getAddress(OWNER_LOWER),
      },
    ]);

    expect(withoutOwner).toEqual([
      "zama.confidentialBalance",
      { tokenAddress: getAddress(TOKEN_LOWER) },
    ]);
    expect(withoutOwner[1]).not.toHaveProperty("owner");
  });

  test("confidentialBalances tokens key includes optional owner only when provided", () => {
    const withOwner = zamaQueryKeys.confidentialBalances.tokens([TOKEN_LOWER], OWNER_LOWER);
    const withoutOwner = zamaQueryKeys.confidentialBalances.tokens([TOKEN_LOWER]);

    expect(withOwner).toEqual([
      "zama.confidentialBalances",
      {
        tokenAddresses: [getAddress(TOKEN_LOWER)],
        owner: getAddress(OWNER_LOWER),
      },
    ]);

    expect(withoutOwner).toEqual([
      "zama.confidentialBalances",
      {
        tokenAddresses: [getAddress(TOKEN_LOWER)],
      },
    ]);
    expect(withoutOwner[1]).not.toHaveProperty("owner");
  });

  test("key labels are consistent and params support prefix matching", () => {
    const all = zamaQueryKeys.confidentialBalance.all;
    const token = zamaQueryKeys.confidentialBalance.token(TOKEN_LOWER);
    const owner = zamaQueryKeys.confidentialBalance.owner(TOKEN_LOWER, OWNER_LOWER);

    expect(all[0]).toBe(token[0]);
    expect(token[0]).toBe(owner[0]);
    expect(owner[1]).toMatchObject(token[1]);
  });

  test("all parameterized keys are 2-element tuples", () => {
    const parameterizedKeys = [
      zamaQueryKeys.signerAddress.token(TOKEN_LOWER),
      zamaQueryKeys.confidentialBalance.owner(TOKEN_LOWER, OWNER_LOWER),
      zamaQueryKeys.confidentialBalances.tokens([TOKEN_LOWER, TOKEN_B_LOWER], OWNER_LOWER),
      zamaQueryKeys.tokenMetadata.token(TOKEN_LOWER),
      zamaQueryKeys.isConfidential.token(TOKEN_LOWER),
      zamaQueryKeys.isWrapper.token(TOKEN_LOWER),
      zamaQueryKeys.wrapperDiscovery.token(TOKEN_LOWER, ERC20_LOWER),
      zamaQueryKeys.underlyingAllowance.token(TOKEN_LOWER),
      zamaQueryKeys.underlyingAllowance.scope(TOKEN_LOWER, OWNER_LOWER, WRAPPER_LOWER),
      zamaQueryKeys.confidentialIsApproved.token(TOKEN_LOWER),
      zamaQueryKeys.confidentialIsApproved.scope(TOKEN_LOWER, OWNER_LOWER, SPENDER_LOWER),
      zamaQueryKeys.totalSupply.token(TOKEN_LOWER),
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
      zamaQueryKeys.confidentialBalances.tokens([TOKEN_LOWER], OWNER_LOWER),
      zamaQueryKeys.underlyingAllowance.scope(TOKEN_LOWER, OWNER_LOWER, WRAPPER_LOWER),
      zamaQueryKeys.signerAddress.token(TOKEN_LOWER),
      zamaQueryKeys.signerAddress.scope(1),
    ];

    const upperVariants = [
      zamaQueryKeys.confidentialBalance.token(TOKEN_UPPER),
      zamaQueryKeys.confidentialBalances.tokens([TOKEN_UPPER], OWNER_UPPER),
      zamaQueryKeys.underlyingAllowance.scope(TOKEN_UPPER, OWNER_UPPER, WRAPPER_UPPER),
      zamaQueryKeys.signerAddress.token(TOKEN_UPPER),
      zamaQueryKeys.signerAddress.scope(1),
    ];

    expect(lowerVariants).toEqual(upperVariants);
    expect(lowerVariants[0][1]).toMatchObject({
      tokenAddress: getAddress(TOKEN_LOWER),
    });
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
        zamaQueryKeys.wrapperDiscovery.token(TOKEN_LOWER, ERC20_LOWER),
        zamaQueryKeys.wrapperDiscovery.token(TOKEN_UPPER, getAddress(ERC20_LOWER)),
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
      [
        zamaQueryKeys.isAllowed.scope(OWNER_LOWER, [TOKEN_LOWER]),
        zamaQueryKeys.isAllowed.scope(OWNER_UPPER, [TOKEN_UPPER]),
      ],
      [zamaQueryKeys.totalSupply.token(TOKEN_LOWER), zamaQueryKeys.totalSupply.token(TOKEN_UPPER)],
      [
        zamaQueryKeys.decryption.handle(HANDLE_A, WRAPPER_LOWER),
        zamaQueryKeys.decryption.handle(HANDLE_A, WRAPPER_UPPER),
      ],
    ];

    for (const [lowerKey, upperKey] of keyPairs) {
      expect(lowerKey).toEqual(upperKey);
    }
  });

  test("isAllowed scope key includes account and contractAddresses", () => {
    expect(zamaQueryKeys.isAllowed.scope(OWNER_LOWER, [TOKEN_LOWER])).toEqual([
      "zama.isAllowed",
      {
        account: getAddress(OWNER_LOWER),
        contractAddresses: [getAddress(TOKEN_LOWER)],
      },
    ]);
  });

  test("omits absent optional address fields from query keys", () => {
    expect(zamaQueryKeys.underlyingAllowance.scope(TOKEN_LOWER)).toEqual([
      "zama.underlyingAllowance",
      { tokenAddress: getAddress(TOKEN_LOWER) },
    ]);
    expect(zamaQueryKeys.confidentialIsApproved.scope(TOKEN_LOWER, OWNER_LOWER)).toEqual([
      "zama.confidentialIsApproved",
      {
        tokenAddress: getAddress(TOKEN_LOWER),
        holder: getAddress(OWNER_LOWER),
      },
    ]);
  });
});
