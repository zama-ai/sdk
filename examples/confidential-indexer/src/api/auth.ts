/**
 * App-level access control — deliberately separate from the on-chain ACL
 * delegation. The delegation decides what THIS SERVICE is allowed to
 * decrypt; this decides who is allowed to QUERY the results afterward.
 * Conflating the two would mean anyone could read any decrypted value this
 * service has ever cached, regardless of whether they have any
 * relationship to the underlying account. POC-level: a single shared
 * bearer token, not a real multi-tenant auth model — see WALKTHROUGH.md.
 */
export function isAuthorized(
  req: { headers: { authorization?: string | string[] } },
  apiKey: string | undefined,
): boolean {
  if (!apiKey) return true;
  return req.headers.authorization === `Bearer ${apiKey}`;
}
