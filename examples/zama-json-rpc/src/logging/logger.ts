import type { AuditBuffer } from "./audit-buffer.js";

export type AuditEntry =
  | { decision: "passthrough"; method: string }
  | { decision: "rewritten"; method: string; contractAddress: string; operation: string }
  | { decision: "rejected"; method: string; reason: string };

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
  debug(message: string): void;
  /**
   * Every routing decision the wrapper makes — rewritten vs untouched
   * pass-through vs rejected — logged unconditionally, even in `--quiet`
   * mode. This is what makes the "magic" auditable: an operator can grep
   * this stream and see exactly which requests were ever modified, and how.
   */
  audit(entry: AuditEntry): void;
}

export function createLogger(options: {
  quiet: boolean;
  verbose: boolean;
  auditBuffer?: AuditBuffer;
}): Logger {
  const write = (stream: NodeJS.WriteStream, message: string) => {
    if (options.quiet) return;
    stream.write(`${new Date().toISOString()} ${message}\n`);
  };

  return {
    info: (message) => write(process.stdout, `[info] ${message}`),
    warn: (message) => write(process.stderr, `[warn] ${message}`),
    error: (message) => process.stderr.write(`${new Date().toISOString()} [error] ${message}\n`),
    debug: (message) => {
      if (!options.verbose) return;
      write(process.stdout, `[debug] ${message}`);
    },
    audit: (entry) => {
      process.stdout.write(`${new Date().toISOString()} [audit] ${JSON.stringify(entry)}\n`);
      options.auditBuffer?.push(entry);
    },
  };
}
