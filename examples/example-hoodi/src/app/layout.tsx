import type { ReactNode } from "react";
import { ClientProviders } from "./client-providers";
import "./globals.css";

export const metadata = {
  title: "Hoodi Confidential Token Quickstart",
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
