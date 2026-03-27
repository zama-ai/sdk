"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// Providers accesses window.ethereum which is unavailable server-side.
// next/dynamic with ssr:false must be declared inside a "use client" component,
// which is why this thin wrapper exists — layout.tsx is a Server Component.
const Providers = dynamic(() => import("../providers").then((m) => ({ default: m.Providers })), {
  ssr: false,
});

export function ClientProviders({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
