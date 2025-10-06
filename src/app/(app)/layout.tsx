import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AudioPlayerBar } from "@/components/audio-player/audio-player-bar";
import { AudioPlayerProvider } from "@/components/audio-player/audio-player-provider";
import { BottomNav } from "@/components/bottom-nav";
import { ModeToggle } from "@/components/mode-toggle";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export default function ChatLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": "calc(var(--spacing) * 72)",
          "--header-height": "calc(var(--spacing) * 12)",
        } as React.CSSProperties
      }
    >
      <AppSidebar collapsible="offcanvas" />
      <AudioPlayerProvider>
        <div className="flex min-h-screen flex-1 flex-col">
          <div className="fixed top-4 right-4 z-50 md:hidden">
            <ModeToggle />
          </div>
          <SidebarInset className="flex-1 md:peer-data-[variant=inset]:mb-0 md:peer-data-[variant=inset]:rounded-b-none">
            {children}
          </SidebarInset>
          <AudioPlayerBar />
          <BottomNav />
        </div>
      </AudioPlayerProvider>
    </SidebarProvider>
  );
}
