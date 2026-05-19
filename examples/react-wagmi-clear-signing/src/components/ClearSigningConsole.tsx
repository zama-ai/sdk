"use client";

import { useEffect, useMemo, useState } from "react";
import { renderClearSigningIntent, type ClearSigningIntent } from "@zama-fhe/sdk";
import { encodeFunctionData, getAddress, isAddress, isHex, formatUnits, type Abi } from "viem";
import { SEPOLIA_CHAIN_ID } from "@/lib/config";

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
  const erc7730Calls = useMemo(() => (entry ? extractErc7730Calls(entry.intent) : []), [entry]);
  const [erc7730State, setErc7730State] = useState<Erc7730PreviewState>({ status: "idle" });
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

  useEffect(() => {
    if (!entry) {
      setErc7730State({ status: "idle" });
      return;
    }
    if (erc7730Calls.length === 0) {
      setErc7730State({ status: "unsupported" });
      return;
    }

    const controller = new AbortController();
    setErc7730State({ status: "loading" });

    void fetch("/api/erc7730/render", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calls: erc7730Calls }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(await response.text());
        }
        return (await response.json()) as { previews: Erc7730RenderResult[] };
      })
      .then(({ previews }) => {
        setErc7730State({ status: "ready", previews });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        setErc7730State({
          status: "error",
          message: error instanceof Error ? error.message : "ERC-7730 preview failed.",
        });
      });

    return () => controller.abort();
  }, [entry, erc7730Calls]);

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

          <Erc7730WalletPreview state={erc7730State} />

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

interface Erc7730RenderCall {
  label: string;
  chainId: number;
  to: string;
  data: string;
  value?: string;
}

interface SourcifyDisplayModel {
  intent?: string | Record<string, string>;
  interpolatedIntent?: string;
  fields?: readonly SourcifyDisplayField[];
  warnings?: readonly { code: string; message: string }[];
}

type SourcifyDisplayField =
  | { label: string; value: string }
  | { label?: string; fields: readonly { label: string; value: string }[] };

interface Erc7730RenderResult {
  label: string;
  chainId: number;
  to: string;
  status: "matched" | "review" | "not-covered" | "failed";
  message?: string;
  model?: SourcifyDisplayModel;
}

type Erc7730PreviewState =
  | { status: "idle" }
  | { status: "unsupported" }
  | { status: "loading" }
  | { status: "ready"; previews: readonly Erc7730RenderResult[] }
  | { status: "error"; message: string };

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

