import type { ReactNode } from "react";
import { ClientProviders } from "./client-providers";
import "./globals.css";

export const metadata = {
  title: "Sepolia Confidential Tokens — Ledger",
  description:
    "POC demo for ERC-7984 confidential tokens on Sepolia testnet using a Ledger hardware wallet directly via WebHID (no MetaMask, no browser extension).",
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
