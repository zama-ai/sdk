import type { ReactNode } from "react";
import { ClientProviders } from "./client-providers";
import "./globals.css";

export const metadata = {
  title: "Sepolia Confidential Token Quickstart",
  description:
    "Quickstart demo for ERC-7984 confidential tokens on Sepolia testnet using the Zama FHE SDK.",
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
