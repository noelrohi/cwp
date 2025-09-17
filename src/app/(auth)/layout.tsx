import type { ReactNode } from "react";
import Link from "next/link";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background text-foreground grid min-h-svh grid-cols-1 md:grid-cols-2">
      <aside className="bg-sidebar text-sidebar-foreground hidden md:flex flex-col justify-between border-r p-8">
        <div className="flex flex-col gap-8">
          <Link href="/" className="font-semibold tracking-tight">
            CWP
          </Link>
          <div className="flex flex-col gap-6 max-w-md">
            <h2 className="text-xl font-semibold">People love CWP</h2>
            <ul className="flex flex-col gap-4 text-sm text-muted-foreground">
              <li>
                “A thoughtful way to build modern apps quickly without fighting
                the stack.”
              </li>
              <li>
                “The defaults are tasteful, the DX is excellent, and the UI is
                clean.”
              </li>
              <li>“Exactly what we needed to ship faster.”</li>
            </ul>
          </div>
        </div>
        <footer className="text-xs text-muted-foreground">
          © {new Date().getFullYear()} CWP. All rights reserved.
        </footer>
      </aside>
      <main className="flex items-center justify-center p-6 md:p-10">{children}</main>
    </div>
  );
}

