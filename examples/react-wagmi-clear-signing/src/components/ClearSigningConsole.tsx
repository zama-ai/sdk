"use client";

import { useMemo } from "react";
import { renderClearSigningIntent, type ClearSigningIntent } from "@zama-fhe/sdk";
import { formatUnits } from "viem";

export type ClearSigningIntentSource = "preview" | "runtime";

export interface ClearSigningTokenSnapshot {
  underlyingSymbol: string;
  underlyingDecimals: number;
  confidentialSymbol: string;
  confidentialDecimals: number;
  networkName: string;
}

export interface ClearSigningIntentEntry {
  source: ClearSigningIntentSource;
  operation: string;
  intent: ClearSigningIntent;
  timestamp: number;
  token?: ClearSigningTokenSnapshot;
}

interface ClearSigningConsoleProps {
  entry: ClearSigningIntentEntry | null;
  onClear: () => void;
}

export function ClearSigningConsole({ entry, onClear }: ClearSigningConsoleProps) {
  const rendered = useMemo(() => (entry ? renderClearSigningIntent(entry.intent) : null), [entry]);
  const summaryRows = useMemo(
    () => (entry && rendered ? humanSummaryRows(entry, rendered.fields) : []),
    [entry, rendered],
  );
  const json = useMemo(
    () =>
      entry
        ? JSON.stringify(
            entry.intent,
            (_key, value) => (typeof value === "bigint" ? value.toString() : value),
            2,
          )
        : "",
    [entry],
  );

  return (
    <div className="card clear-signing-console">
      <div className="clear-signing-console-header">
        <div>
          <div className="card-title">Clear Signing Intent Console</div>
          <p className="token-meta">
            App-level preview for human review before the wallet prompt. Wallet-native ERC-7730
            rendering is not enabled in this demo.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClear}
          disabled={!entry}
        >
          Clear
        </button>
      </div>

      {!entry || !rendered ? (
        <div className="clear-signing-empty">
          Use a <strong>Preview intent</strong> button or execute an operation to capture the next
          runtime intent.
        </div>
      ) : (
        <div className="clear-signing-content">
          <div className="clear-signing-meta">
            <span className={`intent-source intent-source-${entry.source}`}>{entry.source}</span>
            <span>{entry.operation}</span>
            <span>{new Date(entry.timestamp).toLocaleTimeString()}</span>
          </div>

          <h2 className="clear-signing-title">{rendered.title}</h2>
          <p className="clear-signing-summary">{rendered.summary}</p>

          {summaryRows.length > 0 && (
            <dl className="clear-signing-human-summary" aria-label="Human-readable intent summary">
              {summaryRows.map((row) => (
                <div key={row.label} className="clear-signing-human-row">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {rendered.warnings.length > 0 && (
            <div className="clear-signing-warnings">
              {rendered.warnings.map((warning) => (
                <div key={warning} className="alert alert-warning">
                  {warning}
                </div>
              ))}
            </div>
          )}

          <details className="clear-signing-details">
            <summary>Technical intent details</summary>
            <dl className="clear-signing-fields">
              {rendered.fields.map((field, index) => (
                <div key={`${field.label}-${index}`} className="clear-signing-field">
                  <dt>{field.label}</dt>
                  <dd>
                    <span>{field.value}</span>
                    <span className={`visibility-pill visibility-${field.visibility}`}>
                      {field.visibility}
                    </span>
                  </dd>
                </div>
              ))}
            </dl>
          </details>

          <details className="clear-signing-json">
            <summary>Raw intent JSON</summary>
            <pre>{json}</pre>
          </details>
        </div>
      )}
    </div>
  );
}

type RenderedField = ReturnType<typeof renderClearSigningIntent>["fields"][number];

interface HumanSummaryRow {
  label: string;
  value: string;
}

function humanSummaryRows(
  entry: ClearSigningIntentEntry,
  fields: readonly RenderedField[],
): HumanSummaryRow[] {
  switch (entry.intent.kind) {
    case "shield":
      return shieldSummaryRows(entry, fields);
    default:
      return defaultSummaryRows(entry, fields);
  }
}

function shieldSummaryRows(
  entry: ClearSigningIntentEntry,
  fields: readonly RenderedField[],
): HumanSummaryRow[] {
  const amount = rawBigIntField(fields, "Public amount");
  const recipient = fieldValue(fields, "Recipient");
  const wrapper = fieldValue(fields, "Confidential wrapper");
  const token = entry.token;

  return compactRows([
    { label: "Action", value: "Shield" },
    amount !== undefined && token
      ? {
          label: "Send",
          value: `${formatUnits(amount, token.underlyingDecimals)} ${token.underlyingSymbol}`,
        }
      : valueRow("Send", fieldValue(fields, "Public amount")),
    token && { label: "Receive", value: token.confidentialSymbol },
    valueRow("Recipient", recipient ? shortAddress(recipient) : undefined),
    valueRow("Wrapper", wrapper ? shortAddress(wrapper) : undefined),
    token && { label: "Network", value: token.networkName },
  ]);
}

function defaultSummaryRows(
  entry: ClearSigningIntentEntry,
  fields: readonly RenderedField[],
): HumanSummaryRow[] {
  return compactRows([
    { label: "Action", value: entry.operation },
    ...fields
      .filter((field) => field.visibility !== "internal")
      .slice(0, 4)
      .map((field) => ({
        label: field.label,
        value: field.value,
      })),
  ]);
}

function fieldValue(fields: readonly RenderedField[], label: string): string | undefined {
  return fields.find((field) => field.label === label)?.value;
}

function rawBigIntField(fields: readonly RenderedField[], label: string): bigint | undefined {
  const value = fieldValue(fields, label);
  if (!value || !/^\d+$/.test(value)) {
    return undefined;
  }
  return BigInt(value);
}

function shortAddress(value: string): string {
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

function valueRow(label: string, value: string | undefined): HumanSummaryRow | undefined {
  return value ? { label, value } : undefined;
}

function compactRows(rows: readonly (HumanSummaryRow | false | undefined)[]): HumanSummaryRow[] {
  return rows.filter((row): row is HumanSummaryRow => Boolean(row));
}
