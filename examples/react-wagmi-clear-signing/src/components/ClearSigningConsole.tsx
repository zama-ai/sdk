"use client";

import { useMemo } from "react";
import { renderClearSigningIntent, type ClearSigningIntent } from "@zama-fhe/sdk";

export type ClearSigningIntentSource = "preview" | "runtime";

export interface ClearSigningIntentEntry {
  source: ClearSigningIntentSource;
  operation: string;
  intent: ClearSigningIntent;
  timestamp: number;
}

interface ClearSigningConsoleProps {
  entry: ClearSigningIntentEntry | null;
  onClear: () => void;
}

export function ClearSigningConsole({ entry, onClear }: ClearSigningConsoleProps) {
  const rendered = useMemo(() => (entry ? renderClearSigningIntent(entry.intent) : null), [entry]);
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

          {rendered.warnings.length > 0 && (
            <div className="clear-signing-warnings">
              {rendered.warnings.map((warning) => (
                <div key={warning} className="alert alert-warning">
                  {warning}
                </div>
              ))}
            </div>
          )}

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

          <details className="clear-signing-json">
            <summary>Raw intent JSON</summary>
            <pre>{json}</pre>
          </details>
        </div>
      )}
    </div>
  );
}
