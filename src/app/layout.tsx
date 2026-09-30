import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.predarc.xyz"),
  title: "Predarc Forecast Arena",
  description: "Forecast crypto markets on Arc Mainnet.",
  openGraph: {
    title: "Predarc Forecast Arena",
    description: "Forecast crypto markets on Arc Mainnet.",
    url: "https://www.predarc.xyz",
    siteName: "Predarc",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "Predarc Forecast Arena on Arc Mainnet",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Predarc Forecast Arena",
    description: "Forecast crypto markets on Arc Mainnet.",
    images: ["/opengraph-image"],
  },
};

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
