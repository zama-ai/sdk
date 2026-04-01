"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// Providers uses browser-only APIs (TransportWebHID, IndexedDB) that are
// unavailable server-side. next/dynamic with ssr:false must be declared inside
// a "use client" component — this thin wrapper exists because layout.tsx is a
// Server Component and cannot use next/dynamic directly.
const Providers = dynamic(() => import("../providers").then((m) => ({ default: m.Providers })), {
  ssr: false,
});

export function ClientProviders({ children }: { children: ReactNode }) {
  return <Providers>{children}</Providers>;
}
