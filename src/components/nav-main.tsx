"use client";

import {
  LayoutDashboardIcon,
  LightbulbIcon,
  MicIcon,
  ShieldIcon,
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
import { useSession } from "@/lib/auth-client";

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
    title: "Signals",
    icon: LightbulbIcon,
    url: "/signals",
  },
  {
    title: "Podcasts",
    icon: MicIcon,
    url: "/podcasts",
  },
  // {
  //   title: "Patterns",
  //   icon: SparklesIcon,
  //   url: "/patterns",
  //   badge: "Soon",
  // },
  // {
  //   title: "Preferences",
  //   icon: SettingsIcon,
  //   url: "/preferences",
  //   badge: "Soon",
  // },
];

export function NavMain() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === "admin";

  const allItems = [
    ...items,
    ...(isAdmin
      ? [
          {
            title: "Admin",
            icon: ShieldIcon,
            url: "/admin",
          },
        ]
      : []),
  ];

  return (
    <SidebarGroup>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          {allItems.map((item) => {
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
