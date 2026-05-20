import type { Address } from "viem";
import { describe, expect, test } from "../../test-fixtures";
import {
  buildAllowIntent,
  buildAllowAsIntentFromEIP712,
  buildConfidentialTransferFromIntent,
  buildAllowIntentFromEIP712,
  buildConfidentialTransferIntent,
  buildDelegateDecryptionIntent,
  buildFinalizeUnwrapIntent,
  buildShieldViaTransferAndCallIntent,
  buildShieldViaWrapIntent,
  buildUnwrapAllIntent,
  buildUnwrapIntent,
} from "../builders";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const WRAPPER = "0x2222222222222222222222222222222222222222" as Address;
const UNDERLYING = "0x3333333333333333333333333333333333333333" as Address;
const USER = "0x4444444444444444444444444444444444444444" as Address;
const RECIPIENT = "0x5555555555555555555555555555555555555555" as Address;
const DELEGATE = "0x6666666666666666666666666666666666666666" as Address;
const ACL = "0x7777777777777777777777777777777777777777" as Address;
const HANDLE = `0x${"ab".repeat(32)}`;

describe("clear signing intent builders", () => {
  test("buildAllowIntent snapshots user decrypt authorization", () => {
    expect(
      buildAllowIntent({
        contractAddresses: [TOKEN, WRAPPER],
        startTimestamp: 1_700_000_000,
        durationDays: 30,
        chainId: 1,
        typedData: { primaryType: "UserDecryptRequestVerification" },
      }),
    ).toMatchSnapshot();
  });

  test("buildAllowIntentFromEIP712 maps direct decrypt typed data", () => {
    const intent = buildAllowIntentFromEIP712({
      domain: {
        name: "Decryption",
        version: "1",
        chainId: 1n,
        verifyingContract: WRAPPER,
      },
      types: {
        EIP712Domain: [],
        UserDecryptRequestVerification: [],
      },
      primaryType: "UserDecryptRequestVerification",
      message: {
        publicKey: "0xpublic",
        contractAddresses: [TOKEN],
        startTimestamp: "1700000000",
        durationDays: "30",
        extraData: "0x00",
      },
    });

    expect(intent).toMatchSnapshot();
    expect(intent.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Authorized contracts", visibility: "public" }),
        expect.objectContaining({ label: "FHE public key", visibility: "internal" }),
      ]),
    );
  });

  test("buildAllowAsIntentFromEIP712 maps delegated decrypt typed data", () => {
    const intent = buildAllowAsIntentFromEIP712({
      domain: {
        name: "Decryption",
        version: "1",
        chainId: 1n,
        verifyingContract: WRAPPER,
      },
      types: {
        EIP712Domain: [],
        DelegatedUserDecryptRequestVerification: [],
      },
      primaryType: "DelegatedUserDecryptRequestVerification",
      message: {
        publicKey: "0xpublic",
        contractAddresses: [TOKEN],
        delegatorAddress: USER,
        startTimestamp: "1700000000",
        durationDays: "30",
        extraData: "0x00",
      },
    });

    expect(intent).toMatchSnapshot();
    expect(intent.kind).toBe("allowAs");
  });

  test("buildDelegateDecryptionIntent snapshots delegated decrypt semantics", () => {
    const intent = buildDelegateDecryptionIntent({
      contractAddress: TOKEN,
      delegateAddress: DELEGATE,
      delegatorAddress: USER,
      aclAddress: ACL,
      permanent: true,
      chainId: 1,
      contractCall: { functionName: "delegateForUserDecryption" },
    });

    expect(intent).toMatchSnapshot();
  });

  test("buildConfidentialTransferIntent snapshots encrypted amount separation", () => {
    const intent = buildConfidentialTransferIntent({
      tokenAddress: TOKEN,
      senderAddress: USER,
      recipientAddress: RECIPIENT,
      amount: 100n,
      encryptedAmount: { value: HANDLE },
      hasInputProof: true,
      chainId: 1,
      contractCall: { functionName: "confidentialTransfer" },
    });

    expect(intent).toMatchSnapshot();
    expect(intent.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Amount", visibility: "public", value: 100n }),
        expect.objectContaining({
          label: "Encrypted amount",
          visibility: "encrypted",
          displayValue: "Hidden encrypted amount",
        }),
        expect.objectContaining({ label: "Input proof", visibility: "internal", redacted: true }),
      ]),
    );
  });

  test("buildConfidentialTransferFromIntent snapshots operator context", () => {
    const intent = buildConfidentialTransferFromIntent({
      tokenAddress: TOKEN,
      sourceAddress: USER,
      operatorAddress: DELEGATE,
      recipientAddress: RECIPIENT,
      amount: 100n,
      encryptedAmount: { value: HANDLE },
      hasInputProof: true,
      chainId: 1,
      contractCall: { functionName: "confidentialTransferFrom" },
    });

    expect(intent).toMatchSnapshot();
    expect(intent.kind).toBe("confidentialTransferFrom");
    expect(intent.contractContext?.functionName).toBe("confidentialTransferFrom");
    expect(intent.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Granting wallet", value: USER }),
        expect.objectContaining({ label: "Operator wallet", value: DELEGATE }),
      ]),
    );
  });

  test("buildShieldViaTransferAndCallIntent snapshots single transaction shield", () => {
    expect(
      buildShieldViaTransferAndCallIntent({
        underlyingTokenAddress: UNDERLYING,
        wrapperAddress: WRAPPER,
        senderAddress: USER,
        recipientAddress: USER,
        amount: 500n,
        chainId: 1,
        contractCall: { functionName: "transferAndCall" },
      }),
    ).toMatchSnapshot();
  });

  test("buildShieldViaWrapIntent snapshots approval and wrap shield", () => {
    const intent = buildShieldViaWrapIntent({
      underlyingTokenAddress: UNDERLYING,
      wrapperAddress: WRAPPER,
      senderAddress: USER,
      recipientAddress: RECIPIENT,
      amount: 500n,
      approvalAmount: 2n ** 256n - 1n,
      maxApproval: true,
      chainId: 1,
      approvalContractCall: { functionName: "approve" },
      wrapContractCall: { functionName: "wrap" },
    });

    expect(intent).toMatchSnapshot();
    expect(intent.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Approval amount", value: 2n ** 256n - 1n }),
      ]),
    );
  });

  test("buildShieldViaWrapIntent omits approval amount when no approval is shown", () => {
    const intent = buildShieldViaWrapIntent({
      underlyingTokenAddress: UNDERLYING,
      wrapperAddress: WRAPPER,
      senderAddress: USER,
      recipientAddress: RECIPIENT,
      amount: 500n,
      maxApproval: true,
      chainId: 1,
      wrapContractCall: { functionName: "wrap" },
    });

    expect(intent.fields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Approval amount" })]),
    );
  });

  test("buildUnwrapIntent snapshots first phase unshield", () => {
    const intent = buildUnwrapIntent({
      wrapperAddress: WRAPPER,
      fromAddress: USER,
      recipientAddress: USER,
      amount: 50n,
      encryptedAmount: { value: HANDLE },
      hasInputProof: true,
      chainId: 1,
      contractCall: { functionName: "unwrap" },
    });

    expect(intent).toMatchSnapshot();
  });

  test("buildUnwrapAllIntent snapshots entire balance semantics", () => {
    const intent = buildUnwrapAllIntent({
      wrapperAddress: WRAPPER,
      fromAddress: USER,
      recipientAddress: USER,
      encryptedBalance: { value: HANDLE },
      chainId: 1,
      contractCall: { functionName: "unwrap" },
    });

    expect(intent).toMatchSnapshot();
    expect(intent.title).toContain("entire confidential balance");
    expect(intent.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Amount",
          visibility: "derived",
          value: "Entire confidential balance",
        }),
        expect.objectContaining({
          label: "Encrypted balance",
          visibility: "encrypted",
          displayValue: "Hidden encrypted balance",
        }),
      ]),
    );
  });

  test("buildFinalizeUnwrapIntent snapshots public finalization amount", () => {
    const intent = buildFinalizeUnwrapIntent({
      wrapperAddress: WRAPPER,
      unwrapRequestId: HANDLE,
      clearAmount: 50n,
      hasDecryptionProof: true,
      chainId: 1,
      contractCall: { functionName: "finalizeUnwrap" },
    });

    expect(intent).toMatchSnapshot();
    expect(intent.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Public amount", visibility: "public", value: 50n }),
        expect.objectContaining({
          label: "Decryption proof",
          visibility: "internal",
          redacted: true,
        }),
      ]),
    );
  });

  test("encrypted fields never use plaintext amount display labels", () => {
    const intents = [
      buildConfidentialTransferIntent({
        tokenAddress: TOKEN,
        recipientAddress: RECIPIENT,
        amount: 100n,
        encryptedAmount: { value: HANDLE },
      }),
      buildUnwrapIntent({
        wrapperAddress: WRAPPER,
        fromAddress: USER,
        recipientAddress: USER,
        amount: 100n,
        encryptedAmount: { value: HANDLE },
      }),
      buildUnwrapAllIntent({
        wrapperAddress: WRAPPER,
        fromAddress: USER,
        recipientAddress: USER,
        encryptedBalance: { value: HANDLE },
      }),
    ];

    for (const intent of intents) {
      for (const field of intent.fields.filter((item) => item.visibility === "encrypted")) {
        expect(field.displayValue).not.toBe("100");
        expect(field.label.toLowerCase()).toContain("encrypted");
      }
    }
  });

  test("large timestamps fall back to raw display instead of throwing", () => {
    const largeTimestamp = 2n ** 64n - 1n;

    const allowIntent = buildAllowIntent({
      contractAddresses: [TOKEN],
      startTimestamp: largeTimestamp,
      durationDays: 30,
    });
    const delegationIntent = buildDelegateDecryptionIntent({
      contractAddress: TOKEN,
      delegateAddress: DELEGATE,
      expirationTimestamp: largeTimestamp,
    });

    expect(allowIntent.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Starts at",
          displayValue: largeTimestamp.toString(),
        }),
      ]),
    );
    expect(delegationIntent.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Access expires",
          value: largeTimestamp.toString(),
        }),
      ]),
    );
  });

  test("builders omit optional undefined properties", () => {
    const allowIntent = buildAllowIntent({ contractAddresses: [TOKEN] });
    const shieldIntent = buildShieldViaWrapIntent({
      underlyingTokenAddress: UNDERLYING,
      wrapperAddress: WRAPPER,
      recipientAddress: USER,
      amount: 100n,
    });

    expect(allowIntent.contractContext).toBeUndefined();
    expect(allowIntent.rawContext).toBeUndefined();
    expect(allowIntent.fields[0]).not.toHaveProperty("displayValue");
    expect(shieldIntent.rawContext).toBeUndefined();
  });
});
