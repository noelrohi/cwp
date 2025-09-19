import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative grid min-h-svh grid-cols-1 md:grid-cols-2 md:bg-[url('https://cdn.midjourney.com/5d5f06c9-fb01-48a6-975a-f9adc4acdc3f/0_0.png')] bg-cover bg-center md:bg-none">
      {/* Left background panel on desktop */}
      <aside className="relative hidden md:flex flex-col justify-between border-r p-8 bg-[url('https://cdn.midjourney.com/5d5f06c9-fb01-48a6-975a-f9adc4acdc3f/0_0.png')] bg-cover bg-center text-white">
        {/* Desktop overlay to keep text legible */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-black/70" />

        <div className="relative flex flex-col gap-6">
          <Link href="/" className="font-semibold tracking-tight">
            Chat with Podcasts
          </Link>
          <p className="text-sm text-white/70 max-w-md">
            Search, chat, and learn from your favorite podcasts.
          </p>
        </div>

        <footer className="relative text-xs text-white/70">
          © {new Date().getFullYear()} Chat with Podcasts. All rights reserved.
        </footer>
      </aside>

      <main className="relative flex items-center justify-center p-6 md:p-10">
        {children}
      </main>
    </div>
  );
}
