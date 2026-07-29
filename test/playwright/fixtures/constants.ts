export const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

/** Amount minted to the test account per token (ERC-20 units with 6 decimals). */
export const MINTED = 1_000n * 10n ** 6n;

/** Dev-server port for the Next.js test app. */
export const NEXTJS_PORT = 3100;

/** Dev-server port for the Vite test app. */
export const VITE_PORT = 3200;

/** Anvil port assigned to the nextjs project. */
export const NEXTJS_ANVIL_PORT = 8545;

/** Anvil port assigned to the vite project. */
export const VITE_ANVIL_PORT = 8546;

/** Anvil port assigned to the node project. */
export const NODE_ANVIL_PORT = 8547;

/**
 * Playwright `webServer.timeout` for the `start-anvil.sh` boot, i.e. the budget
 * for anvil to come up AND the cleartext fhevm host stack to deploy before the
 * "Anvil ready" line. That deploy cold-compiles the v13 host contracts (not in
 * the forge build cache) and broadcasts the stack `--slow` (one tx per block),
 * so on a loaded CI runner it lands close to the old 90s budget and tips over
 * on variance. 180s gives the compile + serial broadcast headroom without
 * masking a genuinely stuck deploy — `start-anvil.sh` still bounds real
 * failures via its own retry loop.
 */
export const ANVIL_DEPLOY_TIMEOUT_MS = 180_000;
