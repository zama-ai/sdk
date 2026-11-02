import type { ReactNode } from "react";
import { SiteFooter } from "@/components/PageChrome";
import { Providers } from "@/providers";
import "./globals.css";

export const metadata = {
  title: "Confidential Token Quickstart",
  description:
    "Quickstart demo for ERC-7984 confidential tokens using the Zama FHE SDK, with a network picker for every supported chain.",
};

// Rendered per request: the CSP nonce is minted per request and has to land in the HTML,
// which a build-time prerender cannot do.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
        <SiteFooter />
      </body>
    </html>
  );
}
