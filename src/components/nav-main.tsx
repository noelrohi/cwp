"use client";

import {
  LayoutDashboardIcon,
  MicIcon,
  SettingsIcon,
  SparklesIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

type NavItem = {
  title: string;
  icon: typeof LayoutDashboardIcon;
  url: string;
  badge?: string;
};

const items: NavItem[] = [
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
    title: "Patterns",
    icon: SparklesIcon,
    url: "/patterns",
    badge: "Soon",
  },
  {
    title: "Preferences",
    icon: SettingsIcon,
    url: "/preferences",
    badge: "Soon",
  },
];

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
                  <Link href={item.url}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    {item.badge && (
                      <Badge variant="secondary" className="ml-auto text-xs">
                        {item.badge}
                      </Badge>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
