"use client";

import {
  FolderOpenIcon,
  LayoutDashboardIcon,
  MicIcon,
  SettingsIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

const items = [
  {
    title: "Dashboard",
    icon: LayoutDashboardIcon,
    url: "/dashboard",
  },
  {
    title: "Podcasts",
    icon: MicIcon,
    url: "/podcasts",
  },
  {
    title: "Artifacts",
    icon: FolderOpenIcon,
    url: "/artifacts",
  },
  {
    title: "Preferences",
    icon: SettingsIcon,
    url: "/preferences",
  },
] as const;

export function NavMain() {
  const pathname = usePathname();

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {items.map((item) => {
            const isActive = pathname === item.url;
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={isActive}
                >
                  <a href={item.url}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
