import { Analytics } from "@vercel/analytics/next";
import type { Metadata } from "next";
import { Geist_Mono, Rethink_Sans } from "next/font/google";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { TRPCProviders } from "@/components/providers/trpc-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const sans = Rethink_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
});

const serif = Rethink_Sans({
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
  appleWebApp: {
    title: "Framebreak",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${sans.variable} ${geistMono.variable} ${serif.variable} font-sans antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TRPCProviders>
            {/* <AutumnProvider betterAuthUrl={process.env.NEXT_PUBLIC_APP_URL}> */}
            <NuqsAdapter>{children}</NuqsAdapter>
            {/* </AutumnProvider> */}
            <Toaster richColors />
          </TRPCProviders>
        </ThemeProvider>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  );
}
