import { Providers } from "@/providers";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "BNB Confidential Token Quickstart",
  description:
    "Quickstart demo for ERC-7984 confidential tokens on BNB Smart Chain Testnet (cleartext FHEVM development setup) using the Zama FHE SDK.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
