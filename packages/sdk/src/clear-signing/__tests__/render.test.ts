import { describe, expect, test } from "../../test-fixtures";
import { renderClearSigningIntent } from "../render";
import type { ClearSigningIntent } from "../types";

const intent: ClearSigningIntent = {
  kind: "confidentialTransfer",
  title: "Send confidential tokens",
  summary: "Transfer an encrypted token amount to a public recipient.",
  fields: [
    {
      label: "Recipient",
      visibility: "public",
      value: "0x1111111111111111111111111111111111111111",
    },
    {
      label: "Amount",
      visibility: "public",
      value: 100n,
    },
    {
      label: "Encrypted amount",
      visibility: "encrypted",
      value: "0xhidden",
      displayValue: "Hidden encrypted amount",
    },
    {
      label: "Input proof",
      visibility: "internal",
      displayValue: "Protocol proof (hidden)",
      redacted: true,
    },
  ],
  warnings: ["Review encrypted fields carefully."],
};

describe("renderClearSigningIntent", () => {
  test("renders a safe user-facing intent by default", () => {
    const rendered = renderClearSigningIntent(intent);

    expect(rendered).toMatchSnapshot();
    expect(rendered.fields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Input proof" })]),
    );
    expect(rendered.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Encrypted amount",
          value: "Hidden encrypted amount",
          visibility: "encrypted",
        }),
      ]),
    );
  });

  test("can include internal fields for advanced displays", () => {
    const rendered = renderClearSigningIntent(intent, { includeInternal: true });

    expect(rendered).toMatchSnapshot();
    expect(rendered.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Input proof",
          value: "Protocol proof (hidden)",
          visibility: "internal",
        }),
      ]),
    );
  });
});
