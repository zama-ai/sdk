"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import { networks, type NetworkKey } from "@/lib/networks";

type ChosenByChain = Partial<Record<number, NetworkKey>>;

// The row last picked in the network picker, which decides between rows on the same chain.
// Keyed by chain id, so a switch the wallet rejects can't change the current chain's row.
const ChosenNetworkContext = createContext<{
  chosen: ChosenByChain;
  choose: (key: NetworkKey) => void;
} | null>(null);

export function ChosenNetworkProvider({ children }: { children: ReactNode }) {
  const [chosen, setChosen] = useState<ChosenByChain>({});
  const value = useMemo(
    () => ({
      chosen,
      choose: (key: NetworkKey) =>
        setChosen((prev) => ({ ...prev, [networks[key].chain.id]: key })),
    }),
    [chosen],
  );
  return <ChosenNetworkContext.Provider value={value}>{children}</ChosenNetworkContext.Provider>;
}

export function useChosenNetwork() {
  const ctx = useContext(ChosenNetworkContext);
  if (!ctx) throw new Error("useChosenNetwork must be used within <ChosenNetworkProvider>");
  return ctx;
}
