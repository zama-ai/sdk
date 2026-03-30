export const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

/** Amount minted to the test account per token (ERC-20 units with 6 decimals). */
export const MINTED = 1_000n * 10n ** 6n;

/** Port for the mock relayer server. */
export const MOCK_RELAYER_PORT = 4200;

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
