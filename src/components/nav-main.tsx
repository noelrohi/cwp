"use client";

import {
  AiMicIcon,
  AiSecurity01Icon,
  DashboardBrowsingIcon,
  HierarchySquare01Icon,
  Idea01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
  icon: typeof DashboardBrowsingIcon;
  url: string;
  badge?: string;
};

const items: NavItem[] = [
  {
    title: "Dashboard",
    icon: DashboardBrowsingIcon,
    url: "/dashboard",
  },
  {
    title: "Signals",
    icon: Idea01Icon,
    url: "/signals",
  },
  {
    title: "Podcasts",
    icon: AiMicIcon,
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
            title: "Debug",
            icon: HierarchySquare01Icon,
            url: "/debug",
          },
          {
            title: "Admin",
            icon: AiSecurity01Icon,
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
                    {item.icon && <HugeiconsIcon icon={item.icon} size={20} />}
                    <span className="text-base">{item.title}</span>
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
