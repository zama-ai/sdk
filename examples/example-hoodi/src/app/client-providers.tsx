"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// ssr: false — Providers accesses window.ethereum (MetaMask) which is unavailable server-side.
// next/dynamic with ssr: false must be declared inside a Client Component.
const Providers = dynamic(() => import("../providers").then((m) => ({ default: m.Providers })), {
  ssr: false,
});

export function ClientProviders({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
