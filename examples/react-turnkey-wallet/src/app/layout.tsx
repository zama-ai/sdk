import type { Metadata } from "next";
import "@turnkey/react-wallet-kit/styles.css";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Turnkey × Zama — Confidential Tokens Demo",
  description: "Demo app for using Turnkey wallets with Zama FHE confidential tokens on Sepolia",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-50 dark:bg-zinc-950">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
