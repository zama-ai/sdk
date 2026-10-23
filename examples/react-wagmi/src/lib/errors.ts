// The SDK wraps failures in its own error types with the underlying error in `cause`
// (an RPC revert, a relayer response, a viem error). Show that chain so the reason is
// visible, not just "Failed to decrypt encrypted values".
export function describeError(error: unknown, fallback: string): string {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current !== undefined && current !== null; depth++) {
    const message =
      current instanceof Error
        ? ((current as { shortMessage?: string }).shortMessage ?? current.message)
        : typeof current === "string"
          ? current
          : JSON.stringify(current);
    if (message && !messages.includes(message)) messages.push(message);
    current = current instanceof Error ? current.cause : undefined;
  }
  return messages.length > 0 ? messages.join(" — ") : fallback;
}
