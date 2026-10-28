// Loading the relayer table at boot surfaces a bad ENABLED_NETWORKS before the first
// request, which is when the API routes would otherwise load it. Next.js logs a failing
// hook and keeps serving 500s, so exit instead.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      await import("@/lib/relayers");
    } catch (err) {
      console.error(err);
      process.exit(1);
    }
  }
}
