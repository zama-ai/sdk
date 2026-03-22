export const TEST_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as const;

/** Amount minted to the test account per token (ERC-20 units with 6 decimals). */
export const MINTED = 1_000n * 10n ** 6n;

/** Anvil port assigned to the nextjs project. */
export const NEXTJS_ANVIL_PORT = 8545;

/** Anvil port assigned to the vite project. */
export const VITE_ANVIL_PORT = 8546;
