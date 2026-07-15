import type { Metadata } from "next";
import { DM_Sans, DM_Serif_Display, Noto_Sans_Devanagari } from "next/font/google";
import "leaflet/dist/leaflet.css";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const dmSerif = DM_Serif_Display({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-hindi",
  subsets: ["devanagari"],
});

const siteOrigin = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://mp-road-watch.devamahe.chatgpt.site").replace(/\/$/, "");
const siteBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const siteUrl = `${siteOrigin}${siteBasePath}`;
const title = "Madhya Pradesh Road Watch";
const description =
  "Explore active road projects and the official national, state, district and village-road inventory for every Madhya Pradesh district.";

export const metadata: Metadata = {
  metadataBase: new URL(`${siteUrl}/`),
  title,
  description,
  icons: {
    icon: `${siteUrl}/favicon.svg`,
    shortcut: `${siteUrl}/favicon.svg`,
  },
  openGraph: {
    title,
    description,
    type: "website",
    url: siteUrl,
    images: [{ url: `${siteUrl}/og.png`, width: 1536, height: 1024 }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [`${siteUrl}/og.png`],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${dmSans.variable} ${dmSerif.variable} ${notoDevanagari.variable}`}>
        {children}
      </body>
    </html>
  );
}
