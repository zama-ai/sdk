import type { ReactNode } from "react";
import { ClientProviders } from "./client-providers";

export const metadata = {
  title: "Hoodi Confidential Token Demo",
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
