"use client";

import type * as React from "react";
import { ModeToggle } from "@/components/mode-toggle";
import { NavUser } from "@/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
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
        <SidebarTrigger className="fixed top-4 left-4 z-50 rounded-full border border-border bg-background/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70" />
      )}

      <Sidebar collapsible="icon" {...props} className="max-md:hidden">
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2">
            <SidebarTrigger className="-ml-1" />
            <SidebarMenu className="flex-1 overflow-hidden">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className="data-[slot=sidebar-menu-button]:!p-1.5"
                >
                  <span className="font-bold font-serif text-lg">
                    Framebreak Intelligence
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
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
            <SidebarTrigger className="rounded-full border border-border bg-background shadow-sm" />
          </div>
        )}
      </Sidebar>
    </>
  );
}
