import type { ReactNode } from "react";
import { Providers } from "@/providers";
import "./globals.css";

export const metadata = {
  title: "Confidential Token Quickstart",
  description:
    "Quickstart demo for ERC-7984 confidential tokens using the Zama FHE SDK, with a network picker for every supported chain.",
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
