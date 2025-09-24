import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Geist_Mono, Inter, Inter_Tight } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { TRPCProviders } from "@/components/providers/trpc-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const sans = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const serif = Inter_Tight({
  variable: "--font-serif",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Framebreak Intelligence",
  description:
    "Turn podcasts and blogs into smart quotes and insights that get better as you use them",
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
        <TRPCProviders>
          {/* <AutumnProvider betterAuthUrl={process.env.NEXT_PUBLIC_APP_URL}> */}
          <NuqsAdapter>{children}</NuqsAdapter>
          {/* </AutumnProvider> */}
          <Toaster />
        </TRPCProviders>
        <Analytics />
      </body>
    </html>
  );
}
