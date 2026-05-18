import type { ReactNode } from "react";
import { ClientProviders } from "./client-providers";
import "./globals.css";

export const metadata = {
  title: "Sepolia Clear Signing Intent Demo",
  description:
    "App-level clear-signing intent demo for ERC-7984 confidential tokens on Sepolia testnet.",
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
