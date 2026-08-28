import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./product-browser.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from "./site-config";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  applicationName: SITE_NAME,
  title: {
    default: "Принтопус — печать и вышивка на одежде в Минске",
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    type: "website",
    locale: "ru_BY",
    url: "/",
    siteName: SITE_NAME,
    title: "Принтопус — печать и вышивка на одежде",
    description: SITE_DESCRIPTION,
    images: [{
      url: "/og.png",
      width: 1200,
      height: 630,
      alt: "Принтопус — печать и вышивка на одежде в Минске",
    }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Принтопус — печать и вышивка на одежде",
    description: SITE_DESCRIPTION,
    images: ["/og.png"],
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru-BY"><body>{children}</body></html>;
}
