import type { Metadata } from "next";
import { Geist_Mono, Manrope, Merriweather } from "next/font/google";
import { TRPCProviders } from "@/components/providers/trpc-provider";
import "./globals.css";

const sans = Manrope({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

const serif = Merriweather({
  variable: "--font-serif",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "cwp",
  description: "Chat with Podcasts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${sans.variable} ${geistMono.variable} ${serif.variable} font-sans antialiased`}
      >
        <TRPCProviders>{children}</TRPCProviders>
      </body>
    </html>
  );
}
