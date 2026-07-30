import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
// Third-party stylesheets first, globals.css last: order is load-bearing, so
// that Tailwind utilities and our tokens can override vendor defaults rather
// than losing to them.
import "tabulator-tables/dist/css/tabulator_simple.min.css";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import { ClientInit } from "@/components/ClientInit";
import { Providers } from "@/components/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "OmniView",
  description: "Personal app dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: next-themes mutates <html>'s class/style
    // before hydration to apply the stored theme without a flash.
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <body>
        <ClientInit />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
