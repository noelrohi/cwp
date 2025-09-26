"use client";

import { motion } from "motion/react";
import type * as React from "react";

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
      {/* Floating trigger at top-left of the app */}
      {(isMobile || !open) && (
        <motion.div
          initial={{ y: -10, opacity: 0 }}
          animate={{ y: 0, opacity: 1, rotate: open ? 0 : 180 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
          className="fixed left-3 top-3 z-50"
        >
          <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.96 }}>
            <SidebarTrigger className="rounded-full border border-border bg-background/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/70" />
          </motion.div>
        </motion.div>
      )}

      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarHeader>
          <div className="flex items-center gap-2 px-2">
            <SidebarTrigger className="-ml-1" />
            <SidebarMenu className="flex-1 overflow-hidden">
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  className="data-[slot=sidebar-menu-button]:!p-1.5"
                >
                  <span className="font-bold font-serif text-base">
                    Framebreak Intelligence
                  </span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </div>
        </SidebarHeader>
        <SidebarContent>
          <NavMain />
        </SidebarContent>
        <SidebarFooter>
          <NavUser />
        </SidebarFooter>
      </Sidebar>
    </>
  );
}
