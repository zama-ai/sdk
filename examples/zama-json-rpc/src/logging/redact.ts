/**
 * Redacts plaintext argument values before they hit verbose logs. Only the
 * confidential-transfer path decodes plaintext amounts; this keeps them out
 * of logs even in `--verbose` mode, since the whole point of the wrapper is
 * that plaintext values shouldn't leak beyond the encrypt() call.
 */
export function redactPublicArgs(args: readonly unknown[]): unknown[] {
  return args.map((arg) => (typeof arg === "bigint" ? "<redacted>" : arg));
}
