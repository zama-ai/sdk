/**
 * App-level access control for this server's JSON-RPC surface, gated by
 * `--apiKey`/`ZAMA_API_KEY` — separate from `--relayerApiKey`, which
 * authenticates this wrapper to the Zama relayer, not callers to this
 * wrapper. Without it, anyone who can reach this server can trigger real
 * relayer `encrypt()` calls (a cost/DoS surface) and probe which addresses
 * are registered confidential tokens. POC-level: a single shared bearer
 * token, not a real multi-tenant auth model.
 */
export function isAuthorized(
  req: { headers: { authorization?: string | string[] } },
  apiKey: string | undefined,
): boolean {
  if (!apiKey) return true;
  return req.headers.authorization === `Bearer ${apiKey}`;
}
