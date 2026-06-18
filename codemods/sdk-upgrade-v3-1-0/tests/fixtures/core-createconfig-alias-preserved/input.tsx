import { createConfig } from "wagmi";
import { createConfig as createZamaConfig } from "@zama-fhe/react-sdk/wagmi";

// `createZamaConfig` here is a LOCAL alias of the new `createConfig` export,
// chosen to avoid clashing with wagmi's `createConfig`. The codemod must leave
// it alone — renaming it would produce `createConfig as createConfig` and
// collide with the wagmi import above.
export const wagmiConfig = createConfig({});
export const zamaConfig = createZamaConfig({ chains: [] });
