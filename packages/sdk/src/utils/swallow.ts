/**
 * Runs a function and swallows any errors.
 */
export async function swallow(label: string, fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (error) {
    // oxlint-disable-next-line no-console
    console.warn(`[zama-sdk] ${label} failed:`, error);
  }
}
