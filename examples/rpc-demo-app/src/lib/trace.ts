export interface TraceEntry {
  id: string;
  timestamp: number;
  hop: string;
  kind: "request" | "response" | "server-audit" | "inferred";
  summary: string;
  detail?: unknown;
}

let nextId = 0;
export function traceEntry(entry: Omit<TraceEntry, "id" | "timestamp">): TraceEntry {
  nextId += 1;
  return { ...entry, id: `t${nextId}`, timestamp: Date.now() };
}