function Erc7730WalletPreview({ state }: { state: Erc7730PreviewState }) {
  if (state.status === "idle") {
    return null;
  }

  return (
    <section className="erc7730-wallet-preview" aria-label="ERC-7730 wallet preview">
      <div className="erc7730-wallet-preview-heading">
        <div>
          <h3>ERC-7730 wallet preview</h3>
          <p>Rendered at runtime with Sourcify against the SDK local descriptors.</p>
        </div>
        {state.status === "ready" && (
          <span
            className={
              state.previews.every((preview) => preview.status === "matched")
                ? "status-ok"
                : "status-warn"
            }
          >
            {erc7730StatusLabel(state.previews)}
          </span>
        )}
      </div>

      {state.status === "loading" && (
        <div className="erc7730-wallet-empty">Resolving local descriptors with Sourcify…</div>
      )}

      {state.status === "unsupported" && (
        <div className="erc7730-wallet-empty">
          No calldata-backed local ERC-7730 descriptor preview is available for this intent yet.
        </div>
      )}

      {state.status === "error" && <div className="alert alert-error">{state.message}</div>}

      {state.status === "ready" &&
        state.previews.map((preview) => (
          <div className="erc7730-wallet-transaction" key={`${preview.label}-${preview.to}`}>
            <div className="erc7730-wallet-transaction-header">
              <strong>{preview.label}</strong>
              <span className={preview.status === "matched" ? "status-ok" : "status-warn"}>
                {previewStatusLabel(preview)}
              </span>
            </div>

            {preview.model ? (
              <dl className="erc7730-screen" aria-label={`${preview.label} ERC-7730 preview`}>
                <div>
                  <dt>Intent</dt>
                  <dd>{renderSourcifyIntent(preview.model) ?? "—"}</dd>
                </div>
                {preview.model.fields?.map((field, index) =>
                  "fields" in field ? (
                    <div key={`${field.label ?? "group"}-${index}`}>
                      <dt>{field.label ?? "Group"}</dt>
                      <dd>
                        {field.fields
                          .map((nested) => `${nested.label}: ${nested.value}`)
                          .join(" / ")}
                      </dd>
                    </div>
                  ) : (
                    <div key={`${field.label}-${index}`}>
                      <dt>{field.label}</dt>
                      <dd>{field.value}</dd>
                    </div>
                  ),
                )}
                {preview.model.warnings?.map((warning) => (
                  <div key={`${warning.code}-${warning.message}`}>
                    <dt>Warning</dt>
                    <dd>{`${warning.code}: ${warning.message}`}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <div className="erc7730-wallet-empty">
                {preview.message ?? "No local descriptor matched this transaction."}
              </div>
            )}

            <details className="clear-signing-json">
              <summary>Sourcify display model</summary>
              <pre>{JSON.stringify(preview, null, 2)}</pre>
            </details>
          </div>
        ))}
    </section>
  );
}

function extractErc7730Calls(intent: ClearSigningIntent): Erc7730RenderCall[] {
  const rawContext = intent.rawContext;
  const rawCalls = [
    ...(Array.isArray(rawContext?.contractCalls) ? rawContext.contractCalls : []),
    rawContext?.contractCall,
  ].filter(Boolean);

  return rawCalls.flatMap((call, index) => {
    const transaction = encodeContractCall(call, intent, index);
    return transaction ? [transaction] : [];
  });
}

function encodeContractCall(
  call: unknown,
  intent: ClearSigningIntent,
  index: number,
): Erc7730RenderCall | undefined {
  if (!isContractCallLike(call)) {
    return undefined;
  }

  const data =
    typeof call.data === "string" && isHex(call.data)
      ? call.data
      : encodeFunctionData({
          abi: call.abi as Abi,
          functionName: call.functionName,
          args: Array.isArray(call.args) ? call.args : [],
        });

  const chainId = Number(call.chainId ?? intent.contractContext?.chainId ?? SEPOLIA_CHAIN_ID);

  return {
    label: call.functionName
      ? `Transaction ${index + 1}: ${call.functionName}`
      : `Transaction ${index + 1}`,
    chainId,
    to: getAddress(call.address),
    data,
    value: stringifyTransactionValue(call.value),
  };
}

function isContractCallLike(value: unknown): value is {
  address: string;
  abi: unknown;
  functionName: string;
  args?: unknown;
  data?: unknown;
  value?: unknown;
  chainId?: unknown;
} {
  if (!value || typeof value !== "object") {
    return false;
  }
  const call = value as Record<string, unknown>;
  return (
    typeof call.address === "string" &&
    isAddress(call.address) &&
    Array.isArray(call.abi) &&
    typeof call.functionName === "string"
  );
}

function stringifyTransactionValue(value: unknown): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return String(value);
  }
  if (typeof value === "string" && /^\d+$/.test(value)) {
    return value;
  }
  return undefined;
}

function renderSourcifyIntent(model: SourcifyDisplayModel): string | undefined {
  if (model.interpolatedIntent) {
    return model.interpolatedIntent;
  }
  if (typeof model.intent === "string") {
    return model.intent;
  }
  if (model.intent) {
    return Object.values(model.intent).join(" ");
  }
  return undefined;
}

function erc7730StatusLabel(previews: readonly Erc7730RenderResult[]): string {
  if (previews.every((preview) => preview.status === "matched")) {
    return "Local descriptor matched";
  }
  if (previews.every((preview) => preview.status === "not-covered")) {
    return "No local descriptor";
  }
  return "Review needed";
}

function previewStatusLabel(preview: Erc7730RenderResult): string {
  switch (preview.status) {
    case "matched":
      return "Matched";
    case "review":
      return "Warnings";
    case "not-covered":
      return "Not covered";
    case "failed":
      return "Failed";
  }
}
