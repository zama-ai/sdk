import type { Metadata } from "next";
import Link from "next/link";
import { Providers } from "@/providers";
import { ConnectWallet } from "@/components/connect-wallet";
import "./globals.css";

// All pages use wagmi/SDK hooks that require client-side providers
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Token SDK Test App",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <Providers>
          <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
            <nav className="flex gap-4">
              <Link href="/wallet" className="font-medium hover:text-blue-600">
                Wallet
              </Link>
              <Link href="/shield" className="font-medium hover:text-blue-600">
                Shield
              </Link>
              <Link href="/transfer" className="font-medium hover:text-blue-600">
                Transfer
              </Link>
              <Link href="/unshield" className="font-medium hover:text-blue-600">
                Unshield
              </Link>
            </nav>
            <ConnectWallet />
          </header>
          <main className="max-w-2xl mx-auto p-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
