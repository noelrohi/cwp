import type { ReactNode } from "react";
import { AppSidebar } from "@/components/app-sidebar";
import { AudioPlayerBar } from "@/components/audio-player/audio-player-bar";
import { AudioPlayerProvider } from "@/components/audio-player/audio-player-provider";
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
      <AppSidebar collapsible="icon" />
      <AudioPlayerProvider>
        <div className="flex min-h-screen flex-1 flex-col">
          <SidebarInset className="flex-1 pb-28 md:peer-data-[variant=inset]:mb-0 md:peer-data-[variant=inset]:rounded-b-none">
            {children}
          </SidebarInset>
          <AudioPlayerBar />
        </div>
      </AudioPlayerProvider>
    </SidebarProvider>
  );
}
