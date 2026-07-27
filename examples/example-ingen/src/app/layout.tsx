import type { ReactNode } from "react";
import { Providers } from "@/providers";
import "./globals.css";

export const metadata = {
  title: "InGen Confidential Token Quickstart",
  description:
    "Quickstart demo for ERC-7984 confidential tokens on the T-Rex InGen testnet (cleartext FHEVM development setup) using the Zama FHE SDK.",
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
