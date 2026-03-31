import type { ReactNode } from "react";
import { ClientProviders } from "./client-providers";
import "./globals.css";
import "@ledgerhq/ledger-wallet-provider/styles.css";

export const metadata = {
  title: "Hoodi Confidential Tokens — Ledger",
  description:
    "POC demo for ERC-7984 confidential tokens on Hoodi testnet using a Ledger hardware wallet directly via the Ledger Button (no MetaMask).",
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
