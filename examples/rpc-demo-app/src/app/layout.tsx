import type { ReactNode } from "react";
import { ClientProviders } from "./client-providers";
import "./globals.css";

export const metadata = {
  title: "Zama Privacy Service — RPC + Indexer Demo",
  description:
    "An ordinary dApp — plain calldata, real MetaMask — that never imports the Zama SDK, " +
    "talking only to the zama-json-rpc wrapper and the confidential-indexer REST API.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ClientProviders>{children}</ClientProviders>
      </body>
    </html>
  );
}
