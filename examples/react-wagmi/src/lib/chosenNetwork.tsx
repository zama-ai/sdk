"use client";

import { createContext, type ReactNode, useContext, useMemo, useState } from "react";
import type { NetworkKey } from "@/lib/networks";

// The row last picked in the network picker. It decides between rows that share the wallet's
// chain (the custom environment and Sepolia); the wallet's chain decides everything else.
const ChosenNetworkContext = createContext<{
  chosen: NetworkKey | undefined;
  choose: (key: NetworkKey) => void;
} | null>(null);

export function ChosenNetworkProvider({ children }: { children: ReactNode }) {
  const [chosen, choose] = useState<NetworkKey>();
  const value = useMemo(() => ({ chosen, choose }), [chosen]);
  return <ChosenNetworkContext.Provider value={value}>{children}</ChosenNetworkContext.Provider>;
}

export function useChosenNetwork() {
  const ctx = useContext(ChosenNetworkContext);
  if (!ctx) throw new Error("useChosenNetwork must be used within <ChosenNetworkProvider>");
  return ctx;
}
