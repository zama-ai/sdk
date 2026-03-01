import { Providers } from "@/providers";
import { ConnectWallet, Sidebar } from "@zama-fhe/test-components";
import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Token SDK Test App",
};

function NextLink({ to, ...props }: { to: string; className?: string; children: React.ReactNode }) {
  return <Link href={to} {...props} />;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 min-h-screen">
        <Providers>
          <Sidebar LinkComponent={NextLink}>
            <ConnectWallet />
          </Sidebar>
          <main className="md:ml-64 max-w-2xl mx-auto p-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
