"use client";

import {
  AiMicIcon,
  AiSecurity01Icon,
  DashboardBrowsingIcon,
  FileAttachmentIcon,
  HierarchySquare01Icon,
  Idea01Icon,
  MessageMultiple01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { useSession } from "@/lib/auth-client";

type NavItem = {
  title: string;
  icon: typeof DashboardBrowsingIcon;
  url?: string;
  badge?: string;
  items?: { title: string; url: string; badge?: string }[];
};

const items: NavItem[] = [
  {
    title: "Dashboard",
    icon: DashboardBrowsingIcon,
    url: "/dashboard",
  },
  {
    title: "Chat",
    icon: MessageMultiple01Icon,
    url: "/chat",
  },
  {
    title: "Signals",
    icon: Idea01Icon,
    items: [
      { title: "Episodes", url: "/signals/episodes" },
      { title: "Articles", url: "/signals/articles", badge: "WIP" },
    ],
  },
  {
    title: "Podcasts",
    icon: AiMicIcon,
    url: "/podcasts",
  },
  {
    title: "Articles",
    icon: FileAttachmentIcon,
    url: "/articles",
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
            // Handle collapsible items (with sub-items)
            if (item.items && item.items.length > 0) {
              const isAnySubItemActive = item.items.some((subItem) =>
                pathname.startsWith(subItem.url),
              );
              return (
                <Collapsible
                  key={item.title}
                  asChild
                  defaultOpen={isAnySubItemActive}
                >
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip={item.title}
                        isActive={isAnySubItemActive}
                      >
                        {item.icon && (
                          <HugeiconsIcon icon={item.icon} size={20} />
                        )}
                        <span className="text-base">{item.title}</span>
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="border-border">
                        {item.items.map((subItem) => {
                          const isActive = pathname === subItem.url;
                          return (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild isActive={isActive}>
                                <Link href={subItem.url}>
                                  <span>{subItem.title}</span>
                                  {subItem.badge && (
                                    <Badge
                                      variant="secondary"
                                      className="ml-auto text-xs"
                                    >
                                      {subItem.badge}
                                    </Badge>
                                  )}
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          );
                        })}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              );
            }

            // Handle regular items
            const isActive = pathname === item.url;
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  tooltip={item.title}
                  isActive={isActive}
                >
                  <Link href={item.url ?? "#"}>
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
