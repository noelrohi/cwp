"use client";

import { BrainIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { useSession } from "../lib/auth-client";
import { NavMain } from "./nav-main";

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { open, isMobile } = useSidebar();
  const { data } = useSession();
  const _isSignedIn = !!data?.user.id;

  return (
    <>
      {/* Floating trigger at top-left of the app - hidden on mobile */}
      {!isMobile && !open && (
        <SidebarTrigger className="fixed top-4 left-4 z-50 size-9 rounded-full border border-border bg-background/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70" />
      )}

      <Sidebar collapsible="icon" {...props} className="max-md:hidden">
        <SidebarHeader className="pb-4 pt-6">
          <div className="flex items-center justify-center gap-2 px-2">
            <HugeiconsIcon icon={BrainIcon} className="size-6 shrink-0" />
            <div className="flex-1" />
            <ModeToggle />
          </div>
        </SidebarHeader>
        <SidebarContent>
          <NavMain />
        </SidebarContent>
        <SidebarFooter>
          <NavUser />
        </SidebarFooter>

        {open && (
          <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1/2">
            <SidebarTrigger className="size-9 rounded-full border border-border bg-background shadow-sm" />
          </div>
        )}
      </Sidebar>
    </>
  );
}
