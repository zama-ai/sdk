import type { Address } from "viem";
import { describe, expect, test } from "../../test-fixtures";
import {
  buildAllowAsIntent,
  buildAllowIntent,
  buildConfidentialTransferIntent,
  buildDelegateDecryptionIntent,
  buildFinalizeUnwrapIntent,
  buildShieldViaTransferAndCallIntent,
  buildShieldViaWrapIntent,
  buildUnwrapAllIntent,
  buildUnwrapIntent,
} from "../builders";
import { assertClearSigningIntentSafe, validateClearSigningIntent } from "../validation";
import type { ClearSigningIntent } from "../types";

const TOKEN = "0x1111111111111111111111111111111111111111" as Address;
const WRAPPER = "0x2222222222222222222222222222222222222222" as Address;
const UNDERLYING = "0x3333333333333333333333333333333333333333" as Address;
const USER = "0x4444444444444444444444444444444444444444" as Address;
const RECIPIENT = "0x5555555555555555555555555555555555555555" as Address;
const DELEGATE = "0x6666666666666666666666666666666666666666" as Address;
const ACL = "0x7777777777777777777777777777777777777777" as Address;
const HANDLE = `0x${"ab".repeat(32)}`;

describe("validateClearSigningIntent", () => {
  test("accepts every generated builder intent", () => {
    const intents = [
      buildAllowIntent({
        contractAddresses: [TOKEN],
        startTimestamp: 1_700_000_000,
        durationDays: 30,
      }),
      buildAllowAsIntent({
        contractAddresses: [TOKEN],
        delegatorAddress: USER,
        startTimestamp: 1_700_000_000,
        durationDays: 30,
      }),
      buildDelegateDecryptionIntent({
        contractAddress: TOKEN,
        delegateAddress: DELEGATE,
        delegatorAddress: USER,
        aclAddress: ACL,
      }),
      buildConfidentialTransferIntent({
        tokenAddress: TOKEN,
        recipientAddress: RECIPIENT,
        amount: 100n,
        encryptedAmount: { value: HANDLE },
        hasInputProof: true,
      }),
      buildShieldViaTransferAndCallIntent({
        underlyingTokenAddress: UNDERLYING,
        wrapperAddress: WRAPPER,
        senderAddress: USER,
        recipientAddress: RECIPIENT,
        amount: 100n,
      }),
      buildShieldViaWrapIntent({
        underlyingTokenAddress: UNDERLYING,
        wrapperAddress: WRAPPER,
        senderAddress: USER,
        recipientAddress: RECIPIENT,
        amount: 100n,
      }),
      buildUnwrapIntent({
        wrapperAddress: WRAPPER,
        fromAddress: USER,
        recipientAddress: RECIPIENT,
        amount: 100n,
        encryptedAmount: { value: HANDLE },
        hasInputProof: true,
      }),
      buildUnwrapAllIntent({
        wrapperAddress: WRAPPER,
        fromAddress: USER,
        recipientAddress: RECIPIENT,
        encryptedBalance: { value: HANDLE },
      }),
      buildFinalizeUnwrapIntent({
        wrapperAddress: WRAPPER,
        unwrapRequestId: HANDLE,
        clearAmount: 100n,
        hasDecryptionProof: true,
      }),
    ];

    for (const intent of intents) {
      expect(validateClearSigningIntent(intent), intent.kind).toEqual({ valid: true, issues: [] });
      expect(() => assertClearSigningIntentSafe(intent), intent.kind).not.toThrow();
    }
  });

  test("rejects encrypted fields without safe display values", () => {
    const intent: ClearSigningIntent = {
      kind: "confidentialTransfer",
      title: "Send confidential tokens",
      summary: "Transfer an encrypted token amount to a public recipient.",
      fields: [
        {
          label: "Encrypted amount",
          visibility: "encrypted",
          value: "0xencrypted",
        },
      ],
    };

    expect(validateClearSigningIntent(intent)).toMatchInlineSnapshot(`
      {
        "issues": [
          {
            "code": "encrypted-field-missing-safe-display",
            "fieldIndex": 0,
            "message": "Encrypted fields must provide a safe display value.",
          },
        ],
        "valid": false,
      }
    `);
    expect(() => assertClearSigningIntentSafe(intent)).toThrow(
      "Unsafe clear-signing intent: encrypted-field-missing-safe-display at field 0",
    );
  });

  test("rejects internal fields that are not redacted", () => {
    const intent: ClearSigningIntent = {
      kind: "unwrap",
      title: "Request unshield",
      summary: "Start converting a confidential amount into public tokens.",
      fields: [
        {
          label: "Input proof",
          visibility: "internal",
          displayValue: "Protocol proof (hidden)",
        },
      ],
    };

    expect(validateClearSigningIntent(intent)).toMatchInlineSnapshot(`
      {
        "issues": [
          {
            "code": "internal-field-not-redacted",
            "fieldIndex": 0,
            "message": "Internal fields must be marked as redacted.",
          },
        ],
        "valid": false,
      }
    `);
  });

  test("rejects internal fields that expose raw values", () => {
    const intent: ClearSigningIntent = {
      kind: "unwrap",
      title: "Request unshield",
      summary: "Start converting a confidential amount into public tokens.",
      fields: [
        {
          label: "Input proof",
          visibility: "internal",
          value: "0xproof",
          displayValue: "Protocol proof (hidden)",
          redacted: true,
        },
      ],
    };

    expect(validateClearSigningIntent(intent)).toMatchInlineSnapshot(`
      {
        "issues": [
          {
            "code": "internal-field-has-value",
            "fieldIndex": 0,
            "message": "Internal fields must not expose raw values.",
          },
        ],
        "valid": false,
      }
    `);
  });

  test("rejects unsupported intent kinds at runtime", () => {
    const intent = {
      kind: "transfer",
      title: "Send tokens",
      summary: "Unsupported kind.",
      fields: [{ label: "Recipient", visibility: "public", value: RECIPIENT }],
    } as unknown as ClearSigningIntent;

    expect(validateClearSigningIntent(intent)).toMatchInlineSnapshot(`
      {
        "issues": [
          {
            "code": "invalid-kind",
            "message": "Intent kind is not supported.",
          },
        ],
        "valid": false,
      }
    `);
  });

  test("rejects empty title, summary, and field labels", () => {
    const intent: ClearSigningIntent = {
      kind: "allow",
      title: "",
      summary: "",
      fields: [{ label: "", visibility: "public", value: "0xcontract" }],
    };

    expect(validateClearSigningIntent(intent).issues.map((issue) => issue.code)).toEqual([
      "missing-title",
      "missing-summary",
      "missing-field-label",
    ]);
  });

  test("rejects intents without fields", () => {
    const intent: ClearSigningIntent = {
      kind: "shield",
      title: "Shield public tokens",
      summary: "Convert public ERC-20 tokens into a confidential balance.",
      fields: [],
    };

    expect(validateClearSigningIntent(intent)).toMatchInlineSnapshot(`
      {
        "issues": [
          {
            "code": "missing-fields",
            "message": "Intent must include at least one field.",
          },
        ],
        "valid": false,
      }
    `);
  });
});
