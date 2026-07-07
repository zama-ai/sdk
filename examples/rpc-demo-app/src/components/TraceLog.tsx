import type { TraceEntry } from "@/lib/trace";

const KIND_LABEL: Record<TraceEntry["kind"], string> = {
  request: "→ sent",
  response: "← received",
  "server-audit": "server log",
  inferred: "inferred",
};

/**
 * Chronological trace of a single write action: every request/response this
 * browser genuinely exchanges with the wrapper (full payloads), the
 * wrapper's own real audit-log entry for the same action (polled from
 * `GET /audit`), and one clearly labeled *inferred* step for the hop this
 * browser can't directly observe (the signer relay signing + broadcasting).
 * Nothing here is fabricated — entries are either a real captured payload or
 * explicitly marked "inferred".
 */
export function TraceLog({ trace }: { trace: TraceEntry[] }) {
  if (trace.length === 0) return null;

  return (
    <div className="trace-list">
      {trace.map((entry) => (
        <div className={`trace-entry trace-entry-${entry.kind}`} key={entry.id}>
          <div className="trace-entry-header">
            <span className="trace-hop">{entry.hop}</span>
            <span className={`trace-kind trace-kind-${entry.kind}`}>{KIND_LABEL[entry.kind]}</span>
          </div>
          <div className="trace-summary">{entry.summary}</div>
          {entry.detail !== undefined && (
            <details className="trace-detail">
              <summary>payload</summary>
              <pre>{JSON.stringify(entry.detail, null, 2)}</pre>
            </details>
          )}
        </div>
      ))}
    </div>
  );
}
