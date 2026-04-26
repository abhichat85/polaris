import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Outfit } from "next/font/google";

import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/components/providers";

import "allotment/dist/style.css";
import "./globals.css";

// Praxiom Design System — three-font stack
// (DESIGN-SYSTEM.md §3.1)

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "Polaris by Praxiom — From idea to running app, in one chat.",
  description:
    "Polaris is an AI-powered cloud IDE that turns natural-language ideas into deployable Next.js apps.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${outfit.variable} ${inter.variable} ${jetbrainsMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
