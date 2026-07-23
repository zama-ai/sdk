import type { ReactNode } from "react";
import { Providers } from "@/providers";
import "./globals.css";

export const metadata = {
  title: "Hoodi Confidential Token Quickstart",
  description:
    "Quickstart demo for ERC-7984 confidential tokens on Hoodi testnet using the Zama FHE SDK.",
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
